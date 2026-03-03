"""Authentication utilities"""
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
from passlib.context import CryptContext
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
import hashlib
import hmac
import os

from app.database import get_db
from app.models import User, UserRole, Notification
from app.telegram import create_notification
from app.schemas import TokenData

ENVIRONMENT = os.getenv("ENVIRONMENT", "production").strip().lower()
SECRET_KEY = os.getenv("SECRET_KEY", "")

if not SECRET_KEY or SECRET_KEY in ("your-secret-key", ""):
    if ENVIRONMENT == "production":
        raise RuntimeError("FATAL: SECRET_KEY must be set in production! Set a secure random string via environment variable.")
    import secrets as _s
    SECRET_KEY = _s.token_hex(32)
    import logging as _log
    _log.getLogger(__name__).warning("SECRET_KEY not set! Generated ephemeral key — tokens will invalidate on restart.")

ALGORITHM = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "1440"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "30"))
BOT_TOKEN = os.getenv("BOT_TOKEN", "")

security = HTTPBearer()


def verify_telegram_auth(auth_data: dict) -> bool:
    """Verify Telegram Login Widget data"""
    if not BOT_TOKEN:
        if ENVIRONMENT == "production":
            return False
        return True  # Dev mode only
    
    check_hash = auth_data.pop('hash', '')
    data_check_string = '\n'.join(
        f"{k}={v}" for k, v in sorted(auth_data.items())
    )
    
    secret_key = hashlib.sha256(BOT_TOKEN.encode()).digest()
    calculated_hash = hmac.new(
        secret_key, data_check_string.encode(), hashlib.sha256
    ).hexdigest()
    
    return hmac.compare_digest(calculated_hash, check_hash)


def verify_telegram_webapp_data(init_data: str) -> bool:
    """Verify Telegram Mini App initData using WebAppData algorithm.
    
    This is different from Login Widget! Mini App uses:
    HMAC-SHA256(HMAC-SHA256("WebAppData", BOT_TOKEN), data_check_string)
    """
    if not BOT_TOKEN:
        if ENVIRONMENT == "production":
            return False
        return True  # Dev mode only
    
    if not init_data:
        return False
    
    try:
        from urllib.parse import parse_qs, unquote
        
        # Parse initData as query string
        parsed = parse_qs(init_data, keep_blank_values=True)
        
        # Extract hash
        hash_value = parsed.get('hash', [''])[0]
        if not hash_value:
            return False
        
        # Build data_check_string (all params except hash, sorted, joined by \n)
        data_check_parts = []
        for key in sorted(parsed.keys()):
            if key != 'hash':
                # parse_qs returns lists, take first value
                value = parsed[key][0]
                data_check_parts.append(f"{key}={value}")
        
        data_check_string = '\n'.join(data_check_parts)
        
        # Calculate HMAC using WebAppData method
        # Step 1: HMAC-SHA256("WebAppData", BOT_TOKEN) -> secret_key
        secret_key = hmac.new(
            b"WebAppData", BOT_TOKEN.encode(), hashlib.sha256
        ).digest()
        
        # Step 2: HMAC-SHA256(secret_key, data_check_string) -> calculated_hash
        calculated_hash = hmac.new(
            secret_key, data_check_string.encode(), hashlib.sha256
        ).hexdigest()
        
        return hmac.compare_digest(calculated_hash, hash_value)
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"WebApp data verification failed: {e}")
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire, "type": "access"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_refresh_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS))
    to_encode.update({"exp": expire, "type": "refresh"})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        token_type = payload.get("type")
        if token_type != "access":
            raise credentials_exception
        telegram_id: str = payload.get("sub")
        token_version_claim = payload.get("tv")
        is_impersonated = payload.get("imp", False)
        if telegram_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    result = await db.execute(select(User).where(User.telegram_id == telegram_id))
    user = result.scalar_one_or_none()
    
    if user is None:
        raise credentials_exception

    if token_version_claim is None:
        raise credentials_exception
    try:
        if int(token_version_claim) != int(user.token_version or 0):
            raise credentials_exception
    except (TypeError, ValueError):
        raise credentials_exception

    # Attach impersonation flag for downstream endpoints to check
    user._is_impersonated = bool(is_impersonated)

    # Hard sync: downgrade expired sellers to buyer role
    if (
        user.role == UserRole.SELLER
        and user.seller_expires_at
        and user.seller_expires_at < datetime.utcnow()
    ):
        user.role = UserRole.BUYER
        await create_notification(
            db, user_id=user.id, type="seller_expired",
            title="Seller status expired",
            body="Your seller subscription expired and your account switched to buyer. Renew to continue selling.",
            link="/?tab=settings", telegram_id=user.telegram_id,
        )
        await create_notification(
            db, user_id=user.id, type="status_changed",
            title="Account status updated",
            body="Your role changed from seller to buyer due to subscription expiry.",
            link="/?tab=settings", telegram_id=user.telegram_id,
        )
        await db.commit()
        await db.refresh(user)
    
    return user


