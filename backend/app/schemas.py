"""Pydantic Schemas"""
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import Optional, List
from datetime import datetime
import re
from app.models import UserRole, ProductType, OrderStatus, DisputeStatus, MiddlemanStatus

_SAFE_URL_RE = re.compile(r'^(https?://|/)')

def _validate_url_protocol(v):
    """Reject javascript:, data:, and other dangerous URL protocols."""
    if v is not None and v != '' and not _SAFE_URL_RE.match(v):
        raise ValueError('URL must start with http://, https://, or /')
    return v


# ============ User Schemas ============

class UserBase(BaseModel):
    telegram_id: str
    username: Optional[str] = None
    first_name: Optional[str] = None

class UserCreate(UserBase):
    pass

class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    other_contact: Optional[str] = Field(None, max_length=200)
    first_name: Optional[str] = Field(None, max_length=64)
    avatar_url: Optional[str] = Field(None, max_length=500)
    shop_name: Optional[str] = Field(None, max_length=50)
    shop_description: Optional[str] = Field(None, max_length=2000)
    shop_image: Optional[str] = Field(None, max_length=500)
    auto_response: Optional[str] = Field(None, max_length=500)

    @field_validator('avatar_url', 'shop_image', mode='before')
    @classmethod
    def validate_urls(cls, v):
        return _validate_url_protocol(v)

class UserContactUpdate(BaseModel):
    email: Optional[EmailStr] = None
    other_contact: Optional[str] = Field(None, max_length=200)

class User(UserBase):
    id: int
    role: UserRole
    is_active: bool
    is_banned: bool = False
    ban_reason: Optional[str] = None
    balance: float = 0.0
    pending_balance: float = 0.0
    escrow_balance: float = 0.0
    uses_custom_handle: bool = False
    email: Optional[EmailStr] = None
    other_contact: Optional[str] = None
    avatar_url: Optional[str] = None
    created_at: datetime
    shop_name: Optional[str] = None
    shop_description: Optional[str] = None
    seller_expires_at: Optional[datetime] = None
    featured_expires_at: Optional[datetime] = None
    seller_rank: int = 0
    collateral: float = 0.0
    total_sales: int = 0
    rep_positive: int = 0
    rep_negative: int = 0
    has_pin: bool = False
    warning_count: int = 0
    restricted_until: Optional[datetime] = None
    notification_prefs: Optional[dict] = None

    @field_validator('notification_prefs', mode='before')
    @classmethod
    def parse_notification_prefs(cls, v):
        if v is None:
            return None
        if isinstance(v, str):
            import json
            try:
                return json.loads(v)
            except Exception:
                return None
        return v
    
    # Handle NULL values from database
    @field_validator('uses_custom_handle', mode='before')
    @classmethod
    def default_uses_custom_handle(cls, v):
        return v if v is not None else False
    
    @field_validator('is_banned', mode='before')
    @classmethod
    def default_is_banned(cls, v):
        return v if v is not None else False
    
    @field_validator('collateral', mode='before')
    @classmethod
    def default_collateral(cls, v):
        return v if v is not None else 0.0
    
    @field_validator('total_sales', mode='before')
    @classmethod
    def default_total_sales(cls, v):
        return v if v is not None else 0
    
    @field_validator('seller_rank', mode='before')
    @classmethod
    def default_seller_rank_user(cls, v):
        return v if v is not None else 0
    
    @field_validator('rep_positive', mode='before')
    @classmethod
    def default_rep_positive(cls, v):
        return v if v is not None else 0
    
    @field_validator('rep_negative', mode='before')
    @classmethod
    def default_rep_negative(cls, v):
        return v if v is not None else 0
    
    @field_validator('warning_count', mode='before')
    @classmethod
    def default_warning_count(cls, v):
        return v if v is not None else 0
    
    class Config:
        from_attributes = True

