"""Middleman Service Router"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload
from typing import List
from datetime import datetime
import logging

from app.database import get_db
from app.models import User, UserRole, MiddlemanDeal, MiddlemanMessage, MiddlemanStatus, Notification
from app.telegram import create_notification
from app.schemas import (
    MiddlemanDealCreate, MiddlemanDealUpdate, MiddlemanDealSchema,
    MiddlemanMessageCreate, MiddlemanMessageSchema,
    DisputeOpenRequest, AdminResolutionRequest
)
from app.auth import get_current_active_user
from app.rate_limit import limiter

router = APIRouter()
audit_logger = logging.getLogger("audit")


# ============ Service Info ============

@router.get("/stats")
async def get_middleman_stats(db: AsyncSession = Depends(get_db)):
    """Get public middleman stats - no auth required"""
    from sqlalchemy import func
    
    completed_count = await db.scalar(
        select(func.count()).select_from(MiddlemanDeal).where(
            MiddlemanDeal.status == MiddlemanStatus.COMPLETED
        )
    ) or 0
    
    total_volume = await db.scalar(
        select(func.sum(MiddlemanDeal.amount)).where(
            MiddlemanDeal.status == MiddlemanStatus.COMPLETED
        )
    ) or 0
    
    return {
        "completed_deals": completed_count,
        "total_volume": total_volume
    }


# ============ Admin Endpoints ============

@router.get("/admin/deals")
async def admin_list_all_deals(
    status: str = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Admin: List all middleman deals"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")
    
    query = select(MiddlemanDeal).options(
        selectinload(MiddlemanDeal.buyer),
        selectinload(MiddlemanDeal.seller),
        selectinload(MiddlemanDeal.admin)
    )
    
    if status and status != 'all':
        try:
            status_enum = MiddlemanStatus(status)
            query = query.where(MiddlemanDeal.status == status_enum)
        except ValueError:
            pass
    
    query = query.order_by(MiddlemanDeal.created_at.desc())
    result = await db.execute(query)
    deals = result.scalars().all()
    
    # Convert to dict with extra info
    return [{
        "id": d.id,
        "title": d.title,
        "amount": d.amount,
        "status": d.status.value,
        "fee_percent": d.fee_percent,
        "fee_amount": d.fee_amount,
        "buyer": {"id": d.buyer.id, "username": d.buyer.username, "telegram_id": d.buyer.telegram_id} if d.buyer else None,
        "seller": {"id": d.seller.id, "username": d.seller.username, "telegram_id": d.seller.telegram_id} if d.seller else None,
        "buyer_username": d.buyer_username,
        "seller_username": d.seller_username,
        "admin": {"id": d.admin.id, "username": d.admin.username} if d.admin else None,
        "buyer_confirmed": d.buyer_confirmed,
        "seller_confirmed": d.seller_confirmed,
        "funds_locked": d.funds_locked,
        "funds_released": d.funds_released,
        "lock_in_days": d.lock_in_days,
        "admin_requested": d.admin_requested,
        "dispute_reason": d.dispute_reason,
        "terms": d.terms,
        "invite_code": d.invite_code,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        "completed_at": d.completed_at.isoformat() if d.completed_at else None,
    } for d in deals]


@router.post("/admin/deals/{deal_id}/join")
async def admin_join_deal(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Admin: Join a confirmed deal as mediator"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")
    
    result = await db.execute(
        select(MiddlemanDeal).where(MiddlemanDeal.id == deal_id)
    )
    deal = result.scalar_one_or_none()
    
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    deal.status = MiddlemanStatus.ADMIN_JOINED
    deal.admin_id = current_user.id
    
    sys_msg = MiddlemanMessage(
        deal_id=deal.id,
        sender_id=current_user.id,
        content=f"Admin @{current_user.username} has joined the deal as mediator.",
        is_system=True
    )
    db.add(sys_msg)
    
    # Notify both parties
    for party_id in [deal.buyer_id, deal.seller_id]:
        if party_id:
            await create_notification(
                db, user_id=party_id, type="middleman_admin_joined",
                title="Admin Joined",
                body=f"An admin has joined your middleman deal '{deal.title}'",
                link=f"/middleman/{deal.id}",
            )
    
    await db.commit()
    return {"message": "Joined deal as mediator"}


@router.get("/admin/stats")
async def admin_middleman_stats(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Admin: Get detailed middleman stats"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")
    
    from sqlalchemy import func
    
    # Count by status
    status_counts = {}
    for status in MiddlemanStatus:
        count = await db.scalar(
            select(func.count()).select_from(MiddlemanDeal).where(
                MiddlemanDeal.status == status
            )
        ) or 0
        status_counts[status.value] = count
    
    total_volume = await db.scalar(
        select(func.sum(MiddlemanDeal.amount)).where(
            MiddlemanDeal.status == MiddlemanStatus.COMPLETED
        )
    ) or 0
    
    # Pending admin requests (admin requested but no admin joined yet)
    pending_admin = await db.scalar(
        select(func.count()).select_from(MiddlemanDeal).where(
            MiddlemanDeal.admin_requested == True,
            MiddlemanDeal.admin_id.is_(None),
            MiddlemanDeal.status.notin_([MiddlemanStatus.COMPLETED, MiddlemanStatus.CANCELLED])
        )
    ) or 0
    
    return {
        "status_counts": status_counts,
        "total_volume": total_volume,
        "pending_admin_requests": pending_admin,
        "total_deals": sum(status_counts.values())
    }


@router.get("/info")
async def get_middleman_info():
    """Get middleman service information and template"""
    from app.database import get_fee_settings, async_session
    async with async_session() as db:
        fee_settings = await get_fee_settings(db)
    return {
        "title": "Middleman Service",
        "description": """Our Middleman Service provides a safe way to conduct peer-to-peer trades between users.

**How it works:**
1. **Initiate a Deal** - As buyer, enter seller's Telegram handle and propose terms (amount, lock-in period)
2. **Negotiate** - Both parties can discuss and modify terms until agreement
3. **Confirm & Lock Funds** - Once both confirm, buyer's funds are locked from marketplace balance
4. **Complete Trade** - When both mark complete, funds transfer to seller's escrow (with lock-in)
5. **Withdraw** - After lock-in period, seller can withdraw funds

**Dispute Resolution:**
If you have a conflict with the other party, you can open a dispute:
- Click "Open Dispute" and explain the issue
- An admin will review the case and both parties' messages
- Admin can: refund buyer, pay seller, or split funds between both

**Why use Middleman?**
- Automatic escrow from marketplace balance
- No admin required for standard trades
- Fair dispute resolution with partial splits
- Full chat history for transparency
- Configurable lock-in period (0-30 days)

