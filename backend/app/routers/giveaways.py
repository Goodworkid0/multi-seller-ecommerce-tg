"""Giveaways router"""
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, desc, func
from sqlalchemy.orm import selectinload
import secrets as _secrets
import logging
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

from app.database import get_db
from app.auth import get_current_active_user, get_current_admin
from app.models import Giveaway, GiveawayEntry, GiveawayWinner, User, CryptoDeposit, Referral
from app.telegram import create_notification

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/giveaways", tags=["giveaways"])


class GiveawayCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    prize: Optional[str] = Field(None, max_length=200)
    enabled: bool = True
    deposit_required: bool = False
    auto_pick_winner: bool = False
    winner_mode: str = Field(default="random", pattern="^(random|most_referrals)$")
    min_referrals: int = Field(default=0, ge=0)
    winner_count: int = Field(default=1, ge=1, le=10)
    require_name_keyword: Optional[str] = Field(None, max_length=100)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class GiveawayUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=3, max_length=200)
    description: Optional[str] = Field(None, max_length=2000)
    prize: Optional[str] = Field(None, max_length=200)
    enabled: Optional[bool] = None
    deposit_required: Optional[bool] = None
    auto_pick_winner: Optional[bool] = None
    winner_mode: Optional[str] = Field(None, pattern="^(random|most_referrals)$")
    min_referrals: Optional[int] = Field(None, ge=0)
    winner_count: Optional[int] = Field(None, ge=1, le=10)
    require_name_keyword: Optional[str] = Field(None, max_length=100)
    starts_at: Optional[datetime] = None
    ends_at: Optional[datetime] = None


class EnterPayload(BaseModel):
    # Optional message/metadata could be added later; keep minimal.
    pass


class SetWinnerPayload(BaseModel):
    entry_id: int


def _serialize_giveaway(g: Giveaway) -> dict:
    # Build winners list from GiveawayWinner relationship
    winners_list = []
    if hasattr(g, "winners") and g.winners:
        for w in g.winners:
            winners_list.append({
                "place": w.place,
                "user_id": w.user_id,
                "display_name": (f"@{w.user.username}" if w.user and w.user.username else _display_name(w.user)) if w.user else "User",
                "username": w.user.username if w.user else None,
                "telegram_id": str(w.user.telegram_id) if w.user and w.user.telegram_id else None,
                "prize_label": w.prize_label,
                "picked_at": w.picked_at.isoformat() if w.picked_at else None,
            })
    
    # Legacy single winner fallback
    legacy_winner = None
    if getattr(g, "winner_user_id", None) and not winners_list:
        legacy_winner = {
            "user_id": g.winner_user_id,
            "display_name": (f"@{g.winner_user.username}" if g.winner_user.username else (g.winner_user.first_name or "User")) if getattr(g, "winner_user", None) else None,
            "username": g.winner_user.username if getattr(g, "winner_user", None) else None,
            "telegram_id": str(g.winner_user.telegram_id) if getattr(g, "winner_user", None) and g.winner_user.telegram_id else None,
            "picked_at": g.winner_picked_at.isoformat() if g.winner_picked_at else None,
        }
    
    return {
        "id": g.id,
        "title": g.title,
        "description": g.description,
        "prize": g.prize,
        "enabled": bool(g.enabled),
        "deposit_required": bool(getattr(g, "deposit_required", False)),
        "auto_pick_winner": bool(getattr(g, "auto_pick_winner", False)),
        "winner_mode": getattr(g, "winner_mode", "random") or "random",
        "min_referrals": int(getattr(g, "min_referrals", 0) or 0),
        "winner_count": int(getattr(g, "winner_count", 1) or 1),
        "require_name_keyword": getattr(g, "require_name_keyword", None) or None,
        "starts_at": g.starts_at.isoformat() if g.starts_at else None,
        "ends_at": g.ends_at.isoformat() if g.ends_at else None,
        "created_at": g.created_at.isoformat() if getattr(g, "created_at", None) else None,
        "updated_at": g.updated_at.isoformat() if getattr(g, "updated_at", None) else None,
        "winners": winners_list,
        "winner": legacy_winner if legacy_winner else (winners_list[0] if winners_list else None),  # Backwards compat
    }


