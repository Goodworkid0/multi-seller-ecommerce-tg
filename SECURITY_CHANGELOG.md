### P-2025-03-01 Security Audit Fixes

**1. HTML/Phishing Injection in Telegram Notifications (HIGH)**
**File:** `backend/app/telegram.py`
User-controlled strings (product titles, WTB post titles) were interpolated directly into Telegram HTML messages without escaping. A malicious user could inject `<a href="...">` phishing links. Fixed by adding `html.escape()` to both `title` and `body` in `_format_tg()`.

**2. Financial Data Exposure on Public Endpoint (HIGH)**
**File:** `backend/app/routers/wtb.py`
Public `GET /api/wtb/{post_id}` returned exact `total_deposit_amount` for all users. Replaced with privacy-safe tier labels (`$50+`, `$100+`, `$500+`, etc.) via `_deposit_tier()`.

**3. Missing Input Validation on become-seller (MEDIUM)**
**File:** `backend/app/routers/sellers.py`
`shop_name` and `shop_description` accepted as raw query params with no length limits. Added `Query(..., min_length=2, max_length=50)` and `Query("", max_length=500)`.

**4. Unbounded Query Limit on Seller Reviews (MEDIUM)**
**File:** `backend/app/routers/sellers.py`
`limit` param on `get_seller_reviews()` had no upper bound. Capped with `Query(10, ge=1, le=50)`.

**5. No Pagination on Seller Auctions (MEDIUM)**
**File:** `backend/app/routers/sellers.py`
`get_seller_auctions()` returned all results. Added `limit` (max 50) and `offset` params.

**6. No Pagination on My WTB Posts (LOW)**
**File:** `backend/app/routers/wtb.py`
`my_wtb_posts()` returned all posts. Added `limit` (max 50) and `offset` params.

**7. Warning Count Race Condition (MEDIUM)**
**File:** `backend/app/routers/admin.py`
`warn_user()` fetched user without `with_for_update()`. Concurrent warnings could lose increments. Added row lock.

**8. Weak Schema on NotifPrefsUpdate (LOW)**
**File:** `backend/app/routers/notifications.py`
`preferences` typed as bare `dict`. Replaced with `Dict[str, ChannelPrefs]` where `ChannelPrefs` has typed `app: bool, tg: bool` fields.

**9. No Length Limits on Rules Arrays (LOW)**
**File:** `backend/app/routers/admin.py`
`marketplace_rules` and `wtb_rules` had no list size or item length limits. Added `max_length=50` on list, `constr(max_length=500)` on items.

**10. Internal support_user_id Leaked on Public Endpoint (LOW)**
**File:** `backend/app/routers/admin.py`
`GET /branding` (no auth) exposed `support_user_id` internal DB ID. Removed from public response; kept in admin-only PUT response.

---

### P-2. Float → Numeric Migration for All Monetary Columns (CRITICAL)
**File:** `backend/app/models.py`, `backend/app/database.py`

**Before:** Every monetary column in the database (`balance`, `pending_balance`, `escrow_balance`, `total_amount`, `price`, etc.) used `Float` (IEEE 754 double-precision). This caused rounding errors — e.g., `0.1 + 0.2 = 0.30000000000000004`. Over thousands of transactions, balances could drift, go slightly negative (bypassing the `balance < amount` check), or produce inconsistent fee calculations.

**After:** All monetary columns migrated from `Float` to `Numeric(12, 2, asdecimal=False)`. Added `round()` to all balance arithmetic operations. DB migration script ALTERed existing columns. `Numeric` stores exact decimal values so `$0.10 + $0.20 = $0.30` every time.

---

### P-3. Race Condition: Order Payment Double-Spend (CRITICAL)
**File:** `backend/app/routers/orders.py`

**Before:** In `pay_order`, the order row was loaded without `with_for_update()`. The buyer's row was locked, but the order itself wasn't. Two concurrent payment requests for the same order could both see `status == PENDING`, both pass the check, and both deduct the buyer's balance — paying twice for one order.

**After:** Added `with_for_update()` on the order row select. The second request now waits for the first to commit, sees `status == PAID`, and rejects.

