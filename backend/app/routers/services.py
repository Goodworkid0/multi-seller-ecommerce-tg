"""Services Router - CRUD for freelance services"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, func
from sqlalchemy.orm import selectinload
from typing import Optional

from app.database import get_db
from app.auth import get_current_active_user
from app.models import User, Service, UserRole
from app.rate_limit import limiter
from fastapi import Request

router = APIRouter(prefix="/api/services", tags=["services"])


# ─── Schemas ─────────────────────────────────────────────────────────────────
from pydantic import BaseModel, Field, field_validator
import re

DELIVERY_TIME_PATTERN = re.compile(r'^(instant|\d+\s*(minute|hour|day|week)s?)$', re.IGNORECASE)

class ServiceCreate(BaseModel):
    title: str = Field(min_length=3, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    category: str = "other"
    price: float = Field(gt=0, le=100000)
    delivery_time: str = Field(default="1 day", max_length=50)
    is_active: bool = True
    
    @field_validator('delivery_time')
    @classmethod
    def validate_delivery_time(cls, v):
        if not DELIVERY_TIME_PATTERN.match(v.strip()):
            raise ValueError('Invalid delivery time format. Use: "instant", "1 hour", "2 days", "1 week", etc.')
        # Check upper bound (max 365 days)
        match = re.match(r'^(\d+)\s*(minute|hour|day|week)s?$', v.strip(), re.IGNORECASE)
        if match:
            num = int(match.group(1))
            unit = match.group(2).lower()
            max_values = {'minute': 60*24*365, 'hour': 24*365, 'day': 365, 'week': 52}
            if num > max_values.get(unit, 365):
                raise ValueError(f'Delivery time too long. Maximum is {max_values[unit]} {unit}s.')
        return v.strip()

class ServiceUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=3, max_length=200)
    description: Optional[str] = Field(default=None, max_length=5000)
    category: Optional[str] = None
    price: Optional[float] = Field(default=None, gt=0, le=100000)
    delivery_time: Optional[str] = Field(default=None, max_length=50)
    is_active: Optional[bool] = None
    
    @field_validator('delivery_time')
    @classmethod
    def validate_delivery_time(cls, v):
        if v is not None and not DELIVERY_TIME_PATTERN.match(v.strip()):
            raise ValueError('Invalid delivery time format. Use: "instant", "1 hour", "2 days", "1 week", etc.')
        return v.strip() if v else v


# ─── Public Endpoints ────────────────────────────────────────────────────────

@router.get("")
async def list_services(
    category: Optional[str] = None,
    search: Optional[str] = None,
    sort: str = "newest",
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """List all active services (public, paginated)"""
    query = select(Service).options(selectinload(Service.seller)).where(Service.is_active == True)
    
    if category:
        query = query.where(Service.category == category)
    
    if search:
        escaped = search.replace("%", r"\%").replace("_", r"\_")
        query = query.where(Service.title.ilike(f"%{escaped}%", escape='\\'))
    
    # Total count
    total = await db.scalar(select(func.count()).select_from(query.with_only_columns(Service.id).subquery()))

    if sort == "price_low":
        query = query.order_by(Service.price.asc())
    elif sort == "price_high":
        query = query.order_by(Service.price.desc())
    elif sort == "rating":
        query = query.order_by(Service.rating.desc())
    else:  # newest
        query = query.order_by(Service.created_at.desc())
    
    query = query.offset((page - 1) * limit).limit(limit)
    result = await db.execute(query)
    services = result.scalars().all()
    
    return {
        "items": [{
            "id": s.id,
            "title": s.title,
            "description": s.description,
            "category": s.category,
            "price": s.price,
            "delivery_time": s.delivery_time,
            "rating": s.rating,
            "review_count": s.review_count,
            "orders_count": s.orders_count,
            "seller_id": s.seller_id,
            "seller_name": s.seller.shop_name or s.seller.username or "Seller",
            "created_at": s.created_at.isoformat() if s.created_at else None
        } for s in services],
        "total": total,
        "page": page,
        "pages": max(1, -(-total // limit)),
    }


@router.get("/categories")
async def get_service_categories(db: AsyncSession = Depends(get_db)):
    """Get all service categories with counts (from database)"""
    from sqlalchemy import func
    from app.models import ServiceCategory

    # Get all categories from DB
    cat_result = await db.execute(
        select(ServiceCategory).order_by(ServiceCategory.sort_order.asc(), ServiceCategory.name.asc())
    )
    db_categories = cat_result.scalars().all()

    # Get counts per category slug
    count_result = await db.execute(
        select(Service.category, func.count(Service.id))
        .where(Service.is_active == True)
        .group_by(Service.category)
    )
    counts = dict(count_result.all())

    # Build response
    categories = []
    for cat in db_categories:
        count = counts.get(cat.slug, 0)
        categories.append({
            "id": cat.slug,
            "name": cat.name,
            "icon": cat.icon or "briefcase",
            "count": count
        })

    return categories


# ─── Seller Endpoints (must be before /{service_id}) ─────────────────────────

@router.get("/my")
async def get_my_services(
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all services for current seller"""
    if not user.shop_name:
        raise HTTPException(status_code=403, detail="Seller account required")
    
    result = await db.execute(
        select(Service)
        .where(Service.seller_id == user.id)
        .order_by(Service.created_at.desc())
    )
    services = result.scalars().all()
    
    return [{
        "id": s.id,
        "title": s.title,
        "description": s.description,
        "category": s.category,
        "price": s.price,
        "delivery_time": s.delivery_time,
        "is_active": s.is_active,
        "rating": s.rating,
        "review_count": s.review_count,
        "orders_count": s.orders_count,
        "created_at": s.created_at.isoformat() if s.created_at else None
    } for s in services]


