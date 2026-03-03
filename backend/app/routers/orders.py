"""Orders Router"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List
from datetime import datetime, timedelta
import json

from app.database import get_db, get_fee_settings, calc_seller_amount, get_referral_settings
from app.models import User, Order, OrderItem, Product, ProductKey, OrderStatus, Dispute, DisputeStatus, OrderMessage, Review, Notification, Referral, AppSettings, ProductVariant, OrderFeedback, UserRole
from app.telegram import create_notification
from app.schemas import (
    Order as OrderSchema, OrderCreate, SellerOrderItem,
    DisputeCreate, DisputeSchema, OrderMessageCreate, OrderMessageSchema,
    OrderFeedbackCreate, OrderFeedbackSchema
)
from app.auth import get_current_active_user, get_current_seller
from app.rate_limit import limiter

router = APIRouter()


async def process_referral_reward(user_id: int, order: Order, db: AsyncSession):
    """Process referral reward - % of EVERY purchase goes to referrer"""
    # Get settings
    ref_settings = await get_referral_settings(db)
    if not ref_settings["enabled"]:
        return None
    
    # Check if user was referred
    result = await db.execute(
        select(Referral).where(Referral.referred_id == user_id)
    )
    referral = result.scalar_one_or_none()
    
    if not referral:
        return None
    
    # Calculate referrer reward (% of order total)
    referrer_reward = round(order.total_amount * (ref_settings["percent"] / 100), 2)
    if referrer_reward <= 0:
        return None
    
    # Get referrer
    result = await db.execute(select(User).where(User.id == referral.referrer_id).with_for_update())
    referrer = result.scalar_one_or_none()
    
    if not referrer:
        return None
    
    # Award reward to referrer
    referrer.balance = round((referrer.balance or 0) + (referrer_reward), 2)
    referrer.total_referral_earnings = round((referrer.total_referral_earnings or 0) + (referrer_reward), 2)
    
    # Update referral record (accumulate total rewards)
    referral.referrer_reward = (referral.referrer_reward or 0) + referrer_reward
    referral.is_rewarded = True  # Mark as having received at least one reward
    referral.rewarded_at = datetime.utcnow()
    
    # Get referred user for notification
    result = await db.execute(select(User).where(User.id == user_id))
    referred = result.scalar_one_or_none()
    
    # Notify referrer
    await create_notification(
        db, user_id=referrer.id, type="referral_reward",
        title="Referral Commission!",
        body=f"You earned ${referrer_reward:.2f} ({ref_settings['percent']}%) from {referred.username or 'a user'}'s purchase!",
        link="/referrals", telegram_id=referrer.telegram_id,
    )
    
    return {"referrer_id": referrer.id, "referrer_reward": referrer_reward}


@router.post("", response_model=OrderSchema)
@limiter.limit("20/minute")
async def create_order(
    request: Request,
    order_data: OrderCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new order"""
    
    total_amount = 0
    order_items = []
    
    # Validate products and calculate total
    for item in order_data.items:
        result = await db.execute(
            select(Product).options(selectinload(Product.seller))
            .where(Product.id == item.product_id, Product.is_active == True)
            .with_for_update()
        )
        product = result.scalar_one_or_none()
        
        if not product:
            raise HTTPException(status_code=404, detail=f"Product {item.product_id} not found")
        
        # Check seller status - banned or expired sellers can't receive orders
        seller = product.seller
        if seller.is_banned:
            raise HTTPException(status_code=400, detail=f"Seller for product {product.name} is not available")
        if seller.seller_expires_at and seller.seller_expires_at < datetime.utcnow():
            raise HTTPException(status_code=400, detail=f"Seller for product {product.name} is not currently active")
        
        # Prevent self-purchase
        if product.seller_id == current_user.id:
            raise HTTPException(status_code=400, detail="Cannot purchase your own product")
        
        # Handle variant if specified
        variant = None
        if item.variant_id:
            result = await db.execute(
                select(ProductVariant).where(
                    ProductVariant.id == item.variant_id,
                    ProductVariant.product_id == item.product_id,
                    ProductVariant.is_active == True
                ).with_for_update()
            )
            variant = result.scalar_one_or_none()
            if not variant:
                raise HTTPException(status_code=404, detail=f"Variant {item.variant_id} not found for product {item.product_id}")
            
            # Check variant stock
            if variant.stock_count < item.quantity:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Not enough stock for variant '{variant.name}' of {product.name}"
                )
            unit_price = variant.price
        else:
            # Use product stock and price
            if product.stock_count < item.quantity:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Not enough stock for {product.name}"
                )
            unit_price = product.price
        
        # Apply bulk discount if applicable
        if product.bulk_discounts:
            tiers = json.loads(product.bulk_discounts) if isinstance(product.bulk_discounts, str) else product.bulk_discounts
            # Sort descending by min_qty to find highest applicable tier
            applicable = [t for t in tiers if item.quantity >= t['min_qty']]
            if applicable:
                best = max(applicable, key=lambda t: t['min_qty'])
                unit_price = round(unit_price * (1 - best['discount_pct'] / 100), 2)

        total_amount += unit_price * item.quantity
        order_items.append({
            "product": product,
            "variant": variant,
            "variant_id": item.variant_id,
            "quantity": item.quantity,
            "price": unit_price
        })
    
    # Create order
    order = Order(
        buyer_id=current_user.id,
        total_amount=total_amount,
        status=OrderStatus.PENDING
    )
    db.add(order)
    await db.flush()
    
    # Create order items
    for item_data in order_items:
        order_item = OrderItem(
            order_id=order.id,
            product_id=item_data["product"].id,
            seller_id=item_data["product"].seller_id,
            quantity=item_data["quantity"],
            price=item_data["price"],
            variant_id=item_data.get("variant_id")
        )
        db.add(order_item)
    
    await db.commit()
    
    # Re-fetch with eager loading to avoid lazy load in async
    result = await db.execute(
        select(Order)
        .where(Order.id == order.id)
        .options(
            selectinload(Order.items).selectinload(OrderItem.product),
            selectinload(Order.items).selectinload(OrderItem.delivered_keys),
            selectinload(Order.items).selectinload(OrderItem.variant)
        )
    )
    order = result.scalar_one()
    
    return order


