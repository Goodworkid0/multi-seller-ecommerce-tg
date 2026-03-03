"""Banners Router"""
import os
import json
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query, Request
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, or_
from typing import List, Optional
from pydantic import BaseModel

from app.database import get_db
from app.models import Banner, User, UserRole, BannerBooking, AppSettings
from app.schemas import (
    Banner as BannerSchema, 
    BannerCreate, 
    BannerUpdate,
    BannerBookingCreate,
    BannerBookingUpdate,
    BannerBookingSchema
)
from app.auth import get_current_active_user, get_current_admin
from app.rate_limit import limiter

router = APIRouter()

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "uploads")
BANNERS_DIR = os.path.join(UPLOAD_DIR, "banners")


@router.get("", response_model=List[BannerSchema])
async def list_banners(db: AsyncSession = Depends(get_db)):
    """List all active banners (admin-created + approved user bookings)"""
    now = datetime.utcnow()
    
    # Admin-created banners
    admin_result = await db.execute(
        select(Banner)
        .where(Banner.is_active == True)
        .order_by(Banner.sort_order.asc(), Banner.created_at.desc())
    )
    admin_banners = admin_result.scalars().all()
    
    # User-booked slots that are active now
    bookings_result = await db.execute(
        select(BannerBooking)
        .where(
            BannerBooking.is_approved == True,
            BannerBooking.status == "active",
            BannerBooking.starts_at <= now,
            BannerBooking.ends_at > now
        )
        .order_by(BannerBooking.sort_order.asc(), BannerBooking.starts_at.asc())
    )
    bookings = bookings_result.scalars().all()
    
    # Convert bookings to Banner-like dicts
    all_banners = list(admin_banners)
    for b in bookings:
        # Create a pseudo-banner object
        pseudo = Banner(
            id=10000 + b.id,  # Offset to avoid ID collision
            title=b.title,
            subtitle=b.subtitle,
            image_url=b.image_url,
            link=b.link,
            link_text=b.link_text,
            gradient_from=b.gradient_from,
            gradient_to=b.gradient_to,
            position=b.position,
            is_active=True,
            sort_order=b.sort_order,
            created_at=b.created_at
        )
        all_banners.append(pseudo)
    
    # Sort by position then sort_order
    return sorted(all_banners, key=lambda x: (x.position, x.sort_order, x.created_at))


