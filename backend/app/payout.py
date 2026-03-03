"""
NowPayments Payout Service

Flow:
1. Authenticate with NP email/password → JWT token (cached)
2. Create payout → sends USDT (TRC-20) to user's wallet address
3. IPN webhook receives status updates → update withdrawal record

Docs: https://documenter.getpostman.com/view/7907941/S1a32n38 (Payouts API section)

Required env vars:
  NOWPAYMENTS_API_KEY          - API key for NowPayments
  NOWPAYMENTS_PAYOUT_EMAIL     - NowPayments account email (for payout auth)
  NOWPAYMENTS_PAYOUT_PASSWORD  - NowPayments account password (for payout auth)
  NOWPAYMENTS_PAYOUT_IPN_URL   - Webhook URL for payout status updates
"""

import os
import logging
import httpx
from datetime import datetime, timedelta
from typing import Optional

logger = logging.getLogger("payout")
audit_logger = logging.getLogger("audit")

NOWPAYMENTS_API_KEY = os.getenv("NOWPAYMENTS_API_KEY", "")
NOWPAYMENTS_BASE_URL = os.getenv("NOWPAYMENTS_BASE_URL", "https://api.nowpayments.io/v1")
NOWPAYMENTS_PAYOUT_EMAIL = os.getenv("NOWPAYMENTS_PAYOUT_EMAIL", "")
NOWPAYMENTS_PAYOUT_PASSWORD = os.getenv("NOWPAYMENTS_PAYOUT_PASSWORD", "")
NOWPAYMENTS_PAYOUT_IPN_URL = os.getenv("NOWPAYMENTS_PAYOUT_IPN_URL", "")

# Cached JWT token
_jwt_token: Optional[str] = None
_jwt_expires: Optional[datetime] = None

# Default payout currency - USDT on Tron (TRC-20, cheap fees ~$1)
PAYOUT_CURRENCY = "usdttrc20"


async def _get_payout_token() -> str:
    """Authenticate with NowPayments and get/cache JWT token for payouts."""
    global _jwt_token, _jwt_expires
    
    # Return cached token if still valid (with 30sec buffer)
    if _jwt_token and _jwt_expires and datetime.utcnow() < _jwt_expires - timedelta(seconds=30):
        return _jwt_token
    
    if not NOWPAYMENTS_PAYOUT_EMAIL or not NOWPAYMENTS_PAYOUT_PASSWORD:
        raise RuntimeError("NOWPAYMENTS_PAYOUT_EMAIL and NOWPAYMENTS_PAYOUT_PASSWORD must be set")
    
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            f"{NOWPAYMENTS_BASE_URL}/auth",
            json={
                "email": NOWPAYMENTS_PAYOUT_EMAIL,
                "password": NOWPAYMENTS_PAYOUT_PASSWORD
            }
        )
    
    if resp.status_code != 200:
        logger.error(f"Payout auth failed: {resp.status_code} {resp.text}")
        raise RuntimeError(f"NowPayments payout auth failed: {resp.status_code}")
    
    data = resp.json()
    _jwt_token = data.get("token")
    if not _jwt_token:
        raise RuntimeError("NowPayments auth returned no token")
    
    # NowPayments token expires in 5 minutes — refresh after 4 min to be safe
    _jwt_expires = datetime.utcnow() + timedelta(minutes=4)
    
    logger.info("NowPayments payout JWT token refreshed")
    return _jwt_token


async def create_payout(
    address: str,
    amount: float,
    withdrawal_id: int,
    currency: str = PAYOUT_CURRENCY,
    ipn_callback_url: str = None
) -> dict:
    """
    Create a payout via NowPayments API.
    
    Args:
        address: Recipient's USDT TRC-20 wallet address
        amount: Amount in USD to send as USDT
        withdrawal_id: Internal withdrawal ID for tracking
        currency: NowPayments currency code (default: usdterc20)
        ipn_callback_url: Webhook URL for status updates
    
    Returns:
        dict with payout response from NowPayments:
        {
            "id": "payout_id",
            "status": "WAITING" | "PROCESSING" | "FINISHED" | "FAILED" | ...,
            "amount": float,
            "currency": "usdttrc20",
            "address": "T...",
            "hash": "tx_hash" (may be null initially),
            ...
        }
    
    Raises:
        RuntimeError: If auth fails or API is misconfigured
        httpx.HTTPError: If API call fails
    """
    token = await _get_payout_token()
    
    callback_url = ipn_callback_url or NOWPAYMENTS_PAYOUT_IPN_URL
    
    # Normalize Ethereum address to lowercase (standard format)
    # This helps match whitelisted addresses which may be stored lowercase
    normalized_address = address.lower() if address.startswith("0x") else address
    
    payload = {
        "withdrawals": [
            {
                "address": normalized_address,
                "currency": currency,
                "amount": amount,
                "ipn_callback_url": callback_url,
                "extra_id": str(withdrawal_id),  # our internal ID for matching
            }
        ]
    }
    
    headers = {
        "x-api-key": NOWPAYMENTS_API_KEY,
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }
    
    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            f"{NOWPAYMENTS_BASE_URL}/payout",
            json=payload,
            headers=headers
        )
    
    if resp.status_code not in (200, 201):
        error_text = resp.text[:500]
        logger.error(f"Payout creation failed: {resp.status_code} {error_text}")
        raise RuntimeError(f"NowPayments payout failed ({resp.status_code}): {error_text}")
    
    data = resp.json()
    
    audit_logger.info(
        f"PAYOUT_CREATED: withdrawal_id={withdrawal_id} address={address} "
        f"amount=${amount:.2f} currency={currency} response={data}"
    )
    
    return data


async def get_payout_status(payout_id: str) -> dict:
    """Check payout status from NowPayments."""
    token = await _get_payout_token()
    
    headers = {
        "x-api-key": NOWPAYMENTS_API_KEY,
        "Authorization": f"Bearer {token}",
    }
    
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            f"{NOWPAYMENTS_BASE_URL}/payout/{payout_id}",
            headers=headers
        )
    
    if resp.status_code != 200:
        logger.error(f"Payout status check failed: {resp.status_code} {resp.text}")
        return {}
    
    return resp.json()
