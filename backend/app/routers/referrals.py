"""Referral System Router"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel
import secrets
import string

from app.database import get_db, get_referral_settings
from app.models import User, Referral, UserRole, AppSettings
from app.auth import get_current_active_user, get_current_admin

router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════════════
# SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class ReferralOut(BaseModel):
    id: int
    referred_username: Optional[str] = None
    referred_avatar: Optional[str] = None
    referrer_reward: float
    referred_reward: float
    is_rewarded: bool
    rewarded_at: Optional[datetime] = None
    trigger_type: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class ReferralStats(BaseModel):
    total_referrals: int
    successful_referrals: int
    pending_referrals: int
    total_earnings: float
    referral_code: Optional[str] = None

class ReferralConfigOut(BaseModel):
    referral_percent: float  # % referrer gets from each purchase
    first_deposit_bonus_percent: float  # % bonus on first deposit for referred
    enabled: bool


# ═══════════════════════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

def generate_referral_code(length: int = 8) -> str:
    """Generate unique referral code"""
    chars = string.ascii_uppercase + string.digits
    return ''.join(secrets.choice(chars) for _ in range(length))


# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/config", response_model=ReferralConfigOut)
async def get_referral_config(db: AsyncSession = Depends(get_db)):
    """Get referral program configuration"""
    settings = await get_referral_settings(db)
    return ReferralConfigOut(
        referral_percent=settings["percent"],
        first_deposit_bonus_percent=settings["first_deposit_bonus"],
        enabled=settings["enabled"]
    )


@router.get("/my-code")
async def get_my_referral_code(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get or generate user's referral code"""
    if not current_user.referral_code:
        # Generate unique code
        code_generated = False
        for _ in range(10):  # Try up to 10 times
            code = generate_referral_code()
            result = await db.execute(
                select(User).where(User.referral_code == code)
            )
            if not result.scalar_one_or_none():
                current_user.referral_code = code
                await db.commit()
                code_generated = True
                break
        
        if not code_generated:
            raise HTTPException(status_code=500, detail="Could not generate unique referral code. Please try again.")
    
    return {"referral_code": current_user.referral_code}


