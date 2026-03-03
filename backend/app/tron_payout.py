"""
Direct Tron USDT TRC-20 Payout Service

Sends USDT directly from your hot wallet to user addresses.
Much simpler and more reliable than NowPayments payouts.

Required env vars:
  TRON_PRIVATE_KEY     - Private key of your hot wallet (hex, no 0x prefix)
  TRON_WALLET_ADDRESS  - Your hot wallet address (starts with T)
  TRON_NETWORK         - "mainnet" or "shasta" (testnet)
  TRONGRID_API_KEY     - API key from trongrid.io (free)

Requirements:
  - tronpy library: pip install tronpy
  - TRX in wallet for gas fees (~0.5 TRX per transfer)
  - USDT TRC-20 balance in wallet
"""

import os
import logging
from typing import Optional
from decimal import Decimal

logger = logging.getLogger("tron_payout")
audit_logger = logging.getLogger("audit")

# Tron configuration
TRON_PRIVATE_KEY = os.getenv("TRON_PRIVATE_KEY", "")
TRON_WALLET_ADDRESS = os.getenv("TRON_WALLET_ADDRESS", "")
TRON_NETWORK = os.getenv("TRON_NETWORK", "mainnet")
TRONGRID_API_KEY = os.getenv("TRONGRID_API_KEY", "")

# USDT TRC-20 contract address (same on mainnet)
USDT_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"

# Fee limit in SUN (1 TRX = 1,000,000 SUN)
FEE_LIMIT = 15_000_000  # 15 TRX max fee

# Global client cache
_tron_client = None


def _get_client():
    """Get Tron client instance."""
    global _tron_client
    if _tron_client is not None:
        return _tron_client
    
    try:
        from tronpy import Tron
        from tronpy.providers import HTTPProvider
        
        if TRON_NETWORK == "shasta":
            endpoint = "https://api.shasta.trongrid.io"
        else:
            endpoint = "https://api.trongrid.io"
            if not TRONGRID_API_KEY:
                raise RuntimeError("TRONGRID_API_KEY not set - get one at trongrid.io")
        
        # Try different ways to set API key based on tronpy version
        provider = None
        
        # Method 1: Try api_key parameter (newer tronpy versions)
        try:
            provider = HTTPProvider(endpoint, api_key=TRONGRID_API_KEY)
            logger.info("Using tronpy with api_key parameter")
        except TypeError:
            # Method 2: Create provider and patch headers
            provider = HTTPProvider(endpoint)
            logger.info("Using tronpy with header patching")
        
        # Patch headers if API key not set via parameter
        if TRONGRID_API_KEY:
            # Check for different internal client attribute names
            if hasattr(provider, 'sess'):
                provider.sess.headers["TRON-PRO-API-KEY"] = TRONGRID_API_KEY
            elif hasattr(provider, 'client'):
                provider.client.headers["TRON-PRO-API-KEY"] = TRONGRID_API_KEY
            elif hasattr(provider, '_client'):
                provider._client.headers["TRON-PRO-API-KEY"] = TRONGRID_API_KEY
        
        _tron_client = Tron(provider=provider)
        return _tron_client
    except ImportError as e:
        raise RuntimeError(f"Required library not installed: {e}. Run: pip install tronpy")


def _get_private_key():
    """Get private key object."""
    if not TRON_PRIVATE_KEY:
        raise RuntimeError("TRON_PRIVATE_KEY not set in environment")
    
    try:
        from tronpy.keys import PrivateKey
        # Remove 0x prefix if present
        key_hex = TRON_PRIVATE_KEY.replace("0x", "").strip()
        return PrivateKey(bytes.fromhex(key_hex))
    except Exception as e:
        raise RuntimeError(f"Invalid TRON_PRIVATE_KEY: {e}")