class PublicSellerProfile(BaseModel):
    """Public-facing seller profile — excludes balance, email, telegram_id, etc."""
    id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    avatar_url: Optional[str] = None
    role: UserRole
    is_active: bool
    is_banned: bool = False
    created_at: datetime
    shop_name: Optional[str] = None
    shop_description: Optional[str] = None
    shop_image: Optional[str] = None
    auto_response: Optional[str] = None
    collateral: float = 0.0
    is_featured: bool = False
    featured_expires_at: Optional[datetime] = None
    seller_expires_at: Optional[datetime] = None
    seller_rank: int = 0
    seller_rating: float = 0.0
    seller_review_count: int = 0
    total_sales: int = 0
    rep_positive: int = 0
    rep_negative: int = 0

    @field_validator('is_banned', mode='before')
    @classmethod
    def default_is_banned_pub(cls, v):
        return v if v is not None else False

    @field_validator('is_featured', mode='before')
    @classmethod
    def default_is_featured_pub(cls, v):
        return v if v is not None else False

    @field_validator('seller_rank', mode='before')
    @classmethod
    def default_seller_rank_pub(cls, v):
        return v if v is not None else 0

    @field_validator('seller_rating', mode='before')
    @classmethod
    def default_seller_rating_pub(cls, v):
        return v if v is not None else 0.0

    @field_validator('seller_review_count', mode='before')
    @classmethod
    def default_seller_review_count_pub(cls, v):
        return v if v is not None else 0

    @field_validator('collateral', mode='before')
    @classmethod
    def default_collateral_pub(cls, v):
        return v if v is not None else 0.0

    @field_validator('total_sales', mode='before')
    @classmethod
    def default_total_sales_pub(cls, v):
        return v if v is not None else 0

    @field_validator('rep_positive', mode='before')
    @classmethod
    def default_rep_positive_pub(cls, v):
        return v if v is not None else 0

    @field_validator('rep_negative', mode='before')
    @classmethod
    def default_rep_negative_pub(cls, v):
        return v if v is not None else 0

    class Config:
        from_attributes = True


class SellerProfile(User):
    shop_description: Optional[str] = None
    shop_image: Optional[str] = None
    auto_response: Optional[str] = None
    collateral: float = 0.0
    is_featured: bool = False
    featured_expires_at: Optional[datetime] = None
    seller_expires_at: Optional[datetime] = None
    seller_rank: int = 0
    seller_rating: float = 0.0
    seller_review_count: int = 0
    total_sales: int = 0
    
    # Handle NULL values from database
    @field_validator('is_featured', mode='before')
    @classmethod
    def default_is_featured(cls, v):
        return v if v is not None else False
    
    @field_validator('seller_rank', mode='before')
    @classmethod
    def default_seller_rank(cls, v):
        return v if v is not None else 0
    
    @field_validator('seller_rating', mode='before')
    @classmethod
    def default_seller_rating(cls, v):
        return v if v is not None else 0.0
    
    @field_validator('seller_review_count', mode='before')
    @classmethod
    def default_seller_review_count(cls, v):
        return v if v is not None else 0


# ============ Category Schemas ============

class CategoryBase(BaseModel):
    name: str
    slug: str
    icon: Optional[str] = None
    image_url: Optional[str] = None
    parent_id: Optional[int] = None

class CategoryCreate(CategoryBase):
    pass

class CategoryUpdate(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    icon: Optional[str] = None
    image_url: Optional[str] = None
    parent_id: Optional[int] = None

class Category(CategoryBase):
    id: int
    
    class Config:
        from_attributes = True


# ============ Product Schemas ============

class BulkDiscount(BaseModel):
    min_qty: int = Field(ge=2, le=10000)
    discount_pct: float = Field(gt=0, lt=100)

class ProductBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=5000)
    product_type: ProductType = ProductType.GAME_KEY
    price: float = Field(gt=0, le=100000)
    bulk_discounts: Optional[List[BulkDiscount]] = Field(None, max_length=10)
    image_url: Optional[str] = Field(None, max_length=500)
    game_name: Optional[str] = Field(None, max_length=200)
    platform: Optional[str] = Field(None, max_length=50)  # legacy single-tag
    tags: Optional[List[str]] = Field(None, max_length=5)  # up to 5 tags
    region: str = Field("Global", max_length=50)
    warranty_hours: int = Field(48, ge=0, le=720)
    category_id: Optional[int] = None
    subcategory_id: Optional[int] = None

    @field_validator('image_url', mode='before')
    @classmethod
    def validate_image_url(cls, v):
        return _validate_url_protocol(v)

class ProductCreate(ProductBase):
    pass

class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = Field(None, min_length=1, max_length=5000)
    price: Optional[float] = Field(None, gt=0, le=100000)
    bulk_discounts: Optional[List[BulkDiscount]] = Field(None, max_length=10)
    image_url: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None
    subcategory_id: Optional[int] = None
    tags: Optional[List[str]] = Field(None, max_length=5)
    warranty_hours: Optional[int] = Field(None, ge=0, le=720)

