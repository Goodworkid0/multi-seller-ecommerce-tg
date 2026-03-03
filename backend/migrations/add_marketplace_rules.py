"""Add marketplace_rules column to app_settings"""
import asyncio
from sqlalchemy import text
from app.database import engine


async def migrate():
    async with engine.begin() as conn:
        result = await conn.execute(text("PRAGMA table_info(app_settings)"))
        columns = {row[1] for row in result.fetchall()}
        if "marketplace_rules" not in columns:
            await conn.execute(text(
                "ALTER TABLE app_settings ADD COLUMN marketplace_rules TEXT"
            ))
            print("✓ Added marketplace_rules column to app_settings")
        else:
            print("✓ marketplace_rules column already exists")


if __name__ == "__main__":
    asyncio.run(migrate())
