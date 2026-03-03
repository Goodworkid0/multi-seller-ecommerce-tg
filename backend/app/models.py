"""Database Models"""
from sqlalchemy import Column, Integer, String, Float, Boolean, DateTime, ForeignKey, Text, Enum as SQLEnum, Numeric
from sqlalchemy.orm import relationship
from datetime import datetime, timedelta
import enum

from app.database import Base


class UserRole(str, enum.Enum):
    BUYER = "buyer"
    SELLER = "seller"
    ADMIN = "admin"


class ProductType(str, enum.Enum):
    GAME_KEY = "game_key"
    IN_GAME_CURRENCY = "in_game_currency"
    ACCOUNT = "account"
    OTHER = "other"


class OrderStatus(str, enum.Enum):
    PENDING = "pending"
    PAID = "paid"
    DELIVERED = "delivered"
    COMPLETED = "completed"
    DISPUTED = "disputed"
    CANCELLED = "cancelled"
    REFUNDED = "refunded"


class DisputeStatus(str, enum.Enum):
    OPEN = "open"
    ESCALATED = "escalated"  # admin presence requested
    RESOLVED = "resolved"
    CLOSED = "closed"


class MiddlemanStatus(str, enum.Enum):
    PENDING_INVITE = "pending_invite"  # waiting for seller to accept
    NEGOTIATING = "negotiating"  # both parties discussing terms
    PENDING_CONFIRMATION = "pending_confirmation"  # one party confirmed, waiting for other
    FUNDS_LOCKED = "funds_locked"  # both confirmed, buyer funds locked
    ADMIN_JOINED = "admin_joined"  # admin is now mediating
    DISPUTED = "disputed"  # dispute opened, waiting for admin resolution
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    telegram_id = Column(String, unique=True, index=True)
    username = Column(String, nullable=True)
    first_name = Column(String, nullable=True)
    last_name = Column(String, nullable=True)
    email = Column(String, nullable=True)
    other_contact = Column(String, nullable=True)
    avatar_url = Column(String, nullable=True)
    role = Column(SQLEnum(UserRole, values_callable=lambda x: [e.value for e in x]), default=UserRole.BUYER)
    is_active = Column(Boolean, default=True)
    is_banned = Column(Boolean, default=False)
    ban_reason = Column(String, nullable=True)
    banned_at = Column(DateTime, nullable=True)
    token_version = Column(Integer, default=0)
    warning_count = Column(Integer, default=0)
    restricted_until = Column(DateTime, nullable=True)  # posting restriction expiry
    notification_prefs = Column(Text, nullable=True)  # JSON: {"orders": {"app": true, "tg": true}, ...}
    pin_hash = Column(String(60), nullable=True)  # bcrypt hash of 4-6 digit PIN
    pin_failed_attempts = Column(Integer, default=0)
    pin_locked_until = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    @property
    def has_pin(self):
        return bool(self.pin_hash)
    
    # Unified balance
    balance = Column(Numeric(12, 2, asdecimal=False), default=0.0)
    pending_balance = Column(Numeric(12, 2, asdecimal=False), default=0.0)  # Escrow - funds awaiting order completion
    escrow_balance = Column(Numeric(12, 2, asdecimal=False), default=0.0)   # P2P Middleman service balance

    # Referral system
    referral_code = Column(String, unique=True, nullable=True, index=True)
    total_referral_earnings = Column(Numeric(12, 2, asdecimal=False), default=0.0)

    # Handle preferences
    uses_custom_handle = Column(Boolean, default=False)
    
    # Seller specific
    shop_name = Column(String, nullable=True)
    shop_description = Column(Text, nullable=True)
    shop_image = Column(String, nullable=True)
    auto_response = Column(Text, nullable=True)  # Auto-reply to new DMs
    collateral = Column(Numeric(12, 2, asdecimal=False), default=0.0)
    is_featured = Column(Boolean, default=False)
    featured_expires_at = Column(DateTime, nullable=True)
    seller_rank = Column(Integer, default=0)  # 0=none, 1=Bronze($50), 2=Silver($100), 3=Gold($200)
    seller_rating = Column(Float, default=0.0)
    seller_review_count = Column(Integer, default=0)
    total_sales = Column(Integer, default=0)
    seller_expires_at = Column(DateTime, nullable=True)  # subscription expiry
    
    # Reputation system
    rep_positive = Column(Integer, default=0)  # rep+ count
    rep_negative = Column(Integer, default=0)  # rep- count
    
    # Relationships
    products = relationship("Product", back_populates="seller")
    orders = relationship("Order", back_populates="buyer", foreign_keys="Order.buyer_id")
    reviews_given = relationship("Review", back_populates="reviewer", foreign_keys="Review.reviewer_id")


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True)
    slug = Column(String, unique=True)
    icon = Column(String, nullable=True)
    image_url = Column(String, nullable=True)  # Category image
    parent_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    
    products = relationship("Product", back_populates="category", foreign_keys="Product.category_id")
    parent = relationship("Category", remote_side=[id], backref="children")


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(Integer, ForeignKey("users.id"))
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    subcategory_id = Column(Integer, ForeignKey("categories.id"), nullable=True)
    
    name = Column(String, index=True)
    description = Column(Text)
    product_type = Column(SQLEnum(ProductType, values_callable=lambda x: [e.value for e in x]), default=ProductType.GAME_KEY)
    price = Column(Float)
    bulk_discounts = Column(String, nullable=True)  # JSON: [{"min_qty":5,"discount_pct":10},...]
    image_url = Column(String, nullable=True)
    
    # Game specific
    game_name = Column(String, nullable=True)
    platform = Column(String, nullable=True)  # Steam, Epic, Origin, etc. (legacy)
    tags = Column(String, nullable=True)  # JSON: ["Steam", "RPG", ...] — up to 5 tags
    region = Column(String, default="Global")
    warranty_hours = Column(Integer, default=48)
    
    # Stock
    stock_count = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    
    # Stats
    sales_count = Column(Integer, default=0)
    rating = Column(Float, default=0.0)
    review_count = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    seller = relationship("User", back_populates="products")
    category = relationship("Category", back_populates="products", foreign_keys=[category_id])
    subcategory = relationship("Category", foreign_keys=[subcategory_id])
    keys = relationship("ProductKey", back_populates="product")
    order_items = relationship("OrderItem", back_populates="product")
    reviews = relationship("Review", back_populates="product")
    variants = relationship("ProductVariant", back_populates="product")