---

### P-4. Race Condition: Middleman Deal Double Fund-Locking (CRITICAL)
**File:** `backend/app/routers/middleman.py`

**Before:** In `confirm_deal`, the deal row was fetched with `db.get()` (no lock). If buyer and seller confirm simultaneously, both see `buyer_confirmed=False, seller_confirmed=False`, both set their flag, and both try to lock buyer funds — deducting the buyer's balance twice for the same deal.

**After:** Deal row fetched with `with_for_update()`. Confirmations now serialize correctly.

---

### P-5. Dev-Login Endpoint Accessible in All Environments (HIGH)
**File:** `backend/app/routers/auth.py`

**Before:** The `/api/auth/dev-login` endpoint was *registered* in all environments. It checked `ENVIRONMENT == "production"` at runtime and returned 403, but the route itself still existed and was visible in the API spec. If the environment variable was misconfigured, misspelled, or unset (and `main.py` defaulted to `"development"`), anyone could authenticate as any user by providing just their Telegram ID — full auth bypass.

**After:** The route is only registered when `ENVIRONMENT != "production"`. In production, the endpoint doesn't exist at all — returns 404 instead of 403.

---

### P-6. Nuke Endpoint Registered in All Environments (HIGH)
**File:** `backend/app/routers/admin.py`

**Before:** The `/api/admin/system/nuke` endpoint — which drops ALL database tables and deletes ALL uploaded files — was registered in every environment. Same runtime `ENVIRONMENT` check as dev-login: if the check failed, an admin could wipe the entire database.

**After:** Route only registered when `ENVIRONMENT != "production"`.

---

### P-7. LIKE Wildcard Escaping in All Search Endpoints (HIGH)
**Files:** `backend/app/routers/wtb.py`, `admin.py`, `products.py`

**Before:** Search parameters were interpolated directly into `ilike(f"%{search}%")` patterns without escaping `%` and `_` wildcard characters. While SQLAlchemy parameterizes the value (preventing SQL injection), the LIKE wildcards aren't escaped. A search for `%` would match every record. A search with `_` would match any single character. Crafted patterns could cause expensive queries.

**After:** All search inputs now escape `%` → `\%` and `_` → `\_` before building the ILIKE pattern, matching how `services.py` already handled it.

---

### P-8. Seller Withdrawal Endpoint Had No PIN Requirement (HIGH)
**File:** `backend/app/routers/sellers.py`

**Before:** There were two withdrawal endpoints: `/wallet/withdraw` (required PIN) and `/sellers/withdraw` (no PIN required). An attacker who compromised a session token could withdraw all funds via the seller endpoint without knowing the PIN.

**After:** The seller withdrawal endpoint now requires PIN verification, same as the wallet endpoint.

---

### P-9. Admin Could Approve Their Own Withdrawal (HIGH)
**File:** `backend/app/routers/admin.py`

**Before:** The admin withdrawal approval endpoint had no check preventing an admin from approving their own withdrawal request. A single compromised admin account could create and approve unlimited withdrawals, draining the hot wallet.

**After:** Added check: if `withdrawal.user_id == current_user.id`, raise 403 "Cannot approve your own withdrawal".

---

### P-10. Public Blacklist Leaked PII (HIGH)
**File:** `backend/app/routers/admin.py`

**Before:** The public (unauthenticated) blacklist endpoint returned internal `id`, `telegram_id`, and full user details of banned users. Anyone could harvest Telegram IDs and internal user IDs for targeted attacks.

**After:** Response stripped to only `username` and `ban_reason`. Internal IDs and Telegram IDs removed from the public response.

---

### P-11. No Rate Limits on Financial Endpoints (MEDIUM)
**Files:** `backend/app/routers/sellers.py`, `banners.py`, `middleman.py`

**Before:** Critical financial endpoints had zero rate limiting — `become_seller`, `renew_seller`, `book_banner_slot`, `pay_order`, `create_withdrawal`, and others could be hammered at unlimited speed.

**After:** Added `@limiter.limit()` decorators to seller financial endpoints, banner booking, and middleman operations.

---