@router.get("/admin/all", response_model=List[BannerSchema])
async def list_all_banners(
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """List all banners including inactive (admin only)"""
    result = await db.execute(
        select(Banner).order_by(Banner.sort_order.asc(), Banner.created_at.desc())
    )
    return result.scalars().all()


@router.post("/admin", response_model=BannerSchema)
async def create_banner(
    banner_data: BannerCreate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Create a new banner (admin only)"""
    banner = Banner(**banner_data.model_dump())
    db.add(banner)
    await db.commit()
    await db.refresh(banner)
    return banner


@router.put("/admin/{banner_id}", response_model=BannerSchema)
async def update_banner(
    banner_id: int,
    banner_data: BannerUpdate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Update a banner (admin only)"""
    result = await db.execute(select(Banner).where(Banner.id == banner_id))
    banner = result.scalar_one_or_none()
    if not banner:
        raise HTTPException(status_code=404, detail="Banner not found")
    
    update_data = banner_data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(banner, field, value)
    
    await db.commit()
    await db.refresh(banner)
    return banner


@router.delete("/admin/{banner_id}")
async def delete_banner(
    banner_id: int,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Delete a banner (admin only)"""
    result = await db.execute(select(Banner).where(Banner.id == banner_id))
    banner = result.scalar_one_or_none()
    if not banner:
        raise HTTPException(status_code=404, detail="Banner not found")
    
    # Delete associated image file if exists
    if banner.image_url and banner.image_url.startswith("/api/banners/images/"):
        filename = banner.image_url.split("/")[-1]
        filepath = os.path.join(BANNERS_DIR, filename)
        if os.path.exists(filepath):
            os.remove(filepath)
    
    await db.delete(banner)
    await db.commit()
    return {"message": "Banner deleted"}


@router.post("/admin/{banner_id}/upload")
async def upload_banner_image(
    banner_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Upload a GIF/image for a banner (admin only)"""
    result = await db.execute(select(Banner).where(Banner.id == banner_id))
    banner = result.scalar_one_or_none()
    if not banner:
        raise HTTPException(status_code=404, detail="Banner not found")
    
    MAX_SIZE = 5 * 1024 * 1024  # 5MB for GIFs
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 5MB)")
    
    ext = (file.filename or "banner.gif").rsplit(".", 1)[-1].lower()
    if ext not in ("gif", "png", "jpg", "jpeg", "webp"):
        raise HTTPException(status_code=400, detail="Only GIF/PNG/JPG/WebP allowed")
    
    # Create banners directory
    os.makedirs(BANNERS_DIR, exist_ok=True)
    
    filename = f"banner_{banner_id}.{ext}"
    filepath = os.path.join(BANNERS_DIR, filename)
    
    # Remove old banner images with different extension
    for old_ext in ("gif", "png", "jpg", "jpeg", "webp"):
        old_path = os.path.join(BANNERS_DIR, f"banner_{banner_id}.{old_ext}")
        if os.path.exists(old_path) and old_path != filepath:
            os.remove(old_path)
    
    with open(filepath, "wb") as f:
        f.write(content)
    
    banner.image_url = f"/api/banners/images/{filename}"
    await db.commit()
    await db.refresh(banner)
    
    return {"message": "Banner image uploaded", "image_url": banner.image_url}


@router.get("/images/{filename}")
async def serve_banner_image(filename: str):
    """Serve banner image/GIF file"""
    safe_name = os.path.basename(filename)
    filepath = os.path.join(BANNERS_DIR, safe_name)
    if not os.path.exists(filepath):
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(filepath)


# ============ Banner Slot Booking System ============

DEFAULT_SLOT_PRICING = {
    "above_categories": {"price": 350.0, "pages": ["home", "products"], "description": "Premium Spotlight - Top visibility on Home & Products", "max_active": 2},
    "above_wtb": {"price": 200.0, "pages": ["wtb"], "description": "Featured Banner - Prominent WTB section placement", "max_active": 3},
    "above_escrow": {"price": 170.0, "pages": ["escrow"], "description": "Trust Zone - Escrow section banner", "max_active": 3},
    "above_vouches": {"price": 280.0, "pages": ["home"], "description": "Top Showcase - Prime Home page position", "max_active": 2},
    "below_vouches": {"price": 130.0, "pages": ["home"], "description": "Discovery Zone - High traffic Home placement", "max_active": 4},
}


async def _get_slot_config(db: AsyncSession) -> dict:
    """Get slot pricing config from settings"""
    result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = result.scalar_one_or_none()
    if not settings or not settings.banner_slot_pricing:
        return {"enabled": True, "positions": DEFAULT_SLOT_PRICING}
    try:
        config = json.loads(settings.banner_slot_pricing)
        return {"enabled": settings.banner_slots_enabled if hasattr(settings, 'banner_slots_enabled') else True, "positions": config}
    except:
        return {"enabled": True, "positions": DEFAULT_SLOT_PRICING}


@router.get("/slots/config")
async def get_slot_config(db: AsyncSession = Depends(get_db)):
    """Get banner slot pricing configuration (public)"""
    return await _get_slot_config(db)


@router.get("/slots/availability")
async def check_slot_availability(
    position: str,
    starts_at: datetime,
    db: AsyncSession = Depends(get_db)
):
    """Check if a slot is available for the given position (30-day fixed duration)"""
    config = await _get_slot_config(db)
    if position not in config["positions"]:
        raise HTTPException(status_code=400, detail="Invalid position")
    
    pos_config = config["positions"][position]
    duration_days = 30  # Fixed 30-day duration
    ends_at = starts_at + timedelta(days=duration_days)
    
    # Count overlapping active/approved bookings
    overlap_count = await db.scalar(
        select(func.count()).select_from(BannerBooking).where(
            and_(
                BannerBooking.position == position,
                BannerBooking.status.in_(["pending", "active"]),
                BannerBooking.is_approved == True,
                or_(
                    and_(BannerBooking.starts_at <= starts_at, BannerBooking.ends_at > starts_at),
                    and_(BannerBooking.starts_at < ends_at, BannerBooking.ends_at >= ends_at),
                    and_(BannerBooking.starts_at >= starts_at, BannerBooking.ends_at <= ends_at)
                )
            )
        )
    )
    
    max_allowed = pos_config.get("max_active", 3)
    is_available = overlap_count < max_allowed
    price = pos_config.get("price", pos_config.get("price_30d", 150.0))
    
    return {
        "position": position,
        "starts_at": starts_at.isoformat(),
        "ends_at": ends_at.isoformat(),
        "duration_days": duration_days,
        "current_count": overlap_count,
        "max_allowed": max_allowed,
        "is_available": is_available,
        "price": round(price, 2),
        "position_info": pos_config
    }


@router.post("/slots/book")
@limiter.limit("5/minute")
async def book_banner_slot(
    request: Request,
    payload: BannerBookingCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Book a banner slot (pay from wallet balance)"""
    config = await _get_slot_config(db)
    
    if not config.get("enabled", True):
        raise HTTPException(status_code=400, detail="Banner slot purchases are currently disabled")
    
    if payload.position not in config["positions"]:
        raise HTTPException(status_code=400, detail="Invalid position")
    
    pos_config = config["positions"][payload.position]
    ends_at = payload.starts_at + timedelta(days=payload.duration_days)
    
    # Check availability
    overlap_count = await db.scalar(
        select(func.count()).select_from(BannerBooking).where(
            and_(
                BannerBooking.position == payload.position,
                BannerBooking.status.in_(["pending", "active"]),
                BannerBooking.is_approved == True,
                or_(
                    and_(BannerBooking.starts_at <= payload.starts_at, BannerBooking.ends_at > payload.starts_at),
                    and_(BannerBooking.starts_at < ends_at, BannerBooking.ends_at >= ends_at),
                    and_(BannerBooking.starts_at >= payload.starts_at, BannerBooking.ends_at <= ends_at)
                )
            )
        )
    )
    
    max_allowed = pos_config.get("max_active", 3)
    if overlap_count >= max_allowed:
        raise HTTPException(status_code=400, detail=f"This slot is fully booked for the selected period (max {max_allowed})")
    
    # Fixed 30-day price
    price = round(pos_config.get("price", pos_config.get("price_30d", 150.0)), 2)
    
    # Lock user row and check balance
    user_result = await db.execute(
        select(User).where(User.id == current_user.id).with_for_update()
    )
    user = user_result.scalar_one()
    
    if (user.balance or 0) < price:
        raise HTTPException(
            status_code=400,
            detail=f"Insufficient balance. Slot costs ${price:.2f}. Your balance: ${user.balance:.2f}"
        )
    
    # Deduct balance
    user.balance = round((user.balance or 0) - (price), 2)
    
    # Create booking
    booking = BannerBooking(
        user_id=current_user.id,
        title=payload.title,
        subtitle=payload.subtitle,
        image_url=payload.image_url,
        link=payload.link,
        link_text=payload.link_text,
        gradient_from=payload.gradient_from,
        gradient_to=payload.gradient_to,
        position=payload.position,
        starts_at=payload.starts_at,
        ends_at=ends_at,
        price_paid=price,
        duration_days=payload.duration_days,
        status="pending",
        is_approved=False
    )
    db.add(booking)
    await db.commit()
    await db.refresh(booking)
    
    return {
        "message": f"Banner slot booked! Awaiting admin approval. ${price:.2f} deducted from your balance.",
        "booking_id": booking.id,
        "price_paid": price,
        "balance": user.balance,
        "status": "pending"
    }


@router.get("/my-bookings", response_model=List[BannerBookingSchema])
async def list_my_bookings(
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """List current user's banner bookings"""
    result = await db.execute(
        select(BannerBooking)
        .where(BannerBooking.user_id == current_user.id)
        .order_by(BannerBooking.created_at.desc())
    )
    bookings = result.scalars().all()
    return [
        BannerBookingSchema(
            **{c.key: getattr(b, c.key) for c in BannerBooking.__table__.columns},
            user_display_name=current_user.display_name,
            user_shop_name=current_user.shop_name
        )
        for b in bookings
    ]


@router.post("/my-bookings/{booking_id}/upload")
async def upload_booking_image(
    booking_id: int,
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Upload image for a booking (owner only)"""
    result = await db.execute(
        select(BannerBooking).where(
            BannerBooking.id == booking_id,
            BannerBooking.user_id == current_user.id
        )
    )
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    MAX_SIZE = 5 * 1024 * 1024
    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=413, detail="File too large (max 5MB)")
    
    ext = (file.filename or "banner.gif").rsplit(".", 1)[-1].lower()
    if ext not in ("gif", "png", "jpg", "jpeg", "webp"):
        raise HTTPException(status_code=400, detail="Only GIF/PNG/JPG/WebP allowed")
    
    os.makedirs(BANNERS_DIR, exist_ok=True)
    filename = f"booking_{booking_id}.{ext}"
    filepath = os.path.join(BANNERS_DIR, filename)
    
    # Remove old
    for old_ext in ("gif", "png", "jpg", "jpeg", "webp"):
        old_path = os.path.join(BANNERS_DIR, f"booking_{booking_id}.{old_ext}")
        if os.path.exists(old_path) and old_path != filepath:
            os.remove(old_path)
    
    with open(filepath, "wb") as f:
        f.write(content)
    
    booking.image_url = f"/api/banners/images/{filename}"
    await db.commit()
    
    return {"message": "Image uploaded", "image_url": booking.image_url}


# ============ Admin Booking Management ============

@router.get("/admin/bookings", response_model=List[BannerBookingSchema])
async def list_all_bookings(
    status: Optional[str] = None,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """List all banner bookings (admin only)"""
    query = select(BannerBooking).order_by(BannerBooking.created_at.desc())
    if status:
        query = query.where(BannerBooking.status == status)
    
    result = await db.execute(query)
    bookings = result.scalars().all()
    
    # Fetch user info
    user_ids = list(set(b.user_id for b in bookings))
    if user_ids:
        users_result = await db.execute(select(User).where(User.id.in_(user_ids)))
        users_map = {u.id: u for u in users_result.scalars().all()}
    else:
        users_map = {}
    
    return [
        BannerBookingSchema(
            **{c.key: getattr(b, c.key) for c in BannerBooking.__table__.columns},
            user_display_name=users_map.get(b.user_id, {}).display_name if users_map.get(b.user_id) else None,
            user_shop_name=users_map.get(b.user_id, {}).shop_name if users_map.get(b.user_id) else None
        )
        for b in bookings
    ]


@router.put("/admin/bookings/{booking_id}")
async def update_booking(
    booking_id: int,
    payload: BannerBookingUpdate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Update a banner booking (admin only)"""
    result = await db.execute(select(BannerBooking).where(BannerBooking.id == booking_id))
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    update_data = payload.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(booking, field, value)
    
    await db.commit()
    await db.refresh(booking)
    
    return {"message": "Booking updated", "booking_id": booking.id, "is_approved": booking.is_approved, "status": booking.status}


@router.delete("/admin/bookings/{booking_id}")
async def delete_booking(
    booking_id: int,
    refund: bool = Query(False),
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Delete/cancel a booking (admin only), optionally refund"""
    result = await db.execute(select(BannerBooking).where(BannerBooking.id == booking_id))
    booking = result.scalar_one_or_none()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    
    if refund and booking.price_paid > 0:
        user_result = await db.execute(select(User).where(User.id == booking.user_id).with_for_update())
        user = user_result.scalar_one_or_none()
        if user:
            user.balance = round((user.balance or 0) + (booking.price_paid), 2)
    
    # Delete image if exists
    if booking.image_url and "booking_" in booking.image_url:
        filename = booking.image_url.split("/")[-1]
        filepath = os.path.join(BANNERS_DIR, filename)
        if os.path.exists(filepath):
            os.remove(filepath)
    
    await db.delete(booking)
    await db.commit()
    
    return {"message": f"Booking deleted{' and refunded' if refund else ''}"}


class SlotConfigUpdate(BaseModel):
    enabled: Optional[bool] = None
    positions: Optional[dict] = None

    class Config:
        extra = "forbid"


@router.put("/admin/slots/config")
async def update_slot_config(
    config: SlotConfigUpdate,
    current_user: User = Depends(get_current_admin),
    db: AsyncSession = Depends(get_db)
):
    """Update banner slot pricing configuration (admin only)"""
    result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = result.scalar_one_or_none()
    if not settings:
        settings = AppSettings(id=1)
        db.add(settings)
    
    if config.enabled is not None:
        if not isinstance(config.enabled, bool):
            raise HTTPException(status_code=400, detail="'enabled' must be a boolean")
        settings.banner_slots_enabled = config.enabled
    if config.positions is not None:
        # Validate position structure
        for pos_name, pos_data in config.positions.items():
            if not isinstance(pos_name, str) or len(pos_name) > 50:
                raise HTTPException(status_code=400, detail=f"Invalid position name: {pos_name}")
            if isinstance(pos_data, dict):
                price = pos_data.get("price", 0)
                max_active = pos_data.get("max_active", 1)
                if not isinstance(price, (int, float)) or price < 0 or price > 100000:
                    raise HTTPException(status_code=400, detail=f"Invalid price for position '{pos_name}'")
                if not isinstance(max_active, int) or max_active < 1 or max_active > 100:
                    raise HTTPException(status_code=400, detail=f"Invalid max_active for position '{pos_name}'")
        settings.banner_slot_pricing = json.dumps(config.positions)
    
    await db.commit()
    
    return {"message": "Slot config updated"}