class ProductVariant(Base):
    """Product variants (e.g., different editions, regions, etc.)"""
    __tablename__ = "product_variants"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), index=True)
    
    name = Column(String)  # e.g., "Standard Edition", "Deluxe Edition"
    price = Column(Float)  # variant-specific price (overrides product price)
    stock_count = Column(Integer, default=0)
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    product = relationship("Product", back_populates="variants")
    keys = relationship("ProductKey", back_populates="variant")


class ProductKey(Base):
    """Individual keys/codes for digital products"""
    __tablename__ = "product_keys"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    variant_id = Column(Integer, ForeignKey("product_variants.id"), nullable=True)  # optional variant
    
    key_value = Column(String)  # The actual key/code
    is_sold = Column(Boolean, default=False)
    sold_at = Column(DateTime, nullable=True)
    order_item_id = Column(Integer, ForeignKey("order_items.id"), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    product = relationship("Product", back_populates="keys")
    variant = relationship("ProductVariant", back_populates="keys")
    order_item = relationship("OrderItem", back_populates="delivered_keys")


class Order(Base):
    __tablename__ = "orders"

    id = Column(Integer, primary_key=True, index=True)
    buyer_id = Column(Integer, ForeignKey("users.id"), index=True)
    
    total_amount = Column(Numeric(12, 2, asdecimal=False))
    status = Column(SQLEnum(OrderStatus, values_callable=lambda x: [e.value for e in x]), default=OrderStatus.PENDING, index=True)
    
    # Payment info
    payment_method = Column(String, nullable=True)
    payment_id = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    paid_at = Column(DateTime, nullable=True)
    delivered_at = Column(DateTime, nullable=True)
    auto_complete_at = Column(DateTime, nullable=True)  # 48h after delivery
    completed_at = Column(DateTime, nullable=True)
    is_buyer_confirmed = Column(Boolean, default=False)
    
    buyer = relationship("User", back_populates="orders", foreign_keys=[buyer_id])
    items = relationship("OrderItem", back_populates="order")
    disputes = relationship("Dispute", back_populates="order")
    messages = relationship("OrderMessage", back_populates="order")


class OrderItem(Base):
    __tablename__ = "order_items"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), index=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=True)  # nullable for auction orders
    auction_id = Column(Integer, ForeignKey("auctions.id"), nullable=True)  # for auction orders
    seller_id = Column(Integer, ForeignKey("users.id"), index=True)
    variant_id = Column(Integer, ForeignKey("product_variants.id"), nullable=True)
    
    quantity = Column(Integer, default=1)
    price = Column(Float)  # Cijena u trenutku kupovine
    
    order = relationship("Order", back_populates="items")
    product = relationship("Product", back_populates="order_items")
    auction = relationship("Auction")
    variant = relationship("ProductVariant")
    delivered_keys = relationship("ProductKey", back_populates="order_item")