### P-12. ENVIRONMENT Defaults Hardened (MEDIUM)
**File:** `backend/main.py`

**Before:** `main.py` defaulted `ENVIRONMENT` to `"development"`, while `auth.py` and `admin.py` defaulted to `"production"`. If the env var wasn't set, `main.py` would expose Swagger docs, allow localhost CORS origins, and behave as development — while auth.py would block dev-login (inconsistent security posture).

**After:** All files now default to `"production"` (fail-safe). Development mode requires explicit opt-in via `ENVIRONMENT=development`.

---

### P-13. ServiceCategoryCreate Pydantic Model (MEDIUM)
**File:** `backend/app/routers/admin.py`, `backend/app/schemas.py`

**Before:** The admin endpoint for creating service categories accepted a raw `dict` as input: `payload: dict`. No validation — any keys, any types, any sizes were accepted without constraint.

**After:** Replaced with a proper Pydantic model `ServiceCategoryCreate(BaseModel)` with `name: str = Field(min_length=2, max_length=100)` and typed `icon` field. Input is now validated before the handler runs.

---

### P-14. Rate Limiter Deduplicated
**File:** `backend/app/rate_limit.py`

**Before:** Multiple router files created their own `Limiter()` instances. These weren't connected to the app's exception handler, so rate limit hits would crash with unhandled errors instead of returning proper 429 responses.

**After:** Single shared `limiter` instance in `app/rate_limit.py`. All routers import from there.

---

### P-15. PIN Lockout Logic Implemented (HIGH)
**File:** `backend/app/routers/auth.py`

**Before:** The PIN verification endpoint had `pin_failed_attempts` and `pin_locked_until` fields defined in the model but **never used**. A 4-digit PIN has only 10,000 combinations. At 10 attempts/minute (the IP rate limit), an attacker could brute-force any PIN in ~17 minutes — or faster with multiple IPs.

**After:** Failed attempts are now tracked per-account. After 5 failures, the account is locked with exponential backoff (1 → 2 → 4 → 8 → 16 → 32 → 60 min cap). Counters reset on successful verification.

---

### P-16. URL Protocol Validation + XSS Href Fix
**Files:** `backend/app/routers/admin.py`, frontend components

**Before:** URL fields (announcements, vouches, group links) accepted any protocol including `javascript:`. If rendered as `<a href="javascript:alert(1)">`, this enables stored XSS.

**After:** URL fields validated to only accept `http://` and `https://` protocols. Frontend `href` attributes sanitized.

---

### P-17. Referral `is_rewarded` Flag
**File:** `backend/app/routers/orders.py`, `backend/app/models.py`

**Before:** Referral rewards were processed on every order from a referred user with no deduplication flag. Potential for reward duplication.

**After:** Added `is_rewarded` flag to referral records. Checked before processing reward to prevent duplicates.

---

## Session 2 — February 27, 2026

### 1. Race Condition: Admin Deposit Double-Credit
**File:** `backend/app/routers/admin.py`

**Before:** When admin clicks "Credit" on a crypto deposit, the code loaded the deposit row and checked `is_credited == False`. If two admin requests hit simultaneously, both see `False`, both credit the user's balance → user gets double the money.

**After:** The deposit row is now loaded with `with_for_update()`, which locks the database row until the transaction completes. The second request waits for the first to finish, sees `is_credited == True`, and rejects.

---

### 2. Race Condition: Force-Complete Deal — Seller Balance Corruption
**File:** `backend/app/routers/middleman.py`

**Before:** When admin force-completes an escrow deal, the seller's `User` object was accessed via SQLAlchemy's eagerly-loaded relationship (`deal.seller`). This doesn't lock the row. If the seller simultaneously withdraws funds, both operations read the old balance and overwrite each other → lost money.

**After:** The seller is re-fetched with an explicit `select(User).where(User.id == deal.seller_id).with_for_update()` query before modifying their balance.

---

### 3. Race Condition: Referral Reward Balance Race
**File:** `backend/app/routers/orders.py`

**Before:** When a referred user places an order, the referrer gets a percentage bonus. The referrer's row was fetched without a lock. If multiple orders from the same referred user process concurrently, balance updates could be lost (classic read-modify-write race).

