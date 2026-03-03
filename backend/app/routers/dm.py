"""Direct Messages Router - User-to-user messaging"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, func, desc
from sqlalchemy.orm import selectinload
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.models import DirectConversation, DirectMessage, User, UserRole, AppSettings
from app.auth import get_current_active_user, get_current_admin
from app.rate_limit import limiter
from app.telegram import create_notification

router = APIRouter(prefix="/api/dm", tags=["Direct Messages"])


class SendMessage(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class StartConversation(BaseModel):
    user_id: int
    message: str = Field(min_length=1, max_length=2000)
    context_type: Optional[str] = None   # 'seller_profile', 'wtb_post'
    context_id: Optional[int] = None
    context_label: Optional[str] = None


class AdminStartConversation(BaseModel):
    user_id: int
    message: Optional[str] = Field(None, max_length=2000)


def _normalize_pair(a: int, b: int):
    """user1_id is always the smaller id"""
    return (min(a, b), max(a, b))


def _serialize_conversation(conv: DirectConversation, current_user_id: int) -> dict:
    other = conv.user2 if conv.user1_id == current_user_id else conv.user1
    msgs = conv.messages or []
    unread = sum(1 for m in msgs if not m.is_read and m.sender_id != current_user_id)
    last_msg = msgs[-1] if msgs else None

    return {
        "id": conv.id,
        "other_user": {
            "id": other.id,
            "username": other.username,
            "first_name": other.first_name,
            "avatar_url": other.avatar_url,
            "role": other.role.value if other.role else "buyer",
            "seller_rank": getattr(other, "seller_rank", 0) or 0,
        } if other else None,
        "context_type": conv.context_type,
        "context_id": conv.context_id,
        "context_label": conv.context_label,
        "last_message": last_msg.content[:80] if last_msg else None,
        "last_message_at": conv.last_message_at.isoformat() if conv.last_message_at else None,
        "unread_count": unread,
        "created_at": conv.created_at.isoformat() if conv.created_at else None,
    }


def _serialize_message(msg: DirectMessage) -> dict:
    return {
        "id": msg.id,
        "sender_id": msg.sender_id,
        "sender_username": msg.sender.username if msg.sender else None,
        "sender_avatar": msg.sender.avatar_url if msg.sender else None,
        "content": msg.content,
        "is_read": msg.is_read,
        "created_at": msg.created_at.isoformat() if msg.created_at else None,
    }


# ── List conversations ─────────────────────────────────────────────────────

@router.get("")
async def list_conversations(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DirectConversation)
        .where(
            or_(
                DirectConversation.user1_id == current_user.id,
                DirectConversation.user2_id == current_user.id,
            )
        )
        .options(
            selectinload(DirectConversation.user1),
            selectinload(DirectConversation.user2),
            selectinload(DirectConversation.messages).selectinload(DirectMessage.sender),
        )
        .order_by(desc(DirectConversation.last_message_at))
    )
    convos = result.scalars().all()
    return [_serialize_conversation(c, current_user.id) for c in convos]


# ── Unread count ────────────────────────────────────────────────────────────

@router.get("/unread-count")
async def unread_count(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    # Count all unread DMs where current user is NOT the sender
    count = await db.scalar(
        select(func.count()).select_from(DirectMessage).join(
            DirectConversation, DirectMessage.conversation_id == DirectConversation.id
        ).where(
            or_(
                DirectConversation.user1_id == current_user.id,
                DirectConversation.user2_id == current_user.id,
            ),
            DirectMessage.sender_id != current_user.id,
            DirectMessage.is_read == False,
        )
    ) or 0
    return {"count": count}


# ── Start or get conversation ───────────────────────────────────────────────

@router.post("/start")
@limiter.limit("30/hour")
async def start_conversation(
    request: Request,
    payload: StartConversation,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Start a new DM conversation (or return existing) and send first message"""
    if payload.user_id == current_user.id:
        raise HTTPException(400, "Cannot message yourself.")

    # Check target user exists
    target = await db.get(User, payload.user_id)
    if not target:
        raise HTTPException(404, "User not found.")
    if target.is_banned:
        raise HTTPException(400, "Cannot message this user.")

    u1, u2 = _normalize_pair(current_user.id, payload.user_id)

    # Find existing conversation (any context)
    result = await db.execute(
        select(DirectConversation).where(
            DirectConversation.user1_id == u1,
            DirectConversation.user2_id == u2,
        ).order_by(desc(DirectConversation.last_message_at)).limit(1)
    )
    conv = result.scalar_one_or_none()

    if not conv:
        conv = DirectConversation(
            user1_id=u1,
            user2_id=u2,
            context_type=payload.context_type,
            context_id=payload.context_id,
            context_label=(payload.context_label or "")[:200] or None,
        )
        db.add(conv)
        await db.flush()

    # Add first message
    msg = DirectMessage(
        conversation_id=conv.id,
        sender_id=current_user.id,
        content=payload.message.strip(),
    )
    db.add(msg)
    conv.last_message_at = datetime.utcnow()

    # Auto-response: if target has auto_response configured, send it
    if target.auto_response and target.auto_response.strip():
        auto_msg = DirectMessage(
            conversation_id=conv.id,
            sender_id=target.id,
            content=target.auto_response.strip(),
        )
        db.add(auto_msg)
        conv.last_message_at = datetime.utcnow()

    await db.commit()

    return {"conversation_id": conv.id}


