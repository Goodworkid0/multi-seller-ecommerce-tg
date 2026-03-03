"""Database configuration"""
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text, select
import os
from dotenv import load_dotenv
from functools import lru_cache
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models import AppSettings

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./db.db")

engine = create_async_engine(DATABASE_URL, echo=os.getenv("SQL_ECHO", "false").lower() == "true")
async_session = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

class Base(DeclarativeBase):
    pass

# Default fee values (used if db not available)
DEFAULT_PRODUCT_FEE = 10.0  # 10%
DEFAULT_AUCTION_FEE = 5.0   # 5%
DEFAULT_MIDDLEMAN_FEE = 5.0  # 5%

async def get_fee_settings(db: AsyncSession) -> dict:
    """Get fee settings from AppSettings (cached per-request via session)"""
    from app.models import AppSettings
    try:
        result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
        settings = result.scalar_one_or_none()
        if settings:
            return {
                "product_fee": settings.product_fee_percent or DEFAULT_PRODUCT_FEE,
                "auction_fee": settings.auction_fee_percent or DEFAULT_AUCTION_FEE,
                "middleman_fee": settings.middleman_fee_percent or DEFAULT_MIDDLEMAN_FEE,
                "middleman_min_fee": settings.middleman_min_fee or 0.0,
            }
    except Exception:
        pass
    return {
        "product_fee": DEFAULT_PRODUCT_FEE,
        "auction_fee": DEFAULT_AUCTION_FEE,
        "middleman_fee": DEFAULT_MIDDLEMAN_FEE,
        "middleman_min_fee": 0.0,
    }

def calc_seller_amount(price: float, fee_percent: float) -> float:
    """Calculate seller earnings after platform fee"""
    # Clamp fee to valid range (0-99%) to prevent misconfiguration
    fee_percent = max(0, min(fee_percent, 99))
    return round(price * (1 - fee_percent / 100), 2)


async def get_referral_settings(db):
    """Get referral settings from AppSettings (shared helper)"""
    from app.models import AppSettings
    result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    settings = result.scalar_one_or_none()
    if not settings:
        return {"percent": 5.0, "first_deposit_bonus": 10.0, "enabled": True}
    return {
        "percent": settings.referral_percent or 5.0,
        "first_deposit_bonus": settings.referral_first_deposit_bonus_percent or 10.0,
        "enabled": settings.referral_enabled if settings.referral_enabled is not None else True
    }


async def create_tables():
    environment = os.getenv("ENVIRONMENT", "development").lower()
    allow_auto_create = os.getenv("ALLOW_AUTO_CREATE_TABLES", "false").lower() == "true"

    if environment == "production" and not allow_auto_create:
        return

    async with engine.begin() as conn:
        await conn.run_sync(lambda sync_conn: Base.metadata.create_all(sync_conn, checkfirst=True))
        # Lightweight compatibility patch for existing DBs without migrations yet.
        _alter_stmts = [
            "ALTER TABLE users ADD COLUMN token_version INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN pin_failed_attempts INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN pin_locked_until DATETIME",
        ]
        for stmt in _alter_stmts:
            try:
                await conn.execute(text(stmt))
            except Exception:
                # Column already exists or DB does not support this alter syntax.
                pass

async def get_db():
    async with async_session() as session:
        try:
            yield session
        finally:
            await session.close()