class Review(Base):
    __tablename__ = "reviews"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"))
    reviewer_id = Column(Integer, ForeignKey("users.id"))
    order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    
    rating = Column(Integer)  # 1-5
    comment = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    product = relationship("Product", back_populates="reviews")
    reviewer = relationship("User", back_populates="reviews_given", foreign_keys=[reviewer_id])


class CryptoDeposit(Base):
    __tablename__ = "crypto_deposits"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)

    provider = Column(String, default="nowpayments")
    order_id = Column(String, unique=True, index=True)
    payment_id = Column(String, unique=True, index=True, nullable=True)

    price_amount = Column(Float)  # amount in price_currency
    price_currency = Column(String)  # crypto if fixed crypto amount
    price_amount_usd = Column(Float, default=0.0)

    pay_amount = Column(Float, nullable=True)
    pay_currency = Column(String, nullable=True)
    pay_address = Column(String, nullable=True)
    payment_status = Column(String, default="created")
    tx_hash = Column(String, nullable=True)
    confirmations = Column(Integer, default=0)
    is_credited = Column(Boolean, default=False)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    user = relationship("User", foreign_keys=[user_id])


class WithdrawalStatus(str, enum.Enum):
    PENDING = "pending"
    PROCESSING = "processing"  # payout initiated, awaiting confirmation
    APPROVED = "approved"      # payout confirmed/sent
    REJECTED = "rejected"
    FAILED = "failed"          # payout API error


class WithdrawalRequest(Base):
    __tablename__ = "withdrawal_requests"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    amount = Column(Numeric(12, 2, asdecimal=False))
    destination = Column(String, nullable=True)  # USDT TRC-20 wallet address
    status = Column(SQLEnum(WithdrawalStatus, values_callable=lambda x: [e.value for e in x]), default=WithdrawalStatus.PENDING)
    admin_note = Column(Text, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    processed_at = Column(DateTime, nullable=True)

    # NowPayments payout tracking
    payout_id = Column(String, nullable=True, index=True)  # NowPayments payout ID
    payout_status = Column(String, nullable=True)  # NowPayments status string
    payout_hash = Column(String, nullable=True)    # blockchain tx hash
    payout_currency = Column(String, default="usdttrc20")  # crypto sent
    payout_amount = Column(Numeric(12, 2, asdecimal=False), nullable=True)   # actual crypto amount sent
    payout_error = Column(Text, nullable=True)     # error message if failed
    fee_amount = Column(Numeric(12, 2, asdecimal=False), default=0.0)         # fee deducted from withdrawal
    net_amount = Column(Numeric(12, 2, asdecimal=False), nullable=True)        # amount after fee (sent to user)

    user = relationship("User", foreign_keys=[user_id])


class Dispute(Base):
    __tablename__ = "disputes"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), index=True)
    opened_by = Column(Integer, ForeignKey("users.id"))  # buyer who opened
    
    reason = Column(Text)
    status = Column(SQLEnum(DisputeStatus, values_callable=lambda x: [e.value for e in x]), default=DisputeStatus.OPEN, index=True)
    resolution = Column(Text, nullable=True)  # admin resolution note
    resolved_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # admin
    
    created_at = Column(DateTime, default=datetime.utcnow)
    resolved_at = Column(DateTime, nullable=True)
    
    order = relationship("Order", back_populates="disputes")
    opener = relationship("User", foreign_keys=[opened_by])
    resolver = relationship("User", foreign_keys=[resolved_by])


