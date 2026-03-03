"""Notifications Router"""
import json
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, update
from typing import List, Optional, Dict
from datetime import datetime, timedelta

from app.database import get_db
from app.models import User, Notification, UserRole
from app.schemas import NotificationSchema
from app.auth import get_current_active_user
from app.telegram import create_notification

router = APIRouter()

# ─── Notification preference categories ───────────────────────────────────────
# Maps notification types to user-facing categories
NOTIF_CATEGORIES = {
    "orders":        ["order_paid", "order_status_update", "order_confirmed", "order_completed", "status_changed"],
    "disputes":      ["dispute_opened", "dispute_escalated", "dispute_message", "dispute_resolved"],
    "wallet":        ["deposit_credited", "withdrawal_approved", "withdrawal_rejected", "withdrawal_completed", "withdrawal_failed"],
    "auctions":      ["auction_won", "auction_ended", "auction_sold", "auction_paid", "auction_payment_success", "auction_payment_failed", "auction_cancelled"],
    "escrow":        ["middleman_invite", "middleman_joined", "middleman_admin_joined", "middleman_funds_locked",
                      "middleman_confirm_needed", "middleman_admin_request", "middleman_disputed", "middleman_dispute",
                      "middleman_completed", "middleman_complete_needed", "middleman_cancelled", "middleman_resolved", "escrow_released"],
    "wtb":           ["wtb_reply"],
    "seller":        ["seller_expiring_soon", "seller_expired", "feedback"],
    "announcements": ["admin_announcement", "promo_bonus200", "referral_bonus", "referral_reward"],
}

# Types that can never be muted (security / warnings)
ALWAYS_ON_TYPES = {"admin_warning"}

# Build reverse lookup: type -> category
_TYPE_TO_CATEGORY: Dict[str, str] = {}
for cat, types in NOTIF_CATEGORIES.items():
    for t in types:
        _TYPE_TO_CATEGORY[t] = cat

# Default prefs: everything on
DEFAULT_PREFS = {cat: {"app": True, "tg": True} for cat in NOTIF_CATEGORIES}


def _get_user_prefs(user: User) -> dict:
    """Parse user notification_prefs JSON, falling back to defaults."""
    if user.notification_prefs:
        try:
            saved = json.loads(user.notification_prefs) if isinstance(user.notification_prefs, str) else user.notification_prefs
            # Merge with defaults so new categories are always present
            merged = {}
            for cat in NOTIF_CATEGORIES:
                merged[cat] = {
                    "app": saved.get(cat, {}).get("app", True),
                    "tg":  saved.get(cat, {}).get("tg", True),
                }
            return merged
        except Exception:
            pass
    return {cat: {"app": True, "tg": True} for cat in NOTIF_CATEGORIES}


def should_notify(user: User, notif_type: str, channel: str = "app") -> bool:
    """Check if a user wants to receive a particular notification type on a channel.
    channel: 'app' | 'tg'
    """
    if notif_type in ALWAYS_ON_TYPES:
        return True
    cat = _TYPE_TO_CATEGORY.get(notif_type)
    if not cat:
        return True  # Unknown types are always delivered
    prefs = _get_user_prefs(user)
    return prefs.get(cat, {}).get(channel, True)


async def _ensure_subscription_notifications(current_user: User, db: AsyncSession):
    if not current_user.shop_name or not current_user.seller_expires_at:
        return

    now = datetime.utcnow()
    expires_at = current_user.seller_expires_at

    if current_user.role == UserRole.SELLER and expires_at <= now:
        existing_expired = await db.scalar(
            select(func.count()).select_from(Notification).where(
                Notification.user_id == current_user.id,
                Notification.type == "seller_expired"
            )
        )
        if not existing_expired:
            await create_notification(
                db, user_id=current_user.id, type="seller_expired",
                title="Seller status expired",
                body="Your seller subscription has expired. Renew to continue selling.",
                link="/?tab=settings", telegram_id=current_user.telegram_id,
            )
            await db.commit()
        return

    if expires_at > now and expires_at <= now + timedelta(days=7):
        recent_warning = await db.scalar(
            select(func.count()).select_from(Notification).where(
                Notification.user_id == current_user.id,
                Notification.type == "seller_expiring_soon",
                Notification.created_at >= now - timedelta(hours=24)
            )
        )
        if not recent_warning:
            remaining = expires_at - now
            days_left = max(0, remaining.days)
            hours_left = max(0, remaining.seconds // 3600)
            body = f"Your seller status expires in {days_left}d {hours_left}h. Renew to avoid interruption."
            await create_notification(
                db, user_id=current_user.id, type="seller_expiring_soon",
                title="Seller status expiring soon",
                body=body,
                link="/?tab=settings", telegram_id=current_user.telegram_id,
            )
            await db.commit()


@router.get("", response_model=List[NotificationSchema])
async def list_notifications(
    limit: int = 30,
    offset: int = 0,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get user's notifications, newest first (paginated)"""
    await _ensure_subscription_notifications(current_user, db)

    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(min(limit, 100))  # Cap maximum limit
    )
    return result.scalars().all()


@router.get("/unread-count")
async def unread_count(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get count of unread notifications"""
    count = await db.scalar(
        select(func.count()).select_from(Notification)
        .where(Notification.user_id == current_user.id, Notification.is_read == False)
    )
    return {"count": count or 0}


@router.post("/mark-read")
async def mark_all_read(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark all notifications as read"""
    await db.execute(
        update(Notification)
        .where(Notification.user_id == current_user.id, Notification.is_read == False)
        .values(is_read=True)
    )
    await db.commit()
    return {"message": "All notifications marked as read"}


@router.post("/{notification_id}/read")
async def mark_one_read(
    notification_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Mark a single notification as read"""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notification_id,
            Notification.user_id == current_user.id
        )
    )
    notif = result.scalar_one_or_none()
    if notif:
        notif.is_read = True
        await db.commit()
    return {"message": "ok"}


# ─── Notification Preferences ─────────────────────────────────────────────────

@router.get("/preferences")
async def get_notification_preferences(
    current_user: User = Depends(get_current_active_user),
):
    """Get user's notification preferences (categories × app/tg toggles)."""
    return {
        "preferences": _get_user_prefs(current_user),
        "categories": list(NOTIF_CATEGORIES.keys()),
    }


class ChannelPrefs(BaseModel):
    app: bool = True
    tg: bool = True


class NotifPrefsUpdate(BaseModel):
    preferences: Dict[str, ChannelPrefs]


@router.put("/preferences")
async def update_notification_preferences(
    payload: NotifPrefsUpdate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Update user's notification preferences."""
    # Validate and normalize — only keep known categories
    clean = {}
    for cat in NOTIF_CATEGORIES:
        incoming = payload.preferences.get(cat)
        if incoming:
            clean[cat] = {"app": incoming.app, "tg": incoming.tg}
        else:
            clean[cat] = {"app": True, "tg": True}
    
    current_user.notification_prefs = json.dumps(clean)
    await db.commit()
    return {"preferences": clean}
