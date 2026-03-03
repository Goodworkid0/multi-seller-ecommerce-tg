"""Sellers Router"""
import json
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List
from datetime import datetime, timedelta

from app.database import get_db, get_fee_settings, calc_seller_amount
from app.models import User, UserRole, Product, Order, OrderItem, OrderStatus, WithdrawalRequest, WithdrawalStatus, Review, Notification, Dispute, DisputeStatus, Service, AppSettings, Auction, AuctionStatus
from app.telegram import create_notification
from app.schemas import SellerProfile, PublicSellerProfile, SellerStats, UserUpdate, WithdrawalRequestCreate, WithdrawalRequestSchema, Product as ProductSchema, Review as ReviewSchema
from app.auth import get_current_active_user, get_current_seller, get_current_paid_seller, verify_user_pin

# Rate limiter
from app.rate_limit import limiter

# Seller subscription pricing
SELLER_PLANS = {
    1: {"months": 1, "price": 30.0, "label": "1 Month"},
    3: {"months": 3, "price": 70.0, "label": "3 Months"},
    6: {"months": 6, "price": 120.0, "label": "6 Months"},
    12: {"months": 12, "price": 200.0, "label": "12 Months"},
}

# Seller Rank System - Monthly subscription
# Bronze: no featured, Silver: 14 days featured, Gold: 30 days featured
DEFAULT_SELLER_RANKS = {
    1: {"name": "Bronze", "price": 50.0, "badge_color": "#CD7F32", "featured_days": 0},
    2: {"name": "Silver", "price": 100.0, "badge_color": "#C0C0C0", "featured_days": 14},
    3: {"name": "Gold", "price": 200.0, "badge_color": "#FFD700", "featured_days": 30},
}


async def _get_seller_ranks(db: AsyncSession) -> dict:
    """Get seller ranks with admin-configured prices, falling back to defaults."""
    result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = result.scalar_one_or_none()
    ranks = dict(DEFAULT_SELLER_RANKS)  # copy defaults
    if settings and getattr(settings, 'seller_rank_prices', None):
        try:
            overrides = json.loads(settings.seller_rank_prices)
            for k, v in overrides.items():
                rank_id = int(k)
                if rank_id in ranks:
                    if 'price' in v:
                        ranks[rank_id]['price'] = float(v['price'])
                    if 'featured_days' in v:
                        ranks[rank_id]['featured_days'] = int(v['featured_days'])
        except Exception:
            pass
    return ranks

# Keep module-level reference for backwards compat (used only as fallback)
SELLER_RANKS = DEFAULT_SELLER_RANKS

FEATURED_COST = 200.0  # $200 for 30 days featured (separate purchase)

router = APIRouter()


