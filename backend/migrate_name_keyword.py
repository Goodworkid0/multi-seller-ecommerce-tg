#!/usr/bin/env python3
"""
Migration: Add require_name_keyword column to giveaways table.
Run on production: python migrate_name_keyword.py
"""

import sqlite3
import os

DB_PATH = os.environ.get("DATABASE_PATH", "./gimmick.db")

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print(f"Connected to database: {DB_PATH}")

    cursor.execute("PRAGMA table_info(giveaways)")
    existing_columns = {row[1] for row in cursor.fetchall()}
    print(f"Existing giveaways columns: {existing_columns}")

    if "require_name_keyword" not in existing_columns:
        print("Adding require_name_keyword column...")
        cursor.execute("ALTER TABLE giveaways ADD COLUMN require_name_keyword VARCHAR(100)")
        print("✓ require_name_keyword added")
    else:
        print("✓ require_name_keyword already exists")

    conn.commit()
    conn.close()
    print("\nMigration complete!")

if __name__ == "__main__":
    migrate()