@router.put("/my-code")
async def set_custom_referral_code(
    code: str = Query(..., min_length=3, max_length=16),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Set a custom referral code"""
    import re
    
    # Normalize to uppercase
    code = code.upper().strip()
    
    # Validate format: alphanumeric only
    if not re.match(r'^[A-Z0-9_]+$', code):
        raise HTTPException(status_code=400, detail="Code can only contain letters, numbers, and underscores")
    
    # Check if code is already taken (by another user)
    result = await db.execute(
        select(User).where(User.referral_code == code, User.id != current_user.id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="This code is already taken")
    
    # Update user's referral code
    current_user.referral_code = code
    await db.commit()
    
    return {"referral_code": current_user.referral_code, "message": "Referral code updated!"}


@router.get("/stats", response_model=ReferralStats)
async def get_referral_stats(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get user's referral statistics"""
    # Get all referrals made by user
    result = await db.execute(
        select(Referral).where(Referral.referrer_id == current_user.id)
    )
    referrals = result.scalars().all()
    
    return ReferralStats(
        total_referrals=len(referrals),
        successful_referrals=sum(1 for r in referrals if r.is_rewarded),
        pending_referrals=sum(1 for r in referrals if not r.is_rewarded),
        total_earnings=current_user.total_referral_earnings or 0.0,
        referral_code=current_user.referral_code
    )


@router.get("/my-referrals", response_model=List[ReferralOut])
async def list_my_referrals(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """List all users referred by current user"""
    result = await db.execute(
        select(Referral)
        .options(selectinload(Referral.referred))
        .where(Referral.referrer_id == current_user.id)
        .order_by(Referral.created_at.desc())
    )
    referrals = result.scalars().all()
    
    return [
        ReferralOut(
            id=r.id,
            referred_username=r.referred.username if r.referred else None,
            referred_avatar=r.referred.avatar_url if r.referred else None,
            referrer_reward=r.referrer_reward,
            referred_reward=r.referred_reward,
            is_rewarded=r.is_rewarded,
            rewarded_at=r.rewarded_at,
            trigger_type=r.trigger_type,
            created_at=r.created_at
        )
        for r in referrals
    ]


@router.post("/apply/{code}")
async def apply_referral_code(
    code: str,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Apply a referral code (for new users)"""
    # Check if user already has a referrer
    result = await db.execute(
        select(Referral).where(Referral.referred_id == current_user.id)
    )
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="You already have a referrer")
    
    # Find referrer by code
    result = await db.execute(
        select(User).where(User.referral_code == code.upper())
    )
    referrer = result.scalar_one_or_none()
    
    if not referrer:
        raise HTTPException(status_code=404, detail="Invalid referral code")
    
    if referrer.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot use your own referral code")
    
    # Create referral record
    referral = Referral(
        referrer_id=referrer.id,
        referred_id=current_user.id
    )
    db.add(referral)
    await db.commit()
    
    # Get settings for message
    settings = await get_referral_settings(db)
    
    return {
        "message": f"Referral code applied! You'll get {settings['first_deposit_bonus']}% bonus on your first deposit!",
        "referrer_username": referrer.username
    }


@router.get("/check-referrer")
async def check_if_referred(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Check if current user was referred and reward status"""
    result = await db.execute(
        select(Referral)
        .options(selectinload(Referral.referrer))
        .where(Referral.referred_id == current_user.id)
    )
    referral = result.scalar_one_or_none()
    
    if not referral:
        return {"has_referrer": False}
    
    # Get settings
    settings = await get_referral_settings(db)
    
    return {
        "has_referrer": True,
        "referrer_username": referral.referrer.username if referral.referrer else None,
        "is_rewarded": referral.is_rewarded,
        "referred_reward": referral.referred_reward or 0,
        "first_deposit_bonus_percent": settings["first_deposit_bonus"]
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ADMIN ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/admin/all", response_model=List[ReferralOut])
async def admin_list_all_referrals(
    rewarded_only: bool = False,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin: List all referrals"""
    query = select(Referral).options(
        selectinload(Referral.referrer),
        selectinload(Referral.referred)
    ).order_by(Referral.created_at.desc())
    
    if rewarded_only:
        query = query.where(Referral.is_rewarded == True)
    
    result = await db.execute(query)
    referrals = result.scalars().all()
    
    return [
        ReferralOut(
            id=r.id,
            referred_username=r.referred.username if r.referred else None,
            referred_avatar=r.referred.avatar_url if r.referred else None,
            referrer_reward=r.referrer_reward,
            referred_reward=r.referred_reward,
            is_rewarded=r.is_rewarded,
            rewarded_at=r.rewarded_at,
            trigger_type=r.trigger_type,
            created_at=r.created_at
        )
        for r in referrals
    ]


@router.get("/admin/stats")
async def admin_referral_stats(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin: Get overall referral statistics"""
    result = await db.execute(select(func.count(Referral.id)))
    total = result.scalar() or 0
    
    result = await db.execute(
        select(func.count(Referral.id)).where(Referral.is_rewarded == True)
    )
    successful = result.scalar() or 0
    
    result = await db.execute(
        select(func.sum(Referral.referrer_reward + Referral.referred_reward))
        .where(Referral.is_rewarded == True)
    )
    total_paid = result.scalar() or 0.0
    
    # Get settings
    settings = await get_referral_settings(db)
    
    return {
        "total_referrals": total,
        "successful_referrals": successful,
        "pending_referrals": total - successful,
        "total_rewards_paid": total_paid,
        "config": {
            "referral_percent": settings["percent"],
            "first_deposit_bonus_percent": settings["first_deposit_bonus"],
            "enabled": settings["enabled"]
        }
    }


class ReferralSettingsUpdate(BaseModel):
    referral_percent: Optional[float] = None
    first_deposit_bonus_percent: Optional[float] = None
    enabled: Optional[bool] = None


@router.put("/admin/settings")
async def admin_update_referral_settings(
    data: ReferralSettingsUpdate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Admin: Update referral program settings"""
    result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = result.scalar_one_or_none()
    
    if not settings:
        settings = AppSettings(id=1)
        db.add(settings)
    
    if data.referral_percent is not None:
        if data.referral_percent < 0 or data.referral_percent > 100:
            raise HTTPException(status_code=400, detail="Referral percent must be between 0 and 100")
        settings.referral_percent = data.referral_percent
    
    if data.first_deposit_bonus_percent is not None:
        if data.first_deposit_bonus_percent < 0 or data.first_deposit_bonus_percent > 100:
            raise HTTPException(status_code=400, detail="First deposit bonus must be between 0 and 100")
        settings.referral_first_deposit_bonus_percent = data.first_deposit_bonus_percent
    
    if data.enabled is not None:
        settings.referral_enabled = data.enabled
    
    await db.commit()
    
    return {
        "message": "Referral settings updated",
        "referral_percent": settings.referral_percent,
        "first_deposit_bonus_percent": settings.referral_first_deposit_bonus_percent,
        "enabled": settings.referral_enabled
    }