**After:** Referrer is fetched with `with_for_update()`.

---

### 4. Negative Deposit Amount Bypass
**File:** `backend/app/schemas.py`

**Before:** The `CreateCryptoDeposit` schema defined `amount: float` with only a business rule check (`amount < 10` → reject). A negative value like `-100` passes this check (`-100 < 10` is True, but in the wrong direction). This could create negative deposit records in theory.

**After:** Schema uses `amount: float = Field(gt=0, le=1000000)` — Pydantic rejects anything ≤0 or over $1M before the endpoint code ever runs.

---

### 5. Zero-Value Middleman Deals
**File:** `backend/app/schemas.py`

**Before:** `MiddlemanDealCreate.amount` used `ge=0` (greater than or equal to zero), allowing `$0` deals. A malicious user could update a deal to $0 after the counterparty already reviewed the terms.

**After:** Changed to `gt=0` (strictly greater than zero). Also cleaned up a stale comment about promo codes (removed in a prior session).

---

### 6. Banned Users Could Transact on Auctions
**File:** `backend/app/routers/auctions.py`

**Before:** All 7 mutation endpoints (create auction, update, cancel, delete, place bid, buy now, pay for auction) used `get_current_user` as their auth dependency. This function validates the JWT but does NOT check if the user is banned. A banned user could still bid, buy, and create auctions.

**After:** All mutation endpoints switched to `get_current_active_user`, which raises `403 Forbidden` if `user.is_banned == True`. Read-only endpoints (list auctions, view detail, view my auctions) still use `get_current_user` so banned users can at least see their existing auctions.

---

### 7. Banned Users Could Manage Services
**File:** `backend/app/routers/services.py`

**Before:** Same issue as auctions — all 5 service mutation endpoints (create, update, toggle active, delete, list my services) used `get_current_user`, so banned sellers could still manage their service listings.

**After:** All 5 switched to `get_current_active_user`.

---

### 8. PIN Brute-Force via Withdrawal Endpoints
**Files:** `backend/app/auth.py`, `backend/app/routers/wallet.py`, `backend/app/routers/sellers.py`

**Before:** The PIN verification on the `/auth/pin/verify` endpoint had proper lockout logic (track failed attempts, lock after 5 failures with exponential backoff). But the actual withdrawal endpoints (`/wallet/withdraw`, `/sellers/withdraw`) checked the PIN with a raw `bcrypt.checkpw()` — no failed attempt tracking, no lockout. An attacker with a stolen JWT could try all 10,000 4-digit PIN combinations against the withdrawal endpoint with zero consequences.

**After:** Created a shared `verify_user_pin()` function in `auth.py` that both withdrawal endpoints now call. It tracks `pin_failed_attempts`, enforces lockout after 5 failures with exponential backoff (1 min → 2 → 4 → 8 → 16 → 32 → 60 min cap), and resets counters on success.

---

### 9. Admin WTB Posts Leaked Telegram IDs
**File:** `backend/app/routers/admin.py`

**Before:** The admin endpoint that lists Want-to-Buy posts included `user.telegram_id` in the response JSON. If an admin account is compromised, every WTB user's immutable Telegram ID would be exposed — these can't be changed like usernames.

**After:** `telegram_id` removed from the response. Admin still sees username and user ID.

---

### 10. No Rate Limits on Messaging Endpoints
**Files:** `backend/app/routers/orders.py`, `inquiries.py`, `middleman.py`

**Before:** The `send_order_message`, `send_inquiry_message`, and `send_message` (middleman chat) endpoints had zero rate limiting. An attacker could flood thousands of messages per second, filling the database and spamming notification triggers.

**After:** All three endpoints now have `@limiter.limit("30/minute")` with the `Request` parameter added for slowapi to extract the client IP.

---

### 11. No Rate Limit on Order Creation
**File:** `backend/app/routers/orders.py`

**Before:** `create_order` had no rate limit. An attacker could spam order creation to lock up product stock with orders they never intend to pay.

**After:** Added `@limiter.limit("20/minute")`.

---

