"""
Migration script to add login_history table.
Run: python migrations/add_login_history.py
"""
import asyncio
import sys
sys.path.insert(0, '/home/c/Desktop/projekti/proxy/gimmick/backend')

from sqlalchemy import text
from app.database import engine


async def run_migration():
    print("Running login_history migration...")
    async with engine.begin() as conn:
        await conn.execute(text("""
            CREATE TABLE IF NOT EXISTS login_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                ip_address VARCHAR(45),
                user_agent TEXT,
                method VARCHAR(30) DEFAULT 'telegram_webapp',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """))
        print("- Created login_history table")

        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id)"
        ))
        await conn.execute(text(
            "CREATE INDEX IF NOT EXISTS idx_login_history_created_at ON login_history(created_at)"
        ))
        print("- Created indexes")

    print("Migration complete!")


if __name__ == "__main__":
    asyncio.run(run_migration())
