"""
Migration: Add missing columns to users table.

Usage:
  cd /home/web/backend
  python3 -m migrations.fix_users
"""
import sqlite3
import os

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "db.db"))

EXPECTED_COLUMNS = [
    ("id", None),  # skip PK
    ("telegram_id", "TEXT"),
    ("username", "TEXT"),
    ("first_name", "TEXT"),
    ("email", "TEXT"),
    ("other_contact", "TEXT"),
    ("avatar_url", "TEXT"),
    ("role", "TEXT DEFAULT 'buyer'"),
    ("is_active", "BOOLEAN DEFAULT 1"),
    ("is_banned", "BOOLEAN DEFAULT 0"),
    ("ban_reason", "TEXT"),
    ("banned_at", "DATETIME"),
    ("token_version", "INTEGER DEFAULT 0"),
    ("warning_count", "INTEGER DEFAULT 0"),
    ("restricted_until", "DATETIME"),
    ("notification_prefs", "TEXT"),
    ("pin_hash", "TEXT"),
    ("pin_failed_attempts", "INTEGER DEFAULT 0"),
    ("pin_locked_until", "DATETIME"),
    ("created_at", "DATETIME"),
    ("balance", "NUMERIC DEFAULT 0.0"),
    ("pending_balance", "NUMERIC DEFAULT 0.0"),
    ("escrow_balance", "NUMERIC DEFAULT 0.0"),
    ("referral_code", "TEXT"),
    ("total_referral_earnings", "NUMERIC DEFAULT 0.0"),
    ("uses_custom_handle", "BOOLEAN DEFAULT 0"),
    ("shop_name", "TEXT"),
    ("shop_description", "TEXT"),
    ("shop_image", "TEXT"),
    ("auto_response", "TEXT"),
    ("collateral", "NUMERIC DEFAULT 0.0"),
    ("is_featured", "BOOLEAN DEFAULT 0"),
    ("featured_expires_at", "DATETIME"),
    ("seller_rank", "INTEGER DEFAULT 0"),
    ("seller_rating", "FLOAT DEFAULT 0.0"),
    ("seller_review_count", "INTEGER DEFAULT 0"),
    ("total_sales", "INTEGER DEFAULT 0"),
    ("seller_expires_at", "DATETIME"),
    ("rep_positive", "INTEGER DEFAULT 0"),
    ("rep_negative", "INTEGER DEFAULT 0"),
]


def migrate(db_path):
    print(f"DB: {db_path}")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    c.execute("PRAGMA table_info(users)")
    existing = {row[1] for row in c.fetchall()}
    print(f"Existing columns ({len(existing)}): {sorted(existing)}")

    added = 0
    for name, typedef in EXPECTED_COLUMNS:
        if typedef is None:
            continue  # skip PK
        if name not in existing:
            sql = f"ALTER TABLE users ADD COLUMN {name} {typedef}"
            c.execute(sql)
            existing.add(name)
            print(f"  + {name} ({typedef})")
            added += 1

    conn.commit()
    conn.close()
    print(f"\nDone. {added} columns added.")


if __name__ == "__main__":
    migrate(DB_PATH)