async def get_current_active_user(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_active:
        raise HTTPException(status_code=400, detail="Inactive user")
    if current_user.is_banned:
        raise HTTPException(
            status_code=403,
            detail=f"Account banned{': ' + current_user.ban_reason if current_user.ban_reason else ''}"
        )
    return current_user


async def get_current_seller(current_user: User = Depends(get_current_active_user)) -> User:
    """Any user with a shop_name can access seller features (free tier included).
    Admins always pass. Paid subscription is NOT required here — use
    get_current_paid_seller for premium-only endpoints."""
    if current_user.role == UserRole.ADMIN:
        return current_user
    if not current_user.shop_name:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seller access required. Set up your shop first."
        )
    return current_user


async def get_current_paid_seller(current_user: User = Depends(get_current_seller)) -> User:
    """Require an active paid seller subscription (rank >= 1 with valid expiry).
    Used for premium features like withdrawals, collateral, featured purchases."""
    if current_user.role == UserRole.ADMIN:
        return current_user
    rank = current_user.seller_rank or 0
    if rank < 1:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Paid seller subscription required. Upgrade your rank to access this feature."
        )
    if current_user.seller_expires_at:
        if current_user.seller_expires_at < datetime.utcnow():
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Seller subscription expired. Renew to access this feature."
            )
    return current_user


async def get_current_admin(current_user: User = Depends(get_current_active_user)) -> User:
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user


async def verify_user_pin(user: User, pin: str, db) -> None:
    """Shared PIN verification with lockout logic.
    Raises HTTPException on failure. Commits lockout state to DB."""
    import bcrypt
    from datetime import datetime, timedelta

    if not user.pin_hash:
        raise HTTPException(status_code=400, detail="PIN required. Set a PIN code in Settings > Security first.")

    # Check lockout
    if user.pin_locked_until and user.pin_locked_until > datetime.utcnow():
        remaining = int((user.pin_locked_until - datetime.utcnow()).total_seconds())
        raise HTTPException(status_code=429, detail=f"Too many failed attempts. Try again in {remaining}s.")

    if not bcrypt.checkpw(pin.encode(), user.pin_hash.encode()):
        user.pin_failed_attempts = (user.pin_failed_attempts or 0) + 1
        fails = user.pin_failed_attempts
        if fails >= 5:
            lockout_minutes = 2 ** (fails - 5)
            user.pin_locked_until = datetime.utcnow() + timedelta(minutes=min(lockout_minutes, 60))
        await db.commit()
        remaining_attempts = max(0, 5 - fails)
        detail = "Invalid PIN"
        if remaining_attempts > 0:
            detail += f" ({remaining_attempts} attempts remaining)"
        else:
            detail += ". Account locked temporarily."
        raise HTTPException(status_code=403, detail=detail)

    # Success — reset counters
    user.pin_failed_attempts = 0
    user.pin_locked_until = None


def reject_impersonation(user: User) -> None:
    """Raise 403 if the current session is an admin impersonation.
    Call this at the top of sensitive endpoints (PIN, withdrawal, profile changes)."""
    if getattr(user, "_is_impersonated", False):
        raise HTTPException(
            status_code=403,
            detail="This action is not allowed during an impersonated session."
        )
