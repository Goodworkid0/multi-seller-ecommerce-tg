"""Auctions Router - CRUD for auction listings"""
from fastapi import APIRouter, Depends, HTTPException, status, Request, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload
from typing import Optional
from datetime import datetime, timedelta

from app.database import get_db, get_fee_settings, calc_seller_amount
from app.auth import get_current_user, get_current_active_user
from app.models import User, Auction, AuctionBid, AuctionStatus, Order, OrderItem, OrderStatus, Notification, UserRole
from app.telegram import create_notification

# Rate limiter
from slowapi import Limiter
from slowapi.util import get_remote_address
limiter = Limiter(key_func=get_remote_address)

router = APIRouter(prefix="/api/auctions", tags=["auctions"])


# ─── Schemas ─────────────────────────────────────────────────────────────────
from pydantic import BaseModel, Field

class AuctionCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    category: str = "other"
    image_url: Optional[str] = Field(default=None, max_length=500)
    start_price: float = Field(gt=0, le=1000000)
    blitz_price: float = Field(default=1.0, gt=0, le=10000)
    buyout_price: Optional[float] = Field(default=None, gt=0, le=1000000)
    duration_days: int = Field(default=2, ge=1, le=30)

class AuctionUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=3, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    category: Optional[str] = None
    image_url: Optional[str] = Field(default=None, max_length=500)
    start_price: Optional[float] = Field(default=None, gt=0, le=1000000)
    blitz_price: Optional[float] = Field(default=None, gt=0, le=10000)
    buyout_price: Optional[float] = Field(default=None, gt=0, le=1000000)
    duration_days: Optional[int] = Field(default=None, ge=1, le=30)


# ─── Public Endpoints ────────────────────────────────────────────────────────