### 12. Duplicate Rate Limiter Instances
**Files:** `backend/app/routers/orders.py`, `backend/app/routers/dm.py`

**Before:** Both files created their own `Limiter(key_func=get_remote_address)` instance instead of importing the shared one from `app.rate_limit`. The app only registers one limiter in `app.state.limiter`. The duplicate instances weren't connected to the app's exception handler, so they'd crash with unhandled `RateLimitExceeded` errors instead of returning proper 429 responses.

**After:** Both now use `from app.rate_limit import limiter`.

---

### 13. X-Request-ID Log Injection
**File:** `backend/main.py`

**Before:** The `X-Request-ID` header from incoming requests was accepted and logged without any validation. An attacker could send crafted strings with newlines, ANSI escape codes, or fake log entries to poison server logs and defeat audit analysis.

**After:** The header is validated against `[a-zA-Z0-9_\-]{1,64}`. If it doesn't match, a fresh server-generated UUID is used instead.

---

### 14. Unbounded `other_contact` Field
**File:** `backend/app/schemas.py`

**Before:** The `UserContactUpdate` schema's `other_contact` field had no `max_length`. A user could send a multi-megabyte string in this field to bloat the database.

**After:** Added `Field(None, max_length=200)`.

---

### 15. Wallet Payout Currency Mismatch
**File:** `backend/app/routers/wallet.py`

**Before:** When creating a withdrawal request, the code hardcoded `payout_currency="usdterc20"` (ERC-20 network). But the actual payout process sends via TRC-20. This mismatch could cause the NowPayments API to send funds on the wrong network or fail entirely.

**After:** Fixed to `payout_currency="usdttrc20"`.

---

### 16. Unbounded Auction Bid Amount
**File:** `backend/app/routers/auctions.py`

**Before:** The `place_bid` endpoint accepted `amount` as a plain `float` query parameter with no upper bound. A user could submit an astronomically large bid (e.g., $999,999,999,999) with no balance to back it.

**After:** Changed to `amount: float = Query(gt=0, le=1000000)`. Added the missing `Query` import from fastapi.

---

### 17. Frontend Console.log Data Leaks
**File:** `frontend/src/store/authStore.js`

**Before:** Three `console.log` calls exposed sensitive data to the browser console:
1. Full Telegram user object (ID, username, first name, language)
2. Browser auth user ID
3. Development mode status flag

Anyone who opens DevTools (or any browser extension with console access) could read this data.

**After:** All three `console.log` calls removed. `console.error` and `console.warn` kept for legitimate error handling.

---

### 18. OpenAPI Schema Exposed in Production
**File:** `backend/main.py`

**Before:** The OpenAPI JSON schema was served at `/openapi.json` even in production (only `/docs` and `/redoc` were disabled). This gave attackers a complete machine-readable map of every API endpoint, parameter, and response schema.

**After:** `openapi_url=None` when `ENVIRONMENT != "development"`. In production, `/openapi.json` now returns 404.

---

### 19. SQLEnum Case Mismatch — Database Crash
**File:** `backend/app/models.py`

**Before:** The `User.role` column used `SQLEnum(UserRole, values_callable=lambda x: [e.value for e in x])` which correctly stores lowercase values (`"buyer"`, `"seller"`). But all other 7 `SQLEnum` columns (`OrderStatus`, `ProductType`, `WithdrawalStatus`, `DisputeStatus`, `MiddlemanStatus`, `AuctionStatus`, `WtbStatus`) omitted `values_callable`. Without it, SQLAlchemy stores the enum **member name** in uppercase (`"PENDING"`, `"GAME_KEY"`). The database had mixed data — some rows uppercase, some lowercase — causing `LookupError` crashes when reading rows.

**After:** Added `values_callable=lambda x: [e.value for e in x]` to all 7 `SQLEnum` columns, so they consistently use lowercase `.value` strings. Created migration script `migrations/fix_enum_case.py` to normalize existing data.

---

### 20. Missing Database Columns on Production
**File:** `backend/app/models.py` (AppSettings model)

