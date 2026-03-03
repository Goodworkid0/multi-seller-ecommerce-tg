"""Add pending_order_cancel_hours column to app_settings"""
import sqlite3, os

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "gimmick.db"))

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # Check if column exists
    cur.execute("PRAGMA table_info(app_settings)")
    columns = [row[1] for row in cur.fetchall()]

    if "pending_order_cancel_hours" not in columns:
        cur.execute("ALTER TABLE app_settings ADD COLUMN pending_order_cancel_hours INTEGER DEFAULT 24")
        print("Added pending_order_cancel_hours column (default 24h)")
    else:
        print("pending_order_cancel_hours column already exists")

    conn.commit()
    conn.close()

if __name__ == "__main__":
    migrate()