@router.get("/featured", response_model=List[PublicSellerProfile])
async def get_featured_sellers(
    limit: int = 8,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """Get featured sellers for homepage — ranked sellers with active subscription (paginated)"""
    now = datetime.utcnow()
    from sqlalchemy import or_, and_
    result = await db.execute(
        select(User)
        .where(
            User.shop_name.isnot(None),
            User.is_active == True,
            or_(
                and_(User.seller_rank > 0, User.featured_expires_at > now),  # Has rank with active sub
                User.is_featured == True  # Admin featured (permanent)
            )
        )
        .order_by(
            User.seller_rank.desc(),  # Higher ranks first
            User.seller_rating.desc(),
            User.total_sales.desc()
        )
        .offset(offset)
        .limit(min(limit, 50))
    )
    return result.scalars().all()


@router.get("/plans")
async def get_seller_plans():
    """Get available seller subscription plans"""
    return {"monthly_price": SELLER_PLANS[1]["price"], "plans": SELLER_PLANS}


@router.post("/become-seller")
@limiter.limit("5/minute")
async def become_seller(
    request: Request,
    shop_name: str = Query(..., min_length=2, max_length=50),
    shop_description: str = Query("", max_length=500),
    rank: int = 0,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Become a seller. rank=0 is free (limited), 1-3 are paid tiers."""
    if current_user.shop_name:
        raise HTTPException(status_code=400, detail="Already a seller. Use rank upgrade instead.")
    
    # Lock user row to prevent race conditions
    user_result = await db.execute(
        select(User).where(User.id == current_user.id).with_for_update()
    )
    user = user_result.scalar_one()
    
    now = datetime.utcnow()
    old_role = user.role
    
    if rank == 0:
        # Free tier — no payment, no subscription expiry, limited features
        user.shop_name = shop_name
        user.shop_description = shop_description
        user.seller_rank = 0
        user.seller_expires_at = None  # free tier never expires
        message = "Free seller account created! You can list up to 5 products and 1 service."
        rank_name = "Free"
    else:
        # Paid tier
        seller_ranks = await _get_seller_ranks(db)
        rank_info = seller_ranks.get(rank)
        if not rank_info:
            raise HTTPException(status_code=400, detail="Invalid rank. Choose 0 (Free), 1 (Bronze), 2 (Silver), or 3 (Gold).")
        
        cost = rank_info["price"]
        if (user.balance or 0) < cost:
            raise HTTPException(
                status_code=400,
                detail=f"Insufficient balance. {rank_info['name']} rank costs ${cost:.0f}. Current balance: ${user.balance:.2f}"
            )
        
        user.balance = round((user.balance or 0) - (cost), 2)
        if user.role != UserRole.ADMIN:
            user.role = UserRole.SELLER
        user.shop_name = shop_name
        user.shop_description = shop_description
        user.seller_rank = rank
        user.seller_expires_at = now + timedelta(days=30)
        
        featured_days = rank_info["featured_days"]
        if featured_days > 0:
            user.is_featured = True
            user.featured_expires_at = now + timedelta(days=featured_days)
            message = f"{rank_info['name']} seller account created! Includes {featured_days} days featured."
        else:
            message = f"{rank_info['name']} seller account created!"
        rank_name = rank_info["name"]

    await create_notification(
        db, user_id=user.id, type="status_changed",
        title="Seller status activated",
        body=f"{rank_name} rank active. Previous role: {old_role.value}.",
        link="/?tab=settings", telegram_id=user.telegram_id,
    )
    
    await db.commit()
    await db.refresh(user)
    
    return {
        "message": message,
        "rank": rank,
        "rank_name": rank_name,
        "expires_at": user.seller_expires_at.isoformat() if user.seller_expires_at else None,
        "featured_expires_at": user.featured_expires_at.isoformat() if user.featured_expires_at else None,
        "balance": user.balance
    }


@router.post("/renew")
@limiter.limit("5/minute")
async def renew_seller(
    request: Request,
    plan_months: int = 1,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Renew or extend seller subscription"""
    if not current_user.shop_name:
        raise HTTPException(status_code=400, detail="Not a seller. Use become-seller first.")
    
    plan = SELLER_PLANS.get(plan_months)
    if not plan:
        raise HTTPException(status_code=400, detail="Invalid plan. Choose 1, 3, 6, or 12 months.")
    
    cost = plan["price"]
    
    # Lock user row to prevent race conditions
    user_result = await db.execute(
        select(User).where(User.id == current_user.id).with_for_update()
    )
    user = user_result.scalar_one()
    
    if (user.balance or 0) < cost:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance. Plan costs ${cost:.0f}. Current balance: ${user.balance:.2f}"
        )
    
    user.balance = round((user.balance or 0) - (cost), 2)
    # Extend from current expiry if still active, otherwise from now
    base = user.seller_expires_at if (user.seller_expires_at and user.seller_expires_at > datetime.utcnow()) else datetime.utcnow()
    user.seller_expires_at = base + timedelta(days=30 * plan["months"])
    
    # Reactivate role if it was downgraded
    if user.role != UserRole.ADMIN and user.role != UserRole.SELLER:
        user.role = UserRole.SELLER

    await create_notification(
        db, user_id=user.id, type="status_changed",
        title="Seller subscription renewed",
        body=f"{plan['label']} added. Active until {user.seller_expires_at.strftime('%Y-%m-%d')}.",
        link="/?tab=settings", telegram_id=user.telegram_id,
    )
    
    await db.commit()
    await db.refresh(user)
    
    return {
        "message": f"Subscription renewed! {plan['label']} added.",
        "expires_at": user.seller_expires_at.isoformat()
    }


@router.get("/profile", response_model=SellerProfile)
async def get_seller_profile(current_user: User = Depends(get_current_active_user)):
    """Get current user's seller profile (works for all users with shop_name)"""
    return current_user


@router.put("/profile", response_model=SellerProfile)
async def update_seller_profile(
    updates: UserUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update seller profile (any user can set their shop name/description)"""
    ALLOWED_FIELDS = {"email", "other_contact", "first_name", "avatar_url", "shop_name", "shop_description", "shop_image", "auto_response"}
    update_data = updates.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field not in ALLOWED_FIELDS:
            continue
        setattr(current_user, field, value)
    
    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.get("/stats", response_model=SellerStats)
async def get_seller_stats(
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Get seller statistics"""
    
    # Total products
    total_products = await db.scalar(
        select(func.count()).select_from(Product).where(Product.seller_id == current_user.id)
    )
    
    # Active products
    active_products = await db.scalar(
        select(func.count()).select_from(Product).where(
            Product.seller_id == current_user.id,
            Product.is_active == True
        )
    )
    
    # Orders (count distinct orders, not order items)
    total_orders = await db.scalar(
        select(func.count(func.distinct(OrderItem.order_id))).select_from(OrderItem).where(OrderItem.seller_id == current_user.id)
    )
    
    # Pending orders
    pending_subquery = (
        select(OrderItem.id)
        .join(Order)
        .where(
            OrderItem.seller_id == current_user.id,
            Order.status == OrderStatus.PAID
        )
    )
    pending_orders = await db.scalar(
        select(func.count()).select_from(pending_subquery.subquery())
    )
    
    # Revenue (include all paid/delivered/completed orders)
    fee_settings = await get_fee_settings(db)
    revenue_result = await db.scalar(
        select(func.sum(OrderItem.price * OrderItem.quantity))
        .join(Order)
        .where(
            OrderItem.seller_id == current_user.id,
            Order.status.in_([OrderStatus.PAID, OrderStatus.DELIVERED, OrderStatus.COMPLETED])
        )
    )
    total_revenue = calc_seller_amount(revenue_result or 0.0, fee_settings["product_fee"])  # After platform fee
    
    # Average rating
    rating_result = await db.scalar(
        select(func.avg(Product.rating))
        .where(Product.seller_id == current_user.id, Product.review_count > 0)
    )
    
    # Total reviews
    total_reviews = await db.scalar(
        select(func.count()).select_from(Review)
        .join(Product, Review.product_id == Product.id)
        .where(Product.seller_id == current_user.id)
    ) or 0
    
    # Escrow amount (PAID and DELIVERED orders - funds not yet released)
    escrow_result = await db.scalar(
        select(func.sum(OrderItem.price * OrderItem.quantity))
        .join(Order)
        .where(
            OrderItem.seller_id == current_user.id,
            Order.status.in_([OrderStatus.PAID, OrderStatus.DELIVERED, OrderStatus.DISPUTED])
        )
    )
    escrow_amount = calc_seller_amount(escrow_result or 0.0, fee_settings["product_fee"])  # After platform fee
    
    # Open disputes count
    open_disputes = await db.scalar(
        select(func.count()).select_from(Dispute)
        .join(Order)
        .join(OrderItem)
        .where(
            OrderItem.seller_id == current_user.id,
            Dispute.status.in_([DisputeStatus.OPEN, DisputeStatus.ESCALATED])
        )
    ) or 0
    
    return {
        "total_products": total_products or 0,
        "active_products": active_products or 0,
        "total_orders": total_orders or 0,
        "pending_orders": pending_orders or 0,
        "total_revenue": total_revenue,
        "balance": current_user.balance,
        "pending_balance": current_user.pending_balance or 0,
        "rating": round(rating_result or current_user.seller_rating or 0, 2),
        "total_reviews": total_reviews,
        "total_sales": current_user.total_sales or 0,
        "escrow_amount": escrow_amount,
        "open_disputes": open_disputes
    }


MINIMUM_WITHDRAWAL_AMOUNT = 10.0  # Minimum $10 withdrawal

@router.post("/withdraw")
@limiter.limit("5/minute")
async def request_withdrawal(
    request: Request,
    payload: WithdrawalRequestCreate,
    current_user: User = Depends(get_current_paid_seller),
    db: AsyncSession = Depends(get_db)
):
    """Create a withdrawal request (processed manually by admin)"""
    # PIN is mandatory for withdrawals — uses shared lockout logic
    from app.auth import verify_user_pin
    await verify_user_pin(current_user, payload.pin, db)
    
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    if payload.amount < MINIMUM_WITHDRAWAL_AMOUNT:
        raise HTTPException(status_code=400, detail=f"Minimum withdrawal amount is ${MINIMUM_WITHDRAWAL_AMOUNT:.2f}")

    # Check for existing pending withdrawal
    existing = await db.execute(
        select(WithdrawalRequest).where(
            WithdrawalRequest.user_id == current_user.id,
            WithdrawalRequest.status == WithdrawalStatus.PENDING
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You already have a pending withdrawal request")
    
    # Lock user row to prevent race conditions
    user_result = await db.execute(
        select(User).where(User.id == current_user.id).with_for_update()
    )
    user = user_result.scalar_one()
    
    if user.balance < payload.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    
    # Deduct balance immediately (will be refunded if rejected)
    user.balance = round((user.balance or 0) - (payload.amount), 2)

    withdrawal = WithdrawalRequest(
        user_id=current_user.id,
        amount=payload.amount,
        destination=payload.destination
    )
    db.add(withdrawal)
    await db.commit()
    await db.refresh(withdrawal)
    return {"message": "Withdrawal request submitted. Funds reserved.", "id": withdrawal.id, "amount": withdrawal.amount, "balance": user.balance}


@router.get("/withdrawals", response_model=List[WithdrawalRequestSchema])
async def list_my_withdrawals(
    current_user: User = Depends(get_current_paid_seller),
    db: AsyncSession = Depends(get_db)
):
    """List current seller's withdrawal requests"""
    result = await db.execute(
        select(WithdrawalRequest)
        .where(WithdrawalRequest.user_id == current_user.id)
        .order_by(WithdrawalRequest.created_at.desc())
    )
    return result.scalars().all()


@router.get("/products", response_model=List[ProductSchema])
async def get_seller_products(
    limit: int = 50,
    offset: int = 0,
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Get seller's products with pagination"""
    result = await db.execute(
        select(Product)
        .where(Product.seller_id == current_user.id)
        .order_by(Product.created_at.desc())
        .limit(min(limit, 100))
        .offset(offset)
    )
    return result.scalars().all()


@router.post("/collateral/deposit")
@limiter.limit("10/minute")
async def deposit_collateral(
    request: Request,
    amount: float,
    current_user: User = Depends(get_current_paid_seller),
    db: AsyncSession = Depends(get_db)
):
    """Move funds from wallet balance to collateral"""
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    
    # Lock user row to prevent race conditions
    user_result = await db.execute(
        select(User).where(User.id == current_user.id).with_for_update()
    )
    user = user_result.scalar_one()
    
    if (user.balance or 0) < amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    user.balance = round((user.balance or 0) - (amount), 2)
    user.collateral = round((user.collateral or 0) + (amount), 2)
    await db.commit()
    await db.refresh(user)
    return {
        "message": f"${amount:.2f} added to collateral",
        "balance": user.balance,
        "collateral": user.collateral
    }


@router.get("/ranks")
async def get_seller_ranks(db: AsyncSession = Depends(get_db)):
    """Get available seller ranks and prices (monthly). Includes free tier."""
    ranks = await _get_seller_ranks(db)
    all_ranks = [
        {
            "rank": 0,
            "name": "Free",
            "price": 0,
            "badge_color": "#6B7280",
            "featured_days": 0,
            "max_products": 5,
            "max_services": 1,
            "auctions": False,
        }
    ]
    for k, v in ranks.items():
        all_ranks.append({
            "rank": k,
            "name": v["name"],
            "price": v["price"],
            "badge_color": v["badge_color"],
            "featured_days": v["featured_days"],
            "max_products": -1,  # unlimited
            "max_services": -1,
            "auctions": True,
        })
    return {
        "ranks": all_ranks,
        "featured_cost": FEATURED_COST
    }

@router.post("/rank/buy/{rank}")
@limiter.limit("5/minute")
async def buy_seller_rank(
    request: Request,
    rank: int,
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Buy or upgrade a seller rank (30 days). 
    On upgrade: remaining days from old rank carry over + 30 new days.
    Featured days reset fresh from now (don't stack).
    """
    if rank not in DEFAULT_SELLER_RANKS:
        raise HTTPException(status_code=400, detail="Invalid rank")
    
    seller_ranks = await _get_seller_ranks(db)
    rank_info = seller_ranks[rank]
    cost = rank_info["price"]
    now = datetime.utcnow()
    
    # Lock user row to prevent race conditions
    user_result = await db.execute(
        select(User).where(User.id == current_user.id).with_for_update()
    )
    user = user_result.scalar_one()
    
    # Check if downgrading (not allowed)
    current_rank = user.seller_rank or 0
    if rank < current_rank:
        raise HTTPException(status_code=400, detail="Cannot downgrade rank. Wait for current rank to expire.")
    
    if (user.balance or 0) < cost:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance. {rank_info['name']} rank costs ${cost:.0f}/month. Current balance: ${user.balance:.2f}"
        )

    user.balance = round((user.balance or 0) - (cost), 2)
    
    # Upgrade role to SELLER if currently buyer (free tier upgrading to paid)
    if user.role != UserRole.ADMIN and user.role != UserRole.SELLER:
        user.role = UserRole.SELLER
    
    # Calculate rank expiration with carryover
    # If upgrading with active rank, add remaining days to new duration
    base_days = 30
    remaining_days = 0
    
    if user.seller_expires_at and user.seller_expires_at > now:
        # Calculate remaining days from current rank
        remaining = user.seller_expires_at - now
        remaining_days = remaining.days + (1 if remaining.seconds > 0 else 0)  # Round up
    
    total_rank_days = base_days + remaining_days
    user.seller_rank = rank
    user.seller_expires_at = now + timedelta(days=total_rank_days)
    
    # Featured: extends from current expiry if still active
    featured_days = rank_info["featured_days"]
    
    if featured_days > 0:
        user.is_featured = True
        # Extend from current expiry if still active, otherwise from now
        if user.featured_expires_at and user.featured_expires_at > now:
            base_featured = user.featured_expires_at
        else:
            base_featured = now
        user.featured_expires_at = base_featured + timedelta(days=featured_days)
        
        # Calculate total featured days for message
        total_featured = (user.featured_expires_at - now).days
        message = f"{rank_info['name']} rank purchased! {total_rank_days} days rank + {total_featured} days featured."
    else:
        message = f"{rank_info['name']} rank purchased for {total_rank_days} days!"

    await db.commit()
    await db.refresh(user)
    
    return {
        "message": message,
        "rank": rank,
        "rank_name": rank_info["name"],
        "rank_expires_at": user.seller_expires_at.isoformat() if user.seller_expires_at else None,
        "featured_expires_at": user.featured_expires_at.isoformat() if user.featured_expires_at else None,
        "balance": user.balance
    }


@router.post("/featured/buy")
@limiter.limit("5/minute")
async def buy_featured_position(
    request: Request,
    current_user: User = Depends(get_current_paid_seller),
    db: AsyncSession = Depends(get_db)
):
    """Buy 30-day featured position on homepage for $200 (for Bronze or any seller)"""
    # Lock user row to prevent race conditions
    user_result = await db.execute(
        select(User).where(User.id == current_user.id).with_for_update()
    )
    user = user_result.scalar_one()
    
    if (user.balance or 0) < FEATURED_COST:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance. Featured costs ${FEATURED_COST:.0f}/month. Current balance: ${user.balance:.2f}"
        )

    user.balance = round((user.balance or 0) - (FEATURED_COST), 2)
    user.is_featured = True
    # Extend from current expiry if still active, otherwise from now
    now = datetime.utcnow()
    base = user.featured_expires_at if (user.featured_expires_at and user.featured_expires_at > now) else now
    user.featured_expires_at = base + timedelta(days=30)

    await db.commit()
    await db.refresh(user)
    return {
        "message": "Featured position purchased! Your shop will be highlighted on the homepage.",
        "featured_expires_at": user.featured_expires_at.isoformat(),
        "balance": user.balance
    }


@router.post("/collateral/withdraw")
@limiter.limit("5/minute")
async def withdraw_collateral(
    request: Request,
    amount: float,
    pin: str = None,
    current_user: User = Depends(get_current_paid_seller),
    db: AsyncSession = Depends(get_db)
):
    """Move funds from collateral back to wallet balance"""
    if amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    # Require PIN if user has one set
    if current_user.pin_hash:
        if not pin:
            raise HTTPException(status_code=403, detail="PIN required for collateral withdrawal")
        await verify_user_pin(current_user, pin, db)
    
    # Lock user row to prevent race conditions
    user_result = await db.execute(
        select(User).where(User.id == current_user.id).with_for_update()
    )
    user = user_result.scalar_one()
    
    if (user.collateral or 0) < amount:
        raise HTTPException(status_code=400, detail="Insufficient collateral")

    user.collateral = round((user.collateral or 0) - (amount), 2)
    user.balance = round((user.balance or 0) + (amount), 2)
    await db.commit()
    await db.refresh(user)
    return {
        "message": f"${amount:.2f} withdrawn from collateral",
        "balance": user.balance,
        "collateral": user.collateral
    }


async def _resolve_seller(seller_id: str, db: AsyncSession) -> User:
    """Resolve seller by numeric ID or username."""
    if seller_id.isdigit():
        result = await db.execute(
            select(User).where(User.id == int(seller_id), User.shop_name.isnot(None))
        )
    else:
        result = await db.execute(
            select(User).where(User.username == seller_id, User.shop_name.isnot(None))
        )
    seller = result.scalar_one_or_none()
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    return seller


@router.get("/{seller_id}", response_model=PublicSellerProfile)
async def get_seller_public(seller_id: str, db: AsyncSession = Depends(get_db)):
    """Get public seller profile"""
    return await _resolve_seller(seller_id, db)


@router.get("/{seller_id}/products", response_model=List[ProductSchema])
async def get_seller_products_public(
    seller_id: str,
    limit: int = 50,
    offset: int = 0,
    db: AsyncSession = Depends(get_db)
):
    """Get seller's public products with pagination"""
    seller = await _resolve_seller(seller_id, db)
    result = await db.execute(
        select(Product)
        .where(Product.seller_id == seller.id, Product.is_active == True)
        .order_by(Product.sales_count.desc())
        .limit(min(limit, 100))
        .offset(offset)
    )
    return result.scalars().all()


@router.get("/{seller_id}/reviews", response_model=List[ReviewSchema])
async def get_seller_reviews(
    seller_id: str,
    limit: int = Query(10, ge=1, le=50),
    db: AsyncSession = Depends(get_db)
):
    """Get recent reviews for a seller's products"""
    seller = await _resolve_seller(seller_id, db)
    result = await db.execute(
        select(Review)
        .join(Product, Review.product_id == Product.id)
        .where(Product.seller_id == seller.id)
        .options(
            selectinload(Review.reviewer),
            selectinload(Review.product)
        )
        .order_by(Review.created_at.desc())
        .limit(limit)
    )
    return result.scalars().all()


@router.get("/{seller_id}/services")
async def get_seller_services(seller_id: str, db: AsyncSession = Depends(get_db)):
    """Get seller's active services (public)"""
    seller = await _resolve_seller(seller_id, db)
    result = await db.execute(
        select(Service)
        .where(Service.seller_id == seller.id, Service.is_active == True)
        .order_by(Service.orders_count.desc())
    )
    return result.scalars().all()


@router.get("/{seller_id}/auctions")
async def get_seller_auctions(
    seller_id: str,
    limit: int = Query(20, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Get seller's active auctions (public)"""
    seller = await _resolve_seller(seller_id, db)
    result = await db.execute(
        select(Auction)
        .where(Auction.seller_id == seller.id, Auction.status == AuctionStatus.ACTIVE)
        .order_by(Auction.ends_at.asc())
        .limit(limit)
        .offset(offset)
    )
    auctions = result.scalars().all()
    return [{
        "id": a.id,
        "title": a.title,
        "description": a.description,
        "category": a.category,
        "image_url": a.image_url,
        "start_price": a.start_price,
        "blitz_price": a.blitz_price,
        "current_bid": a.current_bid,
        "bid_count": a.bid_count,
        "buyout_price": a.buyout_price,
        "duration_days": a.duration_days,
        "ends_at": a.ends_at.isoformat() if a.ends_at else None,
        "last_bid_at": a.last_bid_at.isoformat() if a.last_bid_at else None,
        "seller_id": a.seller_id,
    } for a in auctions]