def _display_name(u: User) -> str:
    return (u.first_name or u.username or "User").strip() or "User"


async def _notify_giveaway_results(
    db: AsyncSession,
    giveaway: Giveaway,
    winner_user_ids: list[int],
    all_entry_user_ids: list[int],
):
    """Notify winners and all participants about giveaway results."""
    title = giveaway.title
    prize_text = f" Prize: {giveaway.prize}" if giveaway.prize else ""

    # 1. Notify each winner
    for uid in winner_user_ids:
        await create_notification(
            db,
            user_id=uid,
            type="giveaway_won",
            title=f"You won: {title}!",
            body=f"Congratulations! You've been selected as a winner.{prize_text}",
            link="/giveaways",
        )

    # 2. Notify all OTHER participants that giveaway ended
    winner_set = set(winner_user_ids)
    for uid in all_entry_user_ids:
        if uid in winner_set:
            continue  # already notified as winner
        await create_notification(
            db,
            user_id=uid,
            type="giveaway_ended",
            title=f"Giveaway ended: {title}",
            body=f"The winner has been selected. Check the results!",
            link="/giveaways",
        )

    await db.commit()


def _serialize_participant(e: GiveawayEntry) -> dict:
    u = e.user
    return {
        "display_name": _display_name(u) if u else "User",
        "entered_at": e.created_at.isoformat() if e.created_at else None,
    }


def _is_current(g: Giveaway) -> bool:
    """Active giveaways that users can see and enter."""
    now = datetime.utcnow()
    if not g.enabled:
        return False
    # Already has a winner — no longer current
    if getattr(g, "winner_user_id", None):
        return False
    if hasattr(g, "winners") and g.winners:
        return False
    if g.starts_at and g.starts_at > now:
        return False
    if g.ends_at and g.ends_at < now:
        return False
    return True


def _is_finished(g: Giveaway) -> bool:
    """A giveaway is finished if it has a winner OR is past its end date."""
    if getattr(g, "winner_user_id", None):
        return True
    if hasattr(g, "winners") and g.winners:
        return True
    if g.ends_at and g.ends_at < datetime.utcnow() and not _is_current(g):
        return True
    return False


@router.get("")
async def list_current_giveaways(db: AsyncSession = Depends(get_db)):
    """Public: list current giveaways."""
    result = await db.execute(
        select(Giveaway)
        .options(
            selectinload(Giveaway.winner_user),
            selectinload(Giveaway.winners).selectinload(GiveawayWinner.user)
        )
        .order_by(desc(Giveaway.created_at))
    )
    items = [g for g in result.scalars().all() if _is_current(g)]

    out = []
    for g in items:
        entries_res = await db.execute(
            select(GiveawayEntry)
            .where(GiveawayEntry.giveaway_id == g.id)
            .options(selectinload(GiveawayEntry.user))
            .order_by(desc(GiveawayEntry.created_at))
        )
        entries = entries_res.scalars().all()
        payload = _serialize_giveaway(g)
        payload["participant_count"] = len(entries)
        payload["participants"] = [_serialize_participant(e) for e in entries]
        out.append(payload)
    return out


