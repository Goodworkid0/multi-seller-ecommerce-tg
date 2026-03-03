"""Payments Router (NowPayments)"""
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
import os
import json
import hmac
import hashlib
import httpx
from datetime import datetime

from app.database import get_db
from app.auth import get_current_active_user
from app.models import User, CryptoDeposit, Notification, Referral, AppSettings, WithdrawalRequest, WithdrawalStatus
from app.telegram import create_notification
from app.schemas import CreateCryptoDeposit, CryptoDepositResponse, CryptoDepositStatus, CryptoDepositItem

router = APIRouter()

NOWPAYMENTS_API_KEY = os.getenv("NOWPAYMENTS_API_KEY", "")
NOWPAYMENTS_IPN_SECRET = os.getenv("NOWPAYMENTS_IPN_SECRET", "")
NOWPAYMENTS_BASE_URL = os.getenv("NOWPAYMENTS_BASE_URL", "https://api.nowpayments.io/v1")
NOWPAYMENTS_IPN_URL = os.getenv("NOWPAYMENTS_IPN_URL", "")

# Supported cryptocurrencies grouped by category
ALLOWED_COINS = {
    # Stablecoins
    "usdttrc20", "usdterc20", "usdtbep20", "usdtsol", "usdc", "usdcbep20", "usdcsol", "dai", "busd",
    # Popular
    "btc", "eth", "bnbbsc", "xrp", "sol", "ada", "doge", "dot", "matic", "avax", "trx", "ltc",
    # Meme coins
    "shib", "pepe", "floki", "bonk",
    # DeFi / Layer 2
    "link", "uni", "aave", "mkr", "crv", "arb", "op",
    # Privacy
    "xmr", "zec", "dash",
    # Other popular
    "atom", "xlm", "algo", "near", "ftm", "hbar", "vet", "egld", "xtz", "eos", "icp", "fil", "sand", "mana", "apt", "ton"
}