async def get_wallet_balance() -> dict:
    """Get TRX and USDT balance of hot wallet."""
    try:
        client = _get_client()
        
        # TRX balance
        trx_balance = client.get_account_balance(TRON_WALLET_ADDRESS)
        
        # USDT balance
        usdt_contract = client.get_contract(USDT_CONTRACT)
        usdt_raw = usdt_contract.functions.balanceOf(TRON_WALLET_ADDRESS)
        usdt_balance = float(usdt_raw) / 1_000_000  # 6 decimals
        
        return {
            "address": TRON_WALLET_ADDRESS,
            "trx_balance": float(trx_balance),
            "usdt_balance": usdt_balance,
            "network": TRON_NETWORK
        }
    except Exception as e:
        logger.error(f"Failed to get wallet balance: {e}")
        return {"error": str(e)}


async def send_usdt(
    to_address: str,
    amount: float,
    withdrawal_id: int
) -> dict:
    """
    Send USDT TRC-20 to an address.
    
    Args:
        to_address: Recipient's TRC-20 address (starts with T)
        amount: Amount in USDT to send
        withdrawal_id: Internal withdrawal ID for tracking
    
    Returns:
        dict with transaction result:
        {
            "success": True/False,
            "txid": "transaction_hash",
            "amount": float,
            "to_address": "T...",
            "error": "error message if failed"
        }
    """
    # Validate address
    if not to_address or not to_address.startswith("T") or len(to_address) != 34:
        return {
            "success": False,
            "error": f"Invalid TRC-20 address: {to_address}"
        }
    
    # Validate amount
    if amount <= 0:
        return {
            "success": False,
            "error": f"Invalid amount: {amount}"
        }
    
    try:
        from tronpy.exceptions import TransactionError, ValidationError
        
        client = _get_client()
        priv_key = _get_private_key()
        
        # Get USDT contract
        usdt = client.get_contract(USDT_CONTRACT)
        
        # Convert amount to smallest unit (6 decimals)
        amount_raw = int(amount * 1_000_000)
        
        # Check balance first
        balance_raw = usdt.functions.balanceOf(TRON_WALLET_ADDRESS)
        if balance_raw < amount_raw:
            return {
                "success": False,
                "error": f"Insufficient USDT balance. Have: {balance_raw/1_000_000:.2f}, Need: {amount:.2f}"
            }
        
        # Build and sign transaction
        txn = (
            usdt.functions.transfer(to_address, amount_raw)
            .with_owner(TRON_WALLET_ADDRESS)
            .fee_limit(FEE_LIMIT)
            .build()
            .sign(priv_key)
        )
        
        # Broadcast
        result = txn.broadcast()
        
        # Wait for confirmation (with timeout)
        try:
            receipt = result.wait(timeout=60)
            success = receipt.get("result", False) or receipt.get("receipt", {}).get("result") == "SUCCESS"
        except Exception as wait_err:
            # Transaction was broadcast but waiting timed out — treat as pending, not confirmed
            logger.warning(f"Transaction broadcast but wait timed out: {wait_err}")
            success = False  # Don't assume success; admin can verify txid and retry if needed
        
        txid = result.get("txid", "") or result.get("id", "")
        
        audit_logger.info(
            f"TRON_PAYOUT: withdrawal_id={withdrawal_id} to={to_address} "
            f"amount=${amount:.2f} txid={txid} success={success}"
        )
        
        if not success:
            return {
                "success": False,
                "error": f"Transaction broadcast but confirmation timed out. TXID: {txid}. Verify manually.",
                "txid": txid,
            }

        return {
            "success": True,
            "txid": txid,
            "amount": amount,
            "to_address": to_address
        }
        
    except Exception as e:
        error_msg = str(e)[:500]
        audit_logger.error(
            f"TRON_PAYOUT_FAILED: withdrawal_id={withdrawal_id} to={to_address} "
            f"amount=${amount:.2f} error={error_msg}"
        )
        return {
            "success": False,
            "error": error_msg
        }


async def validate_address(address: str) -> bool:
    """Check if address is a valid Tron address."""
    if not address or not address.startswith("T") or len(address) != 34:
        return False
    
    try:
        # Basic base58 check
        import base58
        decoded = base58.b58decode_check(address)
        return len(decoded) == 21 and decoded[0] == 0x41
    except:
        return False
