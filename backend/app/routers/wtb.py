"""Want-to-Buy posts router"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime, timedelta

from app.database import get_db
from app.auth import get_current_active_user, get_current_admin
from app.models import User, UserRole, WtbPost, WtbStatus, WtbCategory, WtbReply, CryptoDeposit, Order, AppSettings
from app.telegram import create_notification


def _deposit_tier(amount: float) -> str:
    """Convert exact deposit amount to a privacy-safe tier label."""
    if amount >= 10000:
        return "$10,000+"
    if amount >= 5000:
        return "$5,000+"
    if amount >= 1000:
        return "$1,000+"
    if amount >= 500:
        return "$500+"
    if amount >= 100:
        return "$100+"
    if amount >= 50:
        return "$50+"
    return "$0"

from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/api/wtb", tags=["wtb"])


@router.get("/categories")
async def list_wtb_categories(db: AsyncSession = Depends(get_db)):
    """Public: list WTB categories (for dropdown selection)."""
    result = await db.execute(select(WtbCategory).order_by(WtbCategory.name.asc()))
    cats = result.scalars().all()
    return [{"id": c.id, "name": c.name, "slug": c.slug} for c in cats]


# ---- Schemas ----

class WtbCreate(BaseModel):
    title: str = Field(min_length=5, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    budget_min: Optional[float] = Field(None, ge=0)
    budget_max: Optional[float] = Field(None, ge=0)
    category: Optional[str] = Field(None, max_length=100)


class WtbUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=5, max_length=200)
    description: Optional[str] = Field(None, max_length=1000)
    budget_min: Optional[float] = Field(None, ge=0)
    budget_max: Optional[float] = Field(None, ge=0)
    category: Optional[str] = Field(None, max_length=100)
    status: Optional[str] = None  # "closed" to close own post


MAX_ACTIVE_POSTS = 5


def _serialize_user(u: User) -> dict:
    """Serialize user with platform stats."""
    if not u:
        return None
    rank_names = {0: None, 1: "Bronze", 2: "Silver", 3: "Gold"}
    return {
        "id": u.id,
        "username": u.username,
        "first_name": u.first_name,
        "avatar_url": u.avatar_url,
        "role": u.role.value if u.role else "buyer",
        "shop_name": u.shop_name,
        "seller_rank": u.seller_rank if hasattr(u, "seller_rank") else 0,
        "seller_rank_name": rank_names.get(u.seller_rank, None) if hasattr(u, "seller_rank") else None,
        "rep_positive": u.rep_positive or 0,
        "rep_negative": u.rep_negative or 0,
        "total_sales": u.total_sales or 0,
        "seller_rating": u.seller_rating or 0,
        "seller_review_count": u.seller_review_count or 0,
        "created_at": u.created_at.isoformat() if u.created_at else None,
    }


def _serialize_post(p: WtbPost) -> dict:
    return {
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
        "archived_at": p.archived_at.isoformat() if getattr(p, "archived_at", None) else None,
        "is_archived": bool(getattr(p, "archived_at", None)),
        "user": _serialize_user(p.user),
        "reply_count": len(p.replies) if hasattr(p, "replies") and p.replies is not None else 0,
    }


# ---- Public: List WTB posts ----

@router.get("")
async def list_wtb_posts(
    category: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=50),
    db: AsyncSession = Depends(get_db),
):
    """List active WTB posts (public)"""
    q = select(WtbPost).where(
        WtbPost.status == WtbStatus.ACTIVE,
        WtbPost.archived_at == None,
    )

    if category:
        q = q.where(WtbPost.category == category)
    if search:
        _escaped = search.replace("%", r"\%").replace("_", r"\_")
        q = q.where(
            WtbPost.title.ilike(f"%{_escaped}%", escape='\\') | WtbPost.description.ilike(f"%{_escaped}%", escape='\\')
        )

    total = await db.scalar(
        select(func.count()).select_from(q.subquery())
    ) or 0

    q = q.order_by(desc(WtbPost.created_at)).offset((page - 1) * limit).limit(limit)
    result = await db.execute(q.options(
        __import__("sqlalchemy.orm", fromlist=["selectinload"]).selectinload(WtbPost.user),
        __import__("sqlalchemy.orm", fromlist=["selectinload"]).selectinload(WtbPost.replies),
    ))
    posts = result.scalars().all()

    return {
        "posts": [_serialize_post(p) for p in posts],
        "total": total,
        "page": page,
        "pages": (total + limit - 1) // limit if total > 0 else 1,
    }


# ---- Auth: Create WTB post ----

@router.post("")
@limiter.limit("10/hour")
async def create_wtb_post(
    request: Request,
    payload: WtbCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new WTB post"""
    # Check if user is restricted
    if current_user.restricted_until and current_user.restricted_until > datetime.utcnow() and current_user.role != UserRole.ADMIN:
        remaining = current_user.restricted_until - datetime.utcnow()
        days_left = remaining.days
        if days_left > 0:
            raise HTTPException(403, f"Your posting is restricted for {days_left} more day{'s' if days_left != 1 else ''}. Check your notifications for details.")
        else:
            hours_left = remaining.seconds // 3600
            raise HTTPException(403, f"Your posting is restricted for {hours_left} more hour{'s' if hours_left != 1 else ''}. Check your notifications for details.")

    # Check active post limit
    active_count = await db.scalar(
        select(func.count()).select_from(WtbPost).where(
            WtbPost.user_id == current_user.id,
            WtbPost.status == WtbStatus.ACTIVE,
            WtbPost.archived_at == None,
        )
    ) or 0
    if active_count >= MAX_ACTIVE_POSTS:
        raise HTTPException(400, f"You can have at most {MAX_ACTIVE_POSTS} active WTB posts.")

    # Check 24h daily post limit
    settings_row = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    app_settings = settings_row.scalar_one_or_none()
    daily_post_limit = (app_settings.wtb_daily_post_limit if app_settings and app_settings.wtb_daily_post_limit is not None else 5)
    if daily_post_limit > 0:
        since_24h = datetime.utcnow() - timedelta(hours=24)
        posts_today = await db.scalar(
            select(func.count()).select_from(WtbPost).where(
                WtbPost.user_id == current_user.id,
                WtbPost.created_at >= since_24h,
            )
        ) or 0
        if posts_today >= daily_post_limit:
            raise HTTPException(429, f"You can create at most {daily_post_limit} WTB posts per 24 hours.")

    if payload.budget_min and payload.budget_max and payload.budget_min > payload.budget_max:
        raise HTTPException(400, "Minimum budget cannot exceed maximum budget.")

    if payload.category:
        cat_slug = payload.category.strip()
        cat_result = await db.execute(select(WtbCategory).where(WtbCategory.slug == cat_slug))
        cat = cat_result.scalar_one_or_none()
        if not cat:
            raise HTTPException(400, "Invalid category")
    else:
        cat_slug = None

    post = WtbPost(
        user_id=current_user.id,
        title=payload.title.strip(),
        description=(payload.description or "").strip() or None,
        budget_min=payload.budget_min,
        budget_max=payload.budget_max,
        category=cat_slug,
    )
    db.add(post)
    await db.commit()
    await db.refresh(post, ["user"])
    return _serialize_post(post)


