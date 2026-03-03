"""Telegram notification utility — sends messages via Bot API + creates in-app Notification records"""
import html
import os
import asyncio
import logging
import httpx
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

logger = logging.getLogger(__name__)

BOT_TOKEN = os.getenv("BOT_TOKEN", "").strip()

# Emoji map for notification types
EMOJI = {
    "order_paid": "💰", "order_completed": "✅", "order_delivered": "📦",
    "order_status_update": "📋", "order_confirmed": "✅",
    "dispute_opened": "⚠️", "dispute_escalated": "🔺",
    "dispute_resolved": "⚖️", "dispute_message": "💬",
    "deposit_credited": "💵", "withdrawal_approved": "✅",
    "withdrawal_completed": "✅", "withdrawal_rejected": "❌",
    "withdrawal_failed": "❌", "seller_expired": "⏰",
    "seller_expiring_soon": "⏳", "status_changed": "🔔",
    "admin_announcement": "📢", "auction_won": "🏆",
    "auction_ended": "🔨", "auction_sold": "🔨",
    "auction_paid": "💰", "auction_payment_success": "✅",
    "auction_payment_failed": "❌", "auction_cancelled": "❌",
    "referral_bonus": "🎁", "referral_reward": "🎁", "feedback": "⭐",
    "middleman_invite": "🤝", "middleman_joined": "🤝",
    "middleman_admin_joined": "👨‍⚖️", "middleman_funds_locked": "🔒",
    "middleman_confirm_needed": "❓", "middleman_admin_request": "👨‍⚖️",
    "middleman_disputed": "⚠️", "middleman_dispute": "🚨",
    "middleman_completed": "✅", "middleman_complete_needed": "❓",
    "middleman_cancelled": "❌", "middleman_resolved": "⚖️",
    "escrow_released": "💰", "promo_bonus200": "🎁",
    "admin_warning": "⚠️",
    "wtb_reply": "💬",
    "giveaway_won": "🏆",
    "giveaway_ended": "🎁",
    "support_message": "🆘",
}


async def send_telegram(chat_id, text: str, parse_mode: str = "HTML") -> bool:
    """Low-level send via Bot API. Returns True on success."""
    if not BOT_TOKEN or not chat_id:
        return False
    tid = str(chat_id).strip()
    if not tid.isdigit():
        return False
    try:
        url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
        async with httpx.AsyncClient(timeout=10.0) as client:
            res = await client.post(url, json={
                "chat_id": int(tid),
                "text": text,
                "parse_mode": parse_mode,
                "disable_web_page_preview": True,
            })
            ok = res.status_code == 200 and res.json().get("ok")
            if not ok:
                logger.warning("Telegram send failed for %s: %s", tid, res.text[:200])
            return ok
    except Exception as e:
        logger.warning("Telegram send error for %s: %s", tid, e)
        return False


def _format_tg(type: str, title: str, body: str | None) -> str:
    emoji = EMOJI.get(type, "🔔")
    msg = f"{emoji} <b>{html.escape(title)}</b>"
    if body:
        msg += f"\n{html.escape(body)}"
    return msg


async def create_notification(
    db: AsyncSession,
    *,
    user_id: int,
    type: str,
    title: str,
    body: str = None,
    link: str = None,
    telegram_id: str | int | None = None,
    skip_telegram: bool = False,
):
    """Create an in-app Notification AND fire-and-forget a Telegram message.

    Respects the user's notification_prefs for both in-app and Telegram
    channels. Security/warning notifications are always delivered.

    If ``telegram_id`` is already known pass it to skip an extra DB query.
    Set ``skip_telegram=True`` to only create the DB record (e.g. broadcast
    handles Telegram delivery separately).
    """
    from app.models import Notification, User

    # Load user to check prefs (also gets telegram_id if needed)
    user = None
    if not telegram_id or True:  # always load for prefs check
        result = await db.execute(select(User).where(User.id == user_id))
        user = result.scalar_one_or_none()

    # Check preferences
    from app.routers.notifications import should_notify
    want_app = should_notify(user, type, "app") if user else True
    want_tg = should_notify(user, type, "tg") if user else True

    # 1. DB record (in-app)
    if want_app:
        db.add(Notification(
            user_id=user_id, type=type, title=title, body=body, link=link,
        ))

    if skip_telegram or not want_tg:
        return

    # 2. Telegram
    tid = telegram_id or (user.telegram_id if user else None)

    if tid:
        msg = _format_tg(type, title, body)
        try:
            asyncio.create_task(send_telegram(tid, msg))
        except RuntimeError:
            # No running event loop (edge case in background tasks at shutdown)
            pass
