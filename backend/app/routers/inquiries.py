"""Pre-sale Inquiries Router - Chat between buyer and seller before purchase"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, and_, func
from sqlalchemy.orm import selectinload
from typing import List, Optional
from datetime import datetime
from pydantic import BaseModel, Field

from app.database import get_db
from app.models import ProductInquiry, InquiryMessage, Product, User, UserRole
from app.auth import get_current_active_user
from app.rate_limit import limiter

router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════════════
# SCHEMAS
# ═══════════════════════════════════════════════════════════════════════════════

class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)

class MessageOut(BaseModel):
    id: int
    sender_id: int
    sender_username: Optional[str] = None
    sender_avatar: Optional[str] = None
    content: str
    is_read: bool
    created_at: datetime

    class Config:
        from_attributes = True

class InquiryOut(BaseModel):
    id: int
    product_id: int
    product_name: str
    product_image: Optional[str] = None
    buyer_id: int
    buyer_username: Optional[str] = None
    buyer_avatar: Optional[str] = None
    seller_id: int
    seller_username: Optional[str] = None
    seller_avatar: Optional[str] = None
    is_active: bool
    last_message_at: datetime
    created_at: datetime
    unread_count: int = 0
    last_message: Optional[str] = None

    class Config:
        from_attributes = True


# ═══════════════════════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/products/{product_id}/inquiry")
async def start_or_get_inquiry(
    product_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Start a new inquiry or get existing one for a product"""
    # Get the product
    result = await db.execute(
        select(Product).options(selectinload(Product.seller)).where(Product.id == product_id)
    )
    product = result.scalar_one_or_none()
    
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    
    if product.seller_id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot inquire about your own product")
    
    # Check for existing inquiry
    result = await db.execute(
        select(ProductInquiry).where(
            ProductInquiry.product_id == product_id,
            ProductInquiry.buyer_id == current_user.id
        )
    )
    inquiry = result.scalar_one_or_none()
    
    if not inquiry:
        # Create new inquiry
        inquiry = ProductInquiry(
            product_id=product_id,
            buyer_id=current_user.id,
            seller_id=product.seller_id
        )
        db.add(inquiry)
        await db.commit()
        await db.refresh(inquiry)
    
    return {"inquiry_id": inquiry.id}


