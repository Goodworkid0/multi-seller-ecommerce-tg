#!/usr/bin/env python3
"""
Migration script for Giveaway tournament features.
Run on production: python migrate_giveaways.py

Adds:
- giveaways.winner_mode (random/most_referrals)
- giveaways.min_referrals (minimum referrals to enter)
- giveaways.winner_count (1-10 places)
- giveaway_winners table (multiple winners per giveaway)
"""

import sqlite3
import os

# Adjust path for production
DB_PATH = os.environ.get("DATABASE_PATH", "./db.db")

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    print(f"Connected to database: {DB_PATH}")
    
    # Check existing columns in giveaways
    cursor.execute("PRAGMA table_info(giveaways)")
    existing_columns = {row[1] for row in cursor.fetchall()}
    print(f"Existing giveaways columns: {existing_columns}")
    
    # Add winner_mode column
    if "winner_mode" not in existing_columns:
        print("Adding winner_mode column...")
        cursor.execute("ALTER TABLE giveaways ADD COLUMN winner_mode VARCHAR(20) DEFAULT 'random'")
        print("✓ winner_mode added")
    else:
        print("✓ winner_mode already exists")
    
    # Add min_referrals column
    if "min_referrals" not in existing_columns:
        print("Adding min_referrals column...")
        cursor.execute("ALTER TABLE giveaways ADD COLUMN min_referrals INTEGER DEFAULT 0")
        print("✓ min_referrals added")
    else:
        print("✓ min_referrals already exists")
    
    # Add winner_count column
    if "winner_count" not in existing_columns:
        print("Adding winner_count column...")
        cursor.execute("ALTER TABLE giveaways ADD COLUMN winner_count INTEGER DEFAULT 1")
        print("✓ winner_count added")
    else:
        print("✓ winner_count already exists")
    
    # Check if giveaway_winners table exists
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='giveaway_winners'")
    if not cursor.fetchone():
        print("Creating giveaway_winners table...")
        cursor.execute("""
            CREATE TABLE giveaway_winners (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                giveaway_id INTEGER NOT NULL,
                user_id INTEGER NOT NULL,
                place INTEGER DEFAULT 1,
                prize_label VARCHAR(200),
                picked_at DATETIME,
                FOREIGN KEY (giveaway_id) REFERENCES giveaways(id),
                FOREIGN KEY (user_id) REFERENCES users(id)
            )
        """)
        cursor.execute("CREATE INDEX ix_giveaway_winners_giveaway_id ON giveaway_winners(giveaway_id)")
        cursor.execute("CREATE INDEX ix_giveaway_winners_user_id ON giveaway_winners(user_id)")
        print("✓ giveaway_winners table created with indexes")
    else:
        print("✓ giveaway_winners table already exists")
    
    conn.commit()
    conn.close()
    print("\n✅ Migration complete!")

if __name__ == "__main__":
    migrate()
