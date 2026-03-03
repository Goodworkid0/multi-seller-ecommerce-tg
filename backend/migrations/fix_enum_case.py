"""
Migration: Normalize enum values from UPPERCASE to lowercase.

When SQLEnum is used without values_callable, SQLAlchemy stores the enum MEMBER NAME
(e.g., 'GAME_KEY'). After adding values_callable, it expects the .value (e.g., 'game_key').
This script normalizes all existing rows.

Run on production: python3 migrations/fix_enum_case.py
"""
import sqlite3
import os
import sys

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "..", "db.db"))

UPDATES = [
    # (table, column, [(UPPERCASE, lowercase), ...])
    ("products", "product_type", [
        ("GAME_KEY", "game_key"),
        ("IN_GAME_CURRENCY", "in_game_currency"),
        ("ACCOUNT", "account"),
        ("OTHER", "other"),
    ]),
    ("orders", "status", [
        ("PENDING", "pending"),
        ("PAID", "paid"),
        ("DELIVERED", "delivered"),
        ("COMPLETED", "completed"),
        ("DISPUTED", "disputed"),
        ("CANCELLED", "cancelled"),
        ("REFUNDED", "refunded"),
    ]),
    ("withdrawal_requests", "status", [
        ("PENDING", "pending"),
        ("PROCESSING", "processing"),
        ("APPROVED", "approved"),
        ("REJECTED", "rejected"),
        ("FAILED", "failed"),
    ]),
    ("disputes", "status", [
        ("OPEN", "open"),
        ("ESCALATED", "escalated"),
        ("RESOLVED", "resolved"),
        ("CLOSED", "closed"),
    ]),
    ("middleman_deals", "status", [
        ("PENDING_INVITE", "pending_invite"),
        ("NEGOTIATING", "negotiating"),
        ("PENDING_CONFIRMATION", "pending_confirmation"),
        ("FUNDS_LOCKED", "funds_locked"),
        ("ADMIN_JOINED", "admin_joined"),
        ("DISPUTED", "disputed"),
        ("COMPLETED", "completed"),
        ("CANCELLED", "cancelled"),
    ]),
    ("auctions", "status", [
        ("DRAFT", "draft"),
        ("ACTIVE", "active"),
        ("AWAITING_PAYMENT", "awaiting_payment"),
        ("ENDED", "ended"),
        ("SOLD", "sold"),
        ("CANCELLED", "cancelled"),
    ]),
    ("wtb_posts", "status", [
        ("ACTIVE", "active"),
        ("CLOSED", "closed"),
        ("EXPIRED", "expired"),
    ]),
    ("users", "role", [
        ("BUYER", "buyer"),
        ("SELLER", "seller"),
        ("ADMIN", "admin"),
    ]),
]


def migrate(db_path: str, dry_run: bool = False):
    conn = sqlite3.connect(db_path)
    c = conn.cursor()

    # Get existing tables
    c.execute("SELECT name FROM sqlite_master WHERE type='table'")
    existing_tables = {r[0] for r in c.fetchall()}

    total = 0
    for table, col, mappings in UPDATES:
        if table not in existing_tables:
            print(f"  SKIP {table} (table does not exist)")
            continue
        for old, new in mappings:
            c.execute(f"UPDATE {table} SET {col} = ? WHERE {col} = ?", (new, old))
            if c.rowcount > 0:
                print(f"  {table}.{col}: {old} -> {new} ({c.rowcount} rows)")
                total += c.rowcount

    if dry_run:
        conn.rollback()
        print(f"\nDry run complete. {total} rows would be updated.")
    else:
        conn.commit()
        print(f"\nDone. {total} rows updated.")

    conn.close()


if __name__ == "__main__":
    dry_run = "--dry-run" in sys.argv
    print(f"Migrating enums in: {DB_PATH}")
    if dry_run:
        print("(DRY RUN — no changes will be saved)")
    migrate(DB_PATH, dry_run=dry_run)