**Before:** The `AppSettings` model was updated over time with new columns (WTB daily limits, banner slot pricing, support fields, fee settings, etc.). But SQLAlchemy's `create_all()` only creates **new tables** — it never adds columns to existing tables. So production's `app_settings` table was missing columns like `wtb_daily_post_limit`, `wtb_daily_reply_limit`, etc., causing `OperationalError: no such column` on every request that reads settings.

**After:** Created migration script `migrations/fix_app_settings.py` that compares existing columns against expected columns and adds any missing ones with correct defaults. Production had 2 missing columns which were added.

---

## Migration Scripts Created

### `backend/migrations/fix_enum_case.py`
Normalizes all uppercase enum values to lowercase across 8 tables (`users`, `products`, `orders`, `withdrawal_requests`, `disputes`, `middleman_deals`, `auctions`, `wtb_posts`). Safe to run multiple times — only updates rows that have uppercase values. On production, updated 14 rows in `products` table (`GAME_KEY` → `game_key`).

### `backend/migrations/fix_app_settings.py`
Adds any columns defined in the `AppSettings` model but missing from the actual database table. Safely skips columns that already exist. On production, added `wtb_daily_post_limit` and `wtb_daily_reply_limit`.

---

## Files Modified Summary

| File | Changes |
|------|---------|
| `backend/app/auth.py` | Added shared `verify_user_pin()` function with exponential lockout |
| `backend/app/models.py` | Added `values_callable` to 7 `SQLEnum` columns |
| `backend/app/schemas.py` | Tightened 4 fields: deposit amount `gt=0`, deal amounts `gt=0`, contact `max_length=200` |
| `backend/main.py` | X-Request-ID sanitized, `openapi_url` disabled in production |
| `backend/app/routers/admin.py` | Deposit `with_for_update()`, WTB `telegram_id` removed |
| `backend/app/routers/auctions.py` | 7 endpoints → `get_current_active_user`, bid amount bounded, `Query` import |
| `backend/app/routers/dm.py` | Shared limiter import |
| `backend/app/routers/inquiries.py` | Rate limit on messaging |
| `backend/app/routers/middleman.py` | Seller row lock on deal completion, rate limit on messaging |
| `backend/app/routers/orders.py` | Referral row lock, shared limiter, rate limits on create + messaging |
| `backend/app/routers/sellers.py` | Withdrawal PIN → shared `verify_user_pin()` |
| `backend/app/routers/services.py` | 5 endpoints → `get_current_active_user` |
| `backend/app/routers/wallet.py` | Withdrawal PIN → shared `verify_user_pin()`, payout currency fixed |
| `frontend/src/store/authStore.js` | 3 `console.log` calls removed |
| `backend/migrations/fix_enum_case.py` | Created — enum data normalization |
| `backend/migrations/fix_app_settings.py` | Created — missing column migration |

---

## Known Remaining Items

1. **SQLite `with_for_update()` is a no-op** — row locking only works with PostgreSQL. Migrate to PostgreSQL for the race condition fixes to actually take effect.
2. **Auction balance reservation** — users can bid, then drain their balance before paying. Need balance freeze or enforcement at payment time.
3. **Middleman username-based join** — Telegram usernames can be changed. Attacker changes username to impersonate invited party. Should use invite codes or Telegram IDs instead.
4. **localStorage JWT storage** — XSS would expose tokens. Mitigated by Telegram iframe context, but short-lived access tokens would help.
5. **Duplicate product key upload** — Sellers can upload the same key repeatedly, inflating stock.
6. **NowPayments webhook** — Same IPN secret used for payments and payouts.
7. **Frontend admin route guards** — Any user can set `localStorage.view_role = 'admin'` to see admin UI structure (API calls still fail via backend checks).
8. **Auction auto-complete timer** — 48h auto-complete may be too short for auction deliveries.

---

## Session 3 — Security Audit Iteration 2

### 1. Public Seller Endpoints Leaked Financial Data (CRITICAL)
**Files:** `backend/app/schemas.py`, `backend/app/routers/sellers.py`

**Before:** The public endpoints `GET /api/sellers/featured` and `GET /api/sellers/{seller_id}` returned the full `SellerProfile` schema, which inherits from `User`. This exposed private financial and PII fields to any authenticated user: `balance`, `pending_balance`, `escrow_balance`, `email`, `telegram_id`, and `notification_prefs`. An attacker could enumerate seller balances to identify high-value targets.