@router.get("", response_model=List[InquiryOut])
async def list_inquiries(
    role: Optional[str] = Query(None, description="'buyer' or 'seller' to filter"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """List all inquiries for the current user (as buyer or seller)"""
    if role == "buyer":
        query = select(ProductInquiry).where(ProductInquiry.buyer_id == current_user.id)
    elif role == "seller":
        query = select(ProductInquiry).where(ProductInquiry.seller_id == current_user.id)
    else:
        query = select(ProductInquiry).where(
            or_(
                ProductInquiry.buyer_id == current_user.id,
                ProductInquiry.seller_id == current_user.id
            )
        )
    
    query = query.options(
        selectinload(ProductInquiry.product),
        selectinload(ProductInquiry.buyer),
        selectinload(ProductInquiry.seller),
        selectinload(ProductInquiry.messages)
    ).order_by(ProductInquiry.last_message_at.desc())
    
    result = await db.execute(query)
    inquiries = result.scalars().all()
    
    out = []
    for inq in inquiries:
        # Count unread messages
        unread = sum(1 for m in inq.messages if not m.is_read and m.sender_id != current_user.id)
        last_msg = inq.messages[-1].content if inq.messages else None
        
        out.append(InquiryOut(
            id=inq.id,
            product_id=inq.product_id,
            product_name=inq.product.name if inq.product else "Deleted Product",
            product_image=inq.product.image_url if inq.product else None,
            buyer_id=inq.buyer_id,
            buyer_username=inq.buyer.username if inq.buyer else None,
            buyer_avatar=inq.buyer.avatar_url if inq.buyer else None,
            seller_id=inq.seller_id,
            seller_username=inq.seller.username if inq.seller else None,
            seller_avatar=inq.seller.avatar_url if inq.seller else None,
            is_active=inq.is_active,
            last_message_at=inq.last_message_at,
            created_at=inq.created_at,
            unread_count=unread,
            last_message=last_msg[:50] + "..." if last_msg and len(last_msg) > 50 else last_msg
        ))
    
    return out


@router.get("/unread-count")
async def get_unread_count(
    role: Optional[str] = Query(None, description="'buyer' or 'seller' to filter"),
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get total unread inquiry messages count"""
    if role == "buyer":
        query = select(ProductInquiry).where(ProductInquiry.buyer_id == current_user.id)
    elif role == "seller":
        query = select(ProductInquiry).where(ProductInquiry.seller_id == current_user.id)
    else:
        query = select(ProductInquiry).where(
            or_(
                ProductInquiry.buyer_id == current_user.id,
                ProductInquiry.seller_id == current_user.id
            )
        )

    result = await db.execute(query.options(selectinload(ProductInquiry.messages)))
    inquiries = result.scalars().all()

    total_unread = 0
    for inq in inquiries:
        unread = sum(1 for m in inq.messages if not m.is_read and m.sender_id != current_user.id)
        total_unread += unread

    return {"count": total_unread}


@router.get("/{inquiry_id}", response_model=InquiryOut)
async def get_inquiry(
    inquiry_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get inquiry details"""
    result = await db.execute(
        select(ProductInquiry)
        .options(
            selectinload(ProductInquiry.product),
            selectinload(ProductInquiry.buyer),
            selectinload(ProductInquiry.seller),
            selectinload(ProductInquiry.messages)
        )
        .where(ProductInquiry.id == inquiry_id)
    )
    inq = result.scalar_one_or_none()
    
    if not inq:
        raise HTTPException(status_code=404, detail="Inquiry not found")
    
    if inq.buyer_id != current_user.id and inq.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    unread = sum(1 for m in inq.messages if not m.is_read and m.sender_id != current_user.id)
    last_msg = inq.messages[-1].content if inq.messages else None
    
    return InquiryOut(
        id=inq.id,
        product_id=inq.product_id,
        product_name=inq.product.name if inq.product else "Deleted Product",
        product_image=inq.product.image_url if inq.product else None,
        buyer_id=inq.buyer_id,
        buyer_username=inq.buyer.username if inq.buyer else None,
        buyer_avatar=inq.buyer.avatar_url if inq.buyer else None,
        seller_id=inq.seller_id,
        seller_username=inq.seller.username if inq.seller else None,
        seller_avatar=inq.seller.avatar_url if inq.seller else None,
        is_active=inq.is_active,
        last_message_at=inq.last_message_at,
        created_at=inq.created_at,
        unread_count=unread,
        last_message=last_msg[:50] + "..." if last_msg and len(last_msg) > 50 else last_msg
    )


@router.get("/{inquiry_id}/messages", response_model=List[MessageOut])
async def get_inquiry_messages(
    inquiry_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Get all messages in an inquiry"""
    result = await db.execute(
        select(ProductInquiry).where(ProductInquiry.id == inquiry_id)
    )
    inq = result.scalar_one_or_none()
    
    if not inq:
        raise HTTPException(status_code=404, detail="Inquiry not found")
    
    if inq.buyer_id != current_user.id and inq.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    # Mark messages as read
    await db.execute(
        select(InquiryMessage).where(
            InquiryMessage.inquiry_id == inquiry_id,
            InquiryMessage.sender_id != current_user.id,
            InquiryMessage.is_read == False
        )
    )
    result = await db.execute(
        select(InquiryMessage)
        .options(selectinload(InquiryMessage.sender))
        .where(InquiryMessage.inquiry_id == inquiry_id)
        .order_by(InquiryMessage.created_at)
    )
    messages = result.scalars().all()
    
    # Mark as read
    for msg in messages:
        if msg.sender_id != current_user.id and not msg.is_read:
            msg.is_read = True
    await db.commit()
    
    return [
        MessageOut(
            id=m.id,
            sender_id=m.sender_id,
            sender_username=m.sender.username if m.sender else None,
            sender_avatar=m.sender.avatar_url if m.sender else None,
            content=m.content,
            is_read=m.is_read,
            created_at=m.created_at
        )
        for m in messages
    ]


@router.post("/{inquiry_id}/messages", response_model=MessageOut)
@limiter.limit("30/minute")
async def send_inquiry_message(
    request: Request,
    inquiry_id: int,
    data: MessageCreate,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Send a message in an inquiry"""
    result = await db.execute(
        select(ProductInquiry).where(ProductInquiry.id == inquiry_id)
    )
    inq = result.scalar_one_or_none()
    
    if not inq:
        raise HTTPException(status_code=404, detail="Inquiry not found")
    
    if inq.buyer_id != current_user.id and inq.seller_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized")
    
    if not inq.is_active:
        raise HTTPException(status_code=400, detail="This inquiry is closed")
    
    content = data.content.strip()
    if not content:
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    if len(content) > 2000:
        raise HTTPException(status_code=400, detail="Message too long (max 2000 chars)")
    
    msg = InquiryMessage(
        inquiry_id=inquiry_id,
        sender_id=current_user.id,
        content=content
    )
    db.add(msg)
    
    # Update last message timestamp
    inq.last_message_at = datetime.utcnow()
    
    await db.commit()
    await db.refresh(msg)
    
    return MessageOut(
        id=msg.id,
        sender_id=msg.sender_id,
        sender_username=current_user.username,
        sender_avatar=current_user.avatar_url,
        content=msg.content,
        is_read=False,
        created_at=msg.created_at
    )


@router.post("/{inquiry_id}/close")
async def close_inquiry(
    inquiry_id: int,
    current_user: User = Depends(get_current_active_user),
    db: AsyncSession = Depends(get_db)
):
    """Close an inquiry (seller only)"""
    result = await db.execute(
        select(ProductInquiry).where(ProductInquiry.id == inquiry_id)
    )
    inq = result.scalar_one_or_none()
    
    if not inq:
        raise HTTPException(status_code=404, detail="Inquiry not found")
    
    if inq.seller_id != current_user.id and current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Only seller can close inquiry")
    
    inq.is_active = False
    await db.commit()
    
    return {"message": "Inquiry closed"}


# Note: /inquiries/unread-count moved above /inquiries/{inquiry_id} to avoid route shadowing