class Product(ProductBase):
    id: int
    seller_id: int
    stock_count: int
    is_active: bool
    sales_count: int
    rating: float
    review_count: int
    created_at: datetime

    @field_validator('bulk_discounts', mode='before')
    @classmethod
    def parse_bulk_discounts(cls, v):
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v

    @field_validator('tags', mode='before')
    @classmethod
    def parse_tags(cls, v):
        if isinstance(v, str):
            import json
            return json.loads(v)
        return v
    
    class Config:
        from_attributes = True

class ProductDetail(Product):
    seller: Optional[SellerProfile] = None
    category: Optional[Category] = None
    subcategory: Optional[Category] = None

class ProductList(BaseModel):
    items: List[Product]
    total: int
    page: int
    pages: int


# ============ Product Key Schemas ============

class ProductKeyCreate(BaseModel):
    key_value: str

class ProductKeyBulkCreate(BaseModel):
    keys: List[str] = Field(max_length=5000)


# ============ Product Variant Schemas ============

class ProductVariantCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    price: float = Field(ge=0)
    
class ProductVariantUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=100)
    price: Optional[float] = Field(None, ge=0)
    is_active: Optional[bool] = None

class ProductVariant(BaseModel):
    id: int
    product_id: int
    name: str
    price: float
    stock_count: int = 0
    is_active: bool = True
    created_at: datetime
    
    class Config:
        from_attributes = True


# ============ Order Schemas ============

class OrderItemCreate(BaseModel):
    product_id: int
    quantity: int = Field(1, ge=1, le=1000)
    variant_id: Optional[int] = None  # Optional variant for the product

class OrderCreate(BaseModel):
    items: List[OrderItemCreate] = Field(min_length=1, max_length=50)

class DeliveredKey(BaseModel):
    id: int
    key_value: str
    
    class Config:
        from_attributes = True

class AuctionMini(BaseModel):
    """Minimal auction info for order items"""
    id: int
    title: str
    image_url: Optional[str] = None
    
    class Config:
        from_attributes = True

class OrderItem(BaseModel):
    id: int
    product_id: Optional[int] = None
    auction_id: Optional[int] = None
    seller_id: Optional[int] = None
    variant_id: Optional[int] = None
    quantity: int
    price: float
    product: Optional[Product] = None
    auction: Optional[AuctionMini] = None
    variant: Optional[ProductVariant] = None
    delivered_keys: Optional[List[DeliveredKey]] = None
    
    class Config:
        from_attributes = True

class Order(BaseModel):
    id: int
    buyer_id: int
    total_amount: float
    status: OrderStatus
    created_at: datetime
    paid_at: Optional[datetime]
    delivered_at: Optional[datetime]
    auto_complete_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    is_buyer_confirmed: bool = False
    items: List[OrderItem] = []
    
    class Config:
        from_attributes = True


# ============ Review Schemas ============

class ReviewCreate(BaseModel):
    product_id: int
    rating: int = Field(ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=2000)
    order_id: Optional[int] = None

class ReviewProduct(BaseModel):
    """Minimal product info for review display"""
    id: int
    name: str
    
    class Config:
        from_attributes = True

class Review(BaseModel):
    id: int
    product_id: int
    reviewer_id: int
    order_id: Optional[int] = None
    rating: int
    comment: Optional[str]
    created_at: datetime
    reviewer: Optional[User] = None
    product: Optional[ReviewProduct] = None
    
    class Config:
        from_attributes = True


# ============ Auth Schemas ============

class TelegramAuth(BaseModel):
    id: int
    first_name: str
    username: Optional[str] = None
    photo_url: Optional[str] = None
    auth_date: int
    hash: str

class Token(BaseModel):
    access_token: str
    refresh_token: Optional[str] = None
    token_type: str = "bearer"

class TokenData(BaseModel):
    telegram_id: Optional[str] = None


# ============ Stats Schemas ============

class SellerStats(BaseModel):
    total_products: int
    active_products: int
    total_orders: int
    pending_orders: int
    total_revenue: float
    balance: float
    pending_balance: float = 0
    escrow_balance: float = 0
    rating: float
    total_reviews: int = 0
    total_sales: int = 0
    escrow_amount: float = 0
    open_disputes: int = 0

