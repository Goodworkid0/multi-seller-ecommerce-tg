"""Add warranty_hours column to products table."""
import sqlite3
import os

DB_PATH = os.getenv("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "db.db"))


def migrate():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    cur.execute("PRAGMA table_info(products)")
    columns = [row[1] for row in cur.fetchall()]

    if "warranty_hours" not in columns:
        cur.execute("ALTER TABLE products ADD COLUMN warranty_hours INTEGER DEFAULT 48")
        conn.commit()
        print("Added 'warranty_hours' column to products table.")
    else:
        print("Column 'warranty_hours' already exists, skipping.")

    conn.close()


if __name__ == "__main__":
    migrate()