class OrderMessage(Base):
    __tablename__ = "order_messages"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), index=True)
    sender_id = Column(Integer, ForeignKey("users.id"))
    
    content = Column(Text)
    is_system = Column(Boolean, default=False)  # system messages (auto-complete, dispute opened, etc.)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    order = relationship("Order", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id])


class Banner(Base):
    __tablename__ = "banners"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String, nullable=False)
    subtitle = Column(String, nullable=True)
    image_url = Column(String, nullable=True)  # Banner image URL
    link = Column(String, nullable=True)
    link_text = Column(String, default="Learn More")
    gradient_from = Column(String, default="primary-500")  # Tailwind color class
    gradient_to = Column(String, default="accent-purple")
    position = Column(String, default="below_vouches")  # above_categories, above_wtb, above_escrow, above_vouches, below_vouches
    is_active = Column(Boolean, default=True)
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    
    type = Column(String)  # dispute_message, dispute_resolved, order_delivered, etc.
    title = Column(String)
    body = Column(Text, nullable=True)
    link = Column(String, nullable=True)  # e.g. /orders/13
    is_read = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    user = relationship("User", foreign_keys=[user_id])


class PredefinedTag(Base):
    """Admin-managed predefined tags for products with optional parent-child hierarchy"""
    __tablename__ = "predefined_tags"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, nullable=False, index=True)
    parent_id = Column(Integer, ForeignKey("predefined_tags.id"), nullable=True, index=True)
    is_parent = Column(Boolean, default=False)  # True for category headers
    sort_order = Column(Integer, default=0)  # For custom ordering
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Self-referential relationship
    parent = relationship("PredefinedTag", remote_side=[id], backref="children")


class AppSettings(Base):
    """Singleton settings table — always ID=1"""
    __tablename__ = "app_settings"

    id = Column(Integer, primary_key=True, default=1)
    app_name = Column(String, default="")
    logo_url = Column(String, nullable=True)  # /api/admin/branding/logo
    show_logo = Column(Boolean, default=True)  # Show logo in header navigation
    bot_username = Column(String, default="")
    maintenance_mode = Column(Boolean, default=False)
    announcements_url = Column(String, nullable=True)  # Telegram channel URL
    vouches_url = Column(String, nullable=True)  # Telegram vouches channel URL
    official_group_url = Column(String, nullable=True)  # Telegram group URL
    suggestion_group_url = Column(String, nullable=True)  # Telegram suggestion group URL
    
    # Fee settings
    product_fee_percent = Column(Float, default=10.0)  # % platform fee on product sales
    auction_fee_percent = Column(Float, default=5.0)  # % platform fee on auction sales
    middleman_fee_percent = Column(Float, default=5.0)  # % default middleman escrow fee
    middleman_min_fee = Column(Float, default=0.0)  # minimum fee in $ for escrow deals
    
    # Withdrawal settings
    withdrawal_fee_percent = Column(Float, default=0.0)  # % fee on withdrawals (default 0)
    
    # Referral system settings
    referral_percent = Column(Float, default=5.0)  # % referrer gets from each purchase
    referral_first_deposit_bonus_percent = Column(Float, default=10.0)  # % bonus on first deposit
    referral_enabled = Column(Boolean, default=True)
    
    # Order settings
    pending_order_cancel_hours = Column(Integer, default=24)  # Auto-cancel pending (unpaid) orders after N hours (0 = disabled)

    # WTB limits
    wtb_daily_post_limit = Column(Integer, default=5)  # max WTB posts per user per 24h (0 = unlimited)
    wtb_daily_reply_limit = Column(Integer, default=20)  # max WTB replies per user per 24h (0 = unlimited)

    # WTB rules (JSON array of strings)
    wtb_rules = Column(Text, nullable=True)  # JSON: ["Rule 1", "Rule 2", ...]

    # Support
    support_user_id = Column(Integer, nullable=True)  # User ID designated as support account (legacy)
    support_username = Column(String, nullable=True)  # Username for support account
    support_display_name = Column(String, nullable=True)  # UI label (e.g. "Support")
    
    # Banner slot pricing (JSON: {"position_name": {"price_7d": X, "price_30d": Y, "pages": [...]}})
    # Positions: above_categories, above_wtb, above_escrow, above_vouches, below_vouches
    banner_slot_pricing = Column(Text, nullable=True)  # JSON config for slot prices
    banner_slots_enabled = Column(Boolean, default=True)  # Enable self-serve banner purchases
    
    # Activity status
    hide_admin_activity = Column(Boolean, default=False)  # Hide admin names from public activity display
    
    # Bot welcome message (shown on /start command; supports {name} and {app} placeholders)
    bot_welcome_message = Column(Text, nullable=True)
    
    # Marketplace rules (JSON array of strings)
    marketplace_rules = Column(Text, nullable=True)  # JSON: ["Rule 1", "Rule 2", ...]
    
    # Seller rank prices (JSON: {"1": {"price": 50, "featured_days": 0}, ...})
    seller_rank_prices = Column(Text, nullable=True)
    
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


