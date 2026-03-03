"""Authentication Router"""
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel, Field
from typing import Optional
import re
import logging
import os

from app.database import get_db
from app.models import User, UserRole, LoginHistory
from app.schemas import Token, User as UserSchema, UserContactUpdate
from app.auth import verify_telegram_auth, verify_telegram_webapp_data, create_access_token, create_refresh_token, get_current_active_user, get_current_admin, reject_impersonation
from jose import JWTError, jwt

router = APIRouter()
USERNAME_RE = re.compile(r"^[a-zA-Z0-9_]{3,20}$")
logger = logging.getLogger(__name__)
audit_logger = logging.getLogger("audit")
ENVIRONMENT = os.getenv("ENVIRONMENT", "production").strip().lower()

# Shared rate limiter instance
from app.rate_limit import limiter


class TelegramLoginData(BaseModel):
    id: int
    first_name: str
    last_name: Optional[str] = ""
    username: Optional[str] = ""
    photo_url: Optional[str] = ""
    auth_date: int
    hash: str
    init_data: Optional[str] = None  # Full initData for verification


class UsernameChangeRequest(BaseModel):
    username: str
    first_name: str


class BalanceUpdate(BaseModel):
    amount: float = Field(gt=0, le=10000)


class RefreshTokenRequest(BaseModel):
    refresh_token: str


class PinSetRequest(BaseModel):
    pin: str = Field(min_length=4, max_length=6, pattern=r'^\d{4,6}$')

class PinVerifyRequest(BaseModel):
    pin: str = Field(min_length=4, max_length=6, pattern=r'^\d{4,6}$')

class PinChangeRequest(BaseModel):
    old_pin: str = Field(min_length=4, max_length=6, pattern=r'^\d{4,6}$')
    new_pin: str = Field(min_length=4, max_length=6, pattern=r'^\d{4,6}$')


def _client_ip(request: Request) -> str:
    # Prefer X-Real-IP set by nginx (trusted proxy), not client-spoofable X-Forwarded-For
    real_ip = request.headers.get("x-real-ip", "").strip()
    if real_ip:
        return real_ip
    if request.client:
        return request.client.host
    return "unknown"


def _request_id(request: Request) -> str:
    rid = getattr(getattr(request, "state", None), "request_id", None)
    return str(rid) if rid else "unknown"


AUTH_DATE_MAX_AGE_SECONDS = 300  # 5 minutes max for auth_date

@router.post("/telegram", response_model=Token)
@limiter.limit("10/minute")
async def telegram_login(request: Request, auth_data: TelegramLoginData, db: AsyncSession = Depends(get_db)):
    """Login/Register via Telegram Mini App"""
    try:
        # Validate auth_date freshness to prevent replay attacks
        import time
        current_time = int(time.time())
        if current_time - auth_data.auth_date > AUTH_DATE_MAX_AGE_SECONDS:
            logger.warning(f"Auth data too old for user {auth_data.id}: {current_time - auth_data.auth_date}s")
            raise HTTPException(status_code=400, detail="Authentication data expired. Please try again.")
        
        # Verify Telegram auth hash when BOT_TOKEN is available
        if ENVIRONMENT == "production":
            verified = False
            
            # Try Mini App verification first (if init_data is provided)
            if auth_data.init_data:
                verified = verify_telegram_webapp_data(auth_data.init_data)
                logger.info(f"Mini App verification result: {verified}")
            
            # Fallback to Login Widget verification
            if not verified:
                auth_dict = auth_data.model_dump(exclude={"init_data"})
                verified = verify_telegram_auth(auth_dict)
                logger.info(f"Login Widget verification result: {verified}")
            
            if not verified:
                logger.warning(f"Auth verification failed for user {auth_data.id}")
                raise HTTPException(status_code=400, detail="Invalid Telegram auth")

        telegram_id = str(auth_data.id)

        # Find or create user
        result = await db.execute(select(User).where(User.telegram_id == telegram_id))
        user = result.scalar_one_or_none()

        if not user:
            # New user registration
            user = User(
                telegram_id=telegram_id,
                username=auth_data.username or f"user_{telegram_id}",
                first_name=auth_data.first_name,
                last_name=(auth_data.last_name or "")[:128],
                avatar_url=auth_data.photo_url,
                role=UserRole.BUYER,
                balance=0.0
            )
            db.add(user)
            await db.commit()
            await db.refresh(user)
        else:
            # Sync Telegram handle unless user paid for a custom handle
            if not user.uses_custom_handle:
                if auth_data.first_name:
                    user.first_name = auth_data.first_name
                if auth_data.last_name is not None:
                    user.last_name = (auth_data.last_name or "")[:128]
                if auth_data.username:
                    user.username = auth_data.username
            if auth_data.photo_url:
                user.avatar_url = auth_data.photo_url
            await db.commit()
            await db.refresh(user)

        token_version = int(user.token_version or 0)

        # Create tokens
        access_token = create_access_token(data={"sub": telegram_id, "tv": token_version})
        refresh_token = create_refresh_token(data={"sub": telegram_id, "tv": token_version})

        # Record login event in a separate session to avoid polluting the auth session
        try:
            from app.database import async_session
            method = "telegram_webapp" if auth_data.init_data else "telegram_widget"
            async with async_session() as login_db:
                login_entry = LoginHistory(
                    user_id=user.id,
                    ip_address=_client_ip(request),
                    user_agent=request.headers.get("user-agent", ""),
                    method=method,
                )
                login_db.add(login_entry)
                await login_db.commit()
                logger.info("Recorded login history for user %s (method=%s)", user.id, method)
        except Exception:
            logger.warning("Failed to record login history for user %s", user.id, exc_info=True)

        return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Telegram login failed")
        raise HTTPException(status_code=500, detail="Authentication failed")