@router.post("/{order_id}/pay")
@limiter.limit("10/minute")
async def pay_order(
    request: Request,
    order_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Simulate payment and deliver keys"""
    
    # Lock the buyer row to prevent concurrent double-spend
    buyer_result = await db.execute(
        select(User).where(User.id == current_user.id).with_for_update()
    )
    buyer = buyer_result.scalar_one()
    
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_id, Order.buyer_id == buyer.id)
        .with_for_update()
    )
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order.status != OrderStatus.PENDING:
        raise HTTPException(status_code=400, detail="Order already processed")

    if (buyer.balance or 0) < order.total_amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    buyer.balance = round((buyer.balance or 0) - (order.total_amount), 2)
    
    # Get fee settings for seller escrow calculation
    fee_settings = await get_fee_settings(db)
    
    # Process each item
    delivered_items = []
    
    for item in order.items:
        # Build key query with optional variant filter
        key_conditions = [
            ProductKey.product_id == item.product_id,
            ProductKey.is_sold == False
        ]
        if item.variant_id:
            key_conditions.append(ProductKey.variant_id == item.variant_id)
        
        # Get available keys with row lock to prevent double-assignment
        keys_result = await db.execute(
            select(ProductKey)
            .where(*key_conditions)
            .limit(item.quantity)
            .with_for_update()
        )
        keys = keys_result.scalars().all()
        
        if len(keys) < item.quantity:
            raise HTTPException(
                status_code=400,
                detail="Not enough keys available"
            )
        
        # Mark keys as sold
        delivered_keys = []
        for key in keys:
            key.is_sold = True
            key.sold_at = datetime.utcnow()
            key.order_item_id = item.id
            delivered_keys.append(key.key_value)
        
        # Update product stock and sales
        product_result = await db.execute(select(Product).where(Product.id == item.product_id))
        product = product_result.scalar_one()
        product.stock_count -= item.quantity
        product.sales_count += item.quantity
        
        # Update variant stock if applicable
        if item.variant_id:
            variant_result = await db.execute(
                select(ProductVariant).where(ProductVariant.id == item.variant_id)
            )
            variant = variant_result.scalar_one_or_none()
            if variant:
                variant.stock_count -= item.quantity
        
        # Update seller pending_balance (escrow) — lock row to prevent race condition
        seller_result = await db.execute(select(User).where(User.id == item.seller_id).with_for_update())
        seller = seller_result.scalar_one()
        seller.pending_balance = round((seller.pending_balance or 0) + calc_seller_amount(item.price * item.quantity, fee_settings["product_fee"]), 2)  # Platform fee (held in escrow)
        
        delivered_items.append({
            "product_name": product.name,
            "keys": delivered_keys
        })
    
    # Update order status
    order.status = OrderStatus.DELIVERED
    order.paid_at = datetime.utcnow()
    order.delivered_at = datetime.utcnow()
    # Use max warranty_hours across order items (minimum 1h buffer)
    max_warranty = max((item.product.warranty_hours or 48 for item in order.items if item.product), default=48)
    order.auto_complete_at = datetime.utcnow() + timedelta(hours=max(max_warranty, 1))

    # Notify each seller about the new sale
    notified_sellers = set()
    for item in order.items:
        sid = item.seller_id
        if sid not in notified_sellers:
            notified_sellers.add(sid)
            await create_notification(
                db, user_id=sid, type="order_paid",
                title=f"New sale! Order #{order.id}",
                body=f"${order.total_amount:.2f} — keys delivered automatically",
                link=f"/orders/{order.id}",
            )

    for sid in notified_sellers:
        await create_notification(
            db, user_id=sid, type="order_status_update",
            title=f"Order #{order.id} status updated",
            body="Order status changed to delivered.",
            link=f"/orders/{order.id}",
        )

    await create_notification(
        db, user_id=buyer.id, type="order_paid",
        title=f"Purchase successful — Order #{order.id}",
        body=f"${order.total_amount:.2f} paid. Keys are now available.",
        link=f"/orders/{order.id}", telegram_id=buyer.telegram_id,
    )

    await create_notification(
        db, user_id=buyer.id, type="order_status_update",
        title=f"Order #{order.id} status updated",
        body="Order status changed to delivered.",
        link=f"/orders/{order.id}", telegram_id=buyer.telegram_id,
    )
    
    await db.commit()
    
    return {
        "message": "Payment successful! Keys delivered.",
        "order_id": order.id,
        "items": delivered_items
    }


@router.get("", response_model=List[OrderSchema])
async def list_orders(
    limit: int = 20,
    offset: int = 0,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """List user's orders (paginated)"""
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.product),
            selectinload(Order.items).selectinload(OrderItem.delivered_keys),
            selectinload(Order.items).selectinload(OrderItem.variant)
        )
        .where(Order.buyer_id == current_user.id)
        .order_by(Order.created_at.desc())
        .offset(offset)
        .limit(min(limit, 100))
    )
    return result.scalars().all()