class BannerBooking(Base):
    """User-purchased banner slot booking with scheduling"""
    __tablename__ = "banner_bookings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    
    # Banner content
    title = Column(String, nullable=False)
    subtitle = Column(String, nullable=True)
    image_url = Column(String, nullable=True)
    link = Column(String, nullable=True)
    link_text = Column(String, default="Learn More")
    gradient_from = Column(String, default="primary-500")
    gradient_to = Column(String, default="accent-purple")
    
    # Slot positioning
    position = Column(String, nullable=False)  # above_categories, above_wtb, etc.
    sort_order = Column(Integer, default=0)
    
    # Scheduling
    starts_at = Column(DateTime, nullable=False)
    ends_at = Column(DateTime, nullable=False)
    
    # Payment
    price_paid = Column(Float, default=0.0)
    duration_days = Column(Integer, default=7)
    
    # Status
    status = Column(String, default="pending")  # pending, active, expired, cancelled
    is_approved = Column(Boolean, default=False)  # Admin approval required
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    user = relationship("User", foreign_keys=[user_id])


class MiddlemanDeal(Base):
    """Middleman service deal between two parties"""
    __tablename__ = "middleman_deals"

    id = Column(Integer, primary_key=True, index=True)
    invite_code = Column(String(12), unique=True, index=True, nullable=True)  # shareable code
    
    # Participants - clear buyer/seller roles
    buyer_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)  # who pays
    seller_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)  # who receives
    buyer_username = Column(String, nullable=True)  # TG handle for invite (when seller creates)
    seller_username = Column(String, nullable=True)  # TG handle for invite (when buyer creates)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # assigned admin
    
    # Deal terms
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    amount = Column(Float, default=0.0)  # agreed price/value
    terms = Column(Text, nullable=True)  # detailed terms of exchange
    
    # Escrow settings
    fee_percent = Column(Float, default=5.0)  # default 5%
    fee_amount = Column(Float, default=0.0)  # calculated fee
    lock_in_days = Column(Integer, default=0)  # lock period after completion (0 = immediate)
    
    # Funds tracking
    funds_locked = Column(Boolean, default=False)  # buyer funds locked from balance
    funds_released = Column(Boolean, default=False)  # funds released to seller
    funds_release_at = Column(DateTime, nullable=True)  # when seller can withdraw
    
    # Status tracking
    status = Column(SQLEnum(MiddlemanStatus, values_callable=lambda x: [e.value for e in x]), default=MiddlemanStatus.PENDING_INVITE)
    buyer_confirmed = Column(Boolean, default=False)  # confirmed terms
    seller_confirmed = Column(Boolean, default=False)  # confirmed terms
    buyer_completed = Column(Boolean, default=False)  # marked as fulfilled their side
    seller_completed = Column(Boolean, default=False)  # marked as fulfilled their side
    admin_requested = Column(Boolean, default=False)  # optional admin request
    
    # Dispute tracking
    dispute_reason = Column(Text, nullable=True)  # reason for dispute
    dispute_by_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # who opened dispute
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    
    # Relationships
    buyer = relationship("User", foreign_keys=[buyer_id])
    seller = relationship("User", foreign_keys=[seller_id])
    admin = relationship("User", foreign_keys=[admin_id])
    messages = relationship("MiddlemanMessage", back_populates="deal", order_by="MiddlemanMessage.created_at")