**Fees:** {fee_settings['middleman_fee']}% of the transaction value{f" (minimum ${fee_settings['middleman_min_fee']:.2f})" if fee_settings['middleman_min_fee'] > 0 else ''}""",
        "fee_percent": fee_settings["middleman_fee"],
        "min_fee": fee_settings["middleman_min_fee"]
    }


# ============ Deal Management ============

@router.get("/deals", response_model=List[MiddlemanDealSchema])
async def list_my_deals(
    status: str = None,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """List current user's middleman deals"""
    query = select(MiddlemanDeal).options(
        selectinload(MiddlemanDeal.buyer),
        selectinload(MiddlemanDeal.seller),
        selectinload(MiddlemanDeal.admin)
    ).where(
        or_(
            MiddlemanDeal.buyer_id == current_user.id,
            MiddlemanDeal.seller_id == current_user.id
        )
    )
    
    if status:
        query = query.where(MiddlemanDeal.status == status)
    
    query = query.order_by(MiddlemanDeal.updated_at.desc())
    result = await db.execute(query)
    return result.scalars().all()


@router.post("/deals", response_model=MiddlemanDealSchema)
@limiter.limit("5/minute")
async def create_deal(
    request: Request,
    data: MiddlemanDealCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new middleman deal - creator can be BUYER or SELLER"""
    import secrets
    import string
    from app.database import get_fee_settings
    from fastapi.responses import JSONResponse
    
    fee_settings = await get_fee_settings(db)
    
    # Clean username (remove @ if present)
    target_username = data.counterparty_username.lstrip('@').lower()
    
    if target_username.lower() == (current_user.username or '').lower():
        raise HTTPException(status_code=400, detail="Cannot create a deal with yourself")
    
    # Generate unique invite code
    alphabet = string.ascii_uppercase + string.digits
    invite_code = ''.join(secrets.choice(alphabet) for _ in range(8))
    
    # Try to find the counterparty user (optional)
    result = await db.execute(
        select(User).where(User.username.ilike(target_username))
    )
    counterparty = result.scalar_one_or_none()
    
    # Assign buyer/seller based on creator's role.
    # IMPORTANT: do NOT pre-assign the counterparty's user_id yet.
    # The counterparty should explicitly join (via invite list, direct link, or code),
    # otherwise the invited user will see it as an "active deal" before joining.
    if data.creator_role == 'buyer':
        buyer_id = current_user.id
        seller_id = None
        buyer_username = current_user.username
        seller_username = target_username
        creator_role_label = "buyer"
        counterparty_role_label = "seller"
        notify_user_id = counterparty.id if counterparty else None
        notify_body = f"Buyer @{current_user.username} wants to purchase from you: {data.title} (${data.amount:.2f})"
    else:  # creator is seller
        buyer_id = None
        seller_id = current_user.id
        buyer_username = target_username
        seller_username = current_user.username
        creator_role_label = "seller"
        counterparty_role_label = "buyer"
        notify_user_id = counterparty.id if counterparty else None
        notify_body = f"Seller @{current_user.username} wants to sell to you: {data.title} (${data.amount:.2f})"
    
    deal = MiddlemanDeal(
        buyer_id=buyer_id,
        seller_id=seller_id,
        buyer_username=buyer_username,
        seller_username=seller_username,
        invite_code=invite_code,
        title=data.title,
        amount=data.amount,
        terms=data.terms,
        lock_in_days=data.lock_in_days,
        fee_percent=fee_settings["middleman_fee"],
        status=MiddlemanStatus.PENDING_INVITE
    )
    db.add(deal)
    await db.flush()
    
    # Add system message
    sys_msg = MiddlemanMessage(
        deal_id=deal.id,
        sender_id=current_user.id,
        content=f"Deal created by {creator_role_label} @{current_user.username}. Invite code: {invite_code}. Waiting for {counterparty_role_label} @{target_username} to join. Lock-in period: {data.lock_in_days} days.",
        is_system=True
    )
    db.add(sys_msg)
    
    # Notify counterparty if they exist
    if notify_user_id:
        await create_notification(
            db, user_id=notify_user_id, type="middleman_invite",
            title="Middleman Deal Invite",
            body=notify_body,
            link=f"/middleman/{deal.id}",
        )
    
    await db.commit()
    
    # Reload with relationships
    result = await db.execute(
        select(MiddlemanDeal).options(
            selectinload(MiddlemanDeal.buyer),
            selectinload(MiddlemanDeal.seller),
            selectinload(MiddlemanDeal.admin)
        ).where(MiddlemanDeal.id == deal.id)
    )
    return result.scalar_one()


@router.get("/deals/{deal_id}", response_model=MiddlemanDealSchema)
async def get_deal(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get a specific deal"""
    result = await db.execute(
        select(MiddlemanDeal).options(
            selectinload(MiddlemanDeal.buyer),
            selectinload(MiddlemanDeal.seller),
            selectinload(MiddlemanDeal.admin)
        ).where(MiddlemanDeal.id == deal_id)
    )
    deal = result.scalar_one_or_none()
    
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    # Check access - participants or admin
    is_participant = deal.buyer_id == current_user.id or deal.seller_id == current_user.id
    is_admin = current_user.role == UserRole.ADMIN
    
    # Allow viewing if user is invited by username (but don't auto-join on GET)
    if not is_participant and not is_admin:
        username_lower = (current_user.username or '').lower()
        invited_as_seller = deal.seller_id is None and deal.seller_username and username_lower == deal.seller_username.lower()
        invited_as_buyer = deal.buyer_id is None and deal.buyer_username and username_lower == deal.buyer_username.lower()
        if not invited_as_seller and not invited_as_buyer:
            raise HTTPException(status_code=403, detail="Access denied")
    
    return deal


@router.put("/deals/{deal_id}", response_model=MiddlemanDealSchema)
async def update_deal_terms(
    deal_id: int,
    data: MiddlemanDealUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update deal terms (resets confirmations)"""
    result = await db.execute(
        select(MiddlemanDeal).where(MiddlemanDeal.id == deal_id).with_for_update()
    )
    deal = result.scalar_one_or_none()
    
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.buyer_id != current_user.id and deal.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if deal.status in [MiddlemanStatus.COMPLETED, MiddlemanStatus.CANCELLED, MiddlemanStatus.FUNDS_LOCKED]:
        raise HTTPException(status_code=400, detail="Cannot modify deal after funds locked")
    
    # Block edit if this user already confirmed
    is_buyer = deal.buyer_id == current_user.id
    if is_buyer and deal.buyer_confirmed:
        raise HTTPException(status_code=400, detail="You already confirmed the terms. Cannot edit after confirming.")
    if not is_buyer and deal.seller_confirmed:
        raise HTTPException(status_code=400, detail="You already confirmed the terms. Cannot edit after confirming.")
    
    # Update fields
    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(deal, field, value)
    
    # Reset confirmations when terms change
    deal.buyer_confirmed = False
    deal.seller_confirmed = False
    deal.status = MiddlemanStatus.NEGOTIATING
    
    # System message
    sys_msg = MiddlemanMessage(
        deal_id=deal.id,
        sender_id=current_user.id,
        content=f"@{current_user.username} updated the deal terms. Please review and confirm.",
        is_system=True
    )
    db.add(sys_msg)
    
    await db.commit()
    
    result = await db.execute(
        select(MiddlemanDeal).options(
            selectinload(MiddlemanDeal.buyer),
            selectinload(MiddlemanDeal.seller),
            selectinload(MiddlemanDeal.admin)
        ).where(MiddlemanDeal.id == deal.id)
    )
    return result.scalar_one()


@router.post("/deals/{deal_id}/confirm")
@limiter.limit("10/minute")
async def confirm_deal(
    request: Request,
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Confirm deal terms - when both confirm, buyer's funds are locked"""
    result = await db.execute(
        select(MiddlemanDeal).where(MiddlemanDeal.id == deal_id).with_for_update()
    )
    deal = result.scalar_one_or_none()
    
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.buyer_id != current_user.id and deal.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if deal.status in [MiddlemanStatus.COMPLETED, MiddlemanStatus.CANCELLED, MiddlemanStatus.ADMIN_JOINED, MiddlemanStatus.FUNDS_LOCKED]:
        raise HTTPException(status_code=400, detail="Cannot confirm at this stage")
    
    if not deal.seller_id:
        raise HTTPException(status_code=400, detail="Seller has not joined yet")
    
    # Set confirmation
    is_buyer = deal.buyer_id == current_user.id

    # Buyer must have enough funds to confirm (do not allow confirming into a state
    # where locking will definitely fail). This message must never be shown to seller.
    if is_buyer:
        buyer_result = await db.execute(
            select(User).where(User.id == deal.buyer_id).with_for_update()
        )
        buyer = buyer_result.scalar_one()
        from app.database import get_fee_settings as _gfs
        _fs = await _gfs(db)
        _min = _fs.get("middleman_min_fee", 0.0)
        _calc_fee = deal.amount * deal.fee_percent / 100
        _pre_fee = round(max(_calc_fee, _min), 2)
        total_required = round(deal.amount + _pre_fee, 2)
        if (buyer.balance or 0) < total_required:
            raise HTTPException(
                status_code=400,
                detail="Insufficient balance to confirm terms. Please deposit funds before confirming."
            )

        deal.buyer_confirmed = True
    else:
        deal.seller_confirmed = True
    
    # Check if both confirmed
    if deal.buyer_confirmed and deal.seller_confirmed:
        # LOCK BUYER'S FUNDS
        from app.database import get_fee_settings
        fee_settings = await get_fee_settings(db)
        min_fee = fee_settings.get("middleman_min_fee", 0.0)
        
        # Calculate fee with minimum enforcement
        calculated_fee = deal.amount * deal.fee_percent / 100
        actual_fee = round(max(calculated_fee, min_fee), 2)
        
        # Load buyer to check balance
        buyer_result = await db.execute(
            select(User).where(User.id == deal.buyer_id).with_for_update()
        )
        buyer = buyer_result.scalar_one()
        
        total_required = deal.amount + actual_fee
        if (buyer.balance or 0) < total_required:
            # If the seller is the one who confirmed last, never leak buyer balance issues.
            # Instead, reset buyer confirmation and wait for buyer to confirm again later.
            if not is_buyer:
                deal.buyer_confirmed = False
                deal.status = MiddlemanStatus.PENDING_CONFIRMATION

                sys_msg = MiddlemanMessage(
                    deal_id=deal.id,
                    sender_id=current_user.id,
                    content=f"@{current_user.username} has confirmed the terms. Waiting for buyer to confirm.",
                    is_system=True
                )
                db.add(sys_msg)

                await create_notification(
                    db, user_id=deal.buyer_id, type="middleman_confirm_needed",
                    title="Confirmation Needed",
                    body=f"Seller @{current_user.username} confirmed the deal terms. Please review and confirm.",
                    link=f"/middleman/{deal.id}",
                )

                await db.commit()
                return {"message": "Confirmed", "both_confirmed": False, "funds_locked": False}

            # Buyer confirmed last but balance changed (race/spend). Return buyer-only message.
            raise HTTPException(
                status_code=400,
                detail="Insufficient balance to confirm terms. Please deposit funds before confirming."
            )
        
        # Deduct from buyer's balance
        buyer.balance = round((buyer.balance or 0) - (total_required), 2)
        deal.funds_locked = True
        deal.fee_amount = actual_fee
        deal.status = MiddlemanStatus.FUNDS_LOCKED
        
        sys_msg = MiddlemanMessage(
            deal_id=deal.id,
            sender_id=current_user.id,
            content=f"Both parties confirmed! ${total_required:.2f} has been locked from buyer's balance (amount: ${deal.amount:.2f} + fee: ${deal.fee_amount:.2f}). Deal is now IN PROGRESS. Lock-in period after completion: {deal.lock_in_days} days.",
            is_system=True
        )
        db.add(sys_msg)
        
        # Notify both parties
        other_party_id = deal.seller_id if is_buyer else deal.buyer_id
        await create_notification(
            db, user_id=other_party_id, type="middleman_funds_locked",
            title="Funds Locked - Deal Active",
            body=f"Funds locked for deal: {deal.title}. Complete your obligations, then mark complete.",
            link=f"/middleman/{deal.id}",
        )
    else:
        deal.status = MiddlemanStatus.PENDING_CONFIRMATION
        
        sys_msg = MiddlemanMessage(
            deal_id=deal.id,
            sender_id=current_user.id,
            content=f"@{current_user.username} has confirmed the terms. Waiting for other party to confirm.",
            is_system=True
        )
        db.add(sys_msg)
        
        # Notify other party
        other_party_id = deal.seller_id if is_buyer else deal.buyer_id
        await create_notification(
            db, user_id=other_party_id, type="middleman_confirm_needed",
            title="Confirmation Needed",
            body=f"@{current_user.username} confirmed the deal terms. Please review and confirm.",
            link=f"/middleman/{deal.id}",
        )
    
    await db.commit()
    return {"message": "Confirmed", "both_confirmed": deal.buyer_confirmed and deal.seller_confirmed, "funds_locked": deal.funds_locked}


@router.post("/deals/{deal_id}/request-admin")
async def request_admin(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Request admin to join the deal for disputes or assistance"""
    result = await db.execute(
        select(MiddlemanDeal).where(MiddlemanDeal.id == deal_id)
    )
    deal = result.scalar_one_or_none()
    
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.buyer_id != current_user.id and deal.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if deal.status in [MiddlemanStatus.COMPLETED, MiddlemanStatus.CANCELLED, MiddlemanStatus.PENDING_INVITE]:
        raise HTTPException(status_code=400, detail="Cannot request admin at this stage")
    
    if deal.admin_requested:
        raise HTTPException(status_code=400, detail="Admin already requested")
    
    deal.admin_requested = True
    
    is_buyer = deal.buyer_id == current_user.id
    role_label = "Buyer" if is_buyer else "Seller"
    
    sys_msg = MiddlemanMessage(
        deal_id=deal.id,
        sender_id=current_user.id,
        content=f"{role_label} @{current_user.username} requested admin assistance. An admin will join shortly.",
        is_system=True
    )
    db.add(sys_msg)
    
    # Notify other party
    other_party_id = deal.seller_id if is_buyer else deal.buyer_id
    if other_party_id:
        await create_notification(
            db, user_id=other_party_id, type="middleman_admin_request",
            title="Admin Requested",
            body=f"@{current_user.username} requested admin assistance for deal: {deal.title}",
            link=f"/middleman/{deal.id}",
        )
    
    # Notify all admins
    admins_result = await db.execute(
        select(User).where(User.role == UserRole.ADMIN, User.is_active == True)
    )
    for admin in admins_result.scalars().all():
        await create_notification(
            db, user_id=admin.id, type="middleman_admin_request",
            title="Middleman Admin Request",
            body=f"Deal #{deal.id}: {deal.title} - Amount: ${deal.amount:.2f}",
            link=f"/middleman/{deal.id}", telegram_id=admin.telegram_id,
        )
    
    await db.commit()
    return {"message": "Admin requested"}


@router.post("/deals/{deal_id}/dispute")
async def open_dispute(
    deal_id: int,
    data: DisputeOpenRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Open a dispute on a deal. Use this when you have a conflict with the other party.
    
    What happens when you open a dispute:
    - The deal status changes to DISPUTED
    - Admin is automatically notified and will review
    - Both parties can continue chatting to provide evidence
    - Only admin can resolve the dispute (refund buyer, pay seller, or split funds)
    
    When to use:
    - Seller didn't deliver what was promised
    - Buyer claims they didn't receive the goods/service
    - Terms were not followed by either party
    - Any disagreement about the deal completion
    """
    result = await db.execute(
        select(MiddlemanDeal).where(MiddlemanDeal.id == deal_id)
    )
    deal = result.scalar_one_or_none()
    
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.buyer_id != current_user.id and deal.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if deal.status in [MiddlemanStatus.COMPLETED, MiddlemanStatus.CANCELLED]:
        raise HTTPException(status_code=400, detail="Cannot dispute a closed deal")
    
    if deal.status == MiddlemanStatus.DISPUTED:
        raise HTTPException(status_code=400, detail="Dispute already opened")
    
    if not deal.funds_locked:
        raise HTTPException(status_code=400, detail="Cannot dispute before funds are locked. Use cancel instead.")
    
    # Update deal
    deal.status = MiddlemanStatus.DISPUTED
    deal.dispute_reason = data.reason
    deal.dispute_by_id = current_user.id
    deal.admin_requested = True
    
    is_buyer = deal.buyer_id == current_user.id
    role_label = "Buyer" if is_buyer else "Seller"
    
    sys_msg = MiddlemanMessage(
        deal_id=deal.id,
        sender_id=current_user.id,
        content=f"⚠️ DISPUTE OPENED by {role_label} @{current_user.username}\n\nReason: {data.reason}\n\nAn admin will review this dispute and make a decision. Both parties can continue chatting to provide evidence or documentation.",
        is_system=True
    )
    db.add(sys_msg)
    
    # Notify other party
    other_party_id = deal.seller_id if is_buyer else deal.buyer_id
    if other_party_id:
        await create_notification(
            db, user_id=other_party_id, type="middleman_disputed",
            title="Dispute Opened",
            body=f"@{current_user.username} opened a dispute on deal: {deal.title}. Admin will review.",
            link=f"/middleman/{deal.id}",
        )
    
    # Notify all admins
    admins_result = await db.execute(
        select(User).where(User.role == UserRole.ADMIN, User.is_active == True)
    )
    for admin in admins_result.scalars().all():
        await create_notification(
            db, user_id=admin.id, type="middleman_dispute",
            title="🚨 Middleman Dispute",
            body=f"Deal #{deal.id}: {deal.title} - ${deal.amount:.2f} - {role_label} @{current_user.username} disputes",
            link=f"/middleman/{deal.id}", telegram_id=admin.telegram_id,
        )
    
    audit_logger.info(
        f"MIDDLEMAN_DISPUTE: Deal #{deal.id} disputed by {role_label} @{current_user.username} (ID:{current_user.id}). "
        f"Amount: ${deal.amount:.2f}. Reason: {data.reason[:100]}"
    )
    
    await db.commit()
    return {"message": "Dispute opened. Admin will review and make a decision."}


@router.post("/deals/{deal_id}/mark-complete")
async def mark_complete(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark deal as complete. When both mark complete, funds transfer to seller's escrow_balance with lock-in."""
    from datetime import timedelta
    
    result = await db.execute(
        select(MiddlemanDeal).options(
            selectinload(MiddlemanDeal.buyer),
            selectinload(MiddlemanDeal.seller)
        ).where(MiddlemanDeal.id == deal_id)
    )
    deal = result.scalar_one_or_none()
    
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.buyer_id != current_user.id and deal.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if deal.status not in [MiddlemanStatus.FUNDS_LOCKED, MiddlemanStatus.ADMIN_JOINED]:
        raise HTTPException(status_code=400, detail="Cannot complete at this stage. Funds must be locked first.")
    
    if not deal.funds_locked:
        raise HTTPException(status_code=400, detail="Funds are not locked. Both parties must confirm first.")
    
    # Lock deal row first to prevent concurrent completion race
    deal_result = await db.execute(
        select(MiddlemanDeal).where(MiddlemanDeal.id == deal_id).with_for_update()
    )
    deal = deal_result.scalar_one()
    
    # Re-check status and completion after lock
    if deal.status not in [MiddlemanStatus.FUNDS_LOCKED, MiddlemanStatus.ADMIN_JOINED]:
        raise HTTPException(status_code=400, detail="Deal status changed")
    
    is_buyer = deal.buyer_id == current_user.id
    
    # Mark complete for current user
    if is_buyer:
        if deal.buyer_completed:
            raise HTTPException(status_code=400, detail="You already marked this deal as complete")
        deal.buyer_completed = True
    else:
        if deal.seller_completed:
            raise HTTPException(status_code=400, detail="You already marked this deal as complete")
        deal.seller_completed = True
    
    # Check if both completed
    if deal.buyer_completed and deal.seller_completed:
        # TRANSFER FUNDS TO SELLER'S ESCROW_BALANCE
        seller_result = await db.execute(
            select(User).where(User.id == deal.seller_id).with_for_update()
        )
        seller = seller_result.scalar_one()
        
        buyer_result = await db.execute(
            select(User).where(User.id == deal.buyer_id)
        )
        buyer = buyer_result.scalar_one()
        
        # Fee already paid by buyer on top of amount, so seller gets full amount
        fee = deal.fee_amount or (deal.amount * deal.fee_percent / 100)
        amount_to_seller = deal.amount
        
        # Calculate release date based on lock-in days
        deal.completed_at = datetime.utcnow()
        deal.funds_release_at = deal.completed_at + timedelta(days=deal.lock_in_days or 0)
        deal.status = MiddlemanStatus.COMPLETED
        
        # If lock-in is 0 days, put directly in balance; otherwise escrow_balance
        if not deal.lock_in_days or deal.lock_in_days <= 0:
            seller.balance = round((seller.balance or 0) + (amount_to_seller), 2)
            deal.funds_released = True
        else:
            seller.escrow_balance = round((seller.escrow_balance or 0) + (amount_to_seller), 2)
        
        lock_info = ""
        if deal.lock_in_days and deal.lock_in_days > 0:
            lock_info = f" Funds will be available for withdrawal after {deal.lock_in_days} days ({deal.funds_release_at.strftime('%Y-%m-%d %H:%M UTC')})."
        
        sys_msg = MiddlemanMessage(
            deal_id=deal.id,
            sender_id=current_user.id,
            content=f"Deal completed! ${amount_to_seller:.2f} transferred to seller @{seller.username}'s escrow balance. (Fee: ${fee:.2f} paid by buyer){lock_info}",
            is_system=True
        )
        db.add(sys_msg)
        
        # Notify both parties
        await create_notification(
            db, user_id=deal.buyer_id, type="middleman_completed",
            title="Deal Completed",
            body=f"Deal '{deal.title}' completed. ${amount_to_seller:.2f} released to seller. Fee: ${fee:.2f}.",
            link=f"/middleman/{deal.id}", telegram_id=buyer.telegram_id,
        )
        await create_notification(
            db, user_id=deal.seller_id, type="middleman_completed",
            title="Deal Completed - Funds Received",
            body=f"Deal '{deal.title}' completed. ${amount_to_seller:.2f} added to your escrow balance.{' Lock-in period: ' + str(deal.lock_in_days) + ' days.' if deal.lock_in_days else ''}",
            link=f"/middleman/{deal.id}", telegram_id=seller.telegram_id,
        )
        
        # Audit log
        audit_logger.info(
            f"MIDDLEMAN_COMPLETE: Deal #{deal.id} completed. "
            f"${deal.amount:.2f} from buyer @{buyer.username} (ID:{buyer.id}) "
            f"to seller @{seller.username} (ID:{seller.id}). Fee: ${fee:.2f}. "
            f"Lock-in: {deal.lock_in_days} days. Release: {deal.funds_release_at}"
        )
        
        await db.commit()
        return {
            "message": "Deal completed! Funds transferred to seller's escrow balance.",
            "both_completed": True,
            "amount": deal.amount,
            "fee": fee,
            "transferred": amount_to_seller,
            "lock_in_days": deal.lock_in_days,
            "funds_release_at": deal.funds_release_at.isoformat() if deal.funds_release_at else None
        }
    else:
        # Waiting for other party
        role_label = "Buyer" if is_buyer else "Seller"
        sys_msg = MiddlemanMessage(
            deal_id=deal.id,
            sender_id=current_user.id,
            content=f"{role_label} @{current_user.username} marked the deal as complete. Waiting for other party.",
            is_system=True
        )
        db.add(sys_msg)
        
        # Notify other party
        other_party_id = deal.seller_id if is_buyer else deal.buyer_id
        await create_notification(
            db, user_id=other_party_id, type="middleman_complete_needed",
            title="Mark Deal Complete",
            body=f"@{current_user.username} marked the deal as complete. Please confirm when ready.",
            link=f"/middleman/{deal.id}",
        )
        
        await db.commit()
        return {"message": "Marked as complete. Waiting for other party.", "both_completed": False}


@router.post("/deals/{deal_id}/cancel")
async def cancel_deal(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Cancel a deal - refunds buyer if funds were locked"""
    result = await db.execute(
        select(MiddlemanDeal).where(MiddlemanDeal.id == deal_id)
    )
    deal = result.scalar_one_or_none()
    
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    is_participant = deal.buyer_id == current_user.id or deal.seller_id == current_user.id
    is_admin = current_user.role == UserRole.ADMIN
    
    if not is_participant and not is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if deal.status == MiddlemanStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Cannot cancel completed deal")
    
    # Block cancellation by participants when funds are locked (only admin can cancel/refund)
    if deal.funds_locked and not is_admin:
        raise HTTPException(
            status_code=400, 
            detail="Cannot cancel after funds are locked. Request admin assistance or mark as complete."
        )
    
    # Block cancellation when admin is involved (only admin can cancel)
    if (deal.admin_requested or deal.admin_id) and not is_admin:
        raise HTTPException(
            status_code=400, 
            detail="Cannot cancel - admin oversight is active. Contact admin to resolve the deal."
        )
    
    refund_amount = 0
    refund_message = ""
    
    # If funds were locked, refund to buyer's marketplace balance
    if deal.funds_locked:
        total_locked = deal.amount + (deal.fee_amount or 0)
        
        buyer_result = await db.execute(
            select(User).where(User.id == deal.buyer_id).with_for_update()
        )
        buyer = buyer_result.scalar_one()
        buyer.balance = round((buyer.balance or 0) + (total_locked), 2)
        deal.funds_locked = False
        refund_amount = total_locked
        refund_message = f" ${total_locked:.2f} refunded to buyer @{buyer.username}'s marketplace balance."
        
        audit_logger.info(
            f"MIDDLEMAN_REFUND: Deal #{deal.id} cancelled. "
            f"${total_locked:.2f} refunded to buyer @{buyer.username} (ID:{buyer.id})"
        )
    
    deal.status = MiddlemanStatus.CANCELLED
    
    is_buyer = deal.buyer_id == current_user.id
    role_label = "Buyer" if is_buyer else ("Seller" if deal.seller_id == current_user.id else "Admin")
    
    sys_msg = MiddlemanMessage(
        deal_id=deal.id,
        sender_id=current_user.id,
        content=f"Deal cancelled by {role_label} @{current_user.username}.{refund_message}",
        is_system=True
    )
    db.add(sys_msg)
    
    # Notify other party (even if they haven't joined yet)
    other_party_id = None
    other_party_username = None

    if is_admin:
        # Notify both participants if present
        targets = []
        if deal.buyer_id and deal.buyer_id != current_user.id:
            targets.append(deal.buyer_id)
        if deal.seller_id and deal.seller_id != current_user.id:
            targets.append(deal.seller_id)
        for target_id in targets:
            await create_notification(
                db, user_id=target_id, type="middleman_cancelled",
                title="Deal Cancelled",
                body=f"Middleman deal '{deal.title}' has been cancelled by @{current_user.username}",
                link=f"/middleman/{deal.id}",
            )
    else:
        if is_buyer:
            other_party_id = deal.seller_id
            other_party_username = deal.seller_username
        elif deal.seller_id == current_user.id:
            other_party_id = deal.buyer_id
            other_party_username = deal.buyer_username

        # If the other party hasn't joined (id is None), try to resolve by stored username
        if other_party_id is None and other_party_username:
            other_user_res = await db.execute(
                select(User).where(User.username.ilike(other_party_username))
            )
            other_user = other_user_res.scalar_one_or_none()
            if other_user:
                other_party_id = other_user.id

        if other_party_id:
            await create_notification(
                db, user_id=other_party_id, type="middleman_cancelled",
                title="Deal Cancelled",
                body=f"Middleman deal '{deal.title}' has been cancelled by @{current_user.username}",
                link=f"/middleman/{deal.id}",
            )
    
    await db.commit()
    return {"message": "Deal cancelled", "refund_amount": refund_amount}


# ============ Messages ============

@router.get("/deals/{deal_id}/messages", response_model=List[MiddlemanMessageSchema])
async def get_deal_messages(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get messages for a deal"""
    # Check access
    result = await db.execute(
        select(MiddlemanDeal).where(MiddlemanDeal.id == deal_id)
    )
    deal = result.scalar_one_or_none()
    
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    is_participant = deal.buyer_id == current_user.id or deal.seller_id == current_user.id
    is_admin = current_user.role == UserRole.ADMIN
    
    if not is_participant and not is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    result = await db.execute(
        select(MiddlemanMessage).options(
            selectinload(MiddlemanMessage.sender)
        ).where(
            MiddlemanMessage.deal_id == deal_id
        ).order_by(MiddlemanMessage.created_at.asc())
    )
    return result.scalars().all()


@router.post("/deals/{deal_id}/messages", response_model=MiddlemanMessageSchema)
@limiter.limit("30/minute")
async def send_message(
    request: Request,
    deal_id: int,
    data: MiddlemanMessageCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Send a message in a deal"""
    # Check access
    result = await db.execute(
        select(MiddlemanDeal).where(MiddlemanDeal.id == deal_id)
    )
    deal = result.scalar_one_or_none()
    
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    is_participant = deal.buyer_id == current_user.id or deal.seller_id == current_user.id
    is_admin = current_user.role == UserRole.ADMIN
    
    if not is_participant and not is_admin:
        raise HTTPException(status_code=403, detail="Access denied")
    
    if deal.status in [MiddlemanStatus.COMPLETED, MiddlemanStatus.CANCELLED]:
        raise HTTPException(status_code=400, detail="Cannot send messages to closed deal")
    
    msg = MiddlemanMessage(
        deal_id=deal_id,
        sender_id=current_user.id,
        content=data.content,
        is_proposal=data.is_proposal,
        proposed_terms=data.proposed_terms,
        proposed_amount=data.proposed_amount
    )
    db.add(msg)
    
    # If proposal, reset confirmations (only if funds not locked)
    if data.is_proposal:
        if deal.funds_locked:
            raise HTTPException(status_code=400, detail="Cannot propose new terms after funds are locked")
        
        deal.buyer_confirmed = False
        deal.seller_confirmed = False
        if deal.status not in [MiddlemanStatus.PENDING_INVITE]:
            deal.status = MiddlemanStatus.NEGOTIATING
        
        if data.proposed_amount is not None:
            deal.amount = data.proposed_amount
        if data.proposed_terms:
            deal.terms = data.proposed_terms
    
    await db.commit()
    
    result = await db.execute(
        select(MiddlemanMessage).options(
            selectinload(MiddlemanMessage.sender)
        ).where(MiddlemanMessage.id == msg.id)
    )
    return result.scalar_one()


# ============ Admin Actions ============

@router.post("/deals/{deal_id}/complete")
async def admin_complete_deal(
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Admin: Force complete a deal - transfers locked funds to seller"""
    from datetime import timedelta
    
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")
    
    result = await db.execute(
        select(MiddlemanDeal).options(
            selectinload(MiddlemanDeal.buyer),
            selectinload(MiddlemanDeal.seller)
        ).where(MiddlemanDeal.id == deal_id).with_for_update()
    )
    deal = result.scalar_one_or_none()
    
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.status == MiddlemanStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Deal already completed")
    
    buyer = deal.buyer
    
    # Re-fetch seller with row lock to prevent balance race condition
    seller = None
    if deal.seller_id:
        seller_result = await db.execute(
            select(User).where(User.id == deal.seller_id).with_for_update()
        )
        seller = seller_result.scalar_one_or_none()
    
    # Transfer funds if locked
    transferred = False
    fee = deal.fee_amount or 0.0
    amount_to_seller = 0.0
    
    if deal.funds_locked and seller:
        fee = deal.fee_amount or (deal.amount * deal.fee_percent / 100)
        deal.fee_amount = fee
        amount_to_seller = deal.amount
        
        # If lock-in is 0 days, put directly in balance; otherwise escrow_balance
        if not deal.lock_in_days or deal.lock_in_days <= 0:
            seller.balance = round((seller.balance or 0) + (amount_to_seller), 2)
        else:
            seller.escrow_balance = round((seller.escrow_balance or 0) + (amount_to_seller), 2)
        transferred = True
    
    deal.status = MiddlemanStatus.COMPLETED
    deal.admin_id = current_user.id
    deal.completed_at = datetime.utcnow()
    deal.funds_release_at = deal.completed_at + timedelta(days=deal.lock_in_days or 0)
    deal.funds_released = (not deal.lock_in_days or deal.lock_in_days <= 0)
    deal.buyer_completed = True
    deal.seller_completed = True
    
    if transferred:
        msg_content = f"Deal force-completed by admin @{current_user.username}. ${amount_to_seller:.2f} transferred to seller @{seller.username}'s escrow balance. (Fee: ${fee:.2f})"
    else:
        msg_content = f"Deal completed by admin @{current_user.username}. No funds transferred (funds were not locked)."
    
    sys_msg = MiddlemanMessage(
        deal_id=deal.id,
        sender_id=current_user.id,
        content=msg_content,
        is_system=True
    )
    db.add(sys_msg)
    
    # Notify both parties
    for party_id in [deal.buyer_id, deal.seller_id]:
        if party_id:
            await create_notification(
                db, user_id=party_id, type="middleman_completed",
                title="Deal Completed by Admin",
                body=f"Middleman deal '{deal.title}' has been completed by admin",
                link=f"/middleman/{deal.id}",
            )
    
    await db.commit()
    return {"message": "Deal completed", "transferred": transferred, "fee": fee, "amount_to_seller": amount_to_seller}


@router.put("/admin/deals/{deal_id}/fee")
async def update_deal_fee(
    deal_id: int,
    fee_percent: float,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Admin: Update fee percentage for a specific deal"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")
    
    if fee_percent < 0 or fee_percent > 50:
        raise HTTPException(status_code=400, detail="Fee must be between 0% and 50%")
    
    result = await db.execute(
        select(MiddlemanDeal).where(MiddlemanDeal.id == deal_id)
    )
    deal = result.scalar_one_or_none()
    
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.status == MiddlemanStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Cannot modify completed deal")
    
    if deal.funds_locked:
        raise HTTPException(status_code=400, detail="Cannot modify fee after funds are locked")
    
    old_fee = deal.fee_percent
    deal.fee_percent = fee_percent
    deal.fee_amount = deal.amount * (fee_percent / 100)
    
    sys_msg = MiddlemanMessage(
        deal_id=deal.id,
        sender_id=current_user.id,
        content=f"Admin updated escrow fee from {old_fee}% to {fee_percent}% (${deal.fee_amount:.2f})",
        is_system=True
    )
    db.add(sys_msg)
    
    await db.commit()
    return {"message": "Fee updated", "fee_percent": fee_percent, "fee_amount": deal.fee_amount}


@router.post("/admin/deals/{deal_id}/resolve")
async def admin_resolve_dispute(
    deal_id: int,
    data: AdminResolutionRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """
    Admin: Resolve a disputed deal.
    
    Decisions:
    - refund_buyer: Full refund to buyer's marketplace balance
    - pay_seller: Full payment to seller's escrow balance (minus fee)
    - partial_split: Split funds by percentage (buyer_percent goes to buyer, rest to seller)
    """
    from datetime import timedelta
    
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin only")
    
    result = await db.execute(
        select(MiddlemanDeal).options(
            selectinload(MiddlemanDeal.buyer),
            selectinload(MiddlemanDeal.seller)
        ).where(MiddlemanDeal.id == deal_id)
    )
    deal = result.scalar_one_or_none()
    
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    if deal.status == MiddlemanStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Deal already completed")
    
    if deal.status == MiddlemanStatus.CANCELLED:
        raise HTTPException(status_code=400, detail="Deal already cancelled")
    
    if not deal.funds_locked:
        raise HTTPException(status_code=400, detail="No funds to distribute - funds not locked")
    
    # Get buyer and seller with lock
    buyer_result = await db.execute(
        select(User).where(User.id == deal.buyer_id).with_for_update()
    )
    buyer = buyer_result.scalar_one()
    
    seller_result = await db.execute(
        select(User).where(User.id == deal.seller_id).with_for_update()
    )
    seller = seller_result.scalar_one()
    
    # Calculate total locked amount
    total_locked = deal.amount + (deal.fee_amount or (deal.amount * deal.fee_percent / 100))
    fee = deal.fee_amount or (deal.amount * deal.fee_percent / 100)
    
    resolution_msg = ""
    buyer_receives = 0.0
    seller_receives = 0.0
    
    if data.decision == "refund_buyer":
        # Full refund to buyer (including fee)
        buyer.balance = round((buyer.balance or 0) + (total_locked), 2)
        buyer_receives = total_locked
        resolution_msg = f"✅ DISPUTE RESOLVED: Full refund to buyer.\n\nBuyer @{buyer.username} receives ${total_locked:.2f} (full amount + fee refunded)"
        
    elif data.decision == "pay_seller":
        # Full payment to seller — fee was already paid by buyer on top
        amount_to_seller = deal.amount
        # If lock-in is 0 days, put directly in balance; otherwise escrow_balance
        if not deal.lock_in_days or deal.lock_in_days <= 0:
            seller.balance = round((seller.balance or 0) + (amount_to_seller), 2)
        else:
            seller.escrow_balance = round((seller.escrow_balance or 0) + (amount_to_seller), 2)
        seller_receives = amount_to_seller
        resolution_msg = f"✅ DISPUTE RESOLVED: Full payment to seller.\n\nSeller @{seller.username} receives ${amount_to_seller:.2f} (Fee: ${fee:.2f} kept by platform)"
        
    elif data.decision == "partial_split":
        # Split funds between parties
        if data.buyer_percent is None:
            raise HTTPException(status_code=400, detail="buyer_percent required for partial_split")
        
        buyer_percent = data.buyer_percent
        seller_percent = 100 - buyer_percent
        
        # Buyer gets percentage of total (including fee portion)
        buyer_receives = round(total_locked * (buyer_percent / 100), 2)
        buyer.balance = round((buyer.balance or 0) + (buyer_receives), 2)
        
        # Seller gets percentage of remaining (after buyer portion)
        # Fee comes from seller's portion only
        seller_portion = round(total_locked - buyer_receives, 2)
        # Proportional fee based on what seller gets
        proportional_fee = round(fee * (seller_percent / 100), 2) if seller_percent > 0 else 0
        seller_receives = round(seller_portion - proportional_fee, 2)
        
        if seller_receives > 0:
            if not deal.lock_in_days or deal.lock_in_days <= 0:
                seller.balance = round((seller.balance or 0) + (seller_receives), 2)
            else:
                seller.escrow_balance = round((seller.escrow_balance or 0) + (seller_receives), 2)
        
        resolution_msg = (
            f"✅ DISPUTE RESOLVED: Partial split ({buyer_percent:.0f}% / {seller_percent:.0f}%)\n\n"
            f"Buyer @{buyer.username} receives ${buyer_receives:.2f}\n"
            f"Seller @{seller.username} receives ${seller_receives:.2f}"
        )
        if proportional_fee > 0:
            resolution_msg += f" (Fee: ${proportional_fee:.2f})"
    
    # Add admin note if provided
    if data.admin_note:
        resolution_msg += f"\n\nAdmin note: {data.admin_note}"
    
    # Update deal status
    deal.status = MiddlemanStatus.COMPLETED
    deal.admin_id = current_user.id
    deal.completed_at = datetime.utcnow()
    deal.funds_release_at = deal.completed_at + timedelta(days=deal.lock_in_days or 0)
    deal.funds_locked = False  # Funds distributed
    deal.funds_released = (not deal.lock_in_days or deal.lock_in_days <= 0)
    deal.buyer_completed = True
    deal.seller_completed = True
    
    sys_msg = MiddlemanMessage(
        deal_id=deal.id,
        sender_id=current_user.id,
        content=resolution_msg,
        is_system=True
    )
    db.add(sys_msg)
    
    # Notify both parties
    for party_id, party_name, amount in [(deal.buyer_id, "buyer", buyer_receives), (deal.seller_id, "seller", seller_receives)]:
        if party_id:
            await create_notification(
                db, user_id=party_id, type="middleman_resolved",
                title="Dispute Resolved",
                body=f"Deal '{deal.title}' resolved by admin. You receive ${amount:.2f}",
                link=f"/middleman/{deal.id}",
            )
    
    audit_logger.info(
        f"MIDDLEMAN_RESOLVE: Deal #{deal.id} resolved by admin @{current_user.username}. "
        f"Decision: {data.decision}. Buyer @{buyer.username}: ${buyer_receives:.2f}, "
        f"Seller @{seller.username}: ${seller_receives:.2f}. Note: {data.admin_note or 'N/A'}"
    )
    
    await db.commit()
    return {
        "message": "Dispute resolved",
        "decision": data.decision,
        "buyer_receives": buyer_receives,
        "seller_receives": seller_receives
    }


# ============ Pending Invites ============

@router.get("/invites", response_model=List[MiddlemanDealSchema])
async def get_pending_invites(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get deals where current user is invited (as seller or buyer) but hasn't joined"""
    if not current_user.username:
        return []
    
    # Check for invites where user is invited as seller
    seller_invites = await db.execute(
        select(MiddlemanDeal).options(
            selectinload(MiddlemanDeal.buyer),
            selectinload(MiddlemanDeal.seller),
            selectinload(MiddlemanDeal.admin)
        ).where(
            MiddlemanDeal.seller_username.ilike(current_user.username),
            MiddlemanDeal.seller_id.is_(None),
            MiddlemanDeal.status == MiddlemanStatus.PENDING_INVITE
        ).order_by(MiddlemanDeal.created_at.desc())
    )
    
    # Check for invites where user is invited as buyer
    buyer_invites = await db.execute(
        select(MiddlemanDeal).options(
            selectinload(MiddlemanDeal.buyer),
            selectinload(MiddlemanDeal.seller),
            selectinload(MiddlemanDeal.admin)
        ).where(
            MiddlemanDeal.buyer_username.ilike(current_user.username),
            MiddlemanDeal.buyer_id.is_(None),
            MiddlemanDeal.status == MiddlemanStatus.PENDING_INVITE
        ).order_by(MiddlemanDeal.created_at.desc())
    )
    
    # Combine + sort results
    all_invites = list(seller_invites.scalars().all()) + list(buyer_invites.scalars().all())
    all_invites.sort(key=lambda d: d.created_at or datetime.min, reverse=True)
    return all_invites


# ============ Accept Invite (by deal ID, not code) ============

@router.post("/deals/{deal_id}/accept", response_model=MiddlemanDealSchema)
@limiter.limit("10/minute")
async def accept_deal_invite(
    request: Request,
    deal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Accept a deal invite when invited by username - sets user ID and transitions status"""
    result = await db.execute(
        select(MiddlemanDeal).options(
            selectinload(MiddlemanDeal.buyer),
            selectinload(MiddlemanDeal.seller),
            selectinload(MiddlemanDeal.admin)
        ).where(MiddlemanDeal.id == deal_id).with_for_update()
    )
    deal = result.scalar_one_or_none()
    
    if not deal:
        raise HTTPException(status_code=404, detail="Deal not found")
    
    # Check if user is already part of this deal
    if deal.buyer_id == current_user.id or deal.seller_id == current_user.id:
        return deal  # Already in the deal
    
    if deal.status != MiddlemanStatus.PENDING_INVITE:
        raise HTTPException(status_code=400, detail="This deal is no longer accepting invites")
    
    # Check if user is invited by username
    is_invited_as_seller = (
        deal.seller_id is None and 
        deal.seller_username and 
        deal.seller_username.lower() == current_user.username.lower()
    )
    is_invited_as_buyer = (
        deal.buyer_id is None and 
        deal.buyer_username and 
        deal.buyer_username.lower() == current_user.username.lower()
    )
    
    if not is_invited_as_seller and not is_invited_as_buyer:
        raise HTTPException(status_code=403, detail="You are not invited to this deal")
    
    # Assign user to deal
    if is_invited_as_seller:
        deal.seller_id = current_user.id
        role_joined = "Seller"
        notify_user_id = deal.buyer_id
        notify_title = "Seller Joined Deal"
        notify_body = f"Seller @{current_user.username} has joined your middleman deal: {deal.title}"
    else:
        deal.buyer_id = current_user.id
        role_joined = "Buyer"
        notify_user_id = deal.seller_id
        notify_title = "Buyer Joined Deal"
        notify_body = f"Buyer @{current_user.username} has joined your middleman deal: {deal.title}"
    
    deal.status = MiddlemanStatus.NEGOTIATING
    
    # System message
    sys_msg = MiddlemanMessage(
        deal_id=deal.id,
        sender_id=current_user.id,
        content=f"{role_joined} @{current_user.username} accepted the invite. You can now negotiate terms.",
        is_system=True
    )
    db.add(sys_msg)
    
    # Notify the other party
    if notify_user_id:
        await create_notification(
            db, user_id=notify_user_id, type="middleman_joined",
            title=notify_title,
            body=notify_body,
            link=f"/middleman/{deal.id}",
        )
    
    await db.commit()
    
    # Reload with relationships
    result = await db.execute(
        select(MiddlemanDeal).options(
            selectinload(MiddlemanDeal.buyer),
            selectinload(MiddlemanDeal.seller),
            selectinload(MiddlemanDeal.admin)
        ).where(MiddlemanDeal.id == deal.id)
    )
    return result.scalar_one()


# ============ Join by Invite Code ============

@router.post("/join/{invite_code}", response_model=MiddlemanDealSchema)
async def join_deal_by_code(
    invite_code: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Join a deal using invite code (as buyer or seller depending on who's missing)"""
    
    # ----- Regular Invite Code Logic -----
    result = await db.execute(
        select(MiddlemanDeal).options(
            selectinload(MiddlemanDeal.buyer),
            selectinload(MiddlemanDeal.seller),
            selectinload(MiddlemanDeal.admin)
        ).where(MiddlemanDeal.invite_code == invite_code.upper())
    )
    deal = result.scalar_one_or_none()
    
    if not deal:
        raise HTTPException(status_code=404, detail="Invalid invite code")
    
    # Check if user is already part of this deal
    if deal.buyer_id == current_user.id or deal.seller_id == current_user.id:
        return deal  # Already in the deal
    
    if deal.status != MiddlemanStatus.PENDING_INVITE:
        raise HTTPException(status_code=400, detail="This deal is no longer accepting invites")
    
    # Determine which role to assign
    if deal.seller_id is None and deal.buyer_id is not None:
        # Buyer created the deal, user joins as seller
        deal.seller_id = current_user.id
        deal.seller_username = current_user.username
        role_joined = "seller"
        notify_user_id = deal.buyer_id
        notify_title = "Seller Joined Deal"
        notify_body = f"Seller @{current_user.username} has joined your middleman deal: {deal.title}"
    elif deal.buyer_id is None and deal.seller_id is not None:
        # Seller created the deal, user joins as buyer
        deal.buyer_id = current_user.id
        deal.buyer_username = current_user.username
        role_joined = "buyer"
        notify_user_id = deal.seller_id
        notify_title = "Buyer Joined Deal"
        notify_body = f"Buyer @{current_user.username} has joined your middleman deal: {deal.title}"
    else:
        raise HTTPException(status_code=400, detail="This deal already has both parties")
    
    deal.status = MiddlemanStatus.NEGOTIATING
    
    # System message
    sys_msg = MiddlemanMessage(
        deal_id=deal.id,
        sender_id=current_user.id,
        content=f"{role_joined.capitalize()} @{current_user.username} joined the deal using invite code. You can now negotiate terms.",
        is_system=True
    )
    db.add(sys_msg)
    
    # Notify the other party
    await create_notification(
        db, user_id=notify_user_id, type="middleman_joined",
        title=notify_title,
        body=notify_body,
        link=f"/middleman/{deal.id}",
    )
    
    await db.commit()
    # Reload with relationships
    result = await db.execute(
        select(MiddlemanDeal).options(
            selectinload(MiddlemanDeal.buyer),
            selectinload(MiddlemanDeal.seller),
            selectinload(MiddlemanDeal.admin)
        ).where(MiddlemanDeal.id == deal.id)
    )
    return result.scalar_one()
