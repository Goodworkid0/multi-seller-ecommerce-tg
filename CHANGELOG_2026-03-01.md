# Changelog — March 1, 2026

## Bug Fixes

### Broadcast System Fixed
Resolved issues with the admin broadcast/announcement system. Full dual-channel delivery now works reliably — admins can send announcements to user groups (all / buyers / sellers / admins) via webapp notifications and/or Telegram. Includes test-send mode, preset targeting pills, optional custom Telegram text, and detailed delivery stats (sent/failed/skipped).

**Files:** `admin.py`, `AdminHome.jsx`

---

### Giveaway Rules Internal Error Fixed
Fixed 500 Internal Server Error on giveaway endpoints caused by NULL values in optional columns (`require_name_keyword`, `winner_mode`, `min_referrals`, `winner_count`). Added defensive `getattr()` with defaults in `_serialize_giveaway()` to handle older rows missing migration-added columns.

**Files:** `giveaways.py`

---

### Home.jsx JSX Syntax Error
Fixed missing fragment wrapper around sibling elements in `publicStats` render block.

**Files:** `Home.jsx`

---

## Features

### 1. WTB Spam Protection
Multi-layered spam prevention for Want-to-Buy posts.

- **IP rate limiting:** 10 posts per hour via `slowapi`
- **Active post cap:** Maximum concurrent active posts per user
- **Daily post limit:** Configurable via `AppSettings.wtb_daily_post_limit` (default 5), returns HTTP 429 when exceeded
- **Daily reply limit:** Configurable via `AppSettings.wtb_daily_reply_limit`
- **Posting restrictions:** Admins can restrict users from posting with countdown timer (HTTP 403 with remaining time)

**Files:** `wtb.py`, `models.py`, `WantToBuy.jsx`

---

### 2. Bot /start — Channel Links & Rules
The Telegram bot `/start` command now displays a branded welcome message, marketplace rules, and channel/group links — all dynamically fetched from admin branding settings.

- Dynamic welcome message with `{name}` and `{app}` placeholders (configurable in Admin → Branding → Bot Settings)
- Numbered marketplace rules list
- Channel links: 📢 Announcements, 👥 Official Group, 💡 Suggestions
- 🛒 Marketplace menu button opens the Mini App

**Files:** `bot.py`, `models.py`, `admin.py`, `AdminHome.jsx`

---

### 3. Suggestion Group URL
Admin-configurable Telegram suggestion group URL, stored in AppSettings and displayed in the bot's `/start` message as a "💡 Suggestions" link.

- New `suggestion_group_url` field in branding settings
- Input field in Admin → Branding with `https://t.me/...` placeholder

**Files:** `models.py`, `admin.py`, `bot.py`, `AdminHome.jsx`

---

### 4. Customizable Seller Rank Prices
Admins can override default seller rank prices and featured-day bonuses from the admin panel.

- Default ranks: Bronze ($50), Silver ($100), Gold ($200)
- `seller_rank_prices` JSON column in AppSettings — per-rank `price` and `featured_days` overrides
- `GET /api/sellers/ranks` — returns all rank tiers with current prices
- Admin UI: per-rank price and featured-days inputs in seller settings tab

**Files:** `models.py`, `sellers.py`, `admin.py`, `AdminHome.jsx`

---

### 5. Free Seller Rank
Users can become sellers for free with limited features.

- Rank 0 = Free tier: 5 products, 1 service, no auctions
- `POST /api/sellers/become-seller` with `rank=0` — no payment required, no expiry
- Paid ranks (Bronze/Silver/Gold) unlock unlimited products, services, and auctions

**Files:** `sellers.py`, `models.py`

---

### 6. WTB Page Rules
Admin-configurable rules displayed as an expandable accordion at the top of the Want-to-Buy page.

- `wtb_rules` JSON array column in AppSettings (max 50 rules, max 500 chars each)
- Admin UI: `RulesEditor` component for adding/removing rules
- WTB page: collapsible "WTB Rules" section with numbered list and chevron toggle

**Files:** `models.py`, `admin.py`, `AdminHome.jsx`, `WantToBuy.jsx`

---

### 7. Seller Shop — Active Auctions & Services
Seller profile pages now display the seller's active auctions and services alongside products and reviews.

- `GET /api/sellers/{seller_id}/auctions` — active auctions sorted by `ends_at`, with pagination
- `GET /api/sellers/{seller_id}/services` — active services sorted by `orders_count` desc
- Auction cards with image, title, current bid, bid count, buyout price, time remaining (red when < 1h)
- Service cards with title, description, price, and orders count
- Count badges in seller stats header

**Files:** `sellers.py`, `SellerProfile.jsx`

---

### 8. Notification System Improvements

#### WTB Reply Notifications
Users receive in-app + Telegram notifications when someone replies to their WTB post. Self-replies are skipped.

- `wtb_reply` notification type with 💬 emoji (Telegram) and teal MessageSquare icon (webapp)