class MiddlemanMessage(Base):
    """Chat messages in middleman deal"""
    __tablename__ = "middleman_messages"

    id = Column(Integer, primary_key=True, index=True)
    deal_id = Column(Integer, ForeignKey("middleman_deals.id"), index=True)
    sender_id = Column(Integer, ForeignKey("users.id"))
    
    content = Column(Text)
    is_system = Column(Boolean, default=False)  # system messages (status changes, etc.)
    
    # For term proposals
    is_proposal = Column(Boolean, default=False)
    proposed_terms = Column(Text, nullable=True)
    proposed_amount = Column(Float, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    deal = relationship("MiddlemanDeal", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id])


class ProductInquiry(Base):
    """Pre-sale chat between buyer and seller about a product"""
    __tablename__ = "product_inquiries"

    id = Column(Integer, primary_key=True, index=True)
    product_id = Column(Integer, ForeignKey("products.id"), index=True)
    buyer_id = Column(Integer, ForeignKey("users.id"), index=True)
    seller_id = Column(Integer, ForeignKey("users.id"), index=True)
    
    is_active = Column(Boolean, default=True)
    last_message_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    product = relationship("Product")
    buyer = relationship("User", foreign_keys=[buyer_id])
    seller = relationship("User", foreign_keys=[seller_id])
    messages = relationship("InquiryMessage", back_populates="inquiry", order_by="InquiryMessage.created_at")


class InquiryMessage(Base):
    """Messages in pre-sale inquiry chat"""
    __tablename__ = "inquiry_messages"

    id = Column(Integer, primary_key=True, index=True)
    inquiry_id = Column(Integer, ForeignKey("product_inquiries.id"), index=True)
    sender_id = Column(Integer, ForeignKey("users.id"))
    
    content = Column(Text)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    inquiry = relationship("ProductInquiry", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id])


class Referral(Base):
    """Referral tracking"""
    __tablename__ = "referrals"

    id = Column(Integer, primary_key=True, index=True)
    referrer_id = Column(Integer, ForeignKey("users.id"), index=True)  # who referred
    referred_id = Column(Integer, ForeignKey("users.id"), unique=True, index=True)  # who was referred
    
    # Reward tracking
    referrer_reward = Column(Float, default=0.0)  # amount earned by referrer
    referred_reward = Column(Float, default=0.0)  # bonus given to referred user
    is_rewarded = Column(Boolean, default=False)  # has reward been paid out
    rewarded_at = Column(DateTime, nullable=True)
    
    # What triggered the reward
    trigger_type = Column(String, nullable=True)  # "first_purchase", "first_deposit", etc.
    trigger_order_id = Column(Integer, ForeignKey("orders.id"), nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    referrer = relationship("User", foreign_keys=[referrer_id], backref="referrals_made")
    referred = relationship("User", foreign_keys=[referred_id], backref="referred_by")
    trigger_order = relationship("Order")


class Service(Base):
    """Freelance services offered by sellers"""
    __tablename__ = "services"

    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(Integer, ForeignKey("users.id"), index=True)
    
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, default="other")  # boosting, coaching, design, development, writing, marketing, other
    price = Column(Float, nullable=False)  # Starting price
    delivery_time = Column(String, default="1 day")  # e.g., "1 hour", "3 days"
    
    is_active = Column(Boolean, default=True)
    
    # Stats
    orders_count = Column(Integer, default=0)
    rating = Column(Float, default=0.0)
    review_count = Column(Integer, default=0)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    seller = relationship("User", backref="services")