@router.get("/for-user")
async def list_current_giveaways_for_user(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    """Auth: list current giveaways with an already_entered flag for current user."""
    result = await db.execute(
        select(Giveaway)
        .options(
            selectinload(Giveaway.winner_user),
            selectinload(Giveaway.winners).selectinload(GiveawayWinner.user)
        )
        .order_by(desc(Giveaway.created_at))
    )
    items = [g for g in result.scalars().all() if _is_current(g)]

    entered_res = await db.execute(
        select(GiveawayEntry.giveaway_id)
        .where(GiveawayEntry.user_id == current_user.id)
    )
    entered_ids = set(entered_res.scalars().all())

    out = []
    for g in items:
        entries_res = await db.execute(
            select(GiveawayEntry)
            .where(GiveawayEntry.giveaway_id == g.id)
            .options(selectinload(GiveawayEntry.user))
            .order_by(desc(GiveawayEntry.created_at))
        )
        entries = entries_res.scalars().all()
        payload = _serialize_giveaway(g)
        payload["participant_count"] = len(entries)
        payload["participants"] = [_serialize_participant(e) for e in entries]
        payload["already_entered"] = g.id in entered_ids
        out.append(payload)
    return out


@router.get("/past")
async def list_past_giveaways(
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """Public: list finished giveaways with winners."""
    result = await db.execute(
        select(Giveaway)
        .options(
            selectinload(Giveaway.winner_user),
            selectinload(Giveaway.winners).selectinload(GiveawayWinner.user)
        )
        .order_by(desc(Giveaway.created_at))
    )
    all_giveaways = result.scalars().all()
    finished = [g for g in all_giveaways if _is_finished(g)]
    page = finished[offset:offset + limit]

    out = []
    for g in page:
        count = await db.scalar(
            select(func.count(GiveawayEntry.id)).where(GiveawayEntry.giveaway_id == g.id)
        )
        payload = _serialize_giveaway(g)
        payload["participant_count"] = int(count or 0)
        out.append(payload)
    return {"items": out, "total": len(finished)}


@router.post("/{giveaway_id}/enter")
async def enter_giveaway(
    giveaway_id: int,
    _payload: EnterPayload,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db),
):
    g = await db.get(Giveaway, giveaway_id)
    if not g or not _is_current(g):
        raise HTTPException(404, "Giveaway not found")

    if getattr(g, "deposit_required", False):
        has_deposit = await db.scalar(
            select(func.count(CryptoDeposit.id)).where(
                CryptoDeposit.user_id == current_user.id,
                CryptoDeposit.is_credited == True,
            )
        )
        if not (has_deposit or 0):
            raise HTTPException(403, "Deposit required")
    
    # Check minimum referrals requirement
    min_refs = int(getattr(g, "min_referrals", 0) or 0)
    if min_refs > 0:
        user_referral_count = await db.scalar(
            select(func.count(Referral.id)).where(Referral.referrer_id == current_user.id)
        ) or 0
        if user_referral_count < min_refs:
            raise HTTPException(403, f"You need at least {min_refs} referrals to enter this giveaway (you have {user_referral_count})")

    # Check name keyword requirement (case-insensitive substring in first+last name)
    keyword = (getattr(g, "require_name_keyword", None) or "").strip()
    if keyword:
        full_name = f"{current_user.first_name or ''} {current_user.last_name or ''}".strip()
        logger.info(
            "Keyword check: user=%s (id=%s) full_name=%r keyword=%r match=%s custom_handle=%s",
            current_user.telegram_id, current_user.id, full_name, keyword,
            keyword.lower() in full_name.lower(), current_user.uses_custom_handle,
        )
        if keyword.lower() not in full_name.lower():
            raise HTTPException(
                403,
                f'Your Telegram name must contain "{keyword}" to enter this giveaway. '
                f'Your current name is "{full_name}". '
                f'Change your Telegram name, then close and reopen the app.'
            )

    existing = await db.execute(
        select(GiveawayEntry).where(
            GiveawayEntry.giveaway_id == giveaway_id,
            GiveawayEntry.user_id == current_user.id,
        )
    )
    if existing.scalar_one_or_none():
        return {"ok": True, "already_entered": True}

    entry = GiveawayEntry(giveaway_id=giveaway_id, user_id=current_user.id)
    db.add(entry)
    await db.commit()
    return {"ok": True, "already_entered": False}


# ---- Admin ----

@router.get("/admin")
async def admin_list_giveaways(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Giveaway)
        .options(
            selectinload(Giveaway.winner_user),
            selectinload(Giveaway.winners).selectinload(GiveawayWinner.user)
        )
        .order_by(desc(Giveaway.created_at))
    )
    items = result.scalars().all()
    out = []
    for g in items:
        count = await db.scalar(select(func.count(GiveawayEntry.id)).where(GiveawayEntry.giveaway_id == g.id))
        payload = _serialize_giveaway(g)
        payload["participant_count"] = int(count or 0)
        out.append(payload)
    return out


