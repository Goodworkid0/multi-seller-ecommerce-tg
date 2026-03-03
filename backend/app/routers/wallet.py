"""Wallet Router - Universal balance management and P2P escrow withdrawals"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
import logging

from app.database import get_db
from app.models import User, UserRole, WithdrawalRequest, WithdrawalStatus, Notification, MiddlemanDeal, MiddlemanStatus, OrderItem, Order, OrderStatus, AppSettings
from app.auth import get_current_active_user, reject_impersonation

from slowapi import Limiter
from slowapi.util import get_remote_address

router = APIRouter()
audit_logger = logging.getLogger("audit")
limiter = Limiter(key_func=get_remote_address)

MINIMUM_WITHDRAWAL_AMOUNT = 10.0


async def _get_withdrawal_fee(db) -> float:
    """Get withdrawal fee percent from AppSettings."""
    from sqlalchemy import select as sel
    result = await db.execute(sel(AppSettings).where(AppSettings.id == 1))
    settings = result.scalar_one_or_none()
    return (settings.withdrawal_fee_percent if settings and settings.withdrawal_fee_percent else 0.0)


class WalletWithdraw(BaseModel):
    amount: float = Field(gt=0, le=100000)
    address: str = Field(min_length=10, max_length=200)  # USDT TRC-20 wallet address
    pin: str = Field(min_length=4, max_length=6, pattern=r'^\d{4,6}$')


@router.get("")
async def get_wallet_overview(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get wallet overview with balances and locked funds info"""
    from sqlalchemy import func, or_
    
    # Funds locked as buyer in active escrow deals
    locked_as_buyer = await db.scalar(
        select(func.sum(MiddlemanDeal.amount)).where(
            MiddlemanDeal.buyer_id == current_user.id,
            MiddlemanDeal.funds_locked == True,
            MiddlemanDeal.status.in_([
                MiddlemanStatus.FUNDS_LOCKED,
                MiddlemanStatus.ADMIN_JOINED
            ])
        )
    ) or 0.0
    
    # Count active deals (as buyer or seller)
    active_deals = await db.scalar(
        select(func.count()).select_from(MiddlemanDeal).where(
            or_(
                MiddlemanDeal.buyer_id == current_user.id,
                MiddlemanDeal.seller_id == current_user.id
            ),
            MiddlemanDeal.status.in_([
                MiddlemanStatus.NEGOTIATING,
                MiddlemanStatus.PENDING_CONFIRMATION,
                MiddlemanStatus.FUNDS_LOCKED,
                MiddlemanStatus.ADMIN_JOINED
            ])
        )
    ) or 0
    
    # Funds in lock-in period (escrow_balance with pending release)
    pending_release = await db.scalar(
        select(func.sum(MiddlemanDeal.amount)).where(
            MiddlemanDeal.seller_id == current_user.id,
            MiddlemanDeal.status == MiddlemanStatus.COMPLETED,
            MiddlemanDeal.funds_released == False,
            MiddlemanDeal.funds_release_at > datetime.utcnow()
        )
    ) or 0.0
    
    # Funds ready to withdraw (past lock-in)
    available_escrow = current_user.escrow_balance or 0.0
    
    # Get pending withdrawals
    pending_withdrawals = await db.scalar(
        select(func.count()).select_from(WithdrawalRequest).where(
            WithdrawalRequest.user_id == current_user.id,
            WithdrawalRequest.status.in_([WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING])
        )
    ) or 0
    pending_withdrawal_amount = await db.scalar(
        select(func.sum(WithdrawalRequest.amount)).where(
            WithdrawalRequest.user_id == current_user.id,
            WithdrawalRequest.status.in_([WithdrawalStatus.PENDING, WithdrawalStatus.PROCESSING])
        )
    ) or 0.0
    
    # Determine if user can withdraw:
    # - Sellers / Admins always
    # - Anyone with balance > 0 (they earned/received funds somehow)
    # - Users who completed middleman deals as seller
    # - Users who had completed marketplace orders as seller
    can_withdraw = current_user.role in (UserRole.SELLER, UserRole.ADMIN)
    if not can_withdraw and (current_user.balance or 0) > 0:
        can_withdraw = True
    if not can_withdraw:
        # Check if user ever received funds as seller in a completed middleman deal
        has_deal_income = await db.scalar(
            select(func.count()).select_from(MiddlemanDeal).where(
                MiddlemanDeal.seller_id == current_user.id,
                MiddlemanDeal.status == MiddlemanStatus.COMPLETED
            )
        ) or 0
        if has_deal_income > 0:
            can_withdraw = True
    if not can_withdraw:
        # Check if user ever had a completed order as seller (via OrderItem)
        has_order_income = await db.scalar(
            select(func.count()).select_from(OrderItem).join(
                Order, OrderItem.order_id == Order.id
            ).where(
                OrderItem.seller_id == current_user.id,
                Order.status == OrderStatus.COMPLETED
            )
        ) or 0
        if has_order_income > 0:
            can_withdraw = True
    
    return {
        "marketplace_balance": current_user.balance or 0.0,
        "escrow_balance": available_escrow,
        "locked_in_deals": locked_as_buyer,
        "pending_release": pending_release,
        "total_available": (current_user.balance or 0.0) + available_escrow,
        "active_escrow_deals": active_deals,
        "pending_withdrawals": pending_withdrawals,
        "pending_withdrawal_amount": pending_withdrawal_amount,
        "can_withdraw": can_withdraw,
        "withdrawal_fee_percent": await _get_withdrawal_fee(db)
    }