# ── Get conversation messages ───────────────────────────────────────────────

@router.get("/{conversation_id}")
async def get_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(DirectConversation)
        .where(DirectConversation.id == conversation_id)
        .options(
            selectinload(DirectConversation.user1),
            selectinload(DirectConversation.user2),
            selectinload(DirectConversation.messages).selectinload(DirectMessage.sender),
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(404, "Conversation not found.")
    if current_user.id not in (conv.user1_id, conv.user2_id):
        raise HTTPException(403, "Not your conversation.")

    # Mark messages as read
    for m in conv.messages:
        if m.sender_id != current_user.id and not m.is_read:
            m.is_read = True
    await db.commit()

    other = conv.user2 if conv.user1_id == current_user.id else conv.user1

    return {
        "id": conv.id,
        "other_user": {
            "id": other.id,
            "username": other.username,
            "first_name": other.first_name,
            "avatar_url": other.avatar_url,
            "role": other.role.value if other.role else "buyer",
            "seller_rank": getattr(other, "seller_rank", 0) or 0,
        } if other else None,
        "context_type": conv.context_type,
        "context_id": conv.context_id,
        "context_label": conv.context_label,
        "messages": [_serialize_message(m) for m in conv.messages],
    }


# ── Send message ────────────────────────────────────────────────────────────

@router.post("/{conversation_id}/messages")
@limiter.limit("60/minute")
async def send_message(
    request: Request,
    conversation_id: int,
    payload: SendMessage,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    conv = await db.get(DirectConversation, conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation not found.")
    if current_user.id not in (conv.user1_id, conv.user2_id):
        raise HTTPException(403, "Not your conversation.")

    msg = DirectMessage(
        conversation_id=conv.id,
        sender_id=current_user.id,
        content=payload.content.strip(),
    )
    db.add(msg)
    conv.last_message_at = datetime.utcnow()

    # Cache before commit (commit expires all ORM objects in async mode)
    is_support = conv.context_type == "support"
    is_non_admin = current_user.role != UserRole.ADMIN
    content_text = payload.content.strip()

    await db.commit()
    await db.refresh(msg, ["sender"])

    # Notify all admins if this is a support conversation and sender is not admin
    if is_support and is_non_admin:
        await _notify_admins_support(db, current_user, content_text)

    return _serialize_message(msg)


# ── Admin notification helper ──────────────────────────────────────────────

async def _notify_admins_support(db: AsyncSession, sender, content: str):
    """Send in-app + Telegram notification to every active admin.

    ``sender`` can be a User object (with attributes already loaded) or an int user ID.
    """
    # Resolve sender info
    if isinstance(sender, int):
        result = await db.execute(select(User).where(User.id == sender))
        sender = result.scalar_one_or_none()
        if not sender:
            return

    admins = (await db.execute(
        select(User).where(User.role == UserRole.ADMIN, User.is_active == True)
    )).scalars().all()

    preview = (content[:80] + "…") if len(content) > 80 else content
    handle = sender.username or f"User #{sender.id}"

    for admin in admins:
        if admin.id == sender.id:
            continue
        await create_notification(
            db,
            user_id=admin.id,
            type="support_message",
            title="New Support Message",
            body=f"@{handle}: {preview}",
            link="/messages",
            telegram_id=admin.telegram_id,
        )


# ── Support user ID (public) ───────────────────────────────────────────────

async def _get_support_user(db: AsyncSession):
    """Resolve the support identity.

    Important: support chat must work without needing Telegram ID/username configuration.
    We auto-provision an internal support user (telegram_id='support_system') and keep
    settings.support_user_id in sync.
    """
    result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = AppSettings(id=1)
        db.add(settings)
        await db.commit()
        await db.refresh(settings)

    # 1) If configured, try resolving by username
    if settings.support_username:
        user_result = await db.execute(
            select(User).where(func.lower(User.username) == settings.support_username.lower())
        )
        user = user_result.scalar_one_or_none()
        if user:
            if settings.support_user_id != user.id:
                settings.support_user_id = user.id
                await db.commit()
            return user, settings

    # 2) If configured, try resolving by user id
    if settings.support_user_id:
        user = await db.get(User, settings.support_user_id)
        if user:
            return user, settings

    # 3) Auto-provision system support user
    system_tg_id = "support_system"
    user_result = await db.execute(select(User).where(User.telegram_id == system_tg_id))
    user = user_result.scalar_one_or_none()
    if not user:
        user = User(
            telegram_id=system_tg_id,
            username="support",
            first_name=settings.support_display_name or "Support",
            role=UserRole.ADMIN,
            is_active=True,
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    if settings.support_user_id != user.id:
        settings.support_user_id = user.id
        await db.commit()

    return user, settings


@router.get("/support-user")
async def get_support_user(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get the designated support user"""
    user, settings = await _get_support_user(db)
    if not user:
        return {"support_user_id": None}
    return {
        "support_user_id": user.id,
        "username": user.username,
        "first_name": user.first_name,
        "avatar_url": user.avatar_url,
        "display_name": (settings.support_display_name if settings else None) or user.first_name or "Support",
    }


@router.post("/start-support")
async def start_support_conversation(
    payload: SendMessage,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Start (or reuse) a conversation with Support.

    This avoids requiring the frontend to know a support user id/username.
    """
    support_user, _settings = await _get_support_user(db)
    if not support_user:
        raise HTTPException(500, "Support is not available")

    a, b = _normalize_pair(current_user.id, support_user.id)
    existing_result = await db.execute(
        select(DirectConversation)
        .where(and_(DirectConversation.user1_id == a, DirectConversation.user2_id == b))
        .options(selectinload(DirectConversation.messages))
    )
    conv = existing_result.scalar_one_or_none()

    if not conv:
        conv = DirectConversation(
            user1_id=a,
            user2_id=b,
            context_type="support",
            context_label="Support",
        )
        db.add(conv)
        await db.commit()
        await db.refresh(conv)

    content = (payload.content or "").strip()
    if content:
        msg = DirectMessage(conversation_id=conv.id, sender_id=current_user.id, content=content)
        db.add(msg)
        conv.last_message_at = datetime.utcnow()
        await db.commit()

        # Notify all admins about new support message
        # (current_user attributes are re-queried inside the helper)
        await _notify_admins_support(db, current_user.id, content)

    return {"conversation_id": conv.id}


# ── Admin: start / find conversation with a user ───────────────────────────

@router.post("/admin/start")
async def admin_start_conversation(
    request: Request,
    payload: AdminStartConversation,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: start (or find existing) DM between the support user and a target user."""
    support_user, _settings = await _get_support_user(db)
    if not support_user:
        raise HTTPException(500, "Support user not configured")

    target = await db.get(User, payload.user_id)
    if not target:
        raise HTTPException(404, "User not found.")

    if target.id == support_user.id:
        raise HTTPException(400, "Cannot message support user itself.")

    if target.is_banned:
        raise HTTPException(400, "Cannot message a banned user.")

    a, b = _normalize_pair(support_user.id, target.id)
    existing = await db.execute(
        select(DirectConversation)
        .where(and_(DirectConversation.user1_id == a, DirectConversation.user2_id == b))
    )
    conv = existing.scalar_one_or_none()

    if not conv:
        conv = DirectConversation(
            user1_id=a, user2_id=b,
            context_type="support", context_label="Support",
        )
        db.add(conv)
        await db.commit()
        await db.refresh(conv)

    # If a message was provided, send it as the support user
    content = (payload.message or "").strip()
    if content:
        # Truncate to prevent oversized messages
        content = content[:2000]
        msg = DirectMessage(conversation_id=conv.id, sender_id=support_user.id, content=content)
        db.add(msg)
        conv.last_message_at = datetime.utcnow()
        await db.commit()

    return {"conversation_id": conv.id}


# ── Admin: list ALL conversations for support user ─────────────────────────

@router.get("/admin/conversations")
async def admin_list_conversations(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: list all conversations where the support user is a participant"""
    # Get support user
    support_user, settings = await _get_support_user(db)
    if not support_user:
        return []
    support_id = support_user.id
    
    convos_result = await db.execute(
        select(DirectConversation)
        .where(
            or_(
                DirectConversation.user1_id == support_id,
                DirectConversation.user2_id == support_id,
            )
        )
        .options(
            selectinload(DirectConversation.user1),
            selectinload(DirectConversation.user2),
            selectinload(DirectConversation.messages).selectinload(DirectMessage.sender),
        )
        .order_by(desc(DirectConversation.last_message_at))
    )
    convos = convos_result.scalars().all()
    return [_serialize_conversation(c, support_id) for c in convos]


@router.get("/admin/conversations/{conversation_id}")
async def admin_get_conversation(
    conversation_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: read any conversation (for support inbox)"""
    result = await db.execute(
        select(DirectConversation)
        .where(DirectConversation.id == conversation_id)
        .options(
            selectinload(DirectConversation.user1),
            selectinload(DirectConversation.user2),
            selectinload(DirectConversation.messages).selectinload(DirectMessage.sender),
        )
    )
    conv = result.scalar_one_or_none()
    if not conv:
        raise HTTPException(404, "Conversation not found.")
    
    # Get support user to determine "other"
    support_user, settings = await _get_support_user(db)
    support_id = support_user.id if support_user else None
    
    # Mark messages as read (from the support user's perspective)
    if support_id:
        for m in conv.messages:
            if m.sender_id != support_id and not m.is_read:
                m.is_read = True
        await db.commit()
    
    other_id = conv.user2_id if conv.user1_id == support_id else conv.user1_id
    other = conv.user2 if conv.user1_id == support_id else conv.user1

    return {
        "id": conv.id,
        "other_user": {
            "id": other.id,
            "username": other.username,
            "first_name": other.first_name,
            "avatar_url": other.avatar_url,
            "role": other.role.value if other.role else "buyer",
            "seller_rank": getattr(other, "seller_rank", 0) or 0,
        } if other else None,
        "context_type": conv.context_type,
        "context_id": conv.context_id,
        "context_label": conv.context_label,
        "messages": [_serialize_message(m) for m in conv.messages],
    }


@router.post("/admin/conversations/{conversation_id}/messages")
async def admin_send_message(
    conversation_id: int,
    payload: SendMessage,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin: send message AS the support user"""
    support_user, settings = await _get_support_user(db)
    if not support_user:
        raise HTTPException(400, "No support user configured")
    support_id = support_user.id
    
    conv = await db.get(DirectConversation, conversation_id)
    if not conv:
        raise HTTPException(404, "Conversation not found.")
    
    msg = DirectMessage(
        conversation_id=conv.id,
        sender_id=support_id,
        content=payload.content.strip(),
    )
    db.add(msg)
    conv.last_message_at = datetime.utcnow()
    await db.commit()
    await db.refresh(msg, ["sender"])
    return _serialize_message(msg)
