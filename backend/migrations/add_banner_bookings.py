"""
Migration script to add banner_bookings table and slot pricing columns to app_settings.
Run this script to apply the migration (SQLite compatible).
"""
import asyncio
import sys
import json
sys.path.insert(0, '/home/c/Desktop/projekti/proxy/gimmick/backend')

from sqlalchemy import text
from app.database import engine

DEFAULT_SLOT_PRICING = json.dumps({
    "above_categories": {"price_7d": 100, "price_30d": 350, "max_active": 2, "description": "Premium position above categories - shown on homepage", "pages": ["home"]},
    "above_wtb": {"price_7d": 80, "price_30d": 280, "max_active": 2, "description": "Visible above WTB section", "pages": ["home"]},
    "above_escrow": {"price_7d": 60, "price_30d": 200, "max_active": 3, "description": "Escrow page placement", "pages": ["escrow"]},
    "above_vouches": {"price_7d": 50, "price_30d": 175, "max_active": 3, "description": "Above vouches section", "pages": ["home"]},
    "below_vouches": {"price_7d": 40, "price_30d": 140, "max_active": 4, "description": "Below vouches section", "pages": ["home"]}
})

async def run_migration():
    print("Running banner_bookings migration (SQLite)...")
    async with engine.begin() as conn:
        # 1. Create banner_bookings table
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS banner_bookings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title VARCHAR(200) NOT NULL,
                subtitle VARCHAR(500),
                image_url VARCHAR(500),
                link VARCHAR(500),
                position VARCHAR(50) NOT NULL DEFAULT 'below_vouches',
                starts_at TIMESTAMP NOT NULL,
                ends_at TIMESTAMP NOT NULL,
                price_paid REAL NOT NULL DEFAULT 0.00,
                duration_days INTEGER NOT NULL DEFAULT 7,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                is_approved BOOLEAN NOT NULL DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        print("- Created banner_bookings table")

        # 2. Create indexes
        for idx_sql in [
            "CREATE INDEX IF NOT EXISTS idx_banner_bookings_user_id ON banner_bookings(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_banner_bookings_position ON banner_bookings(position)",
            "CREATE INDEX IF NOT EXISTS idx_banner_bookings_status ON banner_bookings(status)",
            "CREATE INDEX IF NOT EXISTS idx_banner_bookings_dates ON banner_bookings(starts_at, ends_at)"
        ]:
            await conn.execute(text(idx_sql))
        print("- Created indexes")

        # 3. Check and add columns to app_settings (SQLite way)
        result = await conn.execute(text("PRAGMA table_info(app_settings)"))
        columns = [row[1] for row in result.fetchall()]
        
        if 'banner_slot_pricing' not in columns:
            await conn.execute(text("ALTER TABLE app_settings ADD COLUMN banner_slot_pricing TEXT DEFAULT '{}'"))
            print("- Added banner_slot_pricing column")
        else:
            print("- banner_slot_pricing column already exists")

        if 'banner_slots_enabled' not in columns:
            await conn.execute(text("ALTER TABLE app_settings ADD COLUMN banner_slots_enabled BOOLEAN DEFAULT 1"))
            print("- Added banner_slots_enabled column")
        else:
            print("- banner_slots_enabled column already exists")

        # 4. Set default slot pricing if empty
        result = await conn.execute(text("SELECT id, banner_slot_pricing FROM app_settings LIMIT 1"))
        row = result.fetchone()
        if row:
            current = row[1]
            if not current or current == '{}':
                await conn.execute(text(
                    "UPDATE app_settings SET banner_slot_pricing = :pricing WHERE id = :id"
                ), {"pricing": DEFAULT_SLOT_PRICING, "id": row[0]})
                print("- Set default slot pricing")
            else:
                print("- Slot pricing already configured")
        
    print("Migration completed successfully!")

if __name__ == "__main__":
    asyncio.run(run_migration())
