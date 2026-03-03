"""
Migration: Add missing columns to giveaways table.

Usage:
  cd /home/web/backend
  python3 -m migrations.fix_giveaways
"""
import sqlite3
import os

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "db.db"))

EXPECTED_COLUMNS = [
    ("id", None),
    ("title", "TEXT"),
    ("description", "TEXT"),
    ("prize", "TEXT"),
    ("enabled", "BOOLEAN DEFAULT 1"),
    ("deposit_required", "BOOLEAN DEFAULT 0"),
    ("auto_pick_winner", "BOOLEAN DEFAULT 0"),
    ("winner_mode", "TEXT DEFAULT 'random'"),
    ("min_referrals", "INTEGER DEFAULT 0"),
    ("winner_count", "INTEGER DEFAULT 1"),
    ("require_name_keyword", "TEXT"),
    ("starts_at", "DATETIME"),
    ("ends_at", "DATETIME"),
    ("winner_user_id", "INTEGER REFERENCES users(id)"),
    ("winner_picked_at", "DATETIME"),
    ("created_at", "DATETIME"),
    ("updated_at", "DATETIME"),
]


def migrate(db_path):
    print(f"DB: {db_path}")
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    c.execute("PRAGMA table_info(giveaways)")
    existing = {row[1] for row in c.fetchall()}
    print(f"Existing columns ({len(existing)}): {sorted(existing)}")

    added = 0
    for name, typedef in EXPECTED_COLUMNS:
        if typedef is None:
            continue
        if name not in existing:
            sql = f"ALTER TABLE giveaways ADD COLUMN {name} {typedef}"
            c.execute(sql)
            existing.add(name)
            print(f"  + {name} ({typedef})")
            added += 1

    conn.commit()
    conn.close()
    print(f"\nDone. {added} columns added.")


if __name__ == "__main__":
    migrate(DB_PATH)
