"""Add hide_admin_activity column to app_settings"""
import asyncio
from sqlalchemy import text
from app.database import engine


async def migrate():
    async with engine.begin() as conn:
        result = await conn.execute(text("PRAGMA table_info(app_settings)"))
        columns = {row[1] for row in result.fetchall()}
        if "hide_admin_activity" not in columns:
            await conn.execute(text(
                "ALTER TABLE app_settings ADD COLUMN hide_admin_activity BOOLEAN DEFAULT 0"
            ))
            print("✓ Added hide_admin_activity column to app_settings")
        else:
            print("✓ hide_admin_activity column already exists")


if __name__ == "__main__":
    asyncio.run(migrate())