if ENVIRONMENT != "production":
    @router.post("/dev-login", response_model=Token)
    @limiter.limit("5/minute")
    async def dev_login(request: Request, telegram_id: str, db: AsyncSession = Depends(get_db)):
        """Development login - only registered in non-production environments"""
        result = await db.execute(select(User).where(User.telegram_id == telegram_id))
        user = result.scalar_one_or_none()
        
        if not user:
            user = User(
                telegram_id=telegram_id,
                username=f"user_{telegram_id}",
                first_name="Test User",
                role=UserRole.BUYER
            )
            db.add(user)
            await db.commit()
        
        token_version = int(user.token_version or 0)
        access_token = create_access_token(data={"sub": telegram_id, "tv": token_version})
        refresh_token = create_refresh_token(data={"sub": telegram_id, "tv": token_version})

        # Record login event
        try:
            from app.database import async_session as login_session_factory
            async with login_session_factory() as login_db:
                login_entry = LoginHistory(
                    user_id=user.id,
                    ip_address=_client_ip(request),
                    user_agent=request.headers.get("user-agent", ""),
                    method="dev",
                )
                login_db.add(login_entry)
                await login_db.commit()
                logger.info("Recorded dev login history for user %s", user.id)
        except Exception:
            logger.warning("Failed to record dev login history for user %s", user.id, exc_info=True)

        return {"access_token": access_token, "refresh_token": refresh_token, "token_type": "bearer"}


@router.post("/refresh", response_model=Token)
@limiter.limit("20/minute")
async def refresh_access_token(request: Request, payload: RefreshTokenRequest, db: AsyncSession = Depends(get_db)):
    """Issue a new short-lived access token using a refresh token."""
    from app.auth import SECRET_KEY, ALGORITHM

    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid refresh token",
        headers={"WWW-Authenticate": "Bearer"},
    )

    try:
        decoded = jwt.decode(payload.refresh_token, SECRET_KEY, algorithms=[ALGORITHM])
        if decoded.get("type") != "refresh":
            audit_logger.warning("auth.refresh.failed type_mismatch ip=%s request_id=%s", _client_ip(request), _request_id(request))
            raise credentials_exception
        telegram_id = decoded.get("sub")
        token_version_claim = decoded.get("tv")
        if not telegram_id:
            audit_logger.warning("auth.refresh.failed missing_sub ip=%s request_id=%s", _client_ip(request), _request_id(request))
            raise credentials_exception
    except JWTError:
        audit_logger.warning("auth.refresh.failed invalid_jwt ip=%s request_id=%s", _client_ip(request), _request_id(request))
        raise credentials_exception

    result = await db.execute(select(User).where(User.telegram_id == str(telegram_id), User.is_active == True, User.is_banned == False))
    user = result.scalar_one_or_none()
    if not user:
        audit_logger.warning("auth.refresh.failed user_not_found telegram_id=%s ip=%s request_id=%s", str(telegram_id), _client_ip(request), _request_id(request))
        raise credentials_exception

    if token_version_claim is None:
        audit_logger.warning("auth.refresh.failed missing_token_version user_id=%s ip=%s request_id=%s", str(telegram_id), _client_ip(request), _request_id(request))
        raise credentials_exception

    try:
        if int(token_version_claim) != int(user.token_version or 0):
            audit_logger.warning(
                "auth.refresh.failed token_version_mismatch user_id=%s token_tv=%s db_tv=%s ip=%s request_id=%s",
                user.id,
                token_version_claim,
                int(user.token_version or 0),
                _client_ip(request),
                _request_id(request),
            )
            raise credentials_exception
    except (TypeError, ValueError):
        audit_logger.warning("auth.refresh.failed invalid_token_version user_id=%s ip=%s request_id=%s", user.id, _client_ip(request), _request_id(request))
        raise credentials_exception

    current_tv = int(user.token_version or 0)
    new_access_token = create_access_token(data={"sub": str(telegram_id), "tv": current_tv})
    new_refresh_token = create_refresh_token(data={"sub": str(telegram_id), "tv": current_tv})
    audit_logger.info("auth.refresh.success user_id=%s telegram_id=%s ip=%s request_id=%s", user.id, str(telegram_id), _client_ip(request), _request_id(request))
    return {"access_token": new_access_token, "refresh_token": new_refresh_token, "token_type": "bearer"}


