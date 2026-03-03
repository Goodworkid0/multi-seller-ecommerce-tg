#!/usr/bin/env python3
"""
Database migration script for production
Run this BEFORE restarting the backend service
"""
import sqlite3
import os

DB_PATH = os.environ.get('DATABASE_PATH', 'gimmick.db')

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    migrations = [
        # Banner bookings columns (Feb 2026)
        ("banner_bookings", "link_text", "TEXT"),
        ("banner_bookings", "gradient_from", "TEXT"),
        ("banner_bookings", "gradient_to", "TEXT"),
        ("banner_bookings", "sort_order", "INTEGER DEFAULT 0"),
        # PIN code (Feb 2026)
        ("users", "pin_hash", "TEXT"),
        # Giveaway enhancements (Feb 2026)
        ("giveaways", "winner_mode", "TEXT DEFAULT 'random'"),
        ("giveaways", "min_referrals", "INTEGER DEFAULT 0"),
        ("giveaways", "winner_count", "INTEGER DEFAULT 1"),
        # Warning system (Mar 2026)
        ("users", "warning_count", "INTEGER DEFAULT 0"),
        ("users", "restricted_until", "DATETIME"),
        ("app_settings", "wtb_rules", "TEXT"),
    ]
    
    for table, column, col_type in migrations:
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
            conn.commit()
            print(f"✓ Added {table}.{column}")
        except Exception as e:
            if "duplicate column" in str(e).lower():
                print(f"• {table}.{column} already exists")
            else:
                print(f"✗ {table}.{column}: {e}")

    # New tables
    new_tables = [
        ("service_categories", """
            CREATE TABLE IF NOT EXISTS service_categories (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name VARCHAR(100) UNIQUE NOT NULL,
                slug VARCHAR(120) UNIQUE NOT NULL,
                icon VARCHAR(50) DEFAULT 'briefcase',
                sort_order INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """),
        ("login_history", """
            CREATE TABLE IF NOT EXISTS login_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
                ip_address VARCHAR,
                user_agent VARCHAR,
                method VARCHAR,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """),
        ("user_warnings", """
            CREATE TABLE IF NOT EXISTS user_warnings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                admin_id INTEGER REFERENCES users(id),
                reason TEXT NOT NULL,
                context VARCHAR(50),
                context_id INTEGER,
                warning_number INTEGER DEFAULT 1,
                restriction_days INTEGER DEFAULT 0,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        """),
    ]

    for table_name, ddl in new_tables:
        try:
            cursor.execute(ddl)
            conn.commit()
            print(f"✓ Table {table_name} ready")
        except Exception as e:
            print(f"✗ Table {table_name}: {e}")

    conn.close()
    print("\nMigration complete!")

if __name__ == "__main__":
    migrate()