**After:** Created a new `PublicSellerProfile` schema containing only public-safe fields (username, avatar, shop info, ratings, sales count). Both public endpoints now use `PublicSellerProfile` as their `response_model`. Self-access endpoints (`GET /profile`, `PUT /profile`) still return full `SellerProfile` since the user is viewing their own data.

---

### 2. Middleman GET Endpoint Mutated State (CRITICAL)
**File:** `backend/app/routers/middleman.py`

**Before:** `GET /deals/{deal_id}` auto-joined users to a deal when their username matched an invite — a state-mutating side effect on a GET request. This violated HTTP semantics and had no row locking, creating a race condition where concurrent GETs could corrupt deal state. Automated tools, browser prefetchers, or link previews could trigger unintended joins.

**After:** GET is now read-only — it allows viewing if invited but never mutates. The existing `POST /deals/{deal_id}/accept` endpoint (explicit user action) handles joining. This endpoint was also hardened with `with_for_update()` row locking and `@limiter.limit("10/minute")` rate limiting.

---

### 3. Middleman Deal Update Race Condition (HIGH)
**File:** `backend/app/routers/middleman.py`

**Before:** `PUT /deals/{deal_id}` (update deal terms) fetched the deal row without `with_for_update()`. Concurrent updates from both parties could race: both read old values, both overwrite, last write wins — potentially losing one party's confirmed terms.

**After:** Added `with_for_update()` to the deal row select in `update_deal_terms`.

---

### 4. Duplicate /join Endpoint Removed
**File:** `backend/app/routers/middleman.py`

A redundant `POST /deals/{deal_id}/join` endpoint was created during the initial fix but duplicated the existing `POST /deals/{deal_id}/accept` endpoint's functionality. The duplicate was removed and the existing `/accept` endpoint was hardened with `with_for_update()` and rate limiting instead.

---

## Files Modified (Session 3)

| File | Changes |
|------|---------|
| `backend/app/schemas.py` | Added `PublicSellerProfile` schema (~75 lines) with only public-safe fields |
| `backend/app/routers/sellers.py` | `GET /featured` and `GET /{seller_id}` now use `PublicSellerProfile` |
| `backend/app/routers/middleman.py` | GET made read-only, `/accept` hardened with row lock + rate limit, `/join` duplicate removed, PUT update_deal_terms got row lock |

---

## Session 4 — Full Security Audit (35 Findings)

Comprehensive audit of all backend routers, models, schemas, auth, payment, payout, and task files. 35 findings identified (4 CRITICAL, 9 HIGH, 12 MEDIUM, 10 LOW). All CRITICAL and HIGH issues fixed, plus most MEDIUM and actionable LOW items.

### CRITICAL Fixes

**C-1. Float Arithmetic on Financial Balances**
All 52 balance mutation lines across 10 files wrapped with `round(..., 2)` to prevent floating-point drift.

**C-2. Admin Arbitrary Balance on User Creation**
Removed `balance` parameter from admin user creation endpoint; hardcoded to `balance=0.0`.

**C-3. Impersonation JWT Scope Too Wide**
Added `imp: True` claim to impersonation JWTs. Created `reject_impersonation()` helper in `auth.py`. Blocks impersonated sessions from: PIN set/change/remove, username change, and withdrawals.

**C-4. Auction Bid Race Condition**
Verified existing `with_for_update()` user row lock already serializes concurrent bids. Added clarifying comment.

### HIGH Fixes

**H-1. Admin Auth Consistency**
Replaced manual role checks with `Depends(get_current_admin)` across 16 endpoints in `banners.py`, `dm.py`, `wtb.py`.

**H-2. Banner Config Schema Injection**
Replaced raw `dict` with `SlotConfigUpdate` Pydantic model with validation for price (0-100000) and max_active (1-100).

**H-3. Missing Rate Limits**
Added `@limiter.limit()` to: `services.py` (create 5/min, update/toggle/delete 10/min), `middleman.py` create_deal (5/min).