# ─── Public Detail Endpoint ──────────────────────────────────────────────────

@router.get("/{service_id}")
async def get_service(service_id: int, db: AsyncSession = Depends(get_db)):
    """Get service details (public)"""
    result = await db.execute(
        select(Service).options(selectinload(Service.seller)).where(Service.id == service_id)
    )
    service = result.scalar_one_or_none()
    
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    # Hide inactive services from public
    if not service.is_active:
        raise HTTPException(status_code=404, detail="Service not found")
    
    return {
        "id": service.id,
        "title": service.title,
        "description": service.description,
        "category": service.category,
        "price": service.price,
        "delivery_time": service.delivery_time,
        "is_active": service.is_active,
        "rating": service.rating,
        "review_count": service.review_count,
        "orders_count": service.orders_count,
        "seller_id": service.seller_id,
        "seller_name": service.seller.shop_name or service.seller.username or "Seller",
        "created_at": service.created_at.isoformat() if service.created_at else None
    }


# ─── Service CRUD Endpoints ──────────────────────────────────────────────────


@router.post("")
@limiter.limit("5/minute")
async def create_service(
    request: Request,
    data: ServiceCreate,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Create a new service. Free tier limited to 1 service."""
    if not user.shop_name:
        raise HTTPException(status_code=403, detail="Set up your shop first (Settings > Upgrade)")
    
    # Enforce service limit for free tier (rank 0)
    seller_rank = user.seller_rank or 0
    if seller_rank == 0 and user.role != UserRole.ADMIN:
        service_count = await db.scalar(
            select(func.count()).select_from(Service).where(Service.seller_id == user.id)
        )
        if service_count >= 1:
            raise HTTPException(
                status_code=403,
                detail="Free sellers can list 1 service. Upgrade your rank for unlimited services."
            )
    
    service = Service(
        seller_id=user.id,
        title=data.title,
        description=data.description,
        category=data.category,
        price=data.price,
        delivery_time=data.delivery_time,
        is_active=data.is_active
    )
    
    db.add(service)
    await db.commit()
    await db.refresh(service)
    
    return {"id": service.id, "message": "Service created"}


@router.put("/{service_id}")
@limiter.limit("10/minute")
async def update_service(
    request: Request,
    service_id: int,
    data: ServiceUpdate,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Update a service"""
    result = await db.execute(
        select(Service).where(and_(Service.id == service_id, Service.seller_id == user.id))
    )
    service = result.scalar_one_or_none()
    
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    if data.title is not None:
        service.title = data.title
    if data.description is not None:
        service.description = data.description
    if data.category is not None:
        service.category = data.category
    if data.price is not None:
        service.price = data.price
    if data.delivery_time is not None:
        service.delivery_time = data.delivery_time
    if data.is_active is not None:
        service.is_active = data.is_active
    
    await db.commit()
    
    return {"message": "Service updated"}


@router.patch("/{service_id}/toggle")
@limiter.limit("10/minute")
async def toggle_service(
    request: Request,
    service_id: int,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Toggle service active status"""
    result = await db.execute(
        select(Service).where(and_(Service.id == service_id, Service.seller_id == user.id))
    )
    service = result.scalar_one_or_none()
    
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    service.is_active = not service.is_active
    await db.commit()
    
    return {"is_active": service.is_active}


@router.delete("/{service_id}")
@limiter.limit("10/minute")
async def delete_service(
    request: Request,
    service_id: int,
    user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Delete a service"""
    result = await db.execute(
        select(Service).where(and_(Service.id == service_id, Service.seller_id == user.id))
    )
    service = result.scalar_one_or_none()
    
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")
    
    await db.delete(service)
    await db.commit()
    
    return {"message": "Service deleted"}