@router.post("/logout")
async def logout_current_session(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Invalidate all currently issued tokens for the user."""
    current_user.token_version = int(current_user.token_version or 0) + 1
    await db.commit()
    audit_logger.info(
        "auth.logout.success user_id=%s telegram_id=%s new_tv=%s ip=%s request_id=%s",
        current_user.id,
        current_user.telegram_id,
        int(current_user.token_version or 0),
        _client_ip(request),
        _request_id(request),
    )
    return {"message": "Logged out"}


@router.get("/login-history")
async def get_login_history(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
    limit: int = 20,
):
    """Get recent login history for current user — distinct IPs only (most recent per IP)."""
    from sqlalchemy import desc, func
    # Sub-query: latest login id per distinct IP
    sub = (
        select(func.max(LoginHistory.id).label("max_id"))
        .where(LoginHistory.user_id == current_user.id)
        .group_by(LoginHistory.ip_address)
        .subquery()
    )
    result = await db.execute(
        select(LoginHistory)
        .join(sub, LoginHistory.id == sub.c.max_id)
        .order_by(desc(LoginHistory.created_at))
        .limit(min(limit, 50))
    )
    entries = result.scalars().all()
    return [
        {
            "id": e.id,
            "ip_address": e.ip_address,
            "user_agent": e.user_agent,
            "method": e.method,
            "created_at": e.created_at.isoformat() + "Z" if e.created_at else None,
        }
        for e in entries
    ]


@router.post("/terminate-all")
async def terminate_all_sessions(
    request: Request,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Increment token_version to invalidate all issued tokens."""
    current_user.token_version = int(current_user.token_version or 0) + 1
    await db.commit()
    audit_logger.info(
        "auth.terminate_all user_id=%s telegram_id=%s new_tv=%s ip=%s",
        current_user.id,
        current_user.telegram_id,
        current_user.token_version,
        _client_ip(request),
    )
    # Issue fresh tokens so the caller stays logged in
    tv = int(current_user.token_version or 0)
    access_token = create_access_token(data={"sub": current_user.telegram_id, "tv": tv})
    refresh_token = create_refresh_token(data={"sub": current_user.telegram_id, "tv": tv})
    return {
        "message": "All other sessions terminated",
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_type": "bearer",
    }


@router.get("/me", response_model=UserSchema)
async def get_me(current_user: User = Depends(get_current_active_user)):
    """Get current user"""
    return current_user


class TelegramProfileSync(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    username: Optional[str] = None
    photo_url: Optional[str] = None


@router.post("/sync-telegram")
async def sync_telegram_profile(
    payload: TelegramProfileSync,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Sync Telegram display name/photo after session restore (no re-auth needed)."""
    if current_user.uses_custom_handle:
        logger.info("sync-telegram: skipped for user %s (custom handle)", current_user.id)
        return {"synced": False, "reason": "custom_handle"}

    changed = False
    if payload.first_name and payload.first_name != current_user.first_name:
        logger.info("sync-telegram: user %s first_name %r -> %r", current_user.id, current_user.first_name, payload.first_name)
        current_user.first_name = payload.first_name
        changed = True
    if payload.last_name is not None and (payload.last_name or "") != (current_user.last_name or ""):
        logger.info("sync-telegram: user %s last_name %r -> %r", current_user.id, current_user.last_name, payload.last_name)
        current_user.last_name = (payload.last_name or "")[:128]
        changed = True
    if payload.username and payload.username != current_user.username:
        current_user.username = payload.username
        changed = True
    if payload.photo_url and payload.photo_url != current_user.avatar_url:
        current_user.avatar_url = payload.photo_url
        changed = True

    if changed:
        await db.commit()
        logger.info("sync-telegram: committed changes for user %s", current_user.id)
    else:
        logger.info("sync-telegram: no changes for user %s (first_name=%r)", current_user.id, current_user.first_name)

    return {"synced": changed}


@router.get("/balance")
async def get_balance(current_user: User = Depends(get_current_active_user)):
    """Lightweight balance check for polling"""
    return {"balance": current_user.balance}


@router.put("/profile", response_model=UserSchema)
async def update_profile(
    updates: UserContactUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update contact info for current user"""
    reject_impersonation(current_user)
    ALLOWED_FIELDS = {"email", "other_contact"}
    update_data = updates.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if field in ALLOWED_FIELDS:
            setattr(current_user, field, value)

    await db.commit()
    await db.refresh(current_user)
    return current_user


@router.post("/username", response_model=UserSchema)
async def change_username(
    payload: UsernameChangeRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Paid username/handle change"""
    reject_impersonation(current_user)
    new_username = payload.username.strip().lstrip("@").strip()
    new_first_name = payload.first_name.strip()

    if not USERNAME_RE.match(new_username):
        raise HTTPException(status_code=400, detail="Username must be 3-20 chars (letters, numbers, underscore)")
    if not new_first_name:
        raise HTTPException(status_code=400, detail="Display name is required")

    if (current_user.username or "") == new_username and (current_user.first_name or "") == new_first_name:
        raise HTTPException(status_code=400, detail="No changes detected")

    # Ensure unique username/handle
    result = await db.execute(
        select(User).where(User.username == new_username, User.id != current_user.id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Username already taken")

    # Lock user row to prevent concurrent username changes double-spending balance
    user_result = await db.execute(
        select(User).where(User.id == current_user.id).with_for_update()
    )
    user = user_result.scalar_one()

    if user.balance < 50:
        raise HTTPException(status_code=400, detail="Insufficient balance")

    user.balance = round((user.balance or 0) - (50), 2)
    user.username = new_username
    user.first_name = new_first_name
    user.uses_custom_handle = True
    await db.commit()
    await db.refresh(user)
    return user


@router.post("/deposit", response_model=UserSchema)
async def deposit_balance(
    payload: BalanceUpdate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin-only: manually credit a user's balance (dev/test)"""
    if ENVIRONMENT == "production":
        raise HTTPException(status_code=403, detail="Use crypto deposits in production")

    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")

    current_user.balance = round((current_user.balance or 0) + (payload.amount), 2)
    await db.commit()
    await db.refresh(current_user)
    return current_user


# ==================== PIN CODE ====================

@router.post("/pin/set")
@limiter.limit("5/minute")
async def set_pin(
    request: Request,
    payload: PinSetRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Set or replace the user's PIN code."""
    reject_impersonation(current_user)
    import bcrypt

    if current_user.pin_hash:
        raise HTTPException(status_code=400, detail="PIN already set. Use /pin/change to update it.")

    current_user.pin_hash = bcrypt.hashpw(payload.pin.encode(), bcrypt.gensalt()).decode()
    await db.commit()
    audit_logger.info("auth.pin.set user_id=%s ip=%s", current_user.id, _client_ip(request))
    return {"message": "PIN set successfully"}


@router.post("/pin/verify")
@limiter.limit("10/minute")
async def verify_pin(
    request: Request,
    payload: PinVerifyRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Verify the user's PIN code (used on app open)."""
    import bcrypt
    from datetime import datetime, timedelta

    if not current_user.pin_hash:
        raise HTTPException(status_code=400, detail="No PIN set")

    # Check lockout
    if current_user.pin_locked_until and current_user.pin_locked_until > datetime.utcnow():
        remaining = int((current_user.pin_locked_until - datetime.utcnow()).total_seconds())
        raise HTTPException(status_code=429, detail=f"Too many failed attempts. Try again in {remaining}s.")

    if not bcrypt.checkpw(payload.pin.encode(), current_user.pin_hash.encode()):
        current_user.pin_failed_attempts = (current_user.pin_failed_attempts or 0) + 1
        fails = current_user.pin_failed_attempts
        # Exponential lockout: 1min, 2min, 4min, 8min, 16min...
        if fails >= 5:
            lockout_minutes = 2 ** (fails - 5)
            current_user.pin_locked_until = datetime.utcnow() + timedelta(minutes=min(lockout_minutes, 60))
        await db.commit()
        audit_logger.warning("auth.pin.verify.failed user_id=%s attempts=%s ip=%s", current_user.id, fails, _client_ip(request))
        remaining_attempts = max(0, 5 - fails)
        detail = "Invalid PIN"
        if remaining_attempts > 0:
            detail += f" ({remaining_attempts} attempts remaining)"
        else:
            detail += ". Account locked temporarily."
        raise HTTPException(status_code=403, detail=detail)

    # Success — reset counters
    current_user.pin_failed_attempts = 0
    current_user.pin_locked_until = None
    await db.commit()
    audit_logger.info("auth.pin.verify.success user_id=%s ip=%s", current_user.id, _client_ip(request))
    return {"message": "PIN verified"}


@router.post("/pin/change")
@limiter.limit("5/minute")
async def change_pin(
    request: Request,
    payload: PinChangeRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Change the user's PIN code (requires old PIN)."""
    reject_impersonation(current_user)
    import bcrypt

    if not current_user.pin_hash:
        raise HTTPException(status_code=400, detail="No PIN set. Use /pin/set first.")

    if not bcrypt.checkpw(payload.old_pin.encode(), current_user.pin_hash.encode()):
        # Use lockout logic to prevent brute force
        current_user.pin_failed_attempts = (current_user.pin_failed_attempts or 0) + 1
        fails = current_user.pin_failed_attempts
        if fails >= 5:
            from datetime import timedelta as _td
            lockout_minutes = 2 ** (fails - 5)
            current_user.pin_locked_until = datetime.utcnow() + _td(minutes=min(lockout_minutes, 60))
        await db.commit()
        audit_logger.warning("auth.pin.change.failed user_id=%s attempts=%s ip=%s", current_user.id, fails, _client_ip(request))
        remaining = max(0, 5 - fails)
        detail = "Current PIN is incorrect"
        if remaining > 0:
            detail += f" ({remaining} attempts remaining)"
        else:
            detail += ". Account locked temporarily."
        raise HTTPException(status_code=403, detail=detail)

    # Reset lockout on success
    current_user.pin_failed_attempts = 0
    current_user.pin_locked_until = None
    current_user.pin_hash = bcrypt.hashpw(payload.new_pin.encode(), bcrypt.gensalt()).decode()
    await db.commit()
    audit_logger.info("auth.pin.change.success user_id=%s ip=%s", current_user.id, _client_ip(request))
    return {"message": "PIN changed successfully"}


@router.delete("/pin/remove")
@limiter.limit("5/minute")
async def remove_pin(
    request: Request,
    payload: PinVerifyRequest,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Remove the user's PIN code (requires current PIN)."""
    reject_impersonation(current_user)
    import bcrypt

    if not current_user.pin_hash:
        raise HTTPException(status_code=400, detail="No PIN set")

    if not bcrypt.checkpw(payload.pin.encode(), current_user.pin_hash.encode()):
        # Use lockout logic to prevent brute force
        current_user.pin_failed_attempts = (current_user.pin_failed_attempts or 0) + 1
        fails = current_user.pin_failed_attempts
        if fails >= 5:
            from datetime import timedelta as _td
            lockout_minutes = 2 ** (fails - 5)
            current_user.pin_locked_until = datetime.utcnow() + _td(minutes=min(lockout_minutes, 60))
        await db.commit()
        audit_logger.warning("auth.pin.remove.failed user_id=%s attempts=%s ip=%s", current_user.id, fails, _client_ip(request))
        remaining = max(0, 5 - fails)
        detail = "Invalid PIN"
        if remaining > 0:
            detail += f" ({remaining} attempts remaining)"
        else:
            detail += ". Account locked temporarily."
        raise HTTPException(status_code=403, detail=detail)

    # Reset lockout on success
    current_user.pin_failed_attempts = 0
    current_user.pin_locked_until = None
    current_user.pin_hash = None
    await db.commit()
    audit_logger.info("auth.pin.remove.success user_id=%s ip=%s", current_user.id, _client_ip(request))
    return {"message": "PIN removed"}