# ============ Seller Order Endpoints ============
# NOTE: These MUST be defined before /{order_id} to avoid route conflicts

@router.get("/seller/pending")
async def get_seller_pending_orders(
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Get seller's pending orders"""
    result = await db.execute(
        select(OrderItem)
        .join(Order)
        .options(
            selectinload(OrderItem.order),
            selectinload(OrderItem.product),
            selectinload(OrderItem.variant)
        )
        .where(
            OrderItem.seller_id == current_user.id,
            Order.status == OrderStatus.PAID
        )
    )
    return result.scalars().all()


@router.get("/seller/disputes")
async def get_seller_disputes(
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Get open disputes on seller's orders"""
    result = await db.execute(
        select(Dispute, Order, User)
        .join(Order, Order.id == Dispute.order_id)
        .join(OrderItem, OrderItem.order_id == Order.id)
        .join(User, User.id == Dispute.opened_by)
        .where(
            OrderItem.seller_id == current_user.id,
            Dispute.status.in_([DisputeStatus.OPEN, DisputeStatus.ESCALATED])
        )
        .order_by(Dispute.created_at.desc())
        .distinct()
    )
    disputes = []
    for dispute, order, opener in result.all():
        disputes.append({
            "id": dispute.id,
            "order_id": dispute.order_id,
            "reason": dispute.reason,
            "status": dispute.status.value,
            "created_at": dispute.created_at.isoformat(),
            "buyer_username": opener.username,
            "buyer_first_name": opener.first_name,
            "order_total": order.total_amount,
        })
    return disputes


@router.get("/seller/conversations")
async def get_seller_conversations(
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Get recent conversations on seller's orders (orders with unread/recent messages)"""
    # Get all order IDs for this seller
    order_ids_result = await db.execute(
        select(OrderItem.order_id).where(OrderItem.seller_id == current_user.id).distinct()
    )
    order_ids = [r for (r,) in order_ids_result.all()]
    if not order_ids:
        return []

    # For each order, get the latest non-system message not from the seller
    from sqlalchemy import and_, case
    conversations = []
    for oid in order_ids:
        # Get latest message from buyer/admin (not seller, not system)
        msg_result = await db.execute(
            select(OrderMessage, Order, User)
            .join(Order, Order.id == OrderMessage.order_id)
            .join(User, User.id == OrderMessage.sender_id)
            .where(
                OrderMessage.order_id == oid,
                OrderMessage.sender_id != current_user.id,
                OrderMessage.is_system == False
            )
            .order_by(OrderMessage.created_at.desc())
            .limit(1)
        )
        row = msg_result.first()
        if row:
            msg, order, sender = row
            # Count total messages in thread
            count_result = await db.execute(
                select(func.count(OrderMessage.id)).where(
                    OrderMessage.order_id == oid,
                    OrderMessage.is_system == False
                )
            )
            total = count_result.scalar()
            conversations.append({
                "order_id": oid,
                "order_status": order.status.value,
                "order_total": order.total_amount,
                "last_message": msg.content[:120],
                "last_message_at": msg.created_at.isoformat(),
                "sender_username": sender.username,
                "sender_first_name": sender.first_name,
                "message_count": total,
            })

    # Sort by latest message
    conversations.sort(key=lambda c: c["last_message_at"], reverse=True)
    return conversations[:10]


@router.get("/seller", response_model=List[SellerOrderItem])
async def list_seller_orders(
    limit: int = 20,
    offset: int = 0,
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(OrderItem, Order, Product, User)
        .join(Order, Order.id == OrderItem.order_id)
        .join(Product, Product.id == OrderItem.product_id)
        .join(User, User.id == Order.buyer_id)
        .where(OrderItem.seller_id == current_user.id)
        .order_by(Order.created_at.desc())
        .offset(offset)
        .limit(min(limit, 100))
    )

    items = []
    for item, order, product, buyer in result.all():
        # Check if order has open/escalated dispute
        dispute_result = await db.execute(
            select(func.count(Dispute.id)).where(
                Dispute.order_id == order.id,
                Dispute.status.in_([DisputeStatus.OPEN, DisputeStatus.ESCALATED])
            )
        )
        has_dispute = dispute_result.scalar() > 0

        # Check for review on this order+product
        review_info = None
        review_result = await db.execute(
            select(Review)
            .options(selectinload(Review.reviewer))
            .where(
                Review.product_id == product.id,
                Review.order_id == order.id
            )
            .limit(1)
        )
        review_obj = review_result.scalar_one_or_none()
        if review_obj:
            from app.schemas import OrderReviewInfo
            review_info = OrderReviewInfo(
                rating=review_obj.rating,
                comment=review_obj.comment,
                reviewer_username=review_obj.reviewer.username if review_obj.reviewer else None,
                created_at=review_obj.created_at
            )

        items.append(
            SellerOrderItem(
                order_id=order.id,
                status=order.status,
                created_at=order.created_at,
                paid_at=order.paid_at,
                delivered_at=order.delivered_at,
                auto_complete_at=order.auto_complete_at,
                is_buyer_confirmed=order.is_buyer_confirmed,
                product_id=product.id,
                product_name=product.name,
                quantity=item.quantity,
                price=item.price,
                total=item.price * item.quantity,
                buyer_username=buyer.username,
                buyer_first_name=buyer.first_name,
                has_dispute=has_dispute,
                review=review_info
            )
        )

    return items


@router.post("/seller/{order_id}/deliver")
async def seller_mark_delivered(
    order_id: int,
    current_user: User = Depends(get_current_seller),
    db: AsyncSession = Depends(get_db)
):
    """Seller marks an auction order as delivered (for items without product keys)"""
    # Verify seller has items in this order
    item_check = await db.execute(
        select(OrderItem).where(
            OrderItem.order_id == order_id,
            OrderItem.seller_id == current_user.id,
            OrderItem.auction_id.isnot(None)  # Only for auction items
        )
    )
    item = item_check.scalar_one_or_none()
    
    if not item:
        raise HTTPException(status_code=404, detail="No auction items found for this seller in this order")
    
    # Get the order
    order_result = await db.execute(select(Order).where(Order.id == order_id))
    order = order_result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    if order.status != OrderStatus.PAID:
        raise HTTPException(status_code=400, detail=f"Order is not in PAID status (current: {order.status.value})")
    
    # Mark as delivered with warranty-based auto-complete window
    order.status = OrderStatus.DELIVERED
    order.delivered_at = datetime.utcnow()
    # Use max warranty_hours across order items (minimum 1h buffer)
    warranty_h = max((item.product.warranty_hours or 48 for item in order.items if item.product), default=48)
    warranty_h = max(warranty_h, 1)
    order.auto_complete_at = datetime.utcnow() + timedelta(hours=warranty_h)
    
    # Notify buyer
    warranty_label = f"{warranty_h}h" if warranty_h < 168 else f"{warranty_h // 24}d"
    await create_notification(
        db, user_id=order.buyer_id, type="order_delivered",
        title=f"Auction order #{order.id} delivered",
        body=f"Seller marked your auction order as delivered. You have {warranty_label} to confirm or dispute.",
        link=f"/orders/{order.id}",
    )
    
    # System message
    msg = OrderMessage(
        order_id=order.id,
        sender_id=current_user.id,
        content="Seller marked auction item as delivered.",
        is_system=True
    )
    db.add(msg)
    
    await db.commit()
    return {"message": "Order marked as delivered", "auto_complete_at": order.auto_complete_at.isoformat()}


# ============ Order Detail (after /seller routes) ============

@router.get("/{order_id}", response_model=OrderSchema)
async def get_order(
    order_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get order details with delivered keys — accessible by buyer, seller, or admin"""
    result = await db.execute(
        select(Order)
        .options(
            selectinload(Order.items).selectinload(OrderItem.delivered_keys),
            selectinload(Order.items).selectinload(OrderItem.product),
            selectinload(Order.items).selectinload(OrderItem.auction),
            selectinload(Order.items).selectinload(OrderItem.variant)
        )
        .where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Check access: buyer, seller of any item, or admin
    is_buyer = order.buyer_id == current_user.id
    is_seller = any(item.seller_id == current_user.id for item in order.items)
    is_admin = current_user.role.value == "admin"
    
    if not (is_buyer or is_seller or is_admin):
        raise HTTPException(status_code=403, detail="Not authorized")
    
    return order


# ============ Order Confirm & Dispute ============

@router.post("/{order_id}/confirm")
async def confirm_order(
    order_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Buyer confirms order is satisfactory — marks as completed"""
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.buyer_id == current_user.id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status not in (OrderStatus.DELIVERED,):
        raise HTTPException(status_code=400, detail="Order cannot be confirmed in this state")

    order.status = OrderStatus.COMPLETED
    order.is_buyer_confirmed = True
    order.completed_at = datetime.utcnow()

    # Release funds from pending_balance to balance and increment seller total_sales
    fee_settings = await get_fee_settings(db)
    items_result = await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))
    seller_ids_done = set()
    for item in items_result.scalars().all():
        # Lock seller row to prevent race conditions during balance updates
        seller_result = await db.execute(
            select(User).where(User.id == item.seller_id).with_for_update()
        )
        seller = seller_result.scalar_one()
        
        # Release escrow funds - auction items use auction fee, products use product fee
        if item.auction_id:
            item_earnings = calc_seller_amount(item.price * item.quantity, fee_settings["auction_fee"])
        else:
            item_earnings = calc_seller_amount(item.price * item.quantity, fee_settings["product_fee"])
        seller.pending_balance = round(max(0, (seller.pending_balance or 0) - item_earnings), 2)
        seller.balance = round((seller.balance or 0) + (item_earnings), 2)
        
        if item.seller_id not in seller_ids_done:
            seller.total_sales = (seller.total_sales or 0) + 1
            seller_ids_done.add(item.seller_id)

    # Notify seller(s) - single consolidated notification
    for sid in seller_ids_done:
        await create_notification(
            db, user_id=sid, type="order_completed",
            title=f"Order #{order.id} completed",
            body="Buyer confirmed the order as complete. Funds released.",
            link=f"/orders/{order.id}",
        )

    # Notify buyer - single consolidated notification
    await create_notification(
        db, user_id=current_user.id, type="order_completed",
        title=f"Order #{order.id} completed",
        body="You confirmed this order as complete.",
        link=f"/orders/{order.id}", telegram_id=current_user.telegram_id,
    )

    # System message
    msg = OrderMessage(order_id=order.id, sender_id=current_user.id, content="Buyer confirmed the order. Order completed.", is_system=True)
    db.add(msg)
    
    # Process referral reward on first qualifying purchase
    await process_referral_reward(current_user.id, order, db)
    
    await db.commit()
    return {"message": "Order confirmed and completed."}


@router.post("/{order_id}/dispute", response_model=DisputeSchema)
async def open_dispute(
    order_id: int,
    data: DisputeCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Buyer opens a dispute on a delivered order"""
    result = await db.execute(
        select(Order).where(Order.id == order_id, Order.buyer_id == current_user.id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.status not in (OrderStatus.DELIVERED,):
        raise HTTPException(status_code=400, detail="Disputes can only be opened on delivered orders")

    # Check for existing open/escalated dispute
    existing = await db.execute(
        select(Dispute).where(
            Dispute.order_id == order_id,
            Dispute.status.in_([DisputeStatus.OPEN, DisputeStatus.ESCALATED])
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="This order already has an active dispute")

    order.status = OrderStatus.DISPUTED
    order.auto_complete_at = None  # Cancel auto-complete

    dispute = Dispute(
        order_id=order_id,
        opened_by=current_user.id,
        reason=data.reason
    )
    db.add(dispute)

    # System message
    msg = OrderMessage(
        order_id=order_id, sender_id=current_user.id,
        content=f"⚠️ Issue reported by buyer", is_system=True
    )
    db.add(msg)

    # Buyer's message with the issue description
    buyer_msg = OrderMessage(
        order_id=order_id, sender_id=current_user.id,
        content=data.reason, is_system=False
    )
    db.add(buyer_msg)

    # Notify seller(s) about the dispute - single consolidated notification
    seller_items = await db.execute(
        select(OrderItem.seller_id).where(OrderItem.order_id == order_id).distinct()
    )
    seller_ids = [sid for (sid,) in seller_items.all()]
    for sid in seller_ids:
        await create_notification(
            db, user_id=sid, type="dispute_opened",
            title=f"Dispute opened on Order #{order_id}",
            body=data.reason[:120],
            link=f"/orders/{order_id}",
        )

    # Notify buyer - single consolidated notification
    await create_notification(
        db, user_id=current_user.id, type="dispute_opened",
        title=f"Dispute opened on Order #{order_id}",
        body="Your dispute has been submitted.",
        link=f"/orders/{order_id}", telegram_id=current_user.telegram_id,
    )

    await db.flush()
    await db.commit()
    await db.refresh(dispute)

    return DisputeSchema(
        id=dispute.id, order_id=dispute.order_id, opened_by=dispute.opened_by,
        reason=dispute.reason, status=dispute.status, created_at=dispute.created_at,
        opener_username=current_user.username, opener_first_name=current_user.first_name,
        order_total=order.total_amount, order_status=order.status.value
    )


@router.get("/{order_id}/dispute", response_model=DisputeSchema)
async def get_order_dispute(
    order_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get active dispute for an order (buyer or seller)"""
    # Verify access: buyer must own order OR seller must have items
    order_result = await db.execute(select(Order).where(Order.id == order_id))
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    is_buyer = order.buyer_id == current_user.id
    seller_check = await db.execute(
        select(OrderItem).where(OrderItem.order_id == order_id, OrderItem.seller_id == current_user.id)
    )
    is_seller = seller_check.scalar_one_or_none() is not None
    is_admin = current_user.role.value == "admin"

    if not (is_buyer or is_seller or is_admin):
        raise HTTPException(status_code=403, detail="Not authorized")

    result = await db.execute(
        select(Dispute).where(Dispute.order_id == order_id).order_by(Dispute.created_at.desc())
    )
    dispute = result.scalars().first()
    if not dispute:
        raise HTTPException(status_code=404, detail="No dispute found for this order")

    opener_result = await db.execute(select(User).where(User.id == dispute.opened_by))
    opener = opener_result.scalar_one_or_none()

    return DisputeSchema(
        id=dispute.id, order_id=dispute.order_id, opened_by=dispute.opened_by,
        reason=dispute.reason, status=dispute.status, resolution=dispute.resolution,
        resolved_by=dispute.resolved_by, created_at=dispute.created_at,
        resolved_at=dispute.resolved_at,
        opener_username=opener.username if opener else None,
        opener_first_name=opener.first_name if opener else None,
        order_total=order.total_amount, order_status=order.status.value
    )


@router.post("/{order_id}/dispute/resolve-buyer")
async def buyer_resolve_dispute(
    order_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Buyer closes their own dispute and completes the order (releases funds to seller)"""
    order_result = await db.execute(select(Order).where(Order.id == order_id))
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    if order.buyer_id != current_user.id:
        raise HTTPException(status_code=403, detail="Only the buyer can do this")
    if order.status != OrderStatus.DISPUTED:
        raise HTTPException(status_code=400, detail="Order is not in disputed state")

    # Find active dispute
    result = await db.execute(
        select(Dispute).where(
            Dispute.order_id == order_id,
            Dispute.status.in_([DisputeStatus.OPEN, DisputeStatus.ESCALATED])
        )
    )
    dispute = result.scalar_one_or_none()
    if not dispute:
        raise HTTPException(status_code=400, detail="No active dispute found")

    # Resolve dispute
    dispute.status = DisputeStatus.RESOLVED
    dispute.resolution = "Buyer closed the dispute and confirmed the order."
    dispute.resolved_by = current_user.id
    dispute.resolved_at = datetime.utcnow()

    # Complete order and release escrow funds
    order.status = OrderStatus.COMPLETED
    order.is_buyer_confirmed = True
    order.completed_at = datetime.utcnow()

    # Release escrow funds from pending_balance to balance and increment seller total_sales
    fee_settings = await get_fee_settings(db)
    items_result = await db.execute(select(OrderItem).where(OrderItem.order_id == order.id))
    seller_ids_done = set()
    for item in items_result.scalars().all():
        # Lock seller row to prevent race conditions on balance update
        seller_result = await db.execute(
            select(User).where(User.id == item.seller_id).with_for_update()
        )
        seller = seller_result.scalar_one()
        
        # Release escrow funds
        if item.auction_id:
            item_earnings = calc_seller_amount(item.price * item.quantity, fee_settings["auction_fee"])
        else:
            item_earnings = calc_seller_amount(item.price * item.quantity, fee_settings["product_fee"])
        seller.pending_balance = round(max(0, (seller.pending_balance or 0) - item_earnings), 2)
        seller.balance = round((seller.balance or 0) + (item_earnings), 2)
        
        if item.seller_id not in seller_ids_done:
            seller.total_sales = (seller.total_sales or 0) + 1
            seller_ids_done.add(item.seller_id)

    # System message
    msg = OrderMessage(
        order_id=order.id, sender_id=current_user.id,
        content="Buyer closed the dispute and confirmed the order. Funds released to seller.",
        is_system=True
    )
    db.add(msg)

    # Notify seller(s) - single consolidated notification
    for sid in seller_ids_done:
        await create_notification(
            db, user_id=sid, type="dispute_resolved",
            title=f"Dispute closed — Order #{order.id} completed",
            body="Buyer resolved the dispute and released funds.",
            link=f"/orders/{order.id}",
        )

    # Notify buyer - single consolidated notification
    await create_notification(
        db, user_id=current_user.id, type="dispute_resolved",
        title=f"Order #{order.id} completed",
        body="Dispute is closed and your order is now complete.",
        link=f"/orders/{order.id}", telegram_id=current_user.telegram_id,
    )

    await db.commit()
    return {"message": "Dispute closed. Order completed and funds released."}


@router.post("/{order_id}/dispute/escalate")
async def escalate_dispute(
    order_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Either buyer or seller requests admin presence in the dispute"""
    order_result = await db.execute(select(Order).where(Order.id == order_id))
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    is_buyer = order.buyer_id == current_user.id
    seller_check = await db.execute(
        select(OrderItem).where(OrderItem.order_id == order_id, OrderItem.seller_id == current_user.id)
    )
    is_seller = seller_check.scalar_one_or_none() is not None

    if not (is_buyer or is_seller):
        raise HTTPException(status_code=403, detail="Not authorized")

    # Find the open dispute
    result = await db.execute(
        select(Dispute).where(Dispute.order_id == order_id, Dispute.status == DisputeStatus.OPEN)
    )
    dispute = result.scalar_one_or_none()
    if not dispute:
        raise HTTPException(status_code=400, detail="No open dispute to escalate")

    if dispute.status == DisputeStatus.ESCALATED:
        raise HTTPException(status_code=400, detail="Dispute already escalated")

    dispute.status = DisputeStatus.ESCALATED

    role_label = "Buyer" if is_buyer else "Seller"
    msg = OrderMessage(
        order_id=order_id, sender_id=current_user.id,
        content=f"{role_label} requested admin review. An admin will join this conversation.",
        is_system=True
    )
    db.add(msg)

    # Notify all admins about the escalation
    admin_result = await db.execute(
        select(User).where(User.role == UserRole.ADMIN)
    )
    for admin_user in admin_result.scalars().all():
        await create_notification(
            db, user_id=admin_user.id, type="dispute_escalated",
            title=f"Dispute escalated — Order #{order_id}",
            body=f"{role_label} requested admin review",
            link=f"/orders/{order_id}", telegram_id=admin_user.telegram_id,
        )

    await db.commit()
    return {"message": "Dispute escalated. An admin will review."}


# ============ Order Messages ============

@router.get("/{order_id}/messages", response_model=List[OrderMessageSchema])
async def get_order_messages(
    order_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get messages for an order — accessible by buyer, seller, or admin"""
    order_result = await db.execute(select(Order).where(Order.id == order_id))
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    is_buyer = order.buyer_id == current_user.id
    seller_check = await db.execute(
        select(OrderItem).where(OrderItem.order_id == order_id, OrderItem.seller_id == current_user.id)
    )
    is_seller = seller_check.scalar_one_or_none() is not None
    is_admin = current_user.role.value == "admin"

    if not (is_buyer or is_seller or is_admin):
        raise HTTPException(status_code=403, detail="Not authorized")

    # Get seller IDs for this order to label messages
    seller_ids_result = await db.execute(
        select(OrderItem.seller_id).where(OrderItem.order_id == order_id).distinct()
    )
    seller_ids = {r for (r,) in seller_ids_result.all()}

    result = await db.execute(
        select(OrderMessage, User)
        .join(User, User.id == OrderMessage.sender_id)
        .where(OrderMessage.order_id == order_id)
        .order_by(OrderMessage.created_at.asc())
    )

    messages = []
    for msg, sender in result.all():
        if sender.role.value == "admin":
            label = "admin"
        elif sender.id in seller_ids:
            label = "seller"
        elif sender.id == order.buyer_id:
            label = "buyer"
        else:
            label = None
        messages.append(OrderMessageSchema(
            id=msg.id, order_id=msg.order_id, sender_id=msg.sender_id,
            content=msg.content, is_system=msg.is_system, created_at=msg.created_at,
            sender_username=sender.username, sender_first_name=sender.first_name,
            sender_role=sender.role.value,
            sender_label=label,
            shop_name=sender.shop_name if sender.id in seller_ids else None
        ))
    return messages


@router.post("/{order_id}/messages", response_model=OrderMessageSchema)
@limiter.limit("30/minute")
async def send_order_message(
    request: Request,
    order_id: int,
    data: OrderMessageCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Send a message in an order thread"""
    order_result = await db.execute(select(Order).where(Order.id == order_id))
    order = order_result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")

    # Only delivered/disputed/completed orders have messaging
    if order.status in (OrderStatus.PENDING, OrderStatus.CANCELLED):
        raise HTTPException(status_code=400, detail="Messaging not available for this order")

    is_buyer = order.buyer_id == current_user.id
    seller_check = await db.execute(
        select(OrderItem).where(OrderItem.order_id == order_id, OrderItem.seller_id == current_user.id)
    )
    is_seller = seller_check.scalar_one_or_none() is not None
    is_admin = current_user.role.value == "admin"

    if not (is_buyer or is_seller or is_admin):
        raise HTTPException(status_code=403, detail="Not authorized")

    msg = OrderMessage(
        order_id=order_id,
        sender_id=current_user.id,
        content=data.content.strip()
    )
    db.add(msg)

    sender_label = "Admin" if is_admin else "Seller" if is_seller else "Buyer"
    seller_ids_result = await db.execute(
        select(OrderItem.seller_id).where(OrderItem.order_id == order_id).distinct()
    )
    recipients = {order.buyer_id, *[sid for (sid,) in seller_ids_result.all()]}
    recipients.discard(current_user.id)

    for rid in recipients:
        await create_notification(
            db, user_id=rid, type="dispute_message",
            title=f"{sender_label} replied on Order #{order_id}",
            body=data.content.strip()[:120],
            link=f"/orders/{order_id}",
        )

    await db.commit()
    await db.refresh(msg)

    # Determine label
    if current_user.role.value == "admin":
        label = "admin"
    elif is_seller:
        label = "seller"
    elif is_buyer:
        label = "buyer"
    else:
        label = None

    return OrderMessageSchema(
        id=msg.id, order_id=msg.order_id, sender_id=msg.sender_id,
        content=msg.content, is_system=msg.is_system, created_at=msg.created_at,
        sender_username=current_user.username, sender_first_name=current_user.first_name,
        sender_role=current_user.role.value,
        sender_label=label,
        shop_name=current_user.shop_name if is_seller else None
    )


# ============= ORDER FEEDBACK / REPUTATION =============

@router.post("/{order_id}/feedback", response_model=OrderFeedbackSchema)
async def leave_order_feedback(
    order_id: int,
    data: OrderFeedbackCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Leave feedback (rep+ or rep-) for the other party after order completion"""
    # Get order
    result = await db.execute(
        select(Order)
        .options(selectinload(Order.items))
        .where(Order.id == order_id)
    )
    order = result.scalar_one_or_none()
    if not order:
        raise HTTPException(status_code=404, detail="Order not found")
    
    # Order must be completed or delivered
    if order.status not in [OrderStatus.COMPLETED, OrderStatus.DELIVERED]:
        raise HTTPException(status_code=400, detail="Can only leave feedback on completed orders")
    
    # Determine who the other party is
    is_buyer = order.buyer_id == current_user.id
    seller_ids = list(set(item.seller_id for item in order.items))
    is_seller = current_user.id in seller_ids
    
    if not is_buyer and not is_seller:
        raise HTTPException(status_code=403, detail="You are not part of this order")
    
    # Determine target user
    if is_buyer:
        # Buyer leaving feedback for seller (first seller if multiple)
        to_user_id = seller_ids[0] if seller_ids else None
    else:
        # Seller leaving feedback for buyer
        to_user_id = order.buyer_id
    
    if not to_user_id:
        raise HTTPException(status_code=400, detail="Cannot determine feedback recipient")
    
    # Check if feedback already exists from this user for this order
    existing = await db.execute(
        select(OrderFeedback).where(
            OrderFeedback.order_id == order_id,
            OrderFeedback.from_user_id == current_user.id
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You have already left feedback for this order")
    
    # Create feedback
    feedback = OrderFeedback(
        order_id=order_id,
        from_user_id=current_user.id,
        to_user_id=to_user_id,
        is_positive=data.is_positive,
        comment=data.comment
    )
    db.add(feedback)
    
    # Update target user's rep
    target_user = await db.get(User, to_user_id)
    if target_user:
        if data.is_positive:
            target_user.rep_positive = (target_user.rep_positive or 0) + 1
        else:
            target_user.rep_negative = (target_user.rep_negative or 0) + 1
    
    # Notify the target user
    await create_notification(
        db, user_id=to_user_id, type="feedback",
        title=f"{'Positive' if data.is_positive else 'Negative'} feedback received",
        body=f"You received rep{'+'if data.is_positive else '-'} from Order #{order_id}",
        link=f"/orders/{order_id}",
        telegram_id=target_user.telegram_id if target_user else None,
    )
    
    await db.commit()
    await db.refresh(feedback)
    
    return OrderFeedbackSchema(
        id=feedback.id,
        order_id=feedback.order_id,
        from_user_id=feedback.from_user_id,
        to_user_id=feedback.to_user_id,
        is_positive=feedback.is_positive,
        comment=feedback.comment,
        created_at=feedback.created_at,
        from_user=None
    )


@router.get("/{order_id}/feedback", response_model=List[OrderFeedbackSchema])
async def get_order_feedback(
    order_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all feedback for an order"""
    result = await db.execute(
        select(OrderFeedback)
        .options(selectinload(OrderFeedback.from_user))
        .where(OrderFeedback.order_id == order_id)
        .order_by(OrderFeedback.created_at.desc())
    )
    feedbacks = result.scalars().all()
    
    return [
        OrderFeedbackSchema(
            id=f.id,
            order_id=f.order_id,
            from_user_id=f.from_user_id,
            to_user_id=f.to_user_id,
            is_positive=f.is_positive,
            comment=f.comment,
            created_at=f.created_at,
            from_user={"id": f.from_user.id, "username": f.from_user.username, "shop_name": f.from_user.shop_name} if f.from_user else None
        )
        for f in feedbacks
    ]