class WithdrawalRequestCreate(BaseModel):
    amount: float = Field(gt=0, le=100000)
    destination: Optional[str] = Field(None, max_length=500)
    pin: str = Field(min_length=4, max_length=6, pattern=r'^\d{4,6}$')

class WithdrawalRequestSchema(BaseModel):
    id: int
    user_id: int
    amount: float
    fee_amount: Optional[float] = 0.0
    net_amount: Optional[float] = None
    destination: Optional[str] = None
    status: str
    admin_note: Optional[str] = None
    created_at: datetime
    processed_at: Optional[datetime] = None
    # Payout tracking
    payout_id: Optional[str] = None
    payout_status: Optional[str] = None
    payout_hash: Optional[str] = None
    payout_currency: Optional[str] = None
    payout_amount: Optional[float] = None
    payout_error: Optional[str] = None
    # Joined user info for admin views
    username: Optional[str] = None
    first_name: Optional[str] = None
    telegram_id: Optional[str] = None
    user_balance: Optional[float] = None

    class Config:
        from_attributes = True

class AdminStats(BaseModel):
    total_users: int
    total_sellers: int
    total_products: int
    total_orders: int
    total_revenue: float


# ============ Payments Schemas ============

class CreateCryptoDeposit(BaseModel):
    amount: float = Field(gt=0, le=1000000)
    pay_currency: str


class CryptoDepositResponse(BaseModel):
    deposit_id: int
    payment_id: Optional[str] = None
    pay_address: Optional[str] = None
    pay_amount: Optional[float] = None
    pay_currency: Optional[str] = None
    payment_status: str
    price_amount_usd: float


class CryptoDepositStatus(BaseModel):
    deposit_id: int
    payment_status: str
    confirmations: int = 0
    pay_address: Optional[str] = None
    pay_amount: Optional[float] = None
    pay_currency: Optional[str] = None
    price_amount_usd: float = 0.0
    is_credited: bool = False
    tx_hash: Optional[str] = None


class CryptoDepositItem(BaseModel):
    deposit_id: int
    payment_status: str
    confirmations: int = 0
    pay_amount: Optional[float] = None
    pay_currency: Optional[str] = None
    price_amount_usd: float = 0.0
    is_credited: bool = False
    tx_hash: Optional[str] = None
    created_at: datetime


class AdminCryptoDepositItem(CryptoDepositItem):
    user_id: int
    telegram_id: Optional[str] = None
    username: Optional[str] = None
    first_name: Optional[str] = None


class AdminMarkCreditedRequest(BaseModel):
    credited: bool = True


class OrderReviewInfo(BaseModel):
    rating: int
    comment: Optional[str] = None
    reviewer_username: Optional[str] = None
    created_at: datetime

class SellerOrderItem(BaseModel):
    order_id: int
    status: OrderStatus
    created_at: datetime
    paid_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    auto_complete_at: Optional[datetime] = None
    is_buyer_confirmed: bool = False
    product_id: int
    product_name: Optional[str] = None
    quantity: int
    price: float
    total: float
    buyer_username: Optional[str] = None
    buyer_first_name: Optional[str] = None
    has_dispute: bool = False
    review: Optional[OrderReviewInfo] = None


class AdminOrderItem(BaseModel):
    product_id: int
    product_name: Optional[str] = None
    seller_id: int
    seller_shop: Optional[str] = None
    quantity: int
    price: float


class AdminOrder(BaseModel):
    id: int
    buyer_id: int
    buyer_username: Optional[str] = None
    buyer_first_name: Optional[str] = None
    total_amount: float
    status: OrderStatus
    created_at: datetime
    paid_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    auto_complete_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    is_buyer_confirmed: bool = False
    has_dispute: bool = False
    items: List[AdminOrderItem] = []


# ============ Dispute Schemas ============

class DisputeCreate(BaseModel):
    reason: str = Field(min_length=10, max_length=2000)

class DisputeResolve(BaseModel):
    resolution: str
    action: str = "favor_seller"  # favor_seller, refund_buyer

class DisputeSchema(BaseModel):
    id: int
    order_id: int
    opened_by: int
    reason: str
    status: DisputeStatus
    resolution: Optional[str] = None
    resolved_by: Optional[int] = None
    created_at: datetime
    resolved_at: Optional[datetime] = None
    # Joined fields
    opener_username: Optional[str] = None
    opener_first_name: Optional[str] = None
    order_total: Optional[float] = None
    order_status: Optional[str] = None
    seller_username: Optional[str] = None

    class Config:
        from_attributes = True


