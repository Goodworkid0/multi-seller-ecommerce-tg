"""Admin Router"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Request
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, String, text
from slowapi import Limiter
from slowapi.util import get_remote_address
from sqlalchemy.orm import selectinload, aliased
from typing import List, Optional
from datetime import datetime, timedelta
from pydantic import BaseModel, Field, constr
import uuid
import os
import json
import shutil
import httpx

from app.database import get_db, engine, Base, get_fee_settings, calc_seller_amount
from app.models import User, UserRole, Product, Order, OrderItem, Category, OrderStatus, CryptoDeposit, Banner, WithdrawalRequest, WithdrawalStatus, Dispute, DisputeStatus, OrderMessage, Notification, AppSettings, PredefinedTag, WtbCategory, ServiceCategory, WtbPost, WtbStatus, UserWarning
from app.telegram import create_notification
from app.schemas import (
    User as UserSchema, 
    AdminStats, 
    CategoryCreate,
    CategoryUpdate,
    Category as CategorySchema,
    AdminCryptoDepositItem,
    AdminMarkCreditedRequest,
    Banner as BannerSchema,
    BannerCreate,
    BannerUpdate,
    WithdrawalRequestSchema,
    DisputeSchema,
    DisputeResolve,
    SellerProfile,
    Product as ProductSchema,
    AdminOrder,
    AdminOrderItem,
    PredefinedTagSchema,
    PredefinedTagCreate,
    ServiceCategoryCreate,
)
from app.auth import get_current_admin, create_access_token, reject_impersonation
from datetime import datetime

ENVIRONMENT = os.getenv("ENVIRONMENT", "production").strip().lower()

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)


def _escape_like(value: str) -> str:
    """Escape SQL LIKE wildcards (%, _) so user input is treated literally."""
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/stats", response_model=AdminStats)
async def get_admin_stats(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Get platform statistics"""
    
    total_users = await db.scalar(select(func.count()).select_from(User))
    total_sellers = await db.scalar(
        select(func.count()).select_from(User).where(User.shop_name.isnot(None))
    )
    total_products = await db.scalar(select(func.count()).select_from(Product))
    total_orders = await db.scalar(select(func.count()).select_from(Order))
    
    revenue = await db.scalar(
        select(func.sum(Order.total_amount))
        .where(Order.status.in_([OrderStatus.PAID, OrderStatus.DELIVERED, OrderStatus.COMPLETED]))
    )
    
    return {
        "total_users": total_users or 0,
        "total_sellers": total_sellers or 0,
        "total_products": total_products or 0,
        "total_orders": total_orders or 0,
        "total_revenue": revenue or 0.0
    }


@router.get("/dashboard")
async def get_admin_dashboard(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
    sellers_limit: int = Query(5, ge=0, le=50),
    sellers_offset: int = Query(0, ge=0),
    orders_limit: int = Query(5, ge=0, le=50),
    orders_offset: int = Query(0, ge=0),
    products_limit: int = Query(5, ge=0, le=50),
    products_offset: int = Query(0, ge=0),
    period: str = Query("all", regex="^(today|7d|30d|90d|all)$"),
):
    """Extended dashboard: stats + top sellers + recent activity"""
    from datetime import timedelta

    # Calculate cutoff date based on period
    cutoff = None
    if period == "today":
        cutoff = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    elif period == "7d":
        cutoff = datetime.utcnow() - timedelta(days=7)
    elif period == "30d":
        cutoff = datetime.utcnow() - timedelta(days=30)
    elif period == "90d":
        cutoff = datetime.utcnow() - timedelta(days=90)

    # Users
    users_q = select(func.count()).select_from(User)
    if cutoff:
        users_q = users_q.where(User.created_at >= cutoff)
    total_users = await db.scalar(users_q)

    sellers_q = select(func.count()).select_from(User).where(User.shop_name.isnot(None))
    if cutoff:
        sellers_q = sellers_q.where(User.created_at >= cutoff)
    total_sellers = await db.scalar(sellers_q)

    # Products
    products_q = select(func.count()).select_from(Product)
    if cutoff:
        products_q = products_q.where(Product.created_at >= cutoff)
    total_products = await db.scalar(products_q)

    # Orders
    orders_count_q = select(func.count()).select_from(Order)
    if cutoff:
        orders_count_q = orders_count_q.where(Order.created_at >= cutoff)
    total_orders = await db.scalar(orders_count_q)

    # Order counts by status
    order_status_q = (
        select(Order.status, func.count())
        .group_by(Order.status)
    )
    if cutoff:
        order_status_q = order_status_q.where(Order.created_at >= cutoff)
    status_rows = (await db.execute(order_status_q)).all()
    order_status_counts = {s.value if hasattr(s, 'value') else s: c for s, c in status_rows}

    # Completed orders = paid + delivered + completed (revenue-generating)
    completed_orders = sum(order_status_counts.get(s, 0) for s in ["paid", "delivered", "completed"])

    # Revenue
    revenue_q = select(func.sum(Order.total_amount)).where(Order.status.in_([OrderStatus.PAID, OrderStatus.DELIVERED, OrderStatus.COMPLETED]))
    if cutoff:
        revenue_q = revenue_q.where(Order.created_at >= cutoff)
    revenue = await db.scalar(revenue_q) or 0.0

    platform_fee = revenue * 0.10

    # Total deposits (credited)
    deposits_q = select(func.sum(CryptoDeposit.price_amount_usd)).where(CryptoDeposit.is_credited == True)
    if cutoff:
        deposits_q = deposits_q.where(CryptoDeposit.created_at >= cutoff)
    total_deposits = await db.scalar(deposits_q) or 0.0

    # Disputes (always show all open, regardless of period)
    open_disputes = await db.scalar(
        select(func.count()).select_from(Dispute).where(Dispute.status.in_([DisputeStatus.OPEN, DisputeStatus.ESCALATED]))
    ) or 0

    # Withdrawals (always show all pending, regardless of period)
    pending_withdrawals = await db.scalar(
        select(func.count()).select_from(WithdrawalRequest).where(WithdrawalRequest.status == WithdrawalStatus.PENDING)
    ) or 0

    # Top sellers by total_sales (paginated)
    seller_count_q = select(func.count()).select_from(User).where(User.shop_name.isnot(None))
    if cutoff:
        seller_count_q = seller_count_q.where(User.created_at >= cutoff)
    total_seller_count = await db.scalar(seller_count_q) or 0

    top_sellers_base = select(User).where(User.shop_name.isnot(None))
    if cutoff:
        top_sellers_base = top_sellers_base.where(User.created_at >= cutoff)
    top_sellers_q = await db.execute(
        top_sellers_base
        .order_by(User.total_sales.desc())
        .offset(sellers_offset)
        .limit(sellers_limit)
    )
    top_sellers = []
    for s in top_sellers_q.scalars().all():
        top_sellers.append({
            "id": s.id,
            "username": s.username,
            "shop_name": s.shop_name,
            "avatar_url": s.avatar_url,
            "shop_image": s.shop_image,
            "total_sales": s.total_sales or 0,
            "seller_rating": s.seller_rating or 0.0,
            "collateral": s.collateral or 0.0,
            "is_featured": s.is_featured,
        })

    # Recent orders (paginated)
    order_count_q2 = select(func.count()).select_from(Order)
    if cutoff:
        order_count_q2 = order_count_q2.where(Order.created_at >= cutoff)
    total_order_count = await db.scalar(order_count_q2) or 0

    recent_orders_base = select(Order).options(selectinload(Order.buyer), selectinload(Order.items).selectinload(OrderItem.product))
    if cutoff:
        recent_orders_base = recent_orders_base.where(Order.created_at >= cutoff)
    recent_orders_q = await db.execute(
        recent_orders_base
        .order_by(Order.created_at.desc())
        .offset(orders_offset)
        .limit(orders_limit)
    )
    recent_orders = []
    for o in recent_orders_q.scalars().all():
        recent_orders.append({
            "id": o.id,
            "buyer_username": o.buyer.username if o.buyer else "?",
            "total_amount": o.total_amount,
            "status": o.status.value if o.status else "unknown",
            "created_at": o.created_at.isoformat() if o.created_at else None,
            "item_count": len(o.items),
            "product_name": o.items[0].product.name if o.items and o.items[0].product else None,
        })

    # Top products by sales_count (paginated)
    product_count_q = select(func.count()).select_from(Product).where(Product.is_active == True)
    if cutoff:
        product_count_q = product_count_q.where(Product.created_at >= cutoff)
    total_product_count = await db.scalar(product_count_q) or 0

    top_products_base = select(Product).options(selectinload(Product.seller)).where(Product.is_active == True)
    if cutoff:
        top_products_base = top_products_base.where(Product.created_at >= cutoff)
    top_products_q = await db.execute(
        top_products_base
        .order_by(Product.sales_count.desc())
        .offset(products_offset)
        .limit(products_limit)
    )
    top_products = []
    for p in top_products_q.scalars().all():
        top_products.append({
            "id": p.id,
            "name": p.name,
            "price": p.price,
            "image_url": p.image_url,
            "sales_count": p.sales_count or 0,
            "rating": p.rating or 0.0,
            "review_count": p.review_count or 0,
            "stock_count": p.stock_count or 0,
            "seller_name": p.seller.shop_name or p.seller.username if p.seller else "?",
            "seller_id": p.seller_id,
        })

    return {
        "total_users": total_users or 0,
        "total_sellers": total_sellers or 0,
        "total_products": total_products or 0,
        "total_orders": total_orders or 0,
        "completed_orders": completed_orders,
        "order_status_counts": order_status_counts,
        "total_revenue": revenue,
        "total_deposits": total_deposits,
        "platform_fee": platform_fee,
        "open_disputes": open_disputes,
        "pending_withdrawals": pending_withdrawals,
        "top_sellers": top_sellers,
        "top_sellers_total": total_seller_count,
        "recent_orders": recent_orders,
        "recent_orders_total": total_order_count,
        "top_products": top_products,
        "top_products_total": total_product_count,
    }