# ---- Auth: Get my WTB posts ----

@router.get("/mine")
async def my_wtb_posts(
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(WtbPost)
        .where(WtbPost.user_id == current_user.id)
        .order_by(desc(WtbPost.created_at))
        .options(
            __import__("sqlalchemy.orm", fromlist=["selectinload"]).selectinload(WtbPost.user),
            __import__("sqlalchemy.orm", fromlist=["selectinload"]).selectinload(WtbPost.replies),
        )
        .limit(limit)
        .offset(offset)
    )
    posts = result.scalars().all()
    return [_serialize_post(p) for p in posts]


# ---- Auth: Update own WTB post ----

@router.put("/{post_id}")
async def update_wtb_post(
    post_id: int,
    payload: WtbUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    post = await db.get(WtbPost, post_id)
    if not post:
        raise HTTPException(404, "Post not found.")
    if post.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "Not your post.")

    if payload.title is not None:
        post.title = payload.title.strip()
    if payload.description is not None:
        post.description = payload.description.strip() or None
    if payload.budget_min is not None:
        post.budget_min = payload.budget_min
    if payload.budget_max is not None:
        post.budget_max = payload.budget_max
    if payload.category is not None:
        if payload.category:
            cat_slug = payload.category.strip()
            cat_result = await db.execute(select(WtbCategory).where(WtbCategory.slug == cat_slug))
            cat = cat_result.scalar_one_or_none()
            if not cat:
                raise HTTPException(400, "Invalid category")
            post.category = cat_slug
        else:
            post.category = None
    if payload.status == "closed":
        post.status = WtbStatus.CLOSED

    if post.budget_min and post.budget_max and post.budget_min > post.budget_max:
        raise HTTPException(400, "Minimum budget cannot exceed maximum budget.")

    await db.commit()
    await db.refresh(post, ["user"])
    return _serialize_post(post)