# ============ Order Message Schemas ============

class OrderMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)

class OrderMessageSchema(BaseModel):
    id: int
    order_id: int
    sender_id: int
    content: str
    is_system: bool = False
    created_at: datetime
    sender_username: Optional[str] = None
    sender_first_name: Optional[str] = None
    sender_role: Optional[str] = None
    sender_label: Optional[str] = None  # buyer, seller, admin
    shop_name: Optional[str] = None

    class Config:
        from_attributes = True


class BannerBase(BaseModel):
    title: str
    subtitle: Optional[str] = None
    image_url: Optional[str] = None
    link: Optional[str] = None
    link_text: str = "Learn More"
    gradient_from: str = "primary-500"
    gradient_to: str = "accent-purple"
    position: str = "below_vouches"
    is_active: bool = True
    sort_order: int = 0


class BannerCreate(BannerBase):
    pass


class BannerUpdate(BaseModel):
    title: Optional[str] = None
    subtitle: Optional[str] = None
    image_url: Optional[str] = None
    link: Optional[str] = None
    link_text: Optional[str] = None
    gradient_from: Optional[str] = None
    gradient_to: Optional[str] = None
    position: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class Banner(BannerBase):
    id: int
    created_at: datetime

    class Config:
        from_attributes = True


# ============ Notification Schemas ============

class NotificationSchema(BaseModel):
    id: int
    user_id: int
    type: str
    title: str
    body: Optional[str] = None
    link: Optional[str] = None
    is_read: bool = False
    created_at: datetime

    class Config:
        from_attributes = True


# ============ Predefined Tag Schemas ============

class PredefinedTagCreate(BaseModel):
    name: str = Field(min_length=1, max_length=50)
    parent_id: Optional[int] = None
    is_parent: bool = False
    sort_order: int = 0


class PredefinedTagSchema(BaseModel):
    id: int
    name: str
    parent_id: Optional[int] = None
    is_parent: bool = False
    sort_order: int = 0
    created_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class TagWithCount(BaseModel):
    """Tag with product count"""
    id: int
    name: str
    count: int
    sort_order: int = 0


class TagCategory(BaseModel):
    """Parent tag category with children and counts"""
    id: int
    name: str
    sort_order: int = 0
    total_count: int = 0
    children: List[TagWithCount] = []

    class Config:
        from_attributes = True


# ============ Middleman Deal Schemas ============

class MiddlemanDealCreate(BaseModel):
    counterparty_username: str = Field(min_length=1, max_length=100)
    creator_role: str = Field(default='buyer', pattern='^(buyer|seller)$')  # buyer or seller
    title: str = Field(min_length=1, max_length=200)
    amount: float = Field(gt=0, le=1000000)  # Minimum > $0, max $1M
    terms: Optional[str] = None
    lock_in_days: int = Field(default=0, ge=0, le=30)  # 0-30 days lock-in period


class MiddlemanDealUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=200)
    amount: Optional[float] = Field(None, gt=0)
    terms: Optional[str] = None
    lock_in_days: Optional[int] = Field(None, ge=0, le=30)


class MiddlemanMessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)
    is_proposal: bool = False
    proposed_terms: Optional[str] = None
    proposed_amount: Optional[float] = None


class MiddlemanUserBrief(BaseModel):
    id: int
    username: Optional[str] = None
    first_name: Optional[str] = None
    avatar_url: Optional[str] = None

    class Config:
        from_attributes = True


class MiddlemanMessageSchema(BaseModel):
    id: int
    deal_id: int
    sender_id: int
    content: str
    is_system: bool = False
    is_proposal: bool = False
    proposed_terms: Optional[str] = None
    proposed_amount: Optional[float] = None
    created_at: datetime
    sender: Optional[MiddlemanUserBrief] = None

    class Config:
        from_attributes = True