@router.get("/admin/{giveaway_id}/entries")
async def admin_list_entries(
    giveaway_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    g = await db.get(Giveaway, giveaway_id)
    if not g:
        raise HTTPException(404, "Giveaway not found")
    res = await db.execute(
        select(GiveawayEntry)
        .where(GiveawayEntry.giveaway_id == giveaway_id)
        .options(selectinload(GiveawayEntry.user))
        .order_by(desc(GiveawayEntry.created_at))
    )
    entries = res.scalars().all()
    return [
        {
            "id": e.id,
            "user_id": e.user.id if e.user else None,
            "display_name": _display_name(e.user) if e.user else "User",
            "username": e.user.username if e.user else None,
            "entered_at": e.created_at.isoformat() if e.created_at else None,
        }
        for e in entries
    ]


@router.post("/admin/{giveaway_id}/pick-winner")
async def admin_pick_winner(
    giveaway_id: int,
    force: bool = Query(False),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    g_res = await db.execute(
        select(Giveaway)
        .where(Giveaway.id == giveaway_id)
        .options(selectinload(Giveaway.winner_user))
    )
    g = g_res.scalar_one_or_none()
    if not g:
        raise HTTPException(404, "Giveaway not found")

    # Check if winners already exist (use GiveawayWinner table as source of truth)
    existing_winners = await db.scalar(
        select(func.count()).select_from(GiveawayWinner).where(GiveawayWinner.giveaway_id == giveaway_id)
    ) or 0
    if existing_winners > 0 and not force:
        raise HTTPException(400, "Winners already picked")

    # Always clear existing winners before picking (prevents duplicates)
    if existing_winners > 0:
        await db.execute(
            GiveawayWinner.__table__.delete().where(GiveawayWinner.giveaway_id == giveaway_id)
        )

    # Pick from existing entries (eligibility already enforced on entry; re-check deposit requirement).
    entries_res = await db.execute(
        select(GiveawayEntry)
        .where(GiveawayEntry.giveaway_id == giveaway_id)
        .options(selectinload(GiveawayEntry.user))
    )
    entries = [e for e in entries_res.scalars().all() if e.user is not None]
    if not entries:
        raise HTTPException(400, "No entries")

    if getattr(g, "deposit_required", False):
        eligible = []
        for e in entries:
            has_deposit = await db.scalar(
                select(func.count(CryptoDeposit.id)).where(
                    CryptoDeposit.user_id == e.user_id,
                    CryptoDeposit.is_credited == True,
                )
            )
            if (has_deposit or 0) > 0:
                eligible.append(e)
        entries = eligible
        if not entries:
            raise HTTPException(400, "No eligible entries")

    # Re-verify name keyword at draw time (users may have removed keyword after entry)
    keyword = (getattr(g, "require_name_keyword", None) or "").strip()
    if keyword:
        kw_lower = keyword.lower()
        entries = [
            e for e in entries
            if e.user and kw_lower in f"{e.user.first_name or ''} {e.user.last_name or ''}".strip().lower()
        ]
        if not entries:
            raise HTTPException(400, f'No eligible entries — no participants have "{keyword}" in their name')

    # Determine winner based on winner_mode
    winner_mode = getattr(g, "winner_mode", "random") or "random"
    winner_count = int(getattr(g, "winner_count", 1) or 1)
    
    selected_winners = []
    
    if winner_mode == "most_referrals":
        # Tournament mode: pick entries sorted by referral count
        entry_referral_counts = []
        for e in entries:
            ref_count = await db.scalar(
                select(func.count(Referral.id)).where(Referral.referrer_id == e.user_id)
            ) or 0
            entry_referral_counts.append((e, ref_count))
        
        # Sort by referral count descending
        entry_referral_counts.sort(key=lambda x: x[1], reverse=True)
        
        # Pick top N winners (handle ties with random among same score)
        picked_user_ids = set()
        remaining = list(entry_referral_counts)
        
        while len(selected_winners) < winner_count and remaining:
            max_refs = remaining[0][1]
            tied = [e for e, count in remaining if count == max_refs]
            _secrets.SystemRandom().shuffle(tied)
            
            for e in tied:
                if e.user_id not in picked_user_ids and len(selected_winners) < winner_count:
                    selected_winners.append(e)
                    picked_user_ids.add(e.user_id)
            
            remaining = [(e, c) for e, c in remaining if e.user_id not in picked_user_ids]
    else:
        # Random mode: pick N random unique winners
        available = list(entries)
        _secrets.SystemRandom().shuffle(available)
        picked_user_ids = set()
        
        for e in available:
            if e.user_id not in picked_user_ids and len(selected_winners) < winner_count:
                selected_winners.append(e)
                picked_user_ids.add(e.user_id)
    
    # Create GiveawayWinner records
    now = datetime.utcnow()
    for place, winner_entry in enumerate(selected_winners, start=1):
        gw = GiveawayWinner(
            giveaway_id=giveaway_id,
            user_id=winner_entry.user_id,
            place=place,
            picked_at=now,
        )
        db.add(gw)
    
    # Also set legacy winner_user_id to 1st place for backwards compat
    if selected_winners:
        g.winner_user_id = selected_winners[0].user_id
        g.winner_picked_at = now
    
    await db.commit()
    
    # Reload with winners
    g_res = await db.execute(
        select(Giveaway)
        .where(Giveaway.id == giveaway_id)
        .options(
            selectinload(Giveaway.winner_user),
            selectinload(Giveaway.winners).selectinload(GiveawayWinner.user)
        )
    )
    g = g_res.scalar_one()
    
    payload = _serialize_giveaway(g)
    payload["participant_count"] = await db.scalar(select(func.count(GiveawayEntry.id)).where(GiveawayEntry.giveaway_id == g.id)) or 0

    # Notify winners + all participants
    winner_uids = [e.user_id for e in selected_winners]
    all_entry_uids = list({e.user_id for e in entries})
    await _notify_giveaway_results(db, g, winner_uids, all_entry_uids)

    return payload


@router.post("/admin/{giveaway_id}/set-winner")
async def admin_set_winner(
    giveaway_id: int,
    payload: SetWinnerPayload,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    g_res = await db.execute(
        select(Giveaway)
        .where(Giveaway.id == giveaway_id)
        .options(selectinload(Giveaway.winner_user))
    )
    g = g_res.scalar_one_or_none()
    if not g:
        raise HTTPException(404, "Giveaway not found")

    e_res = await db.execute(
        select(GiveawayEntry)
        .where(
            GiveawayEntry.id == payload.entry_id,
            GiveawayEntry.giveaway_id == giveaway_id,
        )
        .options(selectinload(GiveawayEntry.user))
    )
    entry = e_res.scalar_one_or_none()
    if not entry or not entry.user:
        raise HTTPException(404, "Entry not found")

    if getattr(g, "deposit_required", False):
        has_deposit = await db.scalar(
            select(func.count(CryptoDeposit.id)).where(
                CryptoDeposit.user_id == entry.user_id,
                CryptoDeposit.is_credited == True,
            )
        )
        if not (has_deposit or 0):
            raise HTTPException(400, "Selected user is not eligible (deposit required)")

    # Clear any existing GiveawayWinner records for this giveaway
    await db.execute(
        GiveawayWinner.__table__.delete().where(GiveawayWinner.giveaway_id == giveaway_id)
    )

    # Create a GiveawayWinner record (consistent with multi-winner system)
    now = datetime.utcnow()
    gw = GiveawayWinner(
        giveaway_id=giveaway_id,
        user_id=entry.user_id,
        place=1,
        picked_at=now,
    )
    db.add(gw)

    g.winner_user_id = entry.user_id
    g.winner_picked_at = now
    await db.commit()

    # Reload with all relationships
    g_res2 = await db.execute(
        select(Giveaway)
        .where(Giveaway.id == giveaway_id)
        .options(
            selectinload(Giveaway.winner_user),
            selectinload(Giveaway.winners).selectinload(GiveawayWinner.user)
        )
    )
    g = g_res2.scalar_one()
    payload_out = _serialize_giveaway(g)
    payload_out["participant_count"] = await db.scalar(select(func.count(GiveawayEntry.id)).where(GiveawayEntry.giveaway_id == g.id)) or 0

    # Notify winner + all participants
    all_entries_res = await db.execute(
        select(GiveawayEntry.user_id).where(GiveawayEntry.giveaway_id == giveaway_id)
    )
    all_entry_uids = list({uid for uid in all_entries_res.scalars().all()})
    await _notify_giveaway_results(db, g, [entry.user_id], all_entry_uids)

    return payload_out


@router.post("/admin")
async def admin_create_giveaway(
    payload: GiveawayCreate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    g = Giveaway(
        title=payload.title.strip(),
        description=(payload.description or "").strip() or None,
        prize=(payload.prize or "").strip() or None,
        enabled=payload.enabled,
        deposit_required=payload.deposit_required,
        auto_pick_winner=payload.auto_pick_winner,
        winner_mode=payload.winner_mode,
        min_referrals=payload.min_referrals,
        winner_count=payload.winner_count,
        require_name_keyword=(payload.require_name_keyword or "").strip() or None,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
    )
    db.add(g)
    await db.commit()
    result = await db.execute(
        select(Giveaway)
        .where(Giveaway.id == g.id)
        .options(
            selectinload(Giveaway.winner_user),
            selectinload(Giveaway.winners).selectinload(GiveawayWinner.user)
        )
    )
    g = result.scalar_one()
    return _serialize_giveaway(g)


@router.put("/admin/{giveaway_id}")
async def admin_update_giveaway(
    giveaway_id: int,
    payload: GiveawayUpdate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    g = await db.get(Giveaway, giveaway_id)
    if not g:
        raise HTTPException(404, "Giveaway not found")

    if payload.title is not None:
        g.title = payload.title.strip()
    if payload.description is not None:
        g.description = payload.description.strip() or None
    if payload.prize is not None:
        g.prize = payload.prize.strip() or None
    if payload.enabled is not None:
        g.enabled = payload.enabled
    if payload.deposit_required is not None:
        g.deposit_required = payload.deposit_required
    if payload.auto_pick_winner is not None:
        g.auto_pick_winner = payload.auto_pick_winner
    if payload.winner_mode is not None:
        g.winner_mode = payload.winner_mode
    if payload.min_referrals is not None:
        g.min_referrals = payload.min_referrals
    if payload.winner_count is not None:
        g.winner_count = payload.winner_count
    if payload.require_name_keyword is not None:
        g.require_name_keyword = payload.require_name_keyword.strip() or None
    if payload.starts_at is not None:
        g.starts_at = payload.starts_at
    if payload.ends_at is not None:
        g.ends_at = payload.ends_at

    g.updated_at = datetime.utcnow()
    await db.commit()
    result = await db.execute(
        select(Giveaway)
        .where(Giveaway.id == g.id)
        .options(
            selectinload(Giveaway.winner_user),
            selectinload(Giveaway.winners).selectinload(GiveawayWinner.user)
        )
    )
    g = result.scalar_one()
    return _serialize_giveaway(g)


@router.delete("/admin/{giveaway_id}")
async def admin_delete_giveaway(
    giveaway_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db),
):
    g = await db.get(Giveaway, giveaway_id)
    if not g:
        raise HTTPException(404, "Giveaway not found")

    # Delete winners and entries first
    await db.execute(
        GiveawayWinner.__table__.delete().where(GiveawayWinner.giveaway_id == giveaway_id)
    )
    await db.execute(
        GiveawayEntry.__table__.delete().where(GiveawayEntry.giveaway_id == giveaway_id)
    )
    await db.delete(g)
    await db.commit()
    return {"ok": True}