class AuctionStatus(str, enum.Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    AWAITING_PAYMENT = "awaiting_payment"  # Winner must pay within deadline
    ENDED = "ended"  # No bids received
    SOLD = "sold"
    CANCELLED = "cancelled"


class Auction(Base):
    """Auction listings"""
    __tablename__ = "auctions"

    id = Column(Integer, primary_key=True, index=True)
    seller_id = Column(Integer, ForeignKey("users.id"), index=True)
    
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    category = Column(String, default="other")  # accounts, items, collectibles, domains, digital, other
    image_url = Column(String, nullable=True)
    
    # Pricing: blitz (minimum bid increment), start (starting price), buyout (instant purchase)
    start_price = Column(Float, nullable=False)  # Starting/first bid price
    blitz_price = Column(Float, default=1.0)  # Minimum bid increment
    buyout_price = Column(Float, nullable=True)  # Optional instant purchase price
    current_bid = Column(Float, nullable=True)
    
    # Timing: auction ends X days after last bid
    duration_days = Column(Integer, default=2)  # Days after last bid to auto-close
    
    bid_count = Column(Integer, default=0)
    winner_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    
    status = Column(SQLEnum(AuctionStatus, values_callable=lambda x: [e.value for e in x]), default=AuctionStatus.DRAFT)
    starts_at = Column(DateTime, nullable=True)
    ends_at = Column(DateTime, nullable=True)  # Updated on each bid
    last_bid_at = Column(DateTime, nullable=True)  # Track when last bid was placed
    payment_deadline = Column(DateTime, nullable=True)  # Deadline for winner to pay
    
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    seller = relationship("User", foreign_keys=[seller_id], backref="auctions")
    winner = relationship("User", foreign_keys=[winner_id])


class AuctionBid(Base):
    """Bids on auctions"""
    __tablename__ = "auction_bids"

    id = Column(Integer, primary_key=True, index=True)
    auction_id = Column(Integer, ForeignKey("auctions.id"), index=True)
    bidder_id = Column(Integer, ForeignKey("users.id"), index=True)
    
    amount = Column(Float, nullable=False)
    is_winning = Column(Boolean, default=False)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    auction = relationship("Auction", backref="bids")
    bidder = relationship("User", foreign_keys=[bidder_id])


class OrderFeedback(Base):
    """Mutual feedback between buyer and seller after order completion"""
    __tablename__ = "order_feedbacks"

    id = Column(Integer, primary_key=True, index=True)
    order_id = Column(Integer, ForeignKey("orders.id"), index=True)
    from_user_id = Column(Integer, ForeignKey("users.id"), index=True)
    to_user_id = Column(Integer, ForeignKey("users.id"), index=True)
    
    is_positive = Column(Boolean, nullable=False)  # True = rep+, False = rep-
    comment = Column(Text, nullable=True)
    
    created_at = Column(DateTime, default=datetime.utcnow)
    
    order = relationship("Order")
    from_user = relationship("User", foreign_keys=[from_user_id])
    to_user = relationship("User", foreign_keys=[to_user_id])


class WtbStatus(str, enum.Enum):
    ACTIVE = "active"
    CLOSED = "closed"
    EXPIRED = "expired"


class WtbPost(Base):
    """Want-to-Buy posts — buyers publish what they're looking for"""
    __tablename__ = "wtb_posts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)

    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    budget_min = Column(Float, nullable=True)
    budget_max = Column(Float, nullable=True)
    category = Column(String(100), nullable=True)

    status = Column(SQLEnum(WtbStatus, values_callable=lambda x: [e.value for e in x]), default=WtbStatus.ACTIVE)
    responses = Column(Integer, default=0)  # how many sellers responded

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    archived_at = Column(DateTime, nullable=True)

    user = relationship("User", foreign_keys=[user_id])
    replies = relationship("WtbReply", back_populates="post", cascade="all, delete-orphan")


class WtbReply(Base):
    """Public replies/offers on WTB posts"""
    __tablename__ = "wtb_replies"

    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("wtb_posts.id", ondelete="CASCADE"), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    message = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    post = relationship("WtbPost", back_populates="replies")
    user = relationship("User", foreign_keys=[user_id])


class ServiceCategory(Base):
    __tablename__ = "service_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    slug = Column(String(120), unique=True, nullable=False, index=True)
    icon = Column(String(50), default="briefcase")
    sort_order = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class WtbCategory(Base):
    __tablename__ = "wtb_categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    slug = Column(String(120), unique=True, nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Giveaway(Base):
    __tablename__ = "giveaways"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    prize = Column(String(200), nullable=True)

    enabled = Column(Boolean, default=True)
    # All users are registered in this platform; this flag restricts giveaways to users with at least one credited deposit.
    deposit_required = Column(Boolean, default=False)
    # Automatically pick a random winner when ends_at is reached
    auto_pick_winner = Column(Boolean, default=False)
    
    # Tournament mode: "random" (default) or "most_referrals" (winner = most referrals)
    winner_mode = Column(String(20), default="random")
    # Minimum referrals required to enter (0 = no minimum)
    min_referrals = Column(Integer, default=0)
    # Number of winners/places (1 = single winner, 3 = 1st/2nd/3rd, etc.)
    winner_count = Column(Integer, default=1)
    # Require exact word in Telegram display name to enter (e.g. platform name for visibility)
    require_name_keyword = Column(String(100), nullable=True)

    starts_at = Column(DateTime, nullable=True)
    ends_at = Column(DateTime, nullable=True)

    winner_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)  # Legacy: 1st place
    winner_picked_at = Column(DateTime, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    winner_user = relationship("User", foreign_keys=[winner_user_id])
    winners = relationship("GiveawayWinner", back_populates="giveaway", order_by="GiveawayWinner.place")


class GiveawayEntry(Base):
    __tablename__ = "giveaway_entries"

    id = Column(Integer, primary_key=True, index=True)
    giveaway_id = Column(Integer, ForeignKey("giveaways.id"), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    guest_key = Column(String(64), index=True, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    giveaway = relationship("Giveaway")
    user = relationship("User")


class GiveawayWinner(Base):
    """Multiple winners/places for a giveaway"""
    __tablename__ = "giveaway_winners"

    id = Column(Integer, primary_key=True, index=True)
    giveaway_id = Column(Integer, ForeignKey("giveaways.id"), index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    place = Column(Integer, default=1)  # 1st, 2nd, 3rd, etc.
    prize_label = Column(String(200), nullable=True)  # Optional custom prize for this place
    picked_at = Column(DateTime, default=datetime.utcnow)

    giveaway = relationship("Giveaway", back_populates="winners")
    user = relationship("User")


class DirectConversation(Base):
    """Direct message conversation between two users"""
    __tablename__ = "direct_conversations"

    id = Column(Integer, primary_key=True, index=True)
    user1_id = Column(Integer, ForeignKey("users.id"), index=True)  # lower id
    user2_id = Column(Integer, ForeignKey("users.id"), index=True)  # higher id

    # Optional context for how the conversation started
    context_type = Column(String(50), nullable=True)   # 'seller_profile', 'wtb_post', etc.
    context_id = Column(Integer, nullable=True)         # e.g. wtb_post id
    context_label = Column(String(200), nullable=True)  # e.g. WTB post title

    is_active = Column(Boolean, default=True)
    last_message_at = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    user1 = relationship("User", foreign_keys=[user1_id])
    user2 = relationship("User", foreign_keys=[user2_id])
    messages = relationship("DirectMessage", back_populates="conversation", order_by="DirectMessage.created_at")


class DirectMessage(Base):
    """Message in a direct conversation"""
    __tablename__ = "direct_messages"

    id = Column(Integer, primary_key=True, index=True)
    conversation_id = Column(Integer, ForeignKey("direct_conversations.id"), index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), index=True)

    content = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    conversation = relationship("DirectConversation", back_populates="messages")
    sender = relationship("User", foreign_keys=[sender_id])


class UserWarning(Base):
    """Admin warnings issued to users"""
    __tablename__ = "user_warnings"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    admin_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    reason = Column(Text, nullable=False)
    context = Column(String(50), nullable=True)  # e.g. "wtb", "product", "general"
    context_id = Column(Integer, nullable=True)  # e.g. post_id
    warning_number = Column(Integer, default=1)  # nth warning for this user
    restriction_days = Column(Integer, default=0)  # days restricted as a result
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])
    admin = relationship("User", foreign_keys=[admin_id])


class LoginHistory(Base):
    """Tracks user login events for security audit"""
    __tablename__ = "login_history"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    method = Column(String, default="telegram_webapp")  # telegram_webapp, telegram_widget, dev
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])