class MiddlemanDealSchema(BaseModel):
    id: int
    invite_code: Optional[str] = None
    buyer_id: Optional[int] = None
    seller_id: Optional[int] = None
    buyer_username: Optional[str] = None
    seller_username: Optional[str] = None
    admin_id: Optional[int] = None
    title: str
    description: Optional[str] = None
    amount: float = 0.0
    terms: Optional[str] = None
    fee_percent: float = 5.0
    fee_amount: float = 0.0
    lock_in_days: int = 0
    funds_locked: bool = False
    funds_released: bool = False
    funds_release_at: Optional[datetime] = None
    status: MiddlemanStatus
    buyer_confirmed: bool = False
    seller_confirmed: bool = False
    buyer_completed: bool = False
    seller_completed: bool = False
    admin_requested: bool = False
    dispute_reason: Optional[str] = None
    dispute_by_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    completed_at: Optional[datetime] = None
    buyer: Optional[MiddlemanUserBrief] = None
    seller: Optional[MiddlemanUserBrief] = None
    admin: Optional[MiddlemanUserBrief] = None
    dispute_by: Optional[MiddlemanUserBrief] = None

    class Config:
        from_attributes = True


class DisputeOpenRequest(BaseModel):
    reason: str = Field(min_length=10, max_length=1000)


class AdminResolutionRequest(BaseModel):
    """Admin resolution for disputed deal"""
    decision: str = Field(pattern="^(refund_buyer|pay_seller|partial_split)$")
    buyer_percent: Optional[float] = Field(None, ge=0, le=100)  # for partial_split
    admin_note: Optional[str] = Field(None, max_length=500)


# Order Feedback / Reputation
class OrderFeedbackCreate(BaseModel):
    is_positive: bool
    comment: Optional[str] = Field(None, max_length=500)

class OrderFeedbackSchema(BaseModel):
    id: int
    order_id: int
    from_user_id: int
    to_user_id: int
    is_positive: bool
    comment: Optional[str] = None
    created_at: datetime
    from_user: Optional[MiddlemanUserBrief] = None
    
    class Config:
        from_attributes = True


# ============ Banner Booking Schemas ============

class BannerBookingCreate(BaseModel):
    """Create a new banner booking"""
    title: str = Field(min_length=1, max_length=100)
    subtitle: Optional[str] = Field(None, max_length=200)
    image_url: Optional[str] = None
    link: Optional[str] = None
    link_text: str = "Learn More"
    gradient_from: str = "primary-500"
    gradient_to: str = "accent-purple"
    position: str = Field(..., pattern="^(above_categories|above_wtb|above_escrow|above_vouches|below_vouches)$")
    starts_at: datetime
    duration_days: int = Field(7, ge=7, le=90)

    @field_validator('image_url', 'link', mode='before')
    @classmethod
    def validate_urls(cls, v):
        return _validate_url_protocol(v)


class BannerBookingUpdate(BaseModel):
    """Admin update for banner booking"""
    title: Optional[str] = Field(None, max_length=100)
    subtitle: Optional[str] = Field(None, max_length=200)
    image_url: Optional[str] = None
    link: Optional[str] = None
    link_text: Optional[str] = None
    is_approved: Optional[bool] = None
    status: Optional[str] = None


class BannerBookingSchema(BaseModel):
    id: int
    user_id: int
    title: str
    subtitle: Optional[str] = None
    image_url: Optional[str] = None
    link: Optional[str] = None
    link_text: str = "Learn More"
    gradient_from: str = "primary-500"
    gradient_to: str = "accent-purple"
    position: str
    sort_order: int = 0
    starts_at: datetime
    ends_at: datetime
    price_paid: float = 0.0
    duration_days: int = 7
    status: str = "pending"
    is_approved: bool = False
    created_at: datetime
    updated_at: datetime
    
    # Optional user info (for admin views)
    user_display_name: Optional[str] = None
    user_shop_name: Optional[str] = None

    class Config:
        from_attributes = True


class BannerSlotPricing(BaseModel):
    """Pricing config for a banner position"""
    price_7d: float = 50.0
    price_30d: float = 150.0
    pages: list = []  # Which pages this position appears on
    description: str = ""
    max_active: int = 3  # Max simultaneous banners in this slot


class BannerSlotConfig(BaseModel):
    """Full pricing config for all positions"""
    enabled: bool = True
    positions: dict  # {position_name: BannerSlotPricing}


class BannerSlotAvailability(BaseModel):
    """Check availability for a position on a date range"""
    position: str
    starts_at: datetime
    ends_at: datetime
    current_count: int
    max_allowed: int
    is_available: bool
    price: float


class ServiceCategoryCreate(BaseModel):
    name: str = Field(min_length=2, max_length=100)
    icon: str = Field(default="briefcase", max_length=50)
