"""Add last_name column to users table."""
import sqlite3
import os
import sys

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "db.db"))


def migrate():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Check if column already exists
    cur.execute("PRAGMA table_info(users)")
    columns = [row[1] for row in cur.fetchall()]

    if "last_name" not in columns:
        cur.execute("ALTER TABLE users ADD COLUMN last_name TEXT")
        conn.commit()
        print("Added 'last_name' column to users table.")
    else:
        print("Column 'last_name' already exists, skipping.")

    conn.close()


if __name__ == "__main__":
    migrate()