def _verify_signature(raw_body: bytes, signature: str) -> bool:
    if not NOWPAYMENTS_IPN_SECRET or not signature:
        return False
    expected = hmac.new(
        NOWPAYMENTS_IPN_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha512
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


@router.post("/nowpayments/create", response_model=CryptoDepositResponse)
async def create_nowpayments_deposit(
    payload: CreateCryptoDeposit,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    if not NOWPAYMENTS_API_KEY:
        raise HTTPException(status_code=500, detail="NOWPAYMENTS_API_KEY not set")
    if not NOWPAYMENTS_IPN_URL:
        raise HTTPException(status_code=500, detail="NOWPAYMENTS_IPN_URL not set")

    pay_currency = payload.pay_currency.strip().lower()
    if pay_currency not in ALLOWED_COINS:
        raise HTTPException(status_code=400, detail="Unsupported currency")

    if payload.amount < 10:
        raise HTTPException(status_code=400, detail="Minimum deposit is $10")

    # Limit pending deposits per user (max 3 active)
    pending_result = await db.execute(
        select(func.count(CryptoDeposit.id)).where(
            CryptoDeposit.user_id == current_user.id,
            CryptoDeposit.payment_status.in_(["created", "waiting", "confirming"]),
            CryptoDeposit.is_credited == False
        )
    )
    pending_count = pending_result.scalar() or 0
    if pending_count >= 3:
        raise HTTPException(status_code=429, detail="You have too many pending deposits. Wait for existing deposits to complete or expire.")

    deposit = CryptoDeposit(
        user_id=current_user.id,
        price_amount=payload.amount,
        price_currency="usd",
        price_amount_usd=payload.amount,
        payment_status="created"
    )
    db.add(deposit)
    await db.commit()
    await db.refresh(deposit)

    order_id = f"dep_{deposit.id}"

    req_payload = {
        "price_amount": payload.amount,
        "price_currency": "usd",
        "pay_currency": pay_currency,
        "ipn_callback_url": NOWPAYMENTS_IPN_URL,
        "order_id": order_id,
        "order_description": "Wallet deposit"
    }
    headers = {
        "x-api-key": NOWPAYMENTS_API_KEY,
        "Content-Type": "application/json"
    }

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(f"{NOWPAYMENTS_BASE_URL}/payment", json=req_payload, headers=headers)

    if resp.status_code not in (200, 201):
        deposit.payment_status = "error"
        await db.commit()
        error_detail = "NowPayments create failed"
        try:
            err_data = resp.json()
            error_detail = err_data.get("message") or err_data.get("description") or str(err_data)
            import logging
            logging.getLogger(__name__).error(f"NowPayments error ({resp.status_code}): {err_data}")
        except Exception:
            pass
        raise HTTPException(status_code=502, detail=error_detail)

    data = resp.json()
    deposit.order_id = order_id
    deposit.payment_id = data.get("payment_id")
    deposit.pay_address = data.get("pay_address")
    deposit.pay_amount = data.get("pay_amount")
    deposit.pay_currency = data.get("pay_currency")
    deposit.payment_status = data.get("payment_status") or deposit.payment_status

    await db.commit()
    await db.refresh(deposit)

    return CryptoDepositResponse(
        deposit_id=deposit.id,
        payment_id=deposit.payment_id,
        pay_address=deposit.pay_address,
        pay_amount=deposit.pay_amount,
        pay_currency=deposit.pay_currency,
        payment_status=deposit.payment_status,
        price_amount_usd=deposit.price_amount_usd
    )


@router.post("/nowpayments/webhook")
async def nowpayments_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    raw = await request.body()
    signature = request.headers.get("x-nowpayments-sig", "")
    if not _verify_signature(raw, signature):
        raise HTTPException(status_code=401, detail="Invalid signature")

    try:
        payload = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid payload")

    payment_id = str(payload.get("payment_id") or "")
    order_id = payload.get("order_id")

    query = None
    if payment_id:
        query = select(CryptoDeposit).where(CryptoDeposit.payment_id == payment_id).with_for_update()
    elif order_id:
        query = select(CryptoDeposit).where(CryptoDeposit.order_id == order_id).with_for_update()
    else:
        raise HTTPException(status_code=400, detail="Missing payment identifiers")

    result = await db.execute(query)
    deposit = result.scalar_one_or_none()
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")

    deposit.payment_status = payload.get("payment_status") or deposit.payment_status
    deposit.pay_address = payload.get("pay_address") or deposit.pay_address
    deposit.pay_amount = payload.get("pay_amount") or deposit.pay_amount
    deposit.pay_currency = payload.get("pay_currency") or deposit.pay_currency
    deposit.tx_hash = payload.get("payin_hash") or deposit.tx_hash
    deposit.confirmations = payload.get("confirmations") or deposit.confirmations

    if deposit.payment_status in {"confirmed", "finished"} and not deposit.is_credited:
        # Lock user row to prevent race conditions on balance update
        result = await db.execute(
            select(User).where(User.id == deposit.user_id).with_for_update()
        )
        user = result.scalar_one_or_none()
        if user:
            base_amount = float(deposit.price_amount_usd or 0.0)
            bonus_amount = 0.0
            
            # Check for first deposit referral bonus
            # First, check if this is the user's first credited deposit
            result = await db.execute(
                select(func.count(CryptoDeposit.id)).where(
                    CryptoDeposit.user_id == user.id,
                    CryptoDeposit.is_credited == True,
                    CryptoDeposit.id != deposit.id
                )
            )
            credited_count = result.scalar() or 0
            
            if credited_count == 0:
                # This is first deposit - check if user was referred
                # Lock referral row to prevent double bonus
                result = await db.execute(
                    select(Referral).where(Referral.referred_id == user.id).with_for_update()
                )
                referral = result.scalar_one_or_none()
                
                if referral:
                    # Get bonus percentage from settings
                    result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
                    settings = result.scalar_one_or_none()
                    bonus_percent = settings.referral_first_deposit_bonus_percent if settings else 10.0
                    
                    if bonus_percent and bonus_percent > 0:
                        bonus_amount = round(base_amount * (bonus_percent / 100), 2)
                        referral.referred_reward = (referral.referred_reward or 0) + bonus_amount
                        referral.trigger_type = "first_deposit"
                        referral.is_rewarded = True
                        referral.rewarded_at = datetime.utcnow()
                        
                        # Notify user about bonus
                        await create_notification(
                            db, user_id=user.id, type="referral_bonus",
                            title="First Deposit Bonus!",
                            body=f"You received +${bonus_amount:.2f} ({bonus_percent}%) bonus on your first deposit!",
                            link="/referrals", telegram_id=user.telegram_id,
                        )
            
            total_credit = base_amount + bonus_amount
            user.balance = round((user.balance or 0) + (total_credit), 2)
            deposit.is_credited = True
            deposit.completed_at = datetime.utcnow()
            
            await create_notification(
                db, user_id=user.id, type="deposit_credited",
                title=f"Deposit of ${base_amount:.2f} credited" + (f" (+${bonus_amount:.2f} bonus)" if bonus_amount > 0 else ""),
                body=f"Your {deposit.pay_currency.upper() if deposit.pay_currency else 'crypto'} deposit has been confirmed.",
                link="/deposit", telegram_id=user.telegram_id,
            )

    await db.commit()
    return {"status": "ok"}


@router.get("/nowpayments/deposits/{deposit_id}", response_model=CryptoDepositStatus)
async def get_nowpayments_deposit_status(
    deposit_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(CryptoDeposit).where(
            CryptoDeposit.id == deposit_id,
            CryptoDeposit.user_id == current_user.id
        )
    )
    deposit = result.scalar_one_or_none()
    if not deposit:
        raise HTTPException(status_code=404, detail="Deposit not found")

    return CryptoDepositStatus(
        deposit_id=deposit.id,
        payment_status=deposit.payment_status,
        confirmations=deposit.confirmations or 0,
        pay_address=deposit.pay_address,
        pay_amount=deposit.pay_amount,
        pay_currency=deposit.pay_currency,
        price_amount_usd=deposit.price_amount_usd or 0.0,
        is_credited=deposit.is_credited,
        tx_hash=deposit.tx_hash
    )


@router.get("/nowpayments/deposits", response_model=list[CryptoDepositItem])
async def list_nowpayments_deposits(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    result = await db.execute(
        select(CryptoDeposit)
        .where(CryptoDeposit.user_id == current_user.id)
        .order_by(CryptoDeposit.created_at.desc())
    )
    deposits = result.scalars().all()
    return [
        CryptoDepositItem(
            deposit_id=dep.id,
            payment_status=dep.payment_status,
            confirmations=dep.confirmations or 0,
            pay_amount=dep.pay_amount,
            pay_currency=dep.pay_currency,
            price_amount_usd=dep.price_amount_usd or 0.0,
            is_credited=dep.is_credited,
            tx_hash=dep.tx_hash,
            created_at=dep.created_at
        )
        for dep in deposits
    ]


# ============ Payout Webhook ============

@router.post("/nowpayments/payout-webhook")
async def nowpayments_payout_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    """Handle NowPayments payout IPN callbacks — updates withdrawal status and tx hash."""
    import logging
    audit_logger = logging.getLogger("audit")
    
    raw = await request.body()
    signature = request.headers.get("x-nowpayments-sig", "")
    
    # Verify signature
    if not _verify_signature(raw, signature):
        raise HTTPException(status_code=401, detail="Invalid signature")
    
    try:
        payload = json.loads(raw.decode("utf-8"))
    except json.JSONDecodeError:
        raise HTTPException(status_code=400, detail="Invalid payload")
    
    audit_logger.info(f"PAYOUT_WEBHOOK: {payload}")
    
    # NowPayments payout webhook payload structure:
    # { "id": "payout_id", "status": "FINISHED"|"FAILED"|..., "hash": "tx_hash", 
    #   "address": "0x...", "amount": 100.0, "currency": "usdterc20", "extra_id": "withdrawal_id" }
    
    payout_id = str(payload.get("id", ""))
    extra_id = payload.get("extra_id", "")  # our withdrawal_id
    payout_status = payload.get("status", "")
    tx_hash = payload.get("hash")
    
    # Find the withdrawal by payout_id or extra_id
    wr = None
    if payout_id:
        result = await db.execute(
            select(WithdrawalRequest).where(WithdrawalRequest.payout_id == payout_id).with_for_update()
        )
        wr = result.scalar_one_or_none()
    
    if not wr and extra_id:
        try:
            wid = int(extra_id)
            result = await db.execute(
                select(WithdrawalRequest).where(WithdrawalRequest.id == wid).with_for_update()
            )
            wr = result.scalar_one_or_none()
        except (ValueError, TypeError):
            pass
    
    if not wr:
        # Not found — log but don't error (NP may retry)
        audit_logger.warning(f"PAYOUT_WEBHOOK: No withdrawal found for payout_id={payout_id} extra_id={extra_id}")
        return {"status": "ok"}
    
    # Update payout tracking
    wr.payout_status = payout_status
    if tx_hash:
        wr.payout_hash = tx_hash
    if not wr.payout_id and payout_id:
        wr.payout_id = payout_id
    
    # Map NowPayments payout status to our withdrawal status
    status_upper = payout_status.upper() if payout_status else ""
    
    if status_upper in ("FINISHED", "CONFIRMED"):
        wr.status = WithdrawalStatus.APPROVED
        wr.processed_at = wr.processed_at or datetime.utcnow()
        
        await create_notification(
            db, user_id=wr.user_id, type="withdrawal_completed",
            title=f"Withdrawal of ${wr.amount:.2f} sent",
            body=f"USDT sent to {wr.destination[:10]}...{wr.destination[-6:]}. TX: {tx_hash[:16]}..." if tx_hash else "USDT sent to your wallet.",
            link="/deposit",
        )
        
        audit_logger.info(
            f"PAYOUT_COMPLETE: Withdrawal #{wr.id} ${wr.amount:.2f} -> {wr.destination} "
            f"tx_hash={tx_hash} payout_id={payout_id}"
        )
    
    elif status_upper in ("FAILED", "EXPIRED", "REFUNDED", "REJECTED"):
        wr.status = WithdrawalStatus.FAILED
        wr.payout_error = f"Payout {status_upper}"
        
        # Refund user balance on failed/rejected payout
        user_result = await db.execute(select(User).where(User.id == wr.user_id).with_for_update())
        user = user_result.scalar_one_or_none()
        if user:
            user.balance = round((user.balance or 0) + wr.amount, 2)  # refund full amount (including fee)
            audit_logger.info(
                f"PAYOUT_REFUND: ${wr.amount:.2f} refunded to user #{wr.user_id} due to {status_upper}"
            )
        
        await create_notification(
            db, user_id=wr.user_id, type="withdrawal_failed",
            title=f"Withdrawal ${wr.amount:.2f} {status_upper.lower()}",
            body=f"Payout was {status_upper.lower()}. ${wr.amount:.2f} has been refunded to your balance.",
            link="/deposit",
        )
        
        audit_logger.warning(
            f"PAYOUT_FAILED: Withdrawal #{wr.id} ${wr.amount:.2f} status={payout_status}"
        )
    
    await db.commit()
    return {"status": "ok"}