@router.get("")
async def list_auctions(
    category: Optional[str] = None,
    search: Optional[str] = None,
    sort: str = "ending_soon",
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """List all active auctions (public, paginated with total count)"""
    base_query = select(Auction).where(Auction.status == AuctionStatus.ACTIVE)
    
    if category:
        base_query = base_query.where(Auction.category == category)
    
    if search:
        escaped = search.replace("\\", "\\\\").replace("%", r"\%").replace("_", r"\_")
        base_query = base_query.where(Auction.title.ilike(f"%{escaped}%", escape='\\'))
    
    # Get total count
    count_result = await db.execute(select(func.count()).select_from(base_query.subquery()))
    total = count_result.scalar() or 0
    
    # Apply sorting
    query = base_query.options(selectinload(Auction.seller))
    if sort == "newest":
        query = query.order_by(Auction.created_at.desc())
    elif sort == "price_low":
        query = query.order_by(Auction.current_bid.asc().nullsfirst(), Auction.start_price.asc())
    elif sort == "price_high":
        query = query.order_by(Auction.current_bid.desc().nullslast(), Auction.start_price.desc())
    elif sort == "most_bids":
        query = query.order_by(Auction.bid_count.desc())
    else:  # ending_soon
        query = query.order_by(Auction.ends_at.asc())
    
    query = query.offset((page - 1) * limit).limit(min(limit, 100))
    result = await db.execute(query)
    auctions = result.scalars().all()
    
    return {
        "total": total,
        "page": page,
        "pages": max(1, -(-total // limit)),
        "items": [{
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
            "seller_name": a.seller.shop_name or a.seller.username or "Seller",
        } for a in auctions]
    }


# ─── Seller Endpoints ────────────────────────────────────────────────────────

@router.get("/my")
async def get_my_auctions(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all auctions for current seller (paginated)"""
    if not user.shop_name:
        raise HTTPException(status_code=403, detail="Seller account required")
    
    result = await db.execute(
        select(Auction)
        .where(Auction.seller_id == user.id)
        .order_by(Auction.created_at.desc())
        .offset(offset)
        .limit(min(limit, 100))
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
        "buyout_price": a.buyout_price,
        "current_bid": a.current_bid,
        "bid_count": a.bid_count,
        "duration_days": a.duration_days,
        "status": a.status.value,
        "winner_id": a.winner_id,
        "starts_at": a.starts_at.isoformat() if a.starts_at else None,
        "ends_at": a.ends_at.isoformat() if a.ends_at else None,
        "last_bid_at": a.last_bid_at.isoformat() if a.last_bid_at else None,
        "payment_deadline": a.payment_deadline.isoformat() if a.payment_deadline else None,
        "created_at": a.created_at.isoformat() if a.created_at else None
    } for a in auctions]


# ─── Public Detail Endpoint ──────────────────────────────────────────────────

@router.get("/{auction_id}")
async def get_auction(auction_id: int, db: AsyncSession = Depends(get_db)):
    """Get auction details (public)"""
    result = await db.execute(
        select(Auction)
        .options(selectinload(Auction.seller))
        .where(Auction.id == auction_id)
    )
    auction = result.scalar_one_or_none()
    
    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found")
    
    # Get ALL bids (users can see each other's offers)
    bids_result = await db.execute(
        select(AuctionBid)
        .options(selectinload(AuctionBid.bidder))
        .where(AuctionBid.auction_id == auction_id)
        .order_by(AuctionBid.created_at.desc())
    )
    bids = bids_result.scalars().all()
    
    return {
        "id": auction.id,
        "title": auction.title,
        "description": auction.description,
        "category": auction.category,
        "image_url": auction.image_url,
        "start_price": auction.start_price,
        "blitz_price": auction.blitz_price,
        "buyout_price": auction.buyout_price,
        "current_bid": auction.current_bid,
        "bid_count": auction.bid_count,
        "duration_days": auction.duration_days,
        "status": auction.status.value,
        "starts_at": auction.starts_at.isoformat() if auction.starts_at else None,
        "ends_at": auction.ends_at.isoformat() if auction.ends_at else None,
        "last_bid_at": auction.last_bid_at.isoformat() if auction.last_bid_at else None,
        "payment_deadline": auction.payment_deadline.isoformat() if auction.payment_deadline else None,
        "winner_id": auction.winner_id,
        "seller_id": auction.seller_id,
        "seller_name": auction.seller.shop_name or auction.seller.username or "Seller",
        "bids": [{
            "id": b.id,
            "amount": b.amount,
            "bidder_id": b.bidder_id,
            "bidder_name": b.bidder.first_name or b.bidder.username or "Anonymous",
            "is_winning": b.is_winning,
            "created_at": b.created_at.isoformat() if b.created_at else None
        } for b in bids]
    }


# ─── Auction CRUD ────────────────────────────────────────────────────────────

@router.post("")
async def create_auction(
    data: AuctionCreate,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new auction (paid sellers only)"""
    if not user.shop_name:
        raise HTTPException(status_code=403, detail="Seller account required")
    
    # Block free tier from auctions
    seller_rank = user.seller_rank or 0
    if seller_rank == 0 and user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=403,
            detail="Auctions require a paid seller subscription (Bronze or higher). Upgrade your rank to create auctions."
        )
    
    now = datetime.utcnow()
    # Initial ends_at = now + duration_days (will extend on each bid)
    ends_at = now + timedelta(days=data.duration_days)
    
    auction = Auction(
        seller_id=user.id,
        title=data.title,
        description=data.description,
        category=data.category,
        image_url=data.image_url,
        start_price=data.start_price,
        blitz_price=data.blitz_price,
        buyout_price=data.buyout_price,
        duration_days=data.duration_days,
        status=AuctionStatus.ACTIVE,
        starts_at=now,
        ends_at=ends_at
    )
    
    db.add(auction)
    await db.commit()
    await db.refresh(auction)
    
    return {"id": auction.id, "message": "Auction created"}


@router.put("/{auction_id}")
async def update_auction(
    auction_id: int,
    data: AuctionUpdate,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update an auction (only if draft or no bids)"""
    result = await db.execute(
        select(Auction).where(and_(Auction.id == auction_id, Auction.seller_id == user.id))
    )
    auction = result.scalar_one_or_none()
    
    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found")
    
    if auction.bid_count > 0:
        raise HTTPException(status_code=400, detail="Cannot edit auction with bids")
    
    if data.title is not None:
        auction.title = data.title
    if data.description is not None:
        auction.description = data.description
    if data.category is not None:
        auction.category = data.category
    if data.image_url is not None:
        auction.image_url = data.image_url
    if data.start_price is not None:
        auction.start_price = data.start_price
    if data.blitz_price is not None:
        auction.blitz_price = data.blitz_price
    if data.buyout_price is not None:
        auction.buyout_price = data.buyout_price
    if data.duration_days is not None:
        auction.duration_days = data.duration_days
        # Update ends_at if no bids yet
        auction.ends_at = datetime.utcnow() + timedelta(days=data.duration_days)
    
    await db.commit()
    
    return {"message": "Auction updated"}


@router.post("/{auction_id}/cancel")
async def cancel_auction(
    auction_id: int,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Cancel an auction (only if no bids)"""
    result = await db.execute(
        select(Auction).where(and_(Auction.id == auction_id, Auction.seller_id == user.id))
    )
    auction = result.scalar_one_or_none()
    
    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found")
    
    if auction.bid_count > 0:
        raise HTTPException(status_code=400, detail="Cannot cancel auction with bids")
    
    auction.status = AuctionStatus.CANCELLED
    await db.commit()
    
    return {"message": "Auction cancelled"}


@router.delete("/{auction_id}")
async def delete_auction(
    auction_id: int,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete an auction"""
    result = await db.execute(
        select(Auction).where(and_(Auction.id == auction_id, Auction.seller_id == user.id))
    )
    auction = result.scalar_one_or_none()
    
    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found")
    
    if auction.status == AuctionStatus.ACTIVE and auction.bid_count > 0:
        raise HTTPException(status_code=400, detail="Cannot delete active auction with bids")
    
    await db.delete(auction)
    await db.commit()
    
    return {"message": "Auction deleted"}


# ─── Bidding ─────────────────────────────────────────────────────────────────

@router.post("/{auction_id}/bid")
@limiter.limit("20/minute")
async def place_bid(
    request: Request,
    auction_id: int,
    amount: float = Query(gt=0, le=1000000),
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Place a bid on an auction"""
    # Lock auction row to prevent race conditions during concurrent bids
    result = await db.execute(
        select(Auction).where(Auction.id == auction_id).with_for_update()
    )
    auction = result.scalar_one_or_none()
    
    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found")
    
    if auction.status != AuctionStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Auction is not active")
    
    now = datetime.utcnow()
    if auction.ends_at and now > auction.ends_at:
        raise HTTPException(status_code=400, detail="Auction has ended")
    
    if auction.seller_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot bid on your own auction")
    
    # Calculate minimum bid using blitz_price as increment
    blitz = auction.blitz_price or 1.0
    if auction.current_bid:
        min_bid = auction.current_bid + blitz
    else:
        min_bid = auction.start_price
    
    if amount < min_bid:
        raise HTTPException(status_code=400, detail=f"Minimum bid is ${min_bid:.2f}")
    
    # Lock user row to prevent concurrent bids exceeding balance.
    # This serializes all bid operations for the same user, preventing the race
    # condition where two concurrent bids on different auctions both pass the
    # balance check before either commits.
    user_result = await db.execute(
        select(User).where(User.id == user.id).with_for_update()
    )
    locked_user = user_result.scalar_one()
    
    # Calculate reserved balance from other active auction bids (excluding this auction)
    # Sum of all winning bids on ACTIVE or AWAITING_PAYMENT auctions where user is not already outbid
    reserved_result = await db.execute(
        select(func.coalesce(func.sum(AuctionBid.amount), 0))
        .select_from(AuctionBid)
        .join(Auction, AuctionBid.auction_id == Auction.id)
        .where(
            AuctionBid.bidder_id == user.id,
            AuctionBid.is_winning == True,
            AuctionBid.auction_id != auction_id,  # Exclude current auction
            Auction.status.in_([AuctionStatus.ACTIVE, AuctionStatus.AWAITING_PAYMENT])
        )
    )
    reserved_balance = reserved_result.scalar() or 0
    
    # Available balance = total balance - reserved bids
    available_balance = (locked_user.balance or 0) - reserved_balance
    
    if amount > available_balance:
        raise HTTPException(
            status_code=400, 
            detail=f"Insufficient available balance. You have ${locked_user.balance:.2f} but ${reserved_balance:.2f} is reserved for other auction bids. Available: ${available_balance:.2f}"
        )
    
    # Create bid
    bid = AuctionBid(
        auction_id=auction_id,
        bidder_id=user.id,
        amount=amount,
        is_winning=True
    )
    
    # Update previous winning bids
    await db.execute(
        AuctionBid.__table__.update()
        .where(and_(AuctionBid.auction_id == auction_id, AuctionBid.is_winning == True))
        .values(is_winning=False)
    )
    
    # Update auction - extend ends_at by duration_days from now
    auction.current_bid = amount
    auction.bid_count += 1
    auction.last_bid_at = now
    auction.ends_at = now + timedelta(days=auction.duration_days or 2)
    
    db.add(bid)
    await db.commit()
    
    return {
        "message": "Bid placed successfully", 
        "current_bid": amount,
        "ends_at": auction.ends_at.isoformat(),
        "reserved_balance": reserved_balance + amount
    }


@router.post("/{auction_id}/buy-now")
@limiter.limit("10/minute")
async def buy_now(
    request: Request,
    auction_id: int,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Buy now at buyout price"""
    # Lock auction row to prevent concurrent buy-now race condition
    result = await db.execute(
        select(Auction).where(Auction.id == auction_id).with_for_update()
    )
    auction = result.scalar_one_or_none()
    
    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found")
    
    if auction.status != AuctionStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Auction is not active")
    
    if not auction.buyout_price:
        raise HTTPException(status_code=400, detail="Buyout not available for this auction")
    
    if auction.seller_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot buy your own auction")
    
    # Lock buyer and seller rows to prevent race conditions
    buyer_result = await db.execute(
        select(User).where(User.id == user.id).with_for_update()
    )
    buyer = buyer_result.scalar_one()
    
    # Calculate reserved balance from other active auction bids
    reserved_result = await db.execute(
        select(func.coalesce(func.sum(AuctionBid.amount), 0))
        .select_from(AuctionBid)
        .join(Auction, AuctionBid.auction_id == Auction.id)
        .where(
            AuctionBid.bidder_id == user.id,
            AuctionBid.is_winning == True,
            AuctionBid.auction_id != auction_id,
            Auction.status.in_([AuctionStatus.ACTIVE, AuctionStatus.AWAITING_PAYMENT])
        )
    )
    reserved_balance = reserved_result.scalar() or 0
    available_balance = (buyer.balance or 0) - reserved_balance
    
    if auction.buyout_price > available_balance:
        raise HTTPException(
            status_code=400, 
            detail=f"Insufficient available balance. You have ${buyer.balance:.2f} but ${reserved_balance:.2f} is reserved for auction bids. Available: ${available_balance:.2f}"
        )
    
    seller_result = await db.execute(
        select(User).where(User.id == auction.seller_id).with_for_update()
    )
    seller = seller_result.scalar_one()
    
    # Process purchase - funds go to seller's pending_balance (escrow)
    fee_settings = await get_fee_settings(db)
    buyer.balance = round((buyer.balance or 0) - (auction.buyout_price), 2)
    seller.pending_balance = round((seller.pending_balance or 0) + (calc_seller_amount(auction.buyout_price, fee_settings["auction_fee"])), 2)
    auction.status = AuctionStatus.SOLD
    auction.winner_id = user.id
    auction.current_bid = auction.buyout_price
    
    # Create Order for delivery tracking (same as pay_for_auction)
    order = Order(
        buyer_id=user.id,
        total_amount=auction.buyout_price,
        status=OrderStatus.PAID,
        payment_method="balance",
        paid_at=datetime.utcnow()
    )
    db.add(order)
    await db.flush()  # Get order.id
    
    # Create OrderItem for the auction
    order_item = OrderItem(
        order_id=order.id,
        auction_id=auction.id,
        seller_id=auction.seller_id,
        quantity=1,
        price=auction.buyout_price
    )
    db.add(order_item)
    
    # Notify seller
    await create_notification(
        db, user_id=auction.seller_id, type="auction_sold",
        title=f"Auction sold: {auction.title}",
        body=f"Buyer paid ${auction.buyout_price:.2f} (buyout). Deliver the item in order #{order.id}.",
        link=f"/seller/orders/{order.id}",
    )
    
    await db.commit()
    
    return {"message": "Purchase successful", "order_id": order.id}


@router.post("/{auction_id}/pay")
@limiter.limit("10/minute")
async def pay_for_auction(
    request: Request,
    auction_id: int,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Pay for a won auction"""
    result = await db.execute(
        select(Auction)
        .where(Auction.id == auction_id)
    )
    auction = result.scalar_one_or_none()
    
    if not auction:
        raise HTTPException(status_code=404, detail="Auction not found")
    
    if auction.status != AuctionStatus.AWAITING_PAYMENT:
        raise HTTPException(status_code=400, detail="Auction is not awaiting payment")
    
    if auction.winner_id != user.id:
        raise HTTPException(status_code=403, detail="You are not the winner of this auction")
    
    # Lock buyer and seller rows to prevent race conditions
    buyer_result = await db.execute(
        select(User).where(User.id == user.id).with_for_update()
    )
    buyer = buyer_result.scalar_one()
    
    # Calculate reserved balance from OTHER active auction bids (excluding this one being paid)
    reserved_result = await db.execute(
        select(func.coalesce(func.sum(AuctionBid.amount), 0))
        .select_from(AuctionBid)
        .join(Auction, AuctionBid.auction_id == Auction.id)
        .where(
            AuctionBid.bidder_id == user.id,
            AuctionBid.is_winning == True,
            AuctionBid.auction_id != auction_id,
            Auction.status.in_([AuctionStatus.ACTIVE, AuctionStatus.AWAITING_PAYMENT])
        )
    )
    reserved_balance = reserved_result.scalar() or 0
    available_balance = (buyer.balance or 0) - reserved_balance
    
    if auction.current_bid > available_balance:
        raise HTTPException(
            status_code=400, 
            detail=f"Insufficient available balance. You have ${buyer.balance:.2f} but ${reserved_balance:.2f} is reserved for other auction bids. Available: ${available_balance:.2f}"
        )
    
    seller_result = await db.execute(
        select(User).where(User.id == auction.seller_id).with_for_update()
    )
    seller = seller_result.scalar_one()
    
    # Process payment - funds go to seller's pending_balance (escrow)
    fee_settings = await get_fee_settings(db)
    buyer.balance = round((buyer.balance or 0) - (auction.current_bid), 2)
    seller_amount = calc_seller_amount(auction.current_bid, fee_settings["auction_fee"])
    seller.pending_balance = round((seller.pending_balance or 0) + (seller_amount), 2)
    auction.status = AuctionStatus.SOLD
    
    # Create Order for delivery tracking
    order = Order(
        buyer_id=user.id,
        total_amount=auction.current_bid,
        status=OrderStatus.PAID,
        payment_method="balance",
        paid_at=datetime.utcnow()
    )
    db.add(order)
    await db.flush()  # Get order.id
    
    # Create OrderItem for the auction
    order_item = OrderItem(
        order_id=order.id,
        auction_id=auction.id,
        seller_id=auction.seller_id,
        quantity=1,
        price=auction.current_bid
    )
    db.add(order_item)
    
    # Notify seller
    await create_notification(
        db, user_id=auction.seller_id, type="auction_paid",
        title=f"Auction paid: {auction.title}",
        body=f"Buyer paid ${auction.current_bid:.2f}. Deliver the item in order #{order.id}.",
        link=f"/seller/orders/{order.id}",
    )
    
    # Notify buyer
    await create_notification(
        db, user_id=user.id, type="auction_payment_success",
        title=f"Payment successful: {auction.title}",
        body=f"You paid ${auction.current_bid:.2f}. Track delivery in your orders.",
        link=f"/orders/{order.id}", telegram_id=user.telegram_id,
    )
    
    await db.commit()
    
    return {"message": "Payment successful", "order_id": order.id}