# ---- Auth: Delete own WTB post ----

@router.delete("/{post_id}")
async def delete_wtb_post(
    post_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    post = await db.get(WtbPost, post_id)
    if not post:
        raise HTTPException(404, "Post not found.")
    if post.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "Not your post.")

    # Archive instead of delete
    post.archived_at = datetime.utcnow()
    if post.status == WtbStatus.ACTIVE:
        post.status = WtbStatus.CLOSED
    await db.commit()
    await db.refresh(post, ["user"])
    return {"ok": True, "post": _serialize_post(post)}


# ---- Admin: Unarchive a WTB post ----

@router.post("/{post_id}/unarchive")
async def unarchive_wtb_post(
    post_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    post = await db.get(WtbPost, post_id)
    if not post:
        raise HTTPException(404, "Post not found.")
    post.archived_at = None
    post.status = WtbStatus.ACTIVE
    await db.commit()
    await db.refresh(post, ["user"])
    return {"ok": True, "post": _serialize_post(post)}


# ---- Public: Single Post Detail (must be LAST to not shadow /mine, /categories) ----

@router.get("/{post_id}")
async def get_wtb_post(post_id: int, db: AsyncSession = Depends(get_db)):
    """Public: get a single WTB post by ID with replies."""
    from sqlalchemy.orm import selectinload
    result = await db.execute(
        select(WtbPost)
        .where(WtbPost.id == post_id)
        .options(
            selectinload(WtbPost.user),
            selectinload(WtbPost.replies).selectinload(WtbReply.user),
        )
    )
    post = result.scalar_one_or_none()
    if not post:
        raise HTTPException(404, "Post not found.")

    data = _serialize_post(post)
    # Include full replies list
    data["replies"] = [
        {
            "id": r.id,
            "message": r.message,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "user": _serialize_user(r.user),
        }
        for r in sorted(post.replies, key=lambda x: x.created_at or datetime.min)
    ]

    # Count total credited deposits for post author + deposit amount + total transactions
    if post.user:
        deposit_amount = await db.scalar(
            select(func.coalesce(func.sum(CryptoDeposit.price_amount_usd), 0)).where(
                CryptoDeposit.user_id == post.user_id,
                CryptoDeposit.is_credited == True,
            )
        ) or 0
        data["user"]["total_deposit_amount"] = _deposit_tier(float(deposit_amount))

        tx_count = await db.scalar(
            select(func.count()).select_from(Order).where(Order.buyer_id == post.user_id)
        ) or 0
        data["user"]["total_transactions"] = tx_count

    # Count deposit amounts and transactions for each reply user
    reply_user_ids = list(set(r.user_id for r in post.replies if r.user_id))
    if reply_user_ids:
        dep_results = await db.execute(
            select(CryptoDeposit.user_id, func.sum(CryptoDeposit.price_amount_usd))
            .where(CryptoDeposit.user_id.in_(reply_user_ids), CryptoDeposit.is_credited == True)
            .group_by(CryptoDeposit.user_id)
        )
        dep_map = {uid: round(float(amt or 0), 2) for uid, amt in dep_results.all()}

        tx_results = await db.execute(
            select(Order.buyer_id, func.count())
            .where(Order.buyer_id.in_(reply_user_ids))
            .group_by(Order.buyer_id)
        )
        tx_map = dict(tx_results.all())

        for reply_data in data["replies"]:
            if reply_data["user"]:
                uid = reply_data["user"]["id"]
                reply_data["user"]["total_deposit_amount"] = _deposit_tier(dep_map.get(uid, 0))
                reply_data["user"]["total_transactions"] = tx_map.get(uid, 0)

    return data


# ---- Auth: Post a public reply ----

class WtbReplyCreate(BaseModel):
    message: str = Field(min_length=1, max_length=2000)


@router.post("/{post_id}/replies")
@limiter.limit("30/hour")
async def create_wtb_reply(
    request: Request,
    post_id: int,
    payload: WtbReplyCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Post a public reply on a WTB post."""
    # Check if user is restricted
    if current_user.restricted_until and current_user.restricted_until > datetime.utcnow() and current_user.role != UserRole.ADMIN:
        remaining = current_user.restricted_until - datetime.utcnow()
        days_left = remaining.days
        if days_left > 0:
            raise HTTPException(403, f"Your posting is restricted for {days_left} more day{'s' if days_left != 1 else ''}. Check your notifications for details.")
        else:
            hours_left = remaining.seconds // 3600
            raise HTTPException(403, f"Your posting is restricted for {hours_left} more hour{'s' if hours_left != 1 else ''}. Check your notifications for details.")

    post = await db.get(WtbPost, post_id)
    if not post:
        raise HTTPException(404, "Post not found.")
    if post.archived_at:
        raise HTTPException(400, "This post is archived.")
    if post.status != WtbStatus.ACTIVE:
        raise HTTPException(400, "This post is no longer active.")

    # Check 24h daily reply limit
    settings_row = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    app_settings = settings_row.scalar_one_or_none()
    daily_reply_limit = (app_settings.wtb_daily_reply_limit if app_settings and app_settings.wtb_daily_reply_limit is not None else 20)
    if daily_reply_limit > 0:
        since_24h = datetime.utcnow() - timedelta(hours=24)
        replies_today = await db.scalar(
            select(func.count()).select_from(WtbReply).where(
                WtbReply.user_id == current_user.id,
                WtbReply.created_at >= since_24h,
            )
        ) or 0
        if replies_today >= daily_reply_limit:
            raise HTTPException(429, f"You can post at most {daily_reply_limit} WTB replies per 24 hours.")

    reply = WtbReply(
        post_id=post_id,
        user_id=current_user.id,
        message=payload.message.strip(),
    )
    db.add(reply)
    post.responses = (post.responses or 0) + 1
    await db.commit()
    await db.refresh(reply, ["user"])

    # Notify the post author (unless they replied to their own post)
    if post.user_id != current_user.id:
        poster_name = current_user.first_name or current_user.username or "Someone"
        await create_notification(
            db,
            user_id=post.user_id,
            type="wtb_reply",
            title="New reply on your WTB post",
            body=f"{poster_name} replied to \"{post.title}\"",
            link=f"/wtb/{post.id}",
        )
        await db.commit()

    # Get deposit amount and transaction count for reply user
    dep_amount = await db.scalar(
        select(func.coalesce(func.sum(CryptoDeposit.price_amount_usd), 0)).where(
            CryptoDeposit.user_id == current_user.id,
            CryptoDeposit.is_credited == True,
        )
    ) or 0

    tx_count = await db.scalar(
        select(func.count()).select_from(Order).where(Order.buyer_id == current_user.id)
    ) or 0

    user_data = _serialize_user(reply.user)
    user_data["total_deposit_amount"] = _deposit_tier(float(dep_amount))
    user_data["total_transactions"] = tx_count

    return {
        "id": reply.id,
        "message": reply.message,
        "created_at": reply.created_at.isoformat() if reply.created_at else None,
        "user": user_data,
    }


@router.delete("/{post_id}/replies/{reply_id}")
async def delete_wtb_reply(
    post_id: int,
    reply_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Delete own reply (or admin can delete any)."""
    reply = await db.get(WtbReply, reply_id)
    if not reply or reply.post_id != post_id:
        raise HTTPException(404, "Reply not found.")
    if reply.user_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(403, "Not your reply.")

    # Decrement response count
    post = await db.get(WtbPost, post_id)
    if post and (post.responses or 0) > 0:
        post.responses -= 1

    await db.delete(reply)
    await db.commit()
    return {"ok": True}