#### Per-User Notification Preferences
Full per-user notification control with category-level toggles for both App and Telegram channels.

- 8 notification categories: orders, disputes, wallet, auctions, escrow, wtb, seller, announcements
- `GET/PUT /api/notifications/preferences` endpoints
- `should_notify(user, type, channel)` helper gates delivery at creation time
- Security types (`admin_warning`) always delivered regardless of preferences
- "Notifications" tab in Settings page with per-category app/Telegram toggles
- Instant save with optimistic updates

**Files:** `models.py`, `schemas.py`, `notifications.py`, `telegram.py`, `wtb.py`, `Settings.jsx`

---

### 9. Giveaway Name Keyword Requirement
Admins can require giveaway entrants to include a specific word in their Telegram display name (e.g., the platform name for visibility/promotion).

- `require_name_keyword` field on Giveaway model (max 100 chars)
- Enforced at entry time — case-insensitive word-boundary regex check on `first_name`, returns 403 if not matched
- Re-verified at winner draw — entrants who removed the keyword are filtered out
- Admin UI: keyword input in giveaway create/edit form, 📛 badge on giveaway cards

**Files:** `models.py`, `giveaways.py`, `AdminHome.jsx`, `Giveaways.jsx`

---

### 10. Product Image Upload
Optional image upload for product listings across the marketplace.

- `POST /api/products/{id}/image` — upload PNG/JPG/WebP/GIF (max 5MB), auto-deletes old image
- `DELETE /api/products/{id}/image` — remove product image
- `GET /api/products/image/{filename}` — serve with 24h cache
- Seller product form: drag/click upload with preview, replace, and delete
- ProductCard: thumbnail in marketplace listings
- ProductDetail: full-width banner image

**Files:** `products.py`, `seller/Products.jsx`, `ProductDetail.jsx`, `ProductCard.jsx`

---

### 11. Banner GIF Support
Banners now support animated GIFs alongside static images, for both admin-managed banners and user self-serve bookings.

- `POST /api/banners/admin/{id}/upload` — admin banner upload (GIF/PNG/JPG/WebP, max 5MB)
- `POST /api/banners/my-bookings/{id}/upload` — user self-serve banner upload (same limits)
- GIFs animate automatically in the banner carousel
- Recommended resolution: 864×200px
- Old files cleaned up on re-upload

**Files:** `banners.py`, `seller/Advertising.jsx`

---

### 12. Dynamic Branding Cleanup
Removed all hardcoded "Gimmick" references across frontend and backend. App name, bot username, and logo are now fully driven by admin branding settings.

- Defaults changed to empty strings in `brandingStore.js`, `models.py`, `main.py`
- Removed `'G'` letter fallbacks across components
- Added `loadError` state and **Service Unavailable** page when backend is unreachable

**Files:** `brandingStore.js`, `App.jsx`, `Layout.jsx`, `PinLock.jsx`, `AdminHome.jsx`, `models.py`, `bot.py`, `main.py`

---

## Security Audit & Fixes

Comprehensive security audit of all code changes, resulting in 10 findings — all fixed.

### HIGH Severity

| # | Issue | Fix |
|---|---|---|
| 1 | **HTML/phishing injection** in Telegram notifications — user-controlled titles interpolated into HTML without escaping | Added `html.escape()` on `title` and `body` in `_format_tg()` |
| 2 | **Financial data exposure** — public WTB endpoint returned exact `total_deposit_amount` | Replaced with privacy-safe tier labels (`$50+`, `$100+`, `$500+`, etc.) via `_deposit_tier()` |

### MEDIUM Severity

| # | Issue | Fix |
|---|---|---|
| 3 | `become_seller()` accepted `shop_name`/`shop_description` with no length limits | Added `Query(..., min_length=2, max_length=50)` and `Query("", max_length=500)` |
| 4 | `get_seller_reviews()` `limit` param had no upper bound | Capped with `Query(10, ge=1, le=50)` |
| 5 | `get_seller_auctions()` had no pagination | Added `limit` (max 50) and `offset` params |
| 7 | `warn_user()` fetched user without row lock — concurrent warnings could lose increments | Added `.with_for_update()` |

### LOW Severity

| # | Issue | Fix |
|---|---|---|
| 6 | `my_wtb_posts()` returned all posts without pagination | Added `limit` (max 50) and `offset` params |
| 8 | `NotifPrefsUpdate.preferences` typed as bare `dict` | Replaced with `Dict[str, ChannelPrefs]` typed schema |
| 9 | `marketplace_rules`/`wtb_rules` arrays had no length limits | Added `max_length=50` on list, `constr(max_length=500)` on items |
| 10 | `support_user_id` internal DB ID exposed on public `/branding` endpoint | Removed from public response; kept in admin-only PUT response |

**Files:** `telegram.py`, `wtb.py`, `sellers.py`, `admin.py`, `notifications.py`
