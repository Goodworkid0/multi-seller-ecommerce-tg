#!/usr/bin/env python3
"""
Migration: Add notification_prefs column to users table.
Stores JSON with per-category notification preferences (app/tg toggles).
"""
import sqlite3
import os

DB_PATH = os.environ.get('DATABASE_PATH', os.path.join(os.path.dirname(__file__), '..', 'gimmick.db'))


def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    try:
        cursor.execute("ALTER TABLE users ADD COLUMN notification_prefs TEXT")
        conn.commit()
        print("✓ Added users.notification_prefs")
    except Exception as e:
        if "duplicate column" in str(e).lower():
            print("· users.notification_prefs already exists")
        else:
            print(f"✗ Error adding users.notification_prefs: {e}")

    conn.close()
    print("Migration complete.")


if __name__ == "__main__":
    migrate()
