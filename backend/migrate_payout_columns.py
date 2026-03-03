"""
Migration: Add payout tracking + fee columns to withdrawal_requests table,
and withdrawal_fee_percent to app_settings.
Run once: python migrate_payout_columns.py
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "gimmick.db")
# Fallback to db.db if gimmick.db doesn't exist
if not os.path.exists(DB_PATH):
    DB_PATH = os.path.join(os.path.dirname(__file__), "db.db")

WITHDRAWAL_COLUMNS = [
    ("payout_id", "VARCHAR", None),
    ("payout_status", "VARCHAR", None),
    ("payout_hash", "VARCHAR", None),
    ("payout_currency", "VARCHAR", "'usdterc20'"),
    ("payout_amount", "FLOAT", None),
    ("payout_error", "TEXT", None),
    ("fee_amount", "FLOAT", "0.0"),
    ("net_amount", "FLOAT", None),
]

APP_SETTINGS_COLUMNS = [
    ("withdrawal_fee_percent", "FLOAT", "0.0"),
]


def _add_columns(cursor, table, columns):
    cursor.execute(f"PRAGMA table_info({table})")
    existing = {row[1] for row in cursor.fetchall()}
    if not existing:
        print(f"  Table '{table}' does not exist yet — will be created on app start.")
        return 0
    added = 0
    for col_name, col_type, default in columns:
        if col_name not in existing:
            default_clause = f" DEFAULT {default}" if default else ""
            sql = f"ALTER TABLE {table} ADD COLUMN {col_name} {col_type}{default_clause}"
            print(f"  Running: {sql}")
            cursor.execute(sql)
            added += 1
        else:
            print(f"  Column '{table}.{col_name}' already exists — skipping.")
    return added


def migrate():
    if not os.path.exists(DB_PATH):
        print(f"Database not found at {DB_PATH} — skipping (tables will be created fresh).")
        return

    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()

    print("--- withdrawal_requests ---")
    added = _add_columns(cursor, "withdrawal_requests", WITHDRAWAL_COLUMNS)

    # Create index on payout_id if table exists
    cursor.execute("PRAGMA table_info(withdrawal_requests)")
    if cursor.fetchall():
        cursor.execute("""
            CREATE INDEX IF NOT EXISTS ix_withdrawal_requests_payout_id 
            ON withdrawal_requests(payout_id)
        """)
        print("  Index on payout_id ensured.")

    print("\n--- app_settings ---")
    added += _add_columns(cursor, "app_settings", APP_SETTINGS_COLUMNS)

    conn.commit()
    conn.close()
    print(f"\nDone. Added {added} new column(s) total.")

if __name__ == "__main__":
    migrate()
