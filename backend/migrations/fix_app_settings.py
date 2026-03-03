"""
Migration: Add missing columns to app_settings table.

SQLAlchemy create_all() only creates NEW tables, it never alters existing ones.
This script adds any columns defined in the model but missing from the DB.

Usage:
  cd /home/web/backend
  python3 migrations/fix_app_settings.py
"""
import sqlite3
import os

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "db.db"))

# All columns that should exist on app_settings, with their SQLite types + defaults
EXPECTED_COLUMNS = [
    ("app_name", "TEXT DEFAULT ''"),
    ("logo_url", "TEXT"),
    ("show_logo", "BOOLEAN DEFAULT 1"),
    ("bot_username", "TEXT DEFAULT ''"),
    ("maintenance_mode", "BOOLEAN DEFAULT 0"),
    ("announcements_url", "TEXT"),
    ("vouches_url", "TEXT"),
    ("official_group_url", "TEXT"),
    ("suggestion_group_url", "TEXT"),
    ("product_fee_percent", "FLOAT DEFAULT 10.0"),
    ("auction_fee_percent", "FLOAT DEFAULT 5.0"),
    ("middleman_fee_percent", "FLOAT DEFAULT 5.0"),
    ("middleman_min_fee", "FLOAT DEFAULT 0.0"),
    ("withdrawal_fee_percent", "FLOAT DEFAULT 0.0"),
    ("referral_percent", "FLOAT DEFAULT 5.0"),
    ("referral_first_deposit_bonus_percent", "FLOAT DEFAULT 10.0"),
    ("referral_enabled", "BOOLEAN DEFAULT 1"),
    ("wtb_daily_post_limit", "INTEGER DEFAULT 5"),
    ("wtb_daily_reply_limit", "INTEGER DEFAULT 20"),
    ("wtb_rules", "TEXT"),
    ("support_user_id", "INTEGER"),
    ("support_username", "TEXT"),
    ("support_display_name", "TEXT"),
    ("banner_slot_pricing", "TEXT"),
    ("banner_slots_enabled", "BOOLEAN DEFAULT 1"),
    ("hide_admin_activity", "BOOLEAN DEFAULT 0"),
    ("bot_welcome_message", "TEXT"),
    ("marketplace_rules", "TEXT"),
    ("seller_rank_prices", "TEXT"),
    ("updated_at", "DATETIME"),
]


def migrate(db_path):
    print(f"DB: {db_path}")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    c.execute("PRAGMA table_info(app_settings)")
    existing = {row[1] for row in c.fetchall()}
    print(f"Existing columns ({len(existing)}): {sorted(existing)}")

    added = 0
    for name, typedef in EXPECTED_COLUMNS:
        if name not in existing:
            sql = f"ALTER TABLE app_settings ADD COLUMN {name} {typedef}"
            c.execute(sql)
            existing.add(name)
            print(f"  + {name} ({typedef})")
            added += 1

    conn.commit()
    conn.close()
    print(f"\nDone. {added} columns added.")


if __name__ == "__main__":
    migrate(DB_PATH)
