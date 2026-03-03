#!/usr/bin/env python3
"""
Migration: Add warning system tables and columns.
- users.warning_count, users.restricted_until
- app_settings.wtb_rules
- user_warnings table
"""
import sqlite3
import os

DB_PATH = os.environ.get('DATABASE_PATH', os.path.join(os.path.dirname(__file__), '..', 'gimmick.db'))


def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    # Add columns to users
    columns = [
        ("users", "warning_count", "INTEGER DEFAULT 0"),
        ("users", "restricted_until", "DATETIME"),
        ("app_settings", "wtb_rules", "TEXT"),
    ]

    for table, column, col_type in columns:
        try:
            cursor.execute(f"ALTER TABLE {table} ADD COLUMN {column} {col_type}")
            conn.commit()
            print(f"✓ Added {table}.{column}")
        except Exception as e:
            if "duplicate column" in str(e).lower():
                print(f"• {table}.{column} already exists")
            else:
                print(f"✗ {table}.{column}: {e}")

    # Create user_warnings table
    try:
        cursor.execute("""
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
        """)
        cursor.execute("CREATE INDEX IF NOT EXISTS ix_user_warnings_user_id ON user_warnings(user_id)")
        conn.commit()
        print("✓ Table user_warnings ready")
    except Exception as e:
        print(f"✗ Table user_warnings: {e}")

    conn.close()
    print("\nWarning system migration complete!")


if __name__ == "__main__":
    migrate()