@router.post("/withdraw")
@limiter.limit("5/minute")
async def request_escrow_withdrawal(
    request: Request,
    payload: WalletWithdraw,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Request withdrawal from balance (available to all users)"""
    reject_impersonation(current_user)
    # PIN is mandatory for withdrawals — uses shared lockout logic
    from app.auth import verify_user_pin
    await verify_user_pin(current_user, payload.pin, db)
    
    if payload.amount < MINIMUM_WITHDRAWAL_AMOUNT:
        raise HTTPException(status_code=400, detail=f"Minimum withdrawal is ${MINIMUM_WITHDRAWAL_AMOUNT:.2f}")
    
    # Validate USDT TRC-20 address format (starts with T, 34 characters)
    address = payload.address.strip()
    if not address.startswith("T") or len(address) != 34:
        raise HTTPException(status_code=400, detail="Invalid TRC-20 address. Must start with T and be 34 characters.")
    
    # Check for existing pending withdrawal
    existing = await db.execute(
        select(WithdrawalRequest).where(
            WithdrawalRequest.user_id == current_user.id,
            WithdrawalRequest.status == WithdrawalStatus.PENDING
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You already have a pending withdrawal request")
    
    # Lock user row
    user_result = await db.execute(
        select(User).where(User.id == current_user.id).with_for_update()
    )
    user = user_result.scalar_one()
    
    if (user.balance or 0) < payload.amount:
        raise HTTPException(status_code=400, detail="Insufficient balance")
    
    # Get withdrawal fee from settings
    settings_result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = settings_result.scalar_one_or_none()
    fee_percent = (settings.withdrawal_fee_percent if settings and settings.withdrawal_fee_percent else 0.0)
    fee_amount = round(payload.amount * fee_percent / 100, 2) if fee_percent > 0 else 0.0
    net_amount = round(payload.amount - fee_amount, 2)
    
    if net_amount <= 0:
        raise HTTPException(status_code=400, detail="Amount too small after fee deduction")
    
    # Deduct full amount from balance (fee + net)
    user.balance = round((user.balance or 0) - (payload.amount), 2)
    
    # Create withdrawal request
    withdrawal = WithdrawalRequest(
        user_id=current_user.id,
        amount=payload.amount,
        fee_amount=fee_amount,
        net_amount=net_amount,
        destination=address,
        payout_currency="usdttrc20"
    )
    db.add(withdrawal)
    
    audit_logger.info(
        f"WALLET_WITHDRAW: User {user.id} requested ${payload.amount:.2f} withdrawal. "
        f"Remaining balance: ${user.balance:.2f}"
    )
    
    await db.commit()
    await db.refresh(withdrawal)
    
    return {
        "message": "Withdrawal request submitted",
        "withdrawal_id": withdrawal.id,
        "amount": withdrawal.amount,
        "fee_amount": withdrawal.fee_amount,
        "net_amount": withdrawal.net_amount,
        "escrow_balance": user.escrow_balance
    }


@router.get("/withdrawals")
async def list_wallet_withdrawals(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """List user's withdrawal requests"""
    result = await db.execute(
        select(WithdrawalRequest)
        .where(WithdrawalRequest.user_id == current_user.id)
        .order_by(WithdrawalRequest.created_at.desc())
        .limit(50)
    )
    withdrawals = result.scalars().all()
    
    return [{
        "id": w.id,
        "amount": w.amount,
        "fee_amount": w.fee_amount or 0,
        "net_amount": w.net_amount or w.amount,
        "destination": w.destination,
        "status": w.status.value,
        "payout_id": w.payout_id,
        "payout_status": w.payout_status,
        "payout_hash": w.payout_hash,
        "payout_currency": w.payout_currency,
        "payout_error": w.payout_error,
        "created_at": w.created_at.isoformat() if w.created_at else None,
        "processed_at": w.processed_at.isoformat() if w.processed_at else None
    } for w in withdrawals]


@router.delete("/withdrawals/{withdrawal_id}")
async def cancel_withdrawal(
    withdrawal_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Cancel a pending withdrawal request (refunds to escrow balance)"""
    reject_impersonation(current_user)
    result = await db.execute(
        select(WithdrawalRequest).where(
            WithdrawalRequest.id == withdrawal_id,
            WithdrawalRequest.user_id == current_user.id
        )
    )
    withdrawal = result.scalar_one_or_none()
    
    if not withdrawal:
        raise HTTPException(status_code=404, detail="Withdrawal not found")
    
    if withdrawal.status != WithdrawalStatus.PENDING:
        raise HTTPException(status_code=400, detail="Can only cancel pending withdrawals")
    
    # Lock user row
    user_result = await db.execute(
        select(User).where(User.id == current_user.id).with_for_update()
    )
    user = user_result.scalar_one()
    
    # Refund to balance (not escrow - escrow is hold-only)
    user.balance = round((user.balance or 0) + (withdrawal.amount), 2)
    
    # Mark as rejected/cancelled
    withdrawal.status = WithdrawalStatus.REJECTED
    withdrawal.processed_at = datetime.utcnow()
    withdrawal.admin_note = "Cancelled by user"
    
    audit_logger.info(
        f"WITHDRAW_CANCEL: User {user.id} cancelled ${withdrawal.amount:.2f} withdrawal. "
        f"Refunded to balance. New balance: ${user.balance:.2f}"
    )
    
    await db.commit()
    
    return {
        "message": "Withdrawal cancelled and refunded to balance",
        "balance": user.balance
    }