@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: str = Query(None),
    role: str = Query(None),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List users with server-side pagination, search and role filter."""
    query = select(User)

    # --- search filter ---
    if search and search.strip():
        _escaped = search.strip().replace("%", r"\%").replace("_", r"\_")
        needle = f"%{_escaped}%"
        query = query.where(
            (User.username.ilike(needle, escape='\\'))
            | (User.first_name.ilike(needle, escape='\\'))
            | (User.shop_name.ilike(needle, escape='\\'))
            | (func.cast(User.telegram_id, String).ilike(needle, escape='\\'))
        )

    # --- role counts (after search, before role filter) ---
    count_base = query.with_only_columns(User.id, User.role).subquery()
    role_counts_q = (
        select(count_base.c.role, func.count())
        .group_by(count_base.c.role)
    )
    role_rows = (await db.execute(role_counts_q)).all()
    role_counts = {"admin": 0, "seller": 0, "buyer": 0}
    total_all = 0
    for r, c in role_rows:
        key = r.value if hasattr(r, "value") else str(r).lower()
        role_counts[key] = c
        total_all += c

    # --- role filter ---
    if role and role not in ("all", ""):
        try:
            role_enum = UserRole(role)
            query = query.where(User.role == role_enum)
        except ValueError:
            pass

    # --- total matching ---
    total = await db.scalar(
        select(func.count()).select_from(query.with_only_columns(User.id).subquery())
    )

    # --- global stats (unaffected by pagination / role filter) ---
    stats_q = select(
        func.coalesce(func.sum(User.balance), 0).label("total_balance"),
        func.count(User.id).filter(User.is_banned == True).label("banned_count"),
    )
    stats_row = (await db.execute(stats_q)).one()

    # --- order & paginate ---
    query = query.order_by(User.created_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)

    users = (await db.execute(query)).scalars().all()

    return {
        "items": [UserSchema.model_validate(u) for u in users],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),  # ceil division
        "role_counts": {**role_counts, "total": total_all},
        "stats": {
            "total_balance": float(stats_row.total_balance),
            "banned_count": int(stats_row.banned_count),
        },
    }


@router.put("/users/{user_id}/role")
async def update_user_role(
    user_id: int,
    role: UserRole,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Update user role"""
    reject_impersonation(current_user)
    if role == UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="Cannot promote to admin via this endpoint")

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Auto-set shop_name for seller role if not present
    if role == UserRole.SELLER and not user.shop_name:
        user.shop_name = user.username or f"Shop_{user.id}"

    old_role = user.role
    user.role = role

    if old_role != role:
        await create_notification(
            db, user_id=user.id, type="status_changed",
            title="Account status updated",
            body=f"Your role changed from {old_role.value} to {role.value}.",
            link="/settings", telegram_id=user.telegram_id,
        )

    await db.commit()
    
    return {"message": f"User role updated to {role}"}