**H-4. Middleman Fee Manipulation After Funds Locked**
Added `if deal.funds_locked` check to block fee changes after funds are locked.

**H-5. Public Stats Info Disclosure**
Replaced `active_admins` username list with `active_admin_count` integer in public stats endpoint.

**H-6. Support User Endpoint Unauthenticated**
Added `Depends(get_current_active_user)` to `GET /support-user`.

**H-7. Inquiry Message Length Unbounded**
Added `Field(min_length=1, max_length=2000)` to `MessageCreate.content`.

**H-8. Services Router Missing Rate Limiter**
Imported `limiter` and `Request`, added rate limits to all 4 mutating endpoints.

**H-9. Auction Schema String Length Limits**
Added `Field(min_length=3, max_length=200)` to title, `Field(max_length=5000)` to description in `AuctionCreate` and `AuctionUpdate`.

### MEDIUM Fixes

**M-1/M-2. PIN Change/Remove Lockout Bypass**
PIN change and remove endpoints now implement full exponential lockout logic (failed attempt tracking, temporary lock after 5 failures) instead of bare `bcrypt.checkpw()`.

**M-3. Auction Page/Limit Validation**
Changed `page` to `Query(1, ge=1)` and `limit` to `Query(20, ge=1, le=100)` on list endpoints.

**M-7. Collateral Withdrawal PIN Verification**
Added PIN requirement (via `verify_user_pin`) to `withdraw_collateral` endpoint.

**M-10. Middleman Proposals After Funds Locked**
Block already existed — confirmed `is_proposal` raises 400 when `deal.funds_locked`.

**M-11. Giveaway Weak Randomness**
Replaced `import random` with `import secrets` and `random.shuffle()` with `secrets.SystemRandom().shuffle()` for cryptographically secure winner selection.

**M-12. Dead Code After Return**
Removed unreachable `await db.refresh(deal); return deal` after earlier return in `join_deal_by_code`.

### LOW Fixes

**L-1. Profile Update setattr Allowlist**
Added explicit `ALLOWED_FIELDS = {"email", "other_contact"}` check before `setattr()` in profile update.

**L-9. PIN Hash Column Length**
Changed `pin_hash` from `String` to `String(60)` to enforce bcrypt hash length at DB level.

**L-10. TRC-20 Address Validation**
Already validated in `wallet.py` — confirmed address must start with 'T' and be 34 characters.

### Files Modified (Session 4)

| File | Changes |
|------|---------|
| `backend/app/auth.py` | Added `_is_impersonated` flag, `reject_impersonation()` helper |
| `backend/app/models.py` | `pin_hash` → `String(60)` |
| `backend/app/tasks.py` | `round()` on escrow transfer |
| `backend/main.py` | `active_admin_count` replaces username list |
| `backend/app/routers/admin.py` | Removed balance param, `imp: True` in JWT, `round()` wrapping |
| `backend/app/routers/auctions.py` | Schema limits (title/desc/image_url), page/limit validation |
| `backend/app/routers/auth.py` | Impersonation checks, PIN lockout on change/remove, profile allowlist |
| `backend/app/routers/banners.py` | `Depends(get_current_admin)`, `SlotConfigUpdate` model |
| `backend/app/routers/dm.py` | `Depends(get_current_admin)`, support-user auth |
| `backend/app/routers/giveaways.py` | `secrets.SystemRandom()` for winner selection |
| `backend/app/routers/inquiries.py` | `MessageCreate.content` max_length=2000 |
| `backend/app/routers/middleman.py` | `round()` wrapping, fee lock, create_deal rate limit, proposal block, dead code removal |
| `backend/app/routers/orders.py` | `round()` wrapping on all balance ops |
| `backend/app/routers/payments.py` | `round()` wrapping |
| `backend/app/routers/sellers.py` | `round()` wrapping, collateral PIN verification |
| `backend/app/routers/services.py` | Rate limiter on all mutating endpoints |
| `backend/app/routers/wallet.py` | `round()` wrapping, impersonation check |
| `backend/app/routers/wtb.py` | `Depends(get_current_admin)` on unarchive |