@router.put("/users/{user_id}/seller-rank")
async def update_seller_rank(
    user_id: int,
    rank: int = Query(..., ge=0, le=3, description="0=Free, 1=Bronze, 2=Silver, 3=Gold"),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: set a user's seller rank directly (bypassing payment)."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")

    rank_names = {0: "Free", 1: "Bronze", 2: "Silver", 3: "Gold"}

    # Auto-promote to seller role if needed
    if rank > 0 and user.role == UserRole.BUYER:
        user.role = UserRole.SELLER
        if not user.shop_name:
            user.shop_name = user.username or f"Shop_{user.id}"

    old_rank = user.seller_rank or 0
    user.seller_rank = rank

    # Set 30-day expiry for paid ranks, clear for free
    if rank > 0:
        from datetime import datetime, timedelta
        user.seller_expires_at = datetime.utcnow() + timedelta(days=30)

        # Apply featured status if rank includes it
        from app.routers.sellers import _get_seller_ranks
        rank_config = await _get_seller_ranks(db)
        rank_info = rank_config.get(rank)
        if rank_info:
            featured_days = rank_info.get("featured_days", 0)
            if featured_days > 0:
                user.is_featured = True
                user.featured_expires_at = datetime.utcnow() + timedelta(days=featured_days)
    else:
        user.seller_expires_at = None

    if old_rank != rank:
        await create_notification(
            db, user_id=user.id, type="status_changed",
            title="Seller rank updated",
            body=f"Your seller rank has been changed to {rank_names.get(rank, 'Unknown')}.",
            link="/settings", telegram_id=user.telegram_id,
        )

    await db.commit()
    return {"message": f"Seller rank set to {rank_names.get(rank, rank)}"}


@router.post("/users/{user_id}/ban")
@limiter.limit("10/minute")
async def ban_user(
    user_id: int,
    ban: bool = True,
    reason: Optional[str] = None,
    request: Request = None,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Ban or unban a user"""
    reject_impersonation(current_user)
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user.role == UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="Cannot ban an admin")
    
    user.is_banned = ban
    user.ban_reason = (reason or "")[:500] if ban else None
    user.banned_at = datetime.utcnow() if ban else None
    
    # Invalidate all tokens
    if ban:
        user.token_version = (user.token_version or 0) + 1
    
    await db.commit()
    return {"message": f"User {'banned' if ban else 'unbanned'}"}


# ---- Warning System ----

# Restriction escalation: warning# -> days restricted
WARNING_RESTRICTION = {1: 0, 2: 1, 3: 7}  # 1st=none, 2nd=1d, 3rd=7d, 4+=30d
DEFAULT_RESTRICTION_DAYS = 30


class WarnUserRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=500)
    context: Optional[str] = Field(None, max_length=50)  # e.g. "wtb", "product"
    context_id: Optional[int] = None


@router.post("/users/{user_id}/warn")
async def warn_user(
    user_id: int,
    payload: WarnUserRequest,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Issue a warning to a user. Repeated warnings auto-restrict posting."""
    result = await db.execute(select(User).where(User.id == user_id).with_for_update())
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    if user.role == UserRole.ADMIN:
        raise HTTPException(400, "Cannot warn an admin")

    # Increment warning count
    user.warning_count = (user.warning_count or 0) + 1
    warning_num = user.warning_count

    # Determine restriction duration
    restriction_days = WARNING_RESTRICTION.get(warning_num, DEFAULT_RESTRICTION_DAYS)
    if restriction_days > 0:
        user.restricted_until = datetime.utcnow() + timedelta(days=restriction_days)

    # Create warning record
    warning = UserWarning(
        user_id=user_id,
        admin_id=current_user.id,
        reason=payload.reason.strip(),
        context=payload.context,
        context_id=payload.context_id,
        warning_number=warning_num,
        restriction_days=restriction_days,
    )
    db.add(warning)

    # Build notification
    if restriction_days > 0:
        body = f"Reason: {payload.reason.strip()}\nYou are temporarily restricted from posting for {restriction_days} day{'s' if restriction_days != 1 else ''}."
        title = f"⚠️ Warning #{warning_num} — Posting Restricted"
    else:
        body = f"Reason: {payload.reason.strip()}\nPlease review the rules to avoid further action."
        title = f"⚠️ Warning #{warning_num}"

    await create_notification(
        db,
        user_id=user_id,
        type="admin_warning",
        title=title,
        body=body,
        link="/notifications",
        telegram_id=user.telegram_id,
    )

    await db.commit()
    return {
        "ok": True,
        "warning_number": warning_num,
        "restriction_days": restriction_days,
        "restricted_until": user.restricted_until.isoformat() if user.restricted_until else None,
    }


@router.get("/users/{user_id}/warnings")
async def get_user_warnings(
    user_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List all warnings issued to a user."""
    result = await db.execute(
        select(UserWarning)
        .where(UserWarning.user_id == user_id)
        .order_by(UserWarning.created_at.desc())
    )
    warnings = result.scalars().all()
    return [
        {
            "id": w.id,
            "reason": w.reason,
            "context": w.context,
            "context_id": w.context_id,
            "warning_number": w.warning_number,
            "restriction_days": w.restriction_days,
            "created_at": w.created_at.isoformat() if w.created_at else None,
        }
        for w in warnings
    ]


@router.delete("/users/{user_id}/warnings")
async def clear_user_warnings(
    user_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Clear all warnings and remove restriction for a user."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "User not found")
    user.warning_count = 0
    user.restricted_until = None
    # Delete warning records
    await db.execute(
        select(UserWarning).where(UserWarning.user_id == user_id)
    )
    from sqlalchemy import delete as sql_delete
    await db.execute(sql_delete(UserWarning).where(UserWarning.user_id == user_id))
    await db.commit()
    return {"ok": True, "message": "Warnings cleared"}


@router.post("/users/{user_id}/avatar")
@limiter.limit("10/minute")
async def upload_user_avatar(
    user_id: int,
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin: upload user's avatar/profile picture"""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    MAX_SIZE = 2 * 1024 * 1024  # 2MB
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="Avatar too large (max 2MB)")
    
    ext = (file.filename or "avatar.png").rsplit(".", 1)[-1].lower()
    if ext not in ("png", "jpg", "jpeg", "webp", "gif"):
        raise HTTPException(status_code=400, detail="Only PNG/JPG/WebP/GIF allowed")
    
    # Save to uploads/avatars/
    avatars_dir = os.path.join(UPLOAD_DIR, "avatars")
    os.makedirs(avatars_dir, exist_ok=True)
    
    filename = f"user_{user_id}.{ext}"
    filepath = os.path.join(avatars_dir, filename)
    
    # Remove old avatar if exists with different extension
    for old_ext in ("png", "jpg", "jpeg", "webp", "gif"):
        old_path = os.path.join(avatars_dir, f"user_{user_id}.{old_ext}")
        if os.path.exists(old_path) and old_path != filepath:
            os.remove(old_path)
    
    with open(filepath, "wb") as f:
        f.write(content)
    
    user.avatar_url = f"/api/admin/avatars/{filename}"
    await db.commit()
    
    return {"message": "Avatar uploaded", "avatar_url": user.avatar_url}


@router.get("/avatars/{filename}")
async def serve_avatar(filename: str):
    """Serve user avatar file"""
    safe_name = os.path.basename(filename)
    filepath = os.path.join(UPLOAD_DIR, "avatars", safe_name)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Avatar not found")
    return FileResponse(filepath)


@router.post("/users/create")
async def admin_create_user(
    username: str,
    role: UserRole = UserRole.SELLER,
    shop_name: Optional[str] = None,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin: create a fictional user (puppet account)"""
    # Generate a unique fake telegram_id
    fake_tid = f"fake_{uuid.uuid4().hex[:12]}"
    
    # Check username uniqueness
    existing = await db.execute(select(User).where(User.username == username))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already taken")
    
    if role == UserRole.ADMIN:
        raise HTTPException(status_code=400, detail="Cannot create admin users via this endpoint")

    new_user = User(
        telegram_id=fake_tid,
        username=username,
        first_name=username,
        role=role,
        balance=0.0,
        is_active=True,
    )
    
    # If seller, set shop fields
    if role == UserRole.SELLER or shop_name:
        new_user.shop_name = shop_name or f"{username}'s Shop"
        new_user.role = UserRole.SELLER
    
    db.add(new_user)
    await db.commit()
    await db.refresh(new_user)
    
    return {"message": f"User @{username} created (ID: {new_user.id})", "user_id": new_user.id}


@router.post("/users/{user_id}/impersonate")
@limiter.limit("10/minute")
async def admin_impersonate_user(
    user_id: int,
    request: Request,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin: generate a token to impersonate a user"""
    result = await db.execute(select(User).where(User.id == user_id))
    target = result.scalar_one_or_none()
    
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    
    if target.role == UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Cannot impersonate admin users")
    
    # Create token with impersonation audit claim and token version for invalidation
    # Use short expiry (15 minutes) for security
    # imp=True flag restricts sensitive operations (PIN, withdrawals, profile changes)
    from datetime import timedelta
    token = create_access_token(
        data={
            "sub": target.telegram_id,
            "tv": target.token_version or 0,
            "imp": True,
            "impersonated_by": current_user.telegram_id
        },
        expires_delta=timedelta(minutes=15)
    )
    
    # Log impersonation event
    import logging
    logging.getLogger("audit").warning(
        f"IMPERSONATION: Admin {current_user.username} (ID:{current_user.id}) "
        f"impersonated {target.username} (ID:{target.id})"
    )
    
    return {
        "access_token": token,
        "user_id": target.id,
        "username": target.username,
        "role": target.role.value,
    }


@router.put("/sellers/{seller_id}/collateral")
async def admin_set_collateral(
    seller_id: int,
    amount: float = 0.0,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin: set seller collateral (e.g. reset to 0 as penalty)"""
    result = await db.execute(
        select(User).where(User.id == seller_id, User.shop_name.isnot(None))
    )
    seller = result.scalar_one_or_none()
    
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    
    seller.collateral = round(max(amount, 0.0), 2)
    await db.commit()
    
    return {"message": f"Seller collateral set to ${seller.collateral:.2f}"}


@router.put("/sellers/{seller_id}/expiry")
async def admin_set_seller_expiry(
    seller_id: int,
    days: int = Query(..., ge=0, le=365),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin: set custom seller subscription expiry. days=0 clears expiry (never expires)."""
    result = await db.execute(
        select(User).where(User.id == seller_id, User.shop_name.isnot(None))
    )
    seller = result.scalar_one_or_none()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")

    if days == 0:
        seller.seller_expires_at = None
        msg = "Seller expiry cleared (never expires)"
    else:
        seller.seller_expires_at = datetime.utcnow() + timedelta(days=days)
        msg = f"Seller expiry set to {days} days from now"

    await db.commit()
    return {"message": msg}


@router.get("/sellers/{seller_id}/orders")
async def seller_orders(
    seller_id: int,
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Get orders for a specific seller with stats."""
    # Orders where seller appears in order_items
    order_ids_sq = (
        select(OrderItem.order_id)
        .where(OrderItem.seller_id == seller_id)
        .distinct()
        .subquery()
    )

    base = (
        select(Order, User)
        .join(User, User.id == Order.buyer_id)
        .where(Order.id.in_(select(order_ids_sq.c.order_id)))
    )
    count_q = (
        select(func.count())
        .select_from(Order)
        .where(Order.id.in_(select(order_ids_sq.c.order_id)))
    )

    total = (await db.execute(count_q)).scalar() or 0
    pages = max(1, -(-total // per_page))

    rows = (
        await db.execute(
            base.order_by(Order.created_at.desc())
            .offset((page - 1) * per_page)
            .limit(per_page)
        )
    ).all()

    # Seller revenue stats
    stats_q = select(
        func.count(func.distinct(Order.id)),
        func.coalesce(func.sum(OrderItem.price * OrderItem.quantity), 0),
    ).select_from(OrderItem).join(Order, Order.id == OrderItem.order_id).where(
        OrderItem.seller_id == seller_id,
        Order.status.in_([OrderStatus.COMPLETED, OrderStatus.DELIVERED])
    )
    stats_res = (await db.execute(stats_q)).one()
    completed_orders = stats_res[0] or 0
    total_revenue = float(stats_res[1] or 0)

    items = []
    for order, buyer in rows:
        # Get seller's items in this order
        oi_q = await db.execute(
            select(OrderItem)
            .options(selectinload(OrderItem.product))
            .where(OrderItem.order_id == order.id, OrderItem.seller_id == seller_id)
        )
        seller_items = oi_q.scalars().all()

        seller_total = sum(oi.price * oi.quantity for oi in seller_items)
        product_names = [oi.product.name if oi.product else f"Item #{oi.id}" for oi in seller_items]

        items.append({
            "id": order.id,
            "buyer_username": buyer.username,
            "buyer_first_name": buyer.first_name,
            "status": order.status.value,
            "total_amount": float(order.total_amount),
            "seller_amount": round(seller_total, 2),
            "product_names": product_names,
            "quantity": sum(oi.quantity for oi in seller_items),
            "created_at": order.created_at.isoformat() if order.created_at else None,
            "completed_at": order.completed_at.isoformat() if order.completed_at else None,
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "pages": pages,
        "completed_orders": completed_orders,
        "total_revenue": round(total_revenue, 2),
    }


@router.get("/sellers")
async def list_sellers(
    search: Optional[str] = None,
    filter: Optional[str] = None,  # "featured", "collateral", "active"
    sort_by: Optional[str] = "sales",
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """List sellers with pagination, search, product count."""
    # Subquery for product count
    product_count_sq = (
        select(Product.seller_id, func.count(Product.id).label("product_count"))
        .group_by(Product.seller_id)
        .subquery()
    )

    base = (
        select(User, func.coalesce(product_count_sq.c.product_count, 0).label("product_count"))
        .outerjoin(product_count_sq, User.id == product_count_sq.c.seller_id)
        .where(User.shop_name.isnot(None))
    )
    count_base = select(func.count()).select_from(User).where(User.shop_name.isnot(None))

    filters = []
    if search and search.strip():
        needle = f"%{_escape_like(search.strip())}%"
        filters.append(
            (User.username.ilike(needle)) |
            (User.first_name.ilike(needle)) |
            (User.shop_name.ilike(needle)) |
            (func.cast(User.telegram_id, String).ilike(needle))
        )
    if filter == "featured":
        filters.append(User.is_featured == True)
    elif filter == "collateral":
        filters.append(User.collateral > 0)
    elif filter == "active":
        filters.append(User.total_sales > 0)

    for f in filters:
        base = base.where(f)
        count_base = count_base.where(f)

    # Sorting
    sort_map = {
        "sales": User.total_sales.desc(),
        "rating": User.seller_rating.desc(),
        "collateral": User.collateral.desc(),
        "rank": User.seller_rank.desc(),
        "newest": User.created_at.desc(),
    }
    base = base.order_by(sort_map.get(sort_by, User.total_sales.desc()))

    total = (await db.execute(count_base)).scalar() or 0
    pages = max(1, -(-total // per_page))

    rows = (await db.execute(base.offset((page - 1) * per_page).limit(per_page))).all()

    items = []
    for row in rows:
        seller = row[0]
        pc = row[1]
        seller_dict = SellerProfile.model_validate(seller).model_dump()
        seller_dict["product_count"] = pc
        items.append(seller_dict)

    return {
        "items": items,
        "total": total,
        "page": page,
        "pages": pages,
    }


@router.get("/products")
async def admin_list_products(
    seller_id: int = None,
    search: Optional[str] = None,
    stock_filter: Optional[str] = None,  # "out", "low", "instock"
    sort_by: Optional[str] = "stock_asc",  # stock_asc, stock_desc, sales, price, name, created
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """List all products with pagination, search, stock filter, and sorting"""
    base = select(Product).options(
        selectinload(Product.seller),
        selectinload(Product.category),
    )
    count_base = select(func.count()).select_from(Product)

    filters = []
    if seller_id:
        filters.append(Product.seller_id == seller_id)
    if search and search.strip():
        needle = f"%{_escape_like(search.strip())}%"
        filters.append(
            (Product.name.ilike(needle)) |
            (Product.game_name.ilike(needle)) |
            (Product.platform.ilike(needle))
        )
    if stock_filter == "out":
        filters.append((Product.stock_count == 0) | (Product.stock_count.is_(None)))
    elif stock_filter == "low":
        filters.append(Product.stock_count > 0)
        filters.append(Product.stock_count <= 5)
    elif stock_filter == "instock":
        filters.append(Product.stock_count > 5)

    for f in filters:
        base = base.where(f)
        count_base = count_base.where(f)

    # Sorting
    sort_map = {
        "stock_asc": Product.stock_count.asc(),
        "stock_desc": Product.stock_count.desc(),
        "sales": Product.sales_count.desc(),
        "price": Product.price.desc(),
        "name": Product.name.asc(),
        "created": Product.created_at.desc(),
    }
    base = base.order_by(sort_map.get(sort_by, Product.stock_count.asc()))

    # Counts (all products, ignoring stock_filter for summary)
    count_all_filters = []
    if seller_id:
        count_all_filters.append(Product.seller_id == seller_id)
    if search and search.strip():
        needle = f"%{_escape_like(search.strip())}%"
        count_all_filters.append(
            (Product.name.ilike(needle)) |
            (Product.game_name.ilike(needle)) |
            (Product.platform.ilike(needle))
        )

    def _count_query(extra_filters=None):
        q = select(func.count()).select_from(Product)
        for f in count_all_filters:
            q = q.where(f)
        if extra_filters:
            for f in extra_filters:
                q = q.where(f)
        return q

    total_res = await db.execute(count_base)
    total = total_res.scalar() or 0

    all_res = await db.execute(_count_query())
    all_count = all_res.scalar() or 0

    out_res = await db.execute(_count_query([(Product.stock_count == 0) | (Product.stock_count.is_(None))]))
    out_count = out_res.scalar() or 0

    low_res = await db.execute(_count_query([Product.stock_count > 0, Product.stock_count <= 5]))
    low_count = low_res.scalar() or 0

    instock_count = all_count - out_count - low_count

    # Sum stats (for filtered set)
    stats_q = select(
        func.coalesce(func.sum(Product.stock_count), 0),
        func.coalesce(func.sum(Product.sales_count), 0),
    ).select_from(Product)
    for f in filters:
        stats_q = stats_q.where(f)
    stats_res = await db.execute(stats_q)
    total_stock, total_sales = stats_res.one()

    # Paginate
    pages = max(1, (total + per_page - 1) // per_page)
    offset = (page - 1) * per_page
    result = await db.execute(base.offset(offset).limit(per_page))
    products = result.scalars().all()

    return {
        "items": [
            {
                "id": p.id,
                "name": p.name,
                "price": p.price,
                "stock_count": p.stock_count or 0,
                "sales_count": p.sales_count or 0,
                "is_active": p.is_active,
                "platform": p.platform,
                "game_name": p.game_name,
                "region": p.region,
                "tags": json.loads(p.tags) if p.tags else [],
                "rating": p.rating or 0,
                "review_count": p.review_count or 0,
                "category_name": p.category.name if p.category else None,
                "seller_id": p.seller_id,
                "seller_shop": p.seller.shop_name if p.seller else None,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in products
        ],
        "total": total,
        "pages": pages,
        "page": page,
        "stock_counts": {
            "all": all_count,
            "out": out_count,
            "low": low_count,
            "instock": instock_count,
        },
        "total_stock": int(total_stock),
        "total_sales": int(total_sales),
    }


@router.get("/orders", response_model=List[AdminOrder])
async def admin_list_orders(
    status: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """List all orders for admin — with optional status filter and search"""
    query = (
        select(Order, User)
        .join(User, User.id == Order.buyer_id)
        .options(
            selectinload(Order.items).selectinload(OrderItem.product).selectinload(Product.seller)
        )
    )

    if status and status != "all":
        try:
            os = OrderStatus(status)
            query = query.where(Order.status == os)
        except ValueError:
            pass

    if search:
        _escaped = search.replace("%", r"\%").replace("_", r"\_")
        needle = f"%{_escaped}%"
        query = query.where(
            (User.username.ilike(needle, escape='\\')) |
            (User.first_name.ilike(needle, escape='\\')) |
            (func.cast(Order.id, String).ilike(needle, escape='\\'))
        )

    total = await db.scalar(
        select(func.count()).select_from(
            query.with_only_columns(Order.id).subquery()
        )
    )

    query = query.order_by(Order.created_at.desc()).offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)

    orders = []
    for order, buyer in result.unique().all():
        # Check for active disputes
        dispute_count = await db.scalar(
            select(func.count(Dispute.id)).where(
                Dispute.order_id == order.id,
                Dispute.status.in_([DisputeStatus.OPEN, DisputeStatus.ESCALATED])
            )
        )

        items = []
        for item in order.items:
            items.append(AdminOrderItem(
                product_id=item.product_id,
                product_name=item.product.name if item.product else None,
                seller_id=item.seller_id,
                seller_shop=item.product.seller.shop_name if item.product and item.product.seller else None,
                quantity=item.quantity,
                price=item.price,
            ))

        orders.append(AdminOrder(
            id=order.id,
            buyer_id=order.buyer_id,
            buyer_username=buyer.username,
            buyer_first_name=buyer.first_name,
            total_amount=order.total_amount,
            status=order.status,
            created_at=order.created_at,
            paid_at=order.paid_at,
            delivered_at=order.delivered_at,
            auto_complete_at=order.auto_complete_at,
            completed_at=order.completed_at,
            is_buyer_confirmed=order.is_buyer_confirmed,
            has_dispute=dispute_count > 0,
            items=items,
        ))

    return orders


@router.put("/sellers/{seller_id}/feature")
async def toggle_featured_seller(
    seller_id: int,
    featured: bool = True,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Toggle featured status on a seller"""
    result = await db.execute(
        select(User).where(User.id == seller_id, User.shop_name.isnot(None))
    )
    seller = result.scalar_one_or_none()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    
    seller.is_featured = featured
    await db.commit()
    return {"message": f"Seller {'featured' if featured else 'unfeatured'}"}


@router.post("/categories", response_model=CategorySchema)
async def create_category(
    category: CategoryCreate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Create a new category"""
    if category.parent_id:
        parent = await db.execute(select(Category).where(Category.id == category.parent_id))
        if not parent.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Parent category not found")
    db_category = Category(**category.model_dump())
    db.add(db_category)
    await db.commit()
    await db.refresh(db_category)
    return db_category


@router.get("/categories", response_model=List[CategorySchema])
async def list_categories(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """List all categories for admin"""
    result = await db.execute(select(Category).order_by(Category.parent_id.is_(None).desc(), Category.name))
    return result.scalars().all()


@router.put("/categories/{category_id}", response_model=CategorySchema)
async def update_category(
    category_id: int,
    payload: CategoryUpdate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Update a category"""
    result = await db.execute(select(Category).where(Category.id == category_id))
    category = result.scalar_one_or_none()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(category, field, value)
    await db.commit()
    await db.refresh(category)
    return category


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Delete a category"""
    result = await db.execute(select(Category).where(Category.id == category_id))
    category = result.scalar_one_or_none()
    
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    
    await db.delete(category)
    await db.commit()
    
    return {"message": "Category deleted"}


@router.post("/seed")
async def seed_data(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Seed initial categories"""
    categories = [
        {"name": "Game Keys", "slug": "game-keys", "icon": "🎮"},
        {"name": "In-Game Currency", "slug": "currency", "icon": "💰"},
        {"name": "Gift Cards", "slug": "gift-cards", "icon": "🎁"},
        {"name": "Subscriptions", "slug": "subscriptions", "icon": "📺"},
        {"name": "Software", "slug": "software", "icon": "💻"},
    ]
    
    for cat in categories:
        existing = await db.execute(select(Category).where(Category.slug == cat["slug"]))
        if not existing.scalar_one_or_none():
            db.add(Category(**cat))
    
    await db.commit()
    return {"message": "Data seeded"}


@router.get("/banners", response_model=List[BannerSchema])
async def list_banners(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Banner).order_by(Banner.sort_order.asc(), Banner.created_at.desc()))
    return result.scalars().all()


@router.post("/banners", response_model=BannerSchema)
async def create_banner(
    payload: BannerCreate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    banner = Banner(**payload.model_dump())
    db.add(banner)
    await db.commit()
    await db.refresh(banner)
    return banner


@router.put("/banners/{banner_id}", response_model=BannerSchema)
async def update_banner(
    banner_id: int,
    payload: BannerUpdate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Banner).where(Banner.id == banner_id))
    banner = result.scalar_one_or_none()
    if not banner:
        raise HTTPException(status_code=404, detail="Banner not found")

    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(banner, field, value)

    await db.commit()
    await db.refresh(banner)
    return banner


@router.delete("/banners/{banner_id}")
async def delete_banner(
    banner_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(Banner).where(Banner.id == banner_id))
    banner = result.scalar_one_or_none()
    if not banner:
        raise HTTPException(status_code=404, detail="Banner not found")

    await db.delete(banner)
    await db.commit()
    return {"message": "Banner deleted"}


@router.get("/deposits")
async def list_deposits(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: str = Query(None),
    status: str = Query(None),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    # Auto-expire stale deposits on read
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(hours=6)
    stale_result = await db.execute(
        select(CryptoDeposit).where(
            CryptoDeposit.payment_status.in_(["created", "waiting"]),
            CryptoDeposit.is_credited == False,
            CryptoDeposit.created_at < cutoff
        )
    )
    for dep in stale_result.scalars().all():
        dep.payment_status = "expired"
    await db.commit()

    query = (
        select(CryptoDeposit, User)
        .join(User, User.id == CryptoDeposit.user_id)
    )

    # --- search filter ---
    if search and search.strip():
        _escaped = search.strip().replace("%", r"\%").replace("_", r"\_")
        needle = f"%{_escaped}%"
        query = query.where(
            (User.username.ilike(needle, escape='\\'))
            | (User.first_name.ilike(needle, escape='\\'))
            | (func.cast(User.telegram_id, String).ilike(needle, escape='\\'))
            | (func.cast(CryptoDeposit.id, String).ilike(needle, escape='\\'))
        )

    # --- status counts (after search, before status filter) ---
    count_sub = query.with_only_columns(CryptoDeposit.id, CryptoDeposit.payment_status).subquery()
    sc_rows = (await db.execute(
        select(count_sub.c.payment_status, func.count()).group_by(count_sub.c.payment_status)
    )).all()
    status_counts = {}
    total_all = 0
    for s, c in sc_rows:
        status_counts[str(s).lower()] = c
        total_all += c

    # --- status filter ---
    if status and status not in ("all", ""):
        query = query.where(CryptoDeposit.payment_status == status)

    # --- total matching ---
    total = await db.scalar(
        select(func.count()).select_from(
            query.with_only_columns(CryptoDeposit.id).subquery()
        )
    )

    # --- order & paginate ---
    query = query.order_by(CryptoDeposit.created_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(query)
    items = []
    for deposit, user in result.all():
        items.append(
            AdminCryptoDepositItem(
                deposit_id=deposit.id,
                payment_status=deposit.payment_status,
                confirmations=deposit.confirmations or 0,
                pay_amount=deposit.pay_amount,
                pay_currency=deposit.pay_currency,
                price_amount_usd=deposit.price_amount_usd or 0.0,
                is_credited=deposit.is_credited,
                tx_hash=deposit.tx_hash,
                created_at=deposit.created_at,
                user_id=user.id,
                telegram_id=user.telegram_id,
                username=user.username,
                first_name=user.first_name
            )
        )
    # --- global stats (unfiltered) ---
    total_credited_amount = await db.scalar(
        select(func.coalesce(func.sum(CryptoDeposit.price_amount_usd), 0.0))
        .where(CryptoDeposit.is_credited == True)
    ) or 0.0
    total_credited_count = await db.scalar(
        select(func.count()).select_from(CryptoDeposit)
        .where(CryptoDeposit.is_credited == True)
    ) or 0
    pending_amount = await db.scalar(
        select(func.coalesce(func.sum(CryptoDeposit.price_amount_usd), 0.0))
        .where(
            CryptoDeposit.is_credited == False,
            CryptoDeposit.payment_status.notin_(["expired", "failed"])
        )
    ) or 0.0

    return {
        "items": [i.model_dump() for i in items],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),
        "status_counts": {**status_counts, "total": total_all},
        "stats": {
            "total_credited_amount": round(float(total_credited_amount), 2),
            "total_credited_count": total_credited_count,
            "pending_amount": round(float(pending_amount), 2),
        },
    }


@router.post("/deposits/{deposit_id}/mark-credited")
@limiter.limit("10/minute")
async def mark_deposit_credited(
    deposit_id: int,
    payload: AdminMarkCreditedRequest,
    request: Request,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    if not payload.credited:
        raise HTTPException(status_code=400, detail="Only crediting is supported")

    result = await db.execute(
        select(CryptoDeposit)
        .where(CryptoDeposit.id == deposit_id)
        .with_for_update()
    )
    deposit = result.scalar_one_or_none()
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")

    if deposit.payment_status == "manual_marked":
        return {"message": "Deposit already marked"}

    deposit.payment_status = "manual_marked"
    await db.commit()
    return {"message": "Deposit marked"}


@router.post("/deposits/{deposit_id}/credit")
@limiter.limit("10/minute")
async def credit_deposit(
    deposit_id: int,
    request: Request,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(select(CryptoDeposit).where(CryptoDeposit.id == deposit_id).with_for_update())
    deposit = result.scalar_one_or_none()
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")

    if deposit.is_credited:
        return {"message": "Deposit already credited"}

    # Lock user row to prevent race conditions on balance update
    user_result = await db.execute(
        select(User).where(User.id == deposit.user_id).with_for_update()
    )
    user = user_result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user.balance = round((user.balance or 0) + (float(deposit.price_amount_usd or 0.0)), 2)
    deposit.is_credited = True
    deposit.payment_status = "manual_credited"
    deposit.completed_at = datetime.utcnow()

    await create_notification(
        db, user_id=user.id, type="deposit_credited",
        title=f"Deposit of ${deposit.price_amount_usd:.2f} credited",
        body="An admin has credited your deposit.",
        link="/deposit", telegram_id=user.telegram_id,
    )

    await db.commit()
    return {"message": "Deposit credited"}


# ============ Withdrawal Management ============

@router.get("/withdrawals")
async def list_withdrawals(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: str = Query(None),
    search: str = Query(None),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List withdrawal requests with server-side pagination, search, and stats."""
    base = select(WithdrawalRequest, User).join(User, User.id == WithdrawalRequest.user_id)

    # --- search filter ---
    if search and search.strip():
        _esc = search.strip().replace("%", r"\%").replace("_", r"\_")
        needle = f"%{_esc}%"
        base = base.where(
            (User.username.ilike(needle, escape="\\"))
            | (User.first_name.ilike(needle, escape="\\"))
            | (WithdrawalRequest.destination.ilike(needle, escape="\\"))
            | (func.cast(WithdrawalRequest.id, String).ilike(needle, escape="\\"))
            | (func.cast(User.telegram_id, String).ilike(needle, escape="\\"))
        )

    # --- global status counts (after search, before status filter) ---
    count_sub = base.with_only_columns(WithdrawalRequest.id, WithdrawalRequest.status).subquery()
    count_q = select(count_sub.c.status, func.count()).group_by(count_sub.c.status)
    count_rows = (await db.execute(count_q)).all()
    status_counts = {"pending": 0, "processing": 0, "approved": 0, "completed": 0, "failed": 0, "rejected": 0}
    total_all = 0
    for s, c in count_rows:
        key = s.value if hasattr(s, "value") else str(s).lower()
        status_counts[key] = c
        total_all += c

    # --- global stats (sum of all matching, not just current page) ---
    stats_sub = base.with_only_columns(
        WithdrawalRequest.amount, WithdrawalRequest.net_amount, WithdrawalRequest.status
    ).subquery()
    stats_row = (await db.execute(
        select(
            func.coalesce(func.sum(stats_sub.c.amount), 0).label("total_amount"),
            func.coalesce(func.sum(stats_sub.c.net_amount), 0).label("total_net"),
        )
    )).one()
    pending_sum = await db.scalar(
        select(func.coalesce(func.sum(WithdrawalRequest.amount), 0)).where(
            WithdrawalRequest.status == WithdrawalStatus.PENDING
        )
    ) or 0

    # --- status filter ---
    if status and status not in ("all", ""):
        try:
            ws = WithdrawalStatus(status)
            base = base.where(WithdrawalRequest.status == ws)
        except ValueError:
            pass

    # --- total matching ---
    total = await db.scalar(
        select(func.count()).select_from(base.with_only_columns(WithdrawalRequest.id).subquery())
    )

    # --- order & paginate ---
    base = base.order_by(WithdrawalRequest.created_at.desc())
    base = base.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(base)
    items = []
    for wr, user in result.all():
        items.append(WithdrawalRequestSchema(
            id=wr.id,
            user_id=wr.user_id,
            amount=wr.amount,
            fee_amount=wr.fee_amount or 0,
            net_amount=wr.net_amount or wr.amount,
            destination=wr.destination,
            status=wr.status.value if hasattr(wr.status, 'value') else wr.status,
            admin_note=wr.admin_note,
            created_at=wr.created_at,
            processed_at=wr.processed_at,
            payout_id=wr.payout_id,
            payout_status=wr.payout_status,
            payout_hash=wr.payout_hash,
            payout_currency=wr.payout_currency,
            payout_amount=wr.payout_amount,
            payout_error=wr.payout_error,
            username=user.username,
            first_name=user.first_name,
            telegram_id=user.telegram_id,
            user_balance=user.balance,
        ))

    return {
        "items": [i.model_dump() for i in items],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),
        "status_counts": {**status_counts, "total": total_all},
        "stats": {
            "total_amount": float(stats_row.total_amount),
            "total_net": float(stats_row.total_net),
            "pending_sum": float(pending_sum),
        },
    }


@router.post("/withdrawals/{withdrawal_id}/approve")
@limiter.limit("10/minute")
async def approve_withdrawal(
    withdrawal_id: int,
    request: Request,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Approve a withdrawal request — sends USDT TRC-20 directly from hot wallet"""
    reject_impersonation(current_user)
    result = await db.execute(
        select(WithdrawalRequest)
        .where(WithdrawalRequest.id == withdrawal_id)
        .with_for_update()
    )
    wr = result.scalar_one_or_none()
    if not wr:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if wr.status != WithdrawalStatus.PENDING:
        raise HTTPException(status_code=400, detail="Withdrawal already processed")
    if wr.user_id == current_user.id:
        raise HTTPException(status_code=403, detail="Cannot approve your own withdrawal")
    if not wr.destination or len(wr.destination.strip()) < 10:
        raise HTTPException(status_code=400, detail="No valid USDT address on this withdrawal")

    # Mark as processing
    wr.status = WithdrawalStatus.PROCESSING
    wr.processed_at = datetime.utcnow()
    await db.commit()

    # Send USDT via Tron hot wallet
    try:
        from app.tron_payout import send_usdt
        send_amount = wr.net_amount or wr.amount  # send net amount after fee
        
        payout_result = await send_usdt(
            to_address=wr.destination.strip(),
            amount=send_amount,
            withdrawal_id=wr.id,
        )
        
        if not payout_result.get("success"):
            raise RuntimeError(payout_result.get("error", "Unknown payout error"))
        
        # Success - update withdrawal record
        wr.payout_hash = payout_result.get("txid", "")
        wr.payout_status = "FINISHED"
        wr.payout_amount = send_amount
        wr.payout_currency = "usdttrc20"
        wr.status = WithdrawalStatus.APPROVED
        
        # Get user for notification
        user_result = await db.execute(select(User).where(User.id == wr.user_id))
        user = user_result.scalar_one_or_none()
        
        await create_notification(
            db, user_id=wr.user_id, type="withdrawal_completed",
            title=f"Withdrawal of ${wr.amount:.2f} sent!",
            body=f"USDT sent to your wallet. TX: {wr.payout_hash[:20]}..." if wr.payout_hash else "USDT sent to your wallet.",
            link="/deposit",
            telegram_id=user.telegram_id if user else None,
        )
        
        await db.commit()
        return {
            "message": f"Withdrawal #{wr.id} completed! USDT sent to {wr.destination[:10]}...{wr.destination[-6:]}",
            "txid": wr.payout_hash,
            "status": "FINISHED"
        }
        
    except Exception as e:
        # Payout failed — mark as failed, keep balance deducted (admin can retry or reject)
        import logging
        logging.getLogger("audit").error(
            f"PAYOUT_FAILED: Withdrawal #{wr.id} amount=${wr.amount:.2f} "
            f"address={wr.destination} error={str(e)}"
        )
        wr.status = WithdrawalStatus.FAILED
        wr.payout_error = str(e)[:500]
        
        await create_notification(
            db, user_id=wr.user_id, type="withdrawal_failed",
            title="Withdrawal payout failed",
            body="Admin has been notified. Your funds are safe.",
            link="/deposit",
        )
        
        await db.commit()
        raise HTTPException(
            status_code=502,
            detail="Payout failed. Withdrawal marked as failed — retry or reject."
        )


@router.post("/withdrawals/{withdrawal_id}/reject")
@limiter.limit("10/minute")
async def reject_withdrawal(
    withdrawal_id: int,
    note: str = "",
    request: Request = None,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Reject a withdrawal request — refunds the reserved balance"""
    reject_impersonation(current_user)
    result = await db.execute(
        select(WithdrawalRequest)
        .where(WithdrawalRequest.id == withdrawal_id)
        .with_for_update()
    )
    wr = result.scalar_one_or_none()
    if not wr:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if wr.status not in (WithdrawalStatus.PENDING, WithdrawalStatus.FAILED):
        raise HTTPException(status_code=400, detail="Can only reject pending or failed withdrawals")

    # Refund the reserved balance
    user_result = await db.execute(
        select(User).where(User.id == wr.user_id).with_for_update()
    )
    user = user_result.scalar_one()
    user.balance = round((user.balance or 0) + (wr.amount), 2)

    wr.status = WithdrawalStatus.REJECTED
    wr.admin_note = note or None
    wr.processed_at = datetime.utcnow()

    await create_notification(
        db, user_id=wr.user_id, type="withdrawal_rejected",
        title=f"Withdrawal of ${wr.amount:.2f} rejected",
        body=note[:120] if note else "Your withdrawal request was rejected. Funds returned to balance.",
        link="/deposit", telegram_id=user.telegram_id,
    )

    await db.commit()
    return {"message": f"Withdrawal #{wr.id} rejected. ${wr.amount:.2f} refunded to user balance."}


@router.post("/withdrawals/{withdrawal_id}/retry")
@limiter.limit("10/minute")
async def retry_withdrawal(
    withdrawal_id: int,
    request: Request,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Retry a failed payout — resets to PENDING so admin can approve again"""
    result = await db.execute(select(WithdrawalRequest).where(WithdrawalRequest.id == withdrawal_id))
    wr = result.scalar_one_or_none()
    if not wr:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    if wr.status != WithdrawalStatus.FAILED:
        raise HTTPException(status_code=400, detail="Can only retry failed withdrawals")

    wr.status = WithdrawalStatus.PENDING
    wr.payout_error = None
    wr.payout_id = None
    wr.payout_status = None
    wr.processed_at = None

    await db.commit()
    return {"message": f"Withdrawal #{wr.id} reset to pending. You can approve it again."}


@router.get("/hot-wallet")
async def get_hot_wallet_balance(
    current_user: User = Depends(get_current_admin),
):
    """Get hot wallet balance (TRX and USDT TRC-20)"""
    try:
        from app.tron_payout import get_wallet_balance
        return await get_wallet_balance()
    except Exception as e:
        import logging
        logging.getLogger("audit").error(f"HOT_WALLET_ERROR: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to fetch hot wallet balance")


# ============ Disputes ============

@router.get("/disputes")
async def list_disputes(
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    status: str = Query("all"),
    search: str = Query(None),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """List disputes with server-side pagination, search, and global stats."""
    # --- Aliases for joined tables ---
    Opener = aliased(User)
    Seller = aliased(User)

    base = (
        select(Dispute, Order, Opener)
        .join(Order, Order.id == Dispute.order_id)
        .join(Opener, Opener.id == Dispute.opened_by)
    )

    # --- search filter ---
    if search and search.strip():
        _esc = search.strip().replace("%", r"\%").replace("_", r"\_")
        needle = f"%{_esc}%"
        base = base.where(
            (Opener.username.ilike(needle, escape="\\"))
            | (Opener.first_name.ilike(needle, escape="\\"))
            | (Dispute.reason.ilike(needle, escape="\\"))
            | (func.cast(Dispute.order_id, String).ilike(needle, escape="\\"))
            | (func.cast(Dispute.id, String).ilike(needle, escape="\\"))
        )

    # --- global status counts (after search, before status filter) ---
    count_sub = base.with_only_columns(Dispute.id, Dispute.status).subquery()
    count_q = select(count_sub.c.status, func.count()).group_by(count_sub.c.status)
    count_rows = (await db.execute(count_q)).all()
    status_counts = {"open": 0, "escalated": 0, "resolved": 0, "closed": 0}
    total_all = 0
    for s, c in count_rows:
        key = s.value if hasattr(s, "value") else str(s).lower()
        status_counts[key] = c
        total_all += c

    # --- global stats ---
    stats_sub = base.with_only_columns(Dispute.id, Order.total_amount).subquery()
    total_value = await db.scalar(
        select(func.coalesce(func.sum(stats_sub.c.total_amount), 0))
    ) or 0

    # --- status filter ---
    if status != "all":
        try:
            ds = DisputeStatus(status)
            base = base.where(Dispute.status == ds)
        except ValueError:
            pass

    # --- total matching ---
    total = await db.scalar(
        select(func.count()).select_from(base.with_only_columns(Dispute.id).subquery())
    )

    # --- order & paginate ---
    base = base.order_by(Dispute.created_at.desc())
    base = base.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(base)

    disputes = []
    for dispute, order, opener in result.all():
        # Get seller username
        seller_q = await db.execute(
            select(User).join(OrderItem, OrderItem.seller_id == User.id).where(OrderItem.order_id == order.id).limit(1)
        )
        seller = seller_q.scalar_one_or_none()

        disputes.append(DisputeSchema(
            id=dispute.id, order_id=dispute.order_id, opened_by=dispute.opened_by,
            reason=dispute.reason, status=dispute.status, resolution=dispute.resolution,
            resolved_by=dispute.resolved_by, created_at=dispute.created_at,
            resolved_at=dispute.resolved_at,
            opener_username=opener.username, opener_first_name=opener.first_name,
            order_total=order.total_amount, order_status=order.status.value,
            seller_username=seller.username if seller else None,
        ))

    return {
        "items": [d.model_dump() for d in disputes],
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),
        "status_counts": {**status_counts, "total": total_all},
        "stats": {
            "total_value": float(total_value),
            "open": status_counts.get("open", 0),
            "escalated": status_counts.get("escalated", 0),
        },
    }


@router.post("/disputes/{dispute_id}/resolve")
@limiter.limit("10/minute")
async def resolve_dispute(
    dispute_id: int,
    data: DisputeResolve,
    request: Request,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin resolves a dispute — refund buyer or favor seller"""
    result = await db.execute(select(Dispute).where(Dispute.id == dispute_id))
    dispute = result.scalar_one_or_none()
    if not dispute:
        raise HTTPException(status_code=404, detail="Dispute not found")
    if dispute.status not in (DisputeStatus.OPEN, DisputeStatus.ESCALATED):
        raise HTTPException(status_code=400, detail="Dispute already resolved")

    order_result = await db.execute(select(Order).where(Order.id == dispute.order_id))
    order = order_result.scalar_one()
    seller_ids_result = await db.execute(
        select(OrderItem.seller_id).where(OrderItem.order_id == order.id).distinct()
    )
    seller_ids = [sid for (sid,) in seller_ids_result.all()]

    dispute.status = DisputeStatus.RESOLVED
    dispute.resolution = data.resolution
    dispute.resolved_by = current_user.id
    dispute.resolved_at = datetime.utcnow()

    if data.action == "refund_buyer":
        # Refund buyer - lock buyer row first
        buyer_result = await db.execute(
            select(User).where(User.id == order.buyer_id).with_for_update()
        )
        buyer = buyer_result.scalar_one()
        buyer.balance = round((buyer.balance or 0) + (order.total_amount), 2)
        order.status = OrderStatus.REFUNDED

        # Deduct from seller(s) - use appropriate fee based on item type
        # Funds are in pending_balance (escrow) during dispute, not balance
        fee_settings = await get_fee_settings(db)
        items_result = await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))
        for item in items_result.scalars().all():
            # Lock seller row to prevent race conditions
            seller_result = await db.execute(
                select(User).where(User.id == item.seller_id).with_for_update()
            )
            seller = seller_result.scalar_one()
            if item.auction_id:
                item_earnings = calc_seller_amount(item.price * item.quantity, fee_settings["auction_fee"])
            else:
                item_earnings = calc_seller_amount(item.price * item.quantity, fee_settings["product_fee"])
            seller.pending_balance = round(max(0, (seller.pending_balance or 0) - item_earnings), 2)  # deduct from escrow

        msg_text = f"Admin resolved in favor of buyer (refund): {data.resolution}"
    else:
        # favor_seller — close dispute, order completed, seller keeps funds
        order.status = OrderStatus.COMPLETED
        order.completed_at = datetime.utcnow()

        # Increment seller total_sales and release escrow funds
        fee_settings = await get_fee_settings(db)
        items_result = await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))
        seller_ids_done = set()
        for item in items_result.scalars().all():
            if item.seller_id not in seller_ids_done:
                # Lock seller row to prevent race conditions
                seller_result = await db.execute(
                    select(User).where(User.id == item.seller_id).with_for_update()
                )
                seller = seller_result.scalar_one()
                
                # Release escrow to balance (favor seller means they keep the funds)
                if item.auction_id:
                    item_earnings = calc_seller_amount(item.price * item.quantity, fee_settings["auction_fee"])
                else:
                    item_earnings = calc_seller_amount(item.price * item.quantity, fee_settings["product_fee"])
                seller.pending_balance = round(max(0, (seller.pending_balance or 0) - item_earnings), 2)
                seller.balance = round((seller.balance or 0) + (item_earnings), 2)
                
                seller.total_sales = (seller.total_sales or 0) + 1
                seller_ids_done.add(item.seller_id)

        msg_text = f"Admin resolved in favor of seller: {data.resolution}"

    msg = OrderMessage(
        order_id=order.id, sender_id=current_user.id,
        content=msg_text, is_system=True
    )
    db.add(msg)

    # Notify buyer about dispute resolution
    action_text = "refunded" if data.action == "refund_buyer" else "resolved in seller's favor"
    await create_notification(
        db, user_id=order.buyer_id, type="dispute_resolved",
        title=f"Dispute on Order #{order.id} {action_text}",
        body=data.resolution[:120] if data.resolution else None,
        link=f"/orders/{order.id}",
    )

    new_status = order.status.value if order.status else "updated"
    await create_notification(
        db, user_id=order.buyer_id, type="order_status_update",
        title=f"Order #{order.id} status updated",
        body=f"Order status changed to {new_status}.",
        link=f"/orders/{order.id}",
    )

    for sid in seller_ids:
        await create_notification(
            db, user_id=sid, type="order_status_update",
            title=f"Order #{order.id} status updated",
            body=f"Order status changed to {new_status}.",
            link=f"/orders/{order.id}",
        )

    await db.commit()
    return {"message": f"Dispute #{dispute.id} resolved."}


# ======================== BRANDING & SYSTEM ========================

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)


class BrandingUpdate(BaseModel):
    app_name: Optional[str] = Field(None, min_length=1, max_length=50)
    bot_username: Optional[str] = Field(None, min_length=3, max_length=50)
    show_logo: Optional[bool] = None
    announcements_url: Optional[str] = Field(None, max_length=200)
    vouches_url: Optional[str] = Field(None, max_length=200)
    official_group_url: Optional[str] = Field(None, max_length=200)
    suggestion_group_url: Optional[str] = Field(None, max_length=200)
    support_display_name: Optional[str] = Field(None, max_length=50)
    hide_admin_activity: Optional[bool] = None
    bot_welcome_message: Optional[str] = Field(None, max_length=1000)
    marketplace_rules: Optional[List[constr(max_length=500)]] = Field(None, max_length=50)
    wtb_rules: Optional[List[constr(max_length=500)]] = Field(None, max_length=50)


async def _get_or_create_settings(db: AsyncSession) -> AppSettings:
    """Get the singleton settings row, create if missing."""
    result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = AppSettings(id=1)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)
    return settings


@router.get("/branding")
async def get_branding(db: AsyncSession = Depends(get_db)):
    """Public: get app branding (name, logo, bot_username). No auth required."""
    s = await _get_or_create_settings(db)
    # Parse marketplace rules
    rules = []
    if getattr(s, 'marketplace_rules', None):
        try:
            rules = json.loads(s.marketplace_rules)
        except Exception:
            rules = []
    # Parse WTB rules
    wtb_rules = []
    if getattr(s, 'wtb_rules', None):
        try:
            wtb_rules = json.loads(s.wtb_rules)
        except Exception:
            wtb_rules = []
    return {
        "app_name": s.app_name,
        "logo_url": s.logo_url,
        "show_logo": s.show_logo if s.show_logo is not None else True,
        "bot_username": s.bot_username,
        "maintenance_mode": s.maintenance_mode,
        "announcements_url": s.announcements_url,
        "vouches_url": s.vouches_url,
        "official_group_url": s.official_group_url,
        "suggestion_group_url": s.suggestion_group_url,
        "support_username": s.support_username or "",
        "support_display_name": s.support_display_name or "",
        "hide_admin_activity": getattr(s, 'hide_admin_activity', False),
        "bot_welcome_message": getattr(s, 'bot_welcome_message', None) or "",
        "marketplace_rules": rules,
        "wtb_rules": wtb_rules,
    }


@router.put("/branding")
async def update_branding(
    data: BrandingUpdate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin: update app name / bot username / channel URLs."""
    s = await _get_or_create_settings(db)
    if data.app_name is not None:
        s.app_name = data.app_name.strip()
    if data.bot_username is not None:
        s.bot_username = data.bot_username.strip().lstrip("@")
    if data.show_logo is not None:
        s.show_logo = data.show_logo
    if data.announcements_url is not None:
        s.announcements_url = data.announcements_url.strip() or None
    if data.vouches_url is not None:
        s.vouches_url = data.vouches_url.strip() or None
    if data.official_group_url is not None:
        s.official_group_url = data.official_group_url.strip() or None
    if data.suggestion_group_url is not None:
        s.suggestion_group_url = data.suggestion_group_url.strip() or None
    if data.hide_admin_activity is not None:
        s.hide_admin_activity = data.hide_admin_activity
    if data.bot_welcome_message is not None:
        s.bot_welcome_message = data.bot_welcome_message.strip() or None
    if data.marketplace_rules is not None:
        # Validate & store as JSON
        cleaned = [r.strip() for r in data.marketplace_rules if r and r.strip()]
        s.marketplace_rules = json.dumps(cleaned) if cleaned else None
    if data.wtb_rules is not None:
        cleaned = [r.strip() for r in data.wtb_rules if r and r.strip()]
        s.wtb_rules = json.dumps(cleaned) if cleaned else None
    if data.support_display_name is not None:
        s.support_display_name = data.support_display_name.strip() or None
        # Keep internal support user display consistent in DMs
        # Prefer the configured support_user_id, otherwise fall back to the system user.
        new_name = s.support_display_name or "Support"
        support_user = None
        if s.support_user_id:
            support_user = await db.get(User, s.support_user_id)
        if not support_user:
            support_user_result = await db.execute(select(User).where(User.telegram_id == "support_system"))
            support_user = support_user_result.scalar_one_or_none()
        if support_user:
            support_user.first_name = new_name
    s.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(s)
    return {
        "app_name": s.app_name,
        "logo_url": s.logo_url,
        "show_logo": s.show_logo if s.show_logo is not None else True,
        "bot_username": s.bot_username,
        "announcements_url": s.announcements_url,
        "vouches_url": s.vouches_url,
        "official_group_url": s.official_group_url,
        "suggestion_group_url": s.suggestion_group_url,
        "support_user_id": s.support_user_id,
        "support_username": s.support_username or "",
        "support_display_name": s.support_display_name or "",
        "hide_admin_activity": getattr(s, 'hide_admin_activity', False),
        "bot_welcome_message": getattr(s, 'bot_welcome_message', None) or "",
        "marketplace_rules": json.loads(s.marketplace_rules) if getattr(s, 'marketplace_rules', None) else [],
        "wtb_rules": json.loads(s.wtb_rules) if getattr(s, 'wtb_rules', None) else [],
    }


@router.post("/branding/logo")
@limiter.limit("10/minute")
async def upload_logo(
    request: Request,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin: upload app logo (PNG/JPG/SVG, max 2MB)."""
    MAX_SIZE = 2 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="Logo too large (max 2MB)")

    ext = (file.filename or "logo.png").rsplit(".", 1)[-1].lower()
    if ext not in ("png", "jpg", "jpeg", "svg", "webp"):
        raise HTTPException(status_code=400, detail="Only PNG/JPG/SVG/WebP allowed")

    filename = f"logo.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)
    with open(filepath, "wb") as f:
        f.write(content)

    s = await _get_or_create_settings(db)
    s.logo_url = f"/api/admin/branding/logo-file/{filename}"
    s.updated_at = datetime.utcnow()
    await db.commit()

    return {"message": "Logo uploaded", "logo_url": s.logo_url}


@router.get("/branding/logo-file/{filename}")
async def serve_logo(filename: str):
    """Serve the uploaded logo file."""
    safe_name = os.path.basename(filename)
    filepath = os.path.join(UPLOAD_DIR, safe_name)
    if not os.path.isfile(filepath):
        raise HTTPException(status_code=404, detail="Logo not found")
    return FileResponse(filepath, headers={"Cache-Control": "public, max-age=3600"})


@router.post("/branding/logo/delete")
async def delete_logo(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin: remove the uploaded logo."""
    s = await _get_or_create_settings(db)
    # Delete file if exists
    if s.logo_url:
        filename = s.logo_url.rsplit("/", 1)[-1]
        filepath = os.path.join(UPLOAD_DIR, filename)
        if os.path.isfile(filepath):
            os.remove(filepath)
    s.logo_url = None
    s.updated_at = datetime.utcnow()
    await db.commit()
    return {"message": "Logo removed"}


@router.post("/system/maintenance")
async def toggle_maintenance(
    enabled: bool = True,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin: toggle maintenance mode (blocks all non-admin access)."""
    s = await _get_or_create_settings(db)
    s.maintenance_mode = enabled
    s.updated_at = datetime.utcnow()
    await db.commit()
    return {"maintenance_mode": enabled, "message": f"Maintenance mode {'ON' if enabled else 'OFF'}"}


# ======================== ESCROW / FEE SETTINGS ========================

class EscrowSettingsUpdate(BaseModel):
    middleman_fee_percent: Optional[float] = Field(None, ge=0, le=50)
    middleman_min_fee: Optional[float] = Field(None, ge=0, le=10000)
    product_fee_percent: Optional[float] = Field(None, ge=0, le=50)
    auction_fee_percent: Optional[float] = Field(None, ge=0, le=50)
    withdrawal_fee_percent: Optional[float] = Field(None, ge=0, le=50)
    pending_order_cancel_hours: Optional[int] = Field(None, ge=0, le=720)
    wtb_daily_post_limit: Optional[int] = Field(None, ge=0, le=100)
    wtb_daily_reply_limit: Optional[int] = Field(None, ge=0, le=500)
    seller_rank_prices: Optional[dict] = None  # {"1": {"price": 50, "featured_days": 0}, ...}


@router.get("/escrow-settings")
async def get_escrow_settings(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin: get current fee / escrow settings."""
    s = await _get_or_create_settings(db)
    # Parse seller rank prices
    rank_prices = None
    if getattr(s, 'seller_rank_prices', None):
        try:
            rank_prices = json.loads(s.seller_rank_prices)
        except Exception:
            rank_prices = None
    return {
        "middleman_fee_percent": s.middleman_fee_percent if s.middleman_fee_percent is not None else 5.0,
        "middleman_min_fee": s.middleman_min_fee if s.middleman_min_fee is not None else 0.0,
        "product_fee_percent": s.product_fee_percent if s.product_fee_percent is not None else 10.0,
        "auction_fee_percent": s.auction_fee_percent if s.auction_fee_percent is not None else 5.0,
        "withdrawal_fee_percent": s.withdrawal_fee_percent if s.withdrawal_fee_percent is not None else 0.0,
        "pending_order_cancel_hours": s.pending_order_cancel_hours if s.pending_order_cancel_hours is not None else 24,
        "wtb_daily_post_limit": s.wtb_daily_post_limit if s.wtb_daily_post_limit is not None else 5,
        "wtb_daily_reply_limit": s.wtb_daily_reply_limit if s.wtb_daily_reply_limit is not None else 20,
        "seller_rank_prices": rank_prices,
    }


@router.put("/escrow-settings")
async def update_escrow_settings(
    data: EscrowSettingsUpdate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin: update fee / escrow settings."""
    s = await _get_or_create_settings(db)
    if data.middleman_fee_percent is not None:
        s.middleman_fee_percent = data.middleman_fee_percent
    if data.middleman_min_fee is not None:
        s.middleman_min_fee = data.middleman_min_fee
    if data.product_fee_percent is not None:
        s.product_fee_percent = data.product_fee_percent
    if data.auction_fee_percent is not None:
        s.auction_fee_percent = data.auction_fee_percent
    if data.withdrawal_fee_percent is not None:
        s.withdrawal_fee_percent = data.withdrawal_fee_percent
    if data.pending_order_cancel_hours is not None:
        s.pending_order_cancel_hours = data.pending_order_cancel_hours
    if data.wtb_daily_post_limit is not None:
        s.wtb_daily_post_limit = data.wtb_daily_post_limit
    if data.wtb_daily_reply_limit is not None:
        s.wtb_daily_reply_limit = data.wtb_daily_reply_limit
    if data.seller_rank_prices is not None:
        # Validate and store rank prices as JSON
        cleaned = {}
        for k, v in data.seller_rank_prices.items():
            rank_id = str(int(k))  # ensure string key
            entry = {}
            if 'price' in v:
                entry['price'] = max(0, float(v['price']))
            if 'featured_days' in v:
                entry['featured_days'] = max(0, int(v['featured_days']))
            if entry:
                cleaned[rank_id] = entry
        s.seller_rank_prices = json.dumps(cleaned) if cleaned else None
    s.updated_at = datetime.utcnow()
    await db.commit()
    await db.refresh(s)
    return {
        "middleman_fee_percent": s.middleman_fee_percent,
        "middleman_min_fee": s.middleman_min_fee,
        "product_fee_percent": s.product_fee_percent,
        "auction_fee_percent": s.auction_fee_percent,
        "withdrawal_fee_percent": s.withdrawal_fee_percent if s.withdrawal_fee_percent is not None else 0.0,
        "pending_order_cancel_hours": s.pending_order_cancel_hours if s.pending_order_cancel_hours is not None else 24,
        "wtb_daily_post_limit": s.wtb_daily_post_limit if s.wtb_daily_post_limit is not None else 5,
        "wtb_daily_reply_limit": s.wtb_daily_reply_limit if s.wtb_daily_reply_limit is not None else 20,
        "seller_rank_prices": json.loads(s.seller_rank_prices) if getattr(s, 'seller_rank_prices', None) else None,
    }


class BroadcastAnnouncement(BaseModel):
    title: str = Field(..., min_length=1, max_length=120)
    body: str = Field(..., min_length=1, max_length=1500)
    telegram_text: Optional[str] = Field(None, max_length=4096)
    test_only: bool = False
    target_group: str = Field("all", description="all|buyers|sellers|admins")
    send_webapp: bool = True
    send_telegram: bool = True


@router.post("/system/broadcast")
@limiter.limit("5/minute")
async def broadcast_announcement(
    payload: BroadcastAnnouncement,
    request: Request,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin: send announcement to selected user group and channels (WebApp and/or Telegram)."""
    group = (payload.target_group or "all").strip().lower()
    allowed_groups = {"all", "buyers", "sellers", "admins"}
    if group not in allowed_groups:
        raise HTTPException(status_code=400, detail="target_group must be one of: all, buyers, sellers, admins")

    if not payload.send_webapp and not payload.send_telegram:
        raise HTTPException(status_code=400, detail="At least one channel must be enabled")

    if payload.test_only:
        users = [(current_user.id, current_user.telegram_id)]
    else:
        users_query = select(User.id, User.telegram_id).where(User.is_active == True)
        if group == "buyers":
            users_query = users_query.where(User.role == UserRole.BUYER)
        elif group == "sellers":
            users_query = users_query.where(User.role == UserRole.SELLER)
        elif group == "admins":
            users_query = users_query.where(User.role == UserRole.ADMIN)

        users_result = await db.execute(users_query)
        users = users_result.all()

    if not users:
        return {
            "message": "No active users to notify",
            "webapp_notifications_created": 0,
            "telegram_sent": 0,
            "telegram_failed": 0,
            "telegram_skipped": 0,
            "total_users": 0,
        }

    title = payload.title.strip()
    body = payload.body.strip()
    telegram_message = (payload.telegram_text or "").strip() or f"📢 {title}\n\n{body}"

    webapp_created = 0
    if payload.send_webapp:
        for user_id, _telegram_id in users:
            await create_notification(
                db, user_id=user_id, type="admin_announcement",
                title=title, body=body, link="/notifications",
                telegram_id=_telegram_id,
                skip_telegram=True,  # broadcast handles TG separately below
            )
            webapp_created += 1
        await db.commit()

    bot_token = os.getenv("BOT_TOKEN", "").strip()
    telegram_sent = 0
    telegram_failed = 0
    telegram_skipped = 0

    if payload.send_telegram and bot_token:
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        async with httpx.AsyncClient(timeout=10.0) as client:
            for _user_id, telegram_id in users:
                tid = str(telegram_id or "").strip()
                if not tid.isdigit():
                    telegram_skipped += 1
                    continue

                try:
                    res = await client.post(url, json={
                        "chat_id": int(tid),
                        "text": telegram_message,
                        "disable_web_page_preview": True,
                    })
                    if res.status_code == 200 and res.json().get("ok"):
                        telegram_sent += 1
                    else:
                        telegram_failed += 1
                except Exception:
                    telegram_failed += 1
    elif payload.send_telegram:
        telegram_skipped = len(users)

    return {
        "message": "Test announcement sent" if payload.test_only else "Announcement sent",
        "webapp_notifications_created": webapp_created,
        "telegram_sent": telegram_sent,
        "telegram_failed": telegram_failed,
        "telegram_skipped": telegram_skipped,
        "total_users": len(users),
        "mode": "test" if payload.test_only else "all",
        "target_group": group,
        "channels": {
            "webapp": payload.send_webapp,
            "telegram": payload.send_telegram,
        },
    }


class NukeConfirm(BaseModel):
    confirm_text: str = Field(..., description="Must be exactly 'DELETE EVERYTHING'")


if ENVIRONMENT != "production":
    @router.post("/system/nuke")
    @limiter.limit("1/minute")
    async def nuke_everything(
        data: NukeConfirm,
        request: Request,
        current_user: User = Depends(get_current_admin),
        db: AsyncSession = Depends(get_db)
    ):
        """
        ☠️ DANGER: Wipe ALL data from the database.
        Requires confirm_text = 'DELETE EVERYTHING'.
        Drops and re-creates all tables. Removes uploaded files.
        Only registered in non-production environments.
        """
        if data.confirm_text != "DELETE EVERYTHING":
            raise HTTPException(status_code=400, detail="Confirmation text must be exactly 'DELETE EVERYTHING'")

        import logging
        logging.getLogger("audit").critical(
            f"☠️ NUKE INITIATED by admin {current_user.username} (ID:{current_user.id})"
        )

        # Drop all tables and re-create them
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)

        # Wipe uploads folder
        if os.path.isdir(UPLOAD_DIR):
            shutil.rmtree(UPLOAD_DIR)
            os.makedirs(UPLOAD_DIR, exist_ok=True)

        return {"message": "All data has been permanently deleted. Database re-created."}


# ============ Predefined Tags Management ============

class WtbCategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)


def _wtb_slugify(value: str) -> str:
    v = (value or "").strip().lower()
    out = []
    prev_dash = False
    for ch in v:
        if ch.isalnum():
            out.append(ch)
            prev_dash = False
        else:
            if not prev_dash:
                out.append("-")
                prev_dash = True
    slug = "".join(out).strip("-")
    return slug or "category"


@router.get("/wtb-categories")
async def admin_list_wtb_categories(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(WtbCategory).order_by(WtbCategory.name.asc()))
    cats = result.scalars().all()
    return [{"id": c.id, "name": c.name, "slug": c.slug} for c in cats]


@router.post("/wtb-categories")
async def admin_create_wtb_category(
    payload: WtbCategoryCreate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    name = payload.name.strip()
    existing_name = await db.execute(select(WtbCategory).where(func.lower(WtbCategory.name) == name.lower()))
    if existing_name.scalar_one_or_none():
        raise HTTPException(400, "Category already exists")

    base_slug = _wtb_slugify(name)
    slug = base_slug
    i = 2
    while True:
        existing_slug = await db.execute(select(WtbCategory).where(WtbCategory.slug == slug))
        if not existing_slug.scalar_one_or_none():
            break
        slug = f"{base_slug}-{i}"
        i += 1

    cat = WtbCategory(name=name, slug=slug)
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return {"id": cat.id, "name": cat.name, "slug": cat.slug}


@router.delete("/wtb-categories/{category_id}")
async def admin_delete_wtb_category(
    category_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    cat = await db.get(WtbCategory, category_id)
    if not cat:
        raise HTTPException(404, "Category not found")
    await db.delete(cat)
    await db.commit()
    return {"ok": True}

# ─── Service Categories ──────────────────────────────────────────────────────

# ─── WTB Post Management ──────────────────────────────────────────────────────

@router.get("/wtb-posts")
async def admin_list_wtb_posts(
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    search: str = Query(None),
    status: Optional[str] = None,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: list WTB posts with pagination, search and status filter."""
    from sqlalchemy.orm import selectinload
    q = select(WtbPost).options(selectinload(WtbPost.user))

    # --- search ---
    if search and search.strip():
        _escaped = search.strip().replace("%", r"\%").replace("_", r"\_")
        needle = f"%{_escaped}%"
        q = q.outerjoin(User, User.id == WtbPost.user_id).where(
            (WtbPost.title.ilike(needle, escape='\\'))
            | (WtbPost.description.ilike(needle, escape='\\'))
            | (User.username.ilike(needle, escape='\\'))
            | (User.first_name.ilike(needle, escape='\\'))
            | (func.cast(WtbPost.id, String).ilike(needle, escape='\\'))
        )

    # --- status counts (after search, before status filter) ---
    count_sub = q.with_only_columns(WtbPost.id, WtbPost.status, WtbPost.archived_at).subquery()
    sc_rows = (await db.execute(
        select(
            count_sub.c.status,
            count_sub.c.archived_at,
            func.count(),
        ).group_by(count_sub.c.status, count_sub.c.archived_at)
    )).all()
    status_counts = {"active": 0, "archived": 0, "closed": 0, "total": 0}
    for s, arch, c in sc_rows:
        status_counts["total"] += c
        if arch is not None:
            status_counts["archived"] += c
        else:
            key = s.value if hasattr(s, "value") else str(s).lower()
            status_counts[key] = status_counts.get(key, 0) + c

    # --- status filter ---
    if status == "active":
        q = q.where(WtbPost.status == WtbStatus.ACTIVE, WtbPost.archived_at == None)
    elif status == "archived":
        q = q.where(WtbPost.archived_at != None)
    elif status == "closed":
        q = q.where(WtbPost.status == WtbStatus.CLOSED, WtbPost.archived_at == None)

    # --- total matching ---
    total = await db.scalar(
        select(func.count()).select_from(q.with_only_columns(WtbPost.id).subquery())
    )

    # --- order & paginate ---
    q = q.order_by(WtbPost.created_at.desc())
    q = q.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(q)
    posts = result.scalars().all()
    items = []
    for p in posts:
        user = p.user
        items.append({
            "id": p.id,
            "title": p.title,
            "description": p.description,
            "budget_min": p.budget_min,
            "budget_max": p.budget_max,
            "category": p.category,
            "status": p.status.value if p.status else "active",
            "responses": p.responses or 0,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "expires_at": p.expires_at.isoformat() if p.expires_at else None,
            "archived_at": p.archived_at.isoformat() if p.archived_at else None,
            "is_archived": bool(p.archived_at),
            "user": {
                "id": user.id,
                "username": user.username,
                "first_name": user.first_name,
            } if user else None,
        })
    return {
        "items": items,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": max(1, -(-total // per_page)),
        "status_counts": status_counts,
    }


@router.post("/wtb-posts/{post_id}/archive")
async def admin_archive_wtb_post(
    post_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: archive a WTB post."""
    post = await db.get(WtbPost, post_id)
    if not post:
        raise HTTPException(404, "Post not found.")
    post.archived_at = datetime.utcnow()
    if post.status == WtbStatus.ACTIVE:
        post.status = WtbStatus.CLOSED
    await db.commit()
    return {"ok": True}


@router.post("/wtb-posts/{post_id}/unarchive")
async def admin_unarchive_wtb_post(
    post_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: unarchive a WTB post."""
    post = await db.get(WtbPost, post_id)
    if not post:
        raise HTTPException(404, "Post not found.")
    post.archived_at = None
    post.status = WtbStatus.ACTIVE
    await db.commit()
    return {"ok": True}


@router.delete("/wtb-posts/{post_id}")
async def admin_delete_wtb_post(
    post_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: permanently delete a WTB post."""
    post = await db.get(WtbPost, post_id)
    if not post:
        raise HTTPException(404, "Post not found.")
    await db.delete(post)
    await db.commit()
    return {"ok": True}


@router.get("/service-categories")
async def admin_list_service_categories(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(ServiceCategory).order_by(ServiceCategory.sort_order.asc(), ServiceCategory.name.asc()))
    cats = result.scalars().all()
    return [{"id": c.id, "name": c.name, "slug": c.slug, "icon": c.icon, "sort_order": c.sort_order} for c in cats]


@router.post("/service-categories")
async def admin_create_service_category(
    payload: ServiceCategoryCreate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Name is required")
    icon = payload.icon.strip()

    existing = await db.execute(select(ServiceCategory).where(func.lower(ServiceCategory.name) == name.lower()))
    if existing.scalar_one_or_none():
        raise HTTPException(400, "Category already exists")

    base_slug = _wtb_slugify(name)
    slug = base_slug
    i = 2
    while True:
        existing_slug = await db.execute(select(ServiceCategory).where(ServiceCategory.slug == slug))
        if not existing_slug.scalar_one_or_none():
            break
        slug = f"{base_slug}-{i}"
        i += 1

    # Get next sort order
    max_order = await db.execute(select(func.max(ServiceCategory.sort_order)))
    next_order = (max_order.scalar() or 0) + 1

    cat = ServiceCategory(name=name, slug=slug, icon=icon, sort_order=next_order)
    db.add(cat)
    await db.commit()
    await db.refresh(cat)
    return {"id": cat.id, "name": cat.name, "slug": cat.slug, "icon": cat.icon, "sort_order": cat.sort_order}


@router.delete("/service-categories/{category_id}")
async def admin_delete_service_category(
    category_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    cat = await db.get(ServiceCategory, category_id)
    if not cat:
        raise HTTPException(404, "Category not found")
    await db.delete(cat)
    await db.commit()
    return {"ok": True}


@router.get("/tags", response_model=List[PredefinedTagSchema])
async def list_predefined_tags(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """List all predefined tags"""
    result = await db.execute(
        select(PredefinedTag).order_by(PredefinedTag.is_parent.desc(), PredefinedTag.sort_order, PredefinedTag.name)
    )
    return result.scalars().all()


@router.post("/tags", response_model=PredefinedTagSchema)
async def create_predefined_tag(
    tag_data: PredefinedTagCreate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Create a new predefined tag"""
    # Check uniqueness within same scope:
    # - Parent tags must have unique names among parents
    # - Child tags must have unique names within the same parent
    if tag_data.is_parent:
        # Check uniqueness among parent tags only
        existing = await db.execute(
            select(PredefinedTag).where(
                func.lower(PredefinedTag.name) == tag_data.name.strip().lower(),
                PredefinedTag.is_parent == True
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Category with this name already exists")
    else:
        # Check uniqueness within the same parent
        existing = await db.execute(
            select(PredefinedTag).where(
                func.lower(PredefinedTag.name) == tag_data.name.strip().lower(),
                PredefinedTag.parent_id == tag_data.parent_id,
                PredefinedTag.is_parent == False
            )
        )
        if existing.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Tag with this name already exists in this category")

    # Validate parent exists if specified
    if tag_data.parent_id:
        parent = await db.execute(select(PredefinedTag).where(PredefinedTag.id == tag_data.parent_id))
        if not parent.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Parent tag not found")

    tag = PredefinedTag(
        name=tag_data.name.strip(),
        parent_id=tag_data.parent_id,
        is_parent=tag_data.is_parent,
        sort_order=tag_data.sort_order
    )
    db.add(tag)
    await db.commit()
    await db.refresh(tag)
    return tag


@router.delete("/tags/{tag_id}")
async def delete_predefined_tag(
    tag_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Delete a predefined tag"""
    result = await db.execute(select(PredefinedTag).where(PredefinedTag.id == tag_id))
    tag = result.scalar_one_or_none()
    if not tag:
        raise HTTPException(status_code=404, detail="Tag not found")
    await db.delete(tag)
    await db.commit()
    return {"message": "Tag deleted"}


# ═══════════════════════════════════════════════════════════════════════════════
# PUBLIC BLACKLIST - No authentication required
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/blacklist")
async def get_blacklist(
    admin: bool = False,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=200),
    sort_by: Optional[str] = "newest",
    db: AsyncSession = Depends(get_db),
):
    """Get list of all banned users. Public returns minimal fields; admin=true returns full data."""
    base = select(User).where(User.is_banned == True)
    count_base = select(func.count()).select_from(User).where(User.is_banned == True)

    if search and search.strip():
        needle = f"%{_escape_like(search.strip())}%"
        search_filter = (
            (User.username.ilike(needle)) |
            (User.first_name.ilike(needle)) |
            (User.telegram_id.ilike(needle)) |
            (User.ban_reason.ilike(needle))
        )
        base = base.where(search_filter)
        count_base = count_base.where(search_filter)

    # Sort
    sort_map = {
        "newest": User.banned_at.desc().nullsfirst(),
        "oldest": User.banned_at.asc().nullslast(),
        "username": User.username.asc(),
    }
    base = base.order_by(sort_map.get(sort_by, User.banned_at.desc().nullsfirst()))

    total_res = await db.execute(count_base)
    total = total_res.scalar() or 0
    pages = max(1, (total + per_page - 1) // per_page)
    offset = (page - 1) * per_page

    result = await db.execute(base.offset(offset).limit(per_page))
    users = result.scalars().all()

    # Role counts (across all banned, ignoring search)
    role_q = select(User.role, func.count()).where(User.is_banned == True).group_by(User.role)
    role_res = await db.execute(role_q)
    role_counts = {str(r[0]).lower(): r[1] for r in role_res.all()}

    items = [
        {
            "id": u.id,
            "username": u.username,
            "first_name": u.first_name,
            "avatar_url": u.avatar_url,
            "role": str(u.role.value) if u.role else "buyer",
            "ban_reason": u.ban_reason,
            "banned_at": u.banned_at.isoformat() if u.banned_at else None,
            "warning_count": u.warning_count or 0,
            # Admin-only fields
            **({
                "telegram_id": u.telegram_id,
                "total_sales": u.total_sales or 0,
                "balance": float(u.balance or 0),
                "shop_name": u.shop_name,
            } if admin else {}),
        }
        for u in users
    ]

    return {
        "items": items,
        "total": total,
        "pages": pages,
        "page": page,
        "role_counts": role_counts,
    }
