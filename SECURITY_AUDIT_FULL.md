# Comprehensive Security Audit Report

**Project:** Gimmick — Telegram Marketplace WebApp  
**Date:** 2025-07-12  
**Scope:** All backend routers, models, schemas, auth, payment, payout, tasks, frontend auth  
**Files Analyzed:** 30+ source files (~15,000 lines of code)

---

## Executive Summary

The application demonstrates solid security fundamentals: Telegram auth verification with HMAC, JWT `token_version` for session invalidation, `with_for_update()` row locking on financial operations, bcrypt-hashed PINs with exponential lockout, and proper LIKE-clause escaping. However, several **critical** and **high** severity issues were identified—primarily around inconsistent authorization enforcement, missing rate limits on sensitive endpoints, floating-point financial arithmetic, and business logic flaws in the escrow/auction systems.

---

## CRITICAL — Immediate fix required

### C-1. Floating-Point Arithmetic on Financial Balances

**Files:** [models.py](backend/app/models.py#L40-L45), [models.py](backend/app/models.py#L540), [models.py](backend/app/models.py#L700-L710)  
**Category:** Business Logic Flaw

All monetary fields use `Numeric(12, 2, asdecimal=False)` (returns Python `float`) or plain `Float`. Product prices, auction bids, middleman deal amounts, collateral, pending/escrow balances, referral rewards, and payout amounts all flow through Python `float` arithmetic.

**Impact:** Rounding errors accumulate over thousands of transactions. A balance of `$100.10` minus `$0.30` may yield `$99.79999999999998` rather than `$99.80`. Attackers can exploit systematic rounding bias on micro-transactions.

**Affected models/fields:**
- `User.balance`, `User.pending_balance`, `User.escrow_balance`, `User.collateral` — `Numeric(12,2,asdecimal=False)`
- `Product.price` — `Float` (no precision control at all)
- `MiddlemanDeal.amount`, `.fee_amount` — `Float`
- `Auction.start_price`, `.current_bid`, `.buyout_price` — `Float`
- `Service.price` — `Float`
- `BannerBooking.price_paid` — `Float`
- `AuctionBid.amount` — `Float`

**Fix:** Remove `asdecimal=False` from `Numeric` columns so SQLAlchemy returns `Decimal`. Change all `Float` price/amount columns to `Numeric(12, 2)`. Use `Decimal` exclusively in business logic. Wrap `calc_seller_amount` and all fee calculations to use `Decimal`.

---

### C-2. Admin User Creation with Arbitrary Balance

**File:** [admin.py](backend/app/routers/admin.py#L220-L260) (approx.)  
**Category:** Business Logic Flaw

The `admin_create_user` endpoint accepts a `balance` parameter and sets it directly on newly created users. An admin (or anyone who compromises an admin account) can mint unlimited funds.

**Impact:** Unlimited money creation. No audit trail differentiating admin-created balance from deposited funds.

**Fix:** Remove `balance` from user creation schema or hard-cap it at 0 in production. Add audit logging for any admin balance manipulation.

---

### C-3. Admin Impersonation Creates Full JWT Without Scope Restrictions

**File:** [admin.py](backend/app/routers/admin.py#L280-L330) (approx.)  
**Category:** Authorization Bypass

The impersonation endpoint creates a real access token for the target user with no "impersonation" scope or flag. The token is indistinguishable from the user's own token.

**Consequences:**
1. Impersonated token can change user PIN, submit withdrawals, modify profile
2. No downstream endpoint can detect it's an impersonated session
3. Only protection is a 15-minute expiry, but that's enough for financial damage

**Fix:** Add an `"imp": true` claim to impersonation JWTs. Reject PIN changes, withdrawals, and profile mutations when `imp` is set. Log all actions taken under impersonation with admin ID.

---

### C-4. Auction Bid Balance Check Without Deduction — Virtual Reserve Race Condition

**File:** [auctions.py](backend/app/routers/auctions.py#L370-L440)  
**Category:** Race Condition / Business Logic Flaw

When placing a bid, the system checks `available_balance = balance - reserved_bids` but **does not actually deduct** the bid amount from the user's balance. The "reserve" is computed dynamically each time by summing winning bids.

**Attack scenario:**
1. User has $100 balance
2. User places $90 bid on Auction A → passes check ($100 - $0 = $100 available)
3. Simultaneously in a parallel request, user places $90 bid on Auction B → **also passes** ($100 - $0 = $100 before the first bid's commit)
4. User now has $180 in virtual obligations but only $100

The `with_for_update()` on the auction row does NOT serialize concurrent bids on **different** auctions. The user row IS locked, but the reserved balance query races with the other transaction's uncommitted bid.

**Fix:** Lock the user row with `with_for_update()` (already done) AND ensure the reserved-balance query includes the current transaction's pending bids, OR deduct balance into an `auction_escrow` field atomically under the user row lock with `SERIALIZABLE` isolation.

---

## HIGH — Fix in next release

### H-1. Inconsistent Admin Authorization — Manual Role Checks vs. `get_current_admin`

**Files:** [banners.py](backend/app/routers/banners.py#L87-L89), [banners.py](backend/app/routers/banners.py#L470), [dm.py](backend/app/routers/dm.py#L420-L450)  
**Category:** Authorization Bypass Risk

Multiple admin endpoints use `get_current_active_user` + inline `if current_user.role != UserRole.ADMIN` instead of the `get_current_admin` dependency. While functionally equivalent today, this pattern:
- Is fragile—easy to forget the check when adding new endpoints
- Doesn't appear in OpenAPI security scheme annotations
- Doesn't benefit from centralized admin role enforcement changes

**Affected endpoints (non-exhaustive):**
- All `banners.py` admin endpoints (`create_banner`, `update_banner`, `delete_banner`, `upload_banner_image`, admin booking management)
- `dm.py`: admin start conversation, admin send message, admin conversation list
- `wtb.py`: unarchive post

**Fix:** Replace all `Depends(get_current_active_user)` + manual role check with `Depends(get_current_admin)` on admin-only routes.

---

### H-2. Banner Slot Config Update Accepts Arbitrary `dict` — No Schema Validation

**File:** [banners.py](backend/app/routers/banners.py#L555-L575)  
**Category:** Input Validation / Injection

```python
@router.put("/admin/slots/config")
async def update_slot_config(config: dict, ...):
```

The slot config endpoint accepts a raw unvalidated `dict`. An admin (or attacker with admin access) can inject arbitrary JSON into `AppSettings.banner_slot_pricing`, potentially including negative prices, excessively large `max_active` counts, or unexpected key types that crash downstream `_get_slot_config()`.

**Fix:** Define a Pydantic model for slot config with strict field validation (price ≥ 0, max_active ≥ 1, valid position names only).

---

### H-3. Missing Rate Limits on Financial Endpoints

**Category:** Rate Limiting Gap

Several sensitive endpoints have no rate limiting:

| Endpoint | File | Risk |
|---|---|---|
| `POST /api/orders/{id}/pay` | [orders.py](backend/app/routers/orders.py) | Rapid payment attempts |
| `POST /api/orders` (create) | [orders.py](backend/app/routers/orders.py) | Order bombing |
| `POST /api/middleman/deals` | [middleman.py](backend/app/routers/middleman.py) | Spam deal creation |
| `POST /api/middleman/deals/{id}/confirm` | [middleman.py](backend/app/routers/middleman.py) | Rapid lock attempts |
| `POST /api/middleman/deals/{id}/complete` | [middleman.py](backend/app/routers/middleman.py) | Completion spam |
| `POST /api/auth/pin/change` (beyond 5/min) | [auth.py](backend/app/routers/auth.py) | PIN brute-force already limited, but pin/change doesn't use `verify_user_pin` lockout |
| `POST /api/referrals/apply` | [referrals.py](backend/app/routers/referrals.py) | Referral code guessing |

**Fix:** Add `@limiter.limit()` to all financial and state-changing endpoints. Suggested: 5-10/minute for payments, 3/minute for deal creation.

---

### H-4. Middleman Deal Fee Can Be Changed After Funds Are Locked

**File:** [middleman.py](backend/app/routers/middleman.py#L1220-L1270) (approx.)  
**Category:** Business Logic Flaw

The admin `update_fee` endpoint only blocks changes on `completed` deals. A deal in `confirmed` status (funds already locked from buyer's balance) can have its fee percentage changed by admin.

**Impact:** Admin can increase fee after buyer has committed funds, reducing seller's payout without consent. While admin is trusted, this violates the principle that locked-in deal terms are immutable.

**Fix:** Block fee updates when `deal.funds_locked == True`.

---

### H-5. Public Stats Endpoint Leaks Admin Usernames

**File:** [main.py](backend/app/main.py#L250-L280) (approx.)  
**Category:** Information Disclosure

`/api/public/stats` returns active admin user count and (when `hide_admin_activity` is not set) potentially exposes admin handles. Even with `hide_admin_activity`, the admin count is still returned, confirming admin presence.

**Fix:** Always omit admin-specific stats from public endpoints. Move admin stats to an authenticated admin-only endpoint.

---

### H-6. Support User Info Exposed Without Authentication

**File:** [dm.py](backend/app/routers/dm.py#L280-L300) (approx.)  
**Category:** Information Disclosure

`GET /api/dm/support-user` has no `Depends(get_current_active_user)`. Anyone can query the support user's ID, username, avatar, and display name without authentication.

**Fix:** Add `get_current_active_user` dependency.

---

### H-7. `MessageCreate` Schema in `inquiries.py` Has No Length Limit

**File:** [inquiries.py](backend/app/routers/inquiries.py#L24-L25)  
**Category:** Input Validation

```python
class MessageCreate(BaseModel):
    content: str
```

The Pydantic schema has no `max_length` on `content`. While the endpoint handler manually checks `len(content) > 2000`, the schema itself doesn't enforce it, meaning the full oversized payload is still parsed and allocated in memory before rejection.

**Fix:** Add `Field(min_length=1, max_length=2000)` to the schema.

---

### H-8. Services Router Missing Rate Limits Entirely

**File:** [services.py](backend/app/routers/services.py)  
**Category:** Rate Limiting Gap

No endpoint in the services router has any rate limiting. An attacker can rapidly create, update, toggle, and delete services without throttling.

**Fix:** Add rate limits: `create_service` (5/min), `update_service` (10/min), `toggle/delete` (10/min).

---

### H-9. Auction `update_auction` Schema Has No String Length Limits

**File:** [auctions.py](backend/app/routers/auctions.py#L38-L46)  
**Category:** Input Validation

```python
class AuctionUpdate(BaseModel):
    title: Optional[str] = None         # no max_length
    description: Optional[str] = None   # no max_length
```

Similarly, `AuctionCreate.title` and `.description` have no length restrictions. An attacker could submit multi-MB strings in title/description fields. The DB column is `String` (unlimited in SQLite/Postgres).

**Fix:** Add `Field(min_length=3, max_length=200)` for title, `Field(max_length=5000)` for description.

---

## MEDIUM — Fix in upcoming sprint

### M-1. PIN Change Endpoint Doesn't Use Lockout Logic

**File:** [auth.py](backend/app/routers/auth.py#L550-L575)  
**Category:** Business Logic Flaw

`POST /api/auth/pin/change` directly calls `bcrypt.checkpw()` on the old PIN without going through `verify_user_pin()`, which implements exponential lockout. An attacker with a stolen session token can brute-force the old PIN at the endpoint's rate limit (5/min) without triggering any lockout.

**Fix:** Use `verify_user_pin(current_user, payload.old_pin, db)` instead of manual bcrypt check.

---

### M-2. PIN Removal Endpoint Doesn't Use Lockout Logic

**File:** [auth.py](backend/app/routers/auth.py#L580-L600)  
**Category:** Business Logic Flaw

Same issue as M-1. `DELETE /api/auth/pin/remove` does manual bcrypt check without lockout.

**Fix:** Use `verify_user_pin()`.

---

### M-3. `list_auctions` Doesn't Validate `page`/`limit` Query Params

**File:** [auctions.py](backend/app/routers/auctions.py#L52-L57)  
**Category:** Input Validation

```python
page: int = 1,
limit: int = 20,
```

No `Query(ge=1)` or `Query(ge=1, le=100)` — user can pass `page=-1` or `limit=999999`. The `limit` is capped via `min(limit, 100)` inline but `page` is unconstrained (negative page → negative offset).

**Fix:** Use `page: int = Query(1, ge=1)` and `limit: int = Query(20, ge=1, le=100)`.

---

### M-4. `get_auction` Exposes Non-Active Auctions to Public

**File:** [auctions.py](backend/app/routers/auctions.py#L140-L170)  
**Category:** Information Disclosure

Unlike `get_service()` which hides inactive services, `get_auction()` returns auction details for ALL statuses (including draft, cancelled). All bid history including bidder names is also exposed.

**Fix:** Filter out non-public statuses for unauthenticated access, or require authentication for draft/cancelled auctions.

---

### M-5. Product Key Upload from File Has No Count Limit

**File:** [products.py](backend/app/routers/products.py#L800-L850) (approx.)  
**Category:** Input Validation

When uploading keys via file (CSV/JSON/text), there's no limit on the number of keys parsed. The schema-based bulk create has `max_length=5000`, but file uploads bypass this, allowing unlimited key insertion in a single request.

**Fix:** Cap file-parsed keys at 5000 (consistent with schema limit). Reject uploads exceeding the threshold.

---

### M-6. Auction `image_url` Accepts Arbitrary Strings — No URL Validation

**File:** [auctions.py](backend/app/routers/auctions.py#L28-L46)  
**Category:** Input Validation

`AuctionCreate.image_url` and `AuctionUpdate.image_url` accept `Optional[str]` with no URL format validation. Unlike banner schemas which validate URL protocol, auction images can contain `javascript:` or arbitrary strings stored in the DB and potentially rendered on the frontend.

**Fix:** Add URL validation similar to `_validate_url_protocol` used in other schemas, or restrict to uploaded image paths.

---

### M-7. Collateral Deposit/Withdraw Missing PIN Verification

**File:** [sellers.py](backend/app/routers/sellers.py#L490-L540)  
**Category:** Business Logic Flaw

`POST /api/sellers/collateral/deposit` and `POST /api/sellers/collateral/withdraw` move funds between balance and collateral without requiring PIN verification. Withdrawals only require a paid seller account.

**Fix:** Require PIN verification for collateral withdrawal (at minimum), consistent with the withdrawal request flow.

---

### M-8. No Pagination on Notification Queries with `selectinload`

**File:** [notifications.py](backend/app/routers/notifications.py#L120-L130)  
**Category:** Performance / DoS

`list_notifications` caps results at 100 but users with thousands of notifications still trigger the query. More critically, `_ensure_subscription_notifications` runs on every notification list call, which could create duplicate notifications in edge cases (multiple rapid calls).

**Fix:** Add database-level deduplication for subscription notifications (unique constraint on user_id + type + time window).

---

### M-9. WTB Post Detail Exposes Total Deposit Amounts (Privacy)

**File:** [wtb.py](backend/app/routers/wtb.py#L370-L440)  
**Category:** Information Disclosure

The `get_wtb_post` endpoint exposes `total_deposit_amount` (as a tier label like "$500+") and `total_transactions` for every user who posts or replies. While tiered, this leaks the approximate financial activity of any user to the public.

**Fix:** Only show deposit tier to the user themselves, or make it opt-in in user privacy settings.

---

### M-10. Middleman Message Proposals Can Modify Deal Terms Without Role Check

**File:** [middleman.py](backend/app/routers/middleman.py#L900-L950) (approx.)  
**Category:** Business Logic Flaw

The `send_message` endpoint allows `is_proposal=True` with `proposed_amount` and `proposed_terms`. The check is only that the sender is a deal participant (buyer/seller/admin). There's no validation that proposals are only allowed before terms are confirmed, meaning proposals can be sent after funds are locked.

**Fix:** Block proposals when `deal.funds_locked == True` or `deal.status` is past `negotiation`.

---

### M-11. Giveaway Random Winner Uses Python `random` — Not Cryptographically Secure

**File:** [giveaways.py](backend/app/routers/giveaways.py#L470-L490)  
**Category:** Business Logic Flaw

```python
random.shuffle(available)
```

Python's `random` module uses Mersenne Twister (MT19937), which is predictable if the seed is known. For a public giveaway with prizes, this could be exploited.

**Fix:** Use `secrets.SystemRandom()` or `random.SystemRandom()` for winner selection.

---

### M-12. Dead Code After Return in `join_deal_by_code`

**File:** [middleman.py](backend/app/routers/middleman.py#L1600-L1619) (approx.)  
**Category:** Code Quality

```python
return deal_schema
await db.refresh(deal)  # Dead code — never reached
return deal
```

Code after `return` is unreachable. This suggests incomplete refactoring and may indicate that the intended final state was not properly committed/refreshed.

**Fix:** Remove dead code after the `return` statement.

---

## LOW — Track for future improvement

### L-1. `UserContactUpdate` Schema Allows Setting Arbitrary Fields via `setattr`

**File:** [auth.py](backend/app/routers/auth.py#L450-L460)  
**Category:** Input Validation

```python
update_data = updates.model_dump(exclude_unset=True)
for field, value in update_data.items():
    setattr(current_user, field, value)
```

While `UserContactUpdate` schema should restrict which fields are settable, if the schema is ever expanded incautiously (e.g., adding `role` or `balance`), this pattern silently allows privilege escalation.

**Fix:** Use an explicit allowlist: `for field in ("bio", "contact_info", ...): if field in update_data: setattr(...)`.

---

### L-2. `list_auctions` and `list_services` Use `page * limit` Without Integer Overflow Protection

**Files:** [auctions.py](backend/app/routers/auctions.py#L82), [services.py](backend/app/routers/services.py#L90)  
**Category:** Input Validation

With unvalidated `page` param (auctions), `(page - 1) * limit` could overflow for extreme values. Python handles arbitrary-precision ints, so this is a minor DB performance concern rather than a crash.

**Fix:** Validate `page` with `Query(ge=1, le=10000)`.

---

### L-3. No CSRF Protection on State-Modifying GET Endpoints

**Category:** Security Best Practice

While the app uses JWT Bearer tokens (not cookies), which naturally prevents CSRF, some endpoints like `GET /api/auth/balance` modify state indirectly (seller expiry downgrade in `get_current_user`). This is acceptable for bearer-token auth but worth noting.

---

### L-4. Telegram Bot Token in Dev Mode Allows Auth Bypass

**File:** [auth.py](backend/app/auth.py#L38-L41)  
**Category:** Security Configuration

```python
if not BOT_TOKEN:
    if ENVIRONMENT == "production":
        return False
    return True  # Dev mode only
```

In non-production environments without a `BOT_TOKEN`, all Telegram auth verification is bypassed. If `ENVIRONMENT` is accidentally left as `development` in a deployed instance, authentication is completely disabled.

**Fix:** Add a startup warning or crash if `ENVIRONMENT != "production"` and the app is accessible on a public network. Log the environment mode prominently.

---

### L-5. `dev-login` Endpoint Registered in Non-Production

**File:** [auth.py](backend/app/routers/auth.py#L155-L175)  
**Category:** Security Configuration

`POST /api/auth/dev-login` allows login with any `telegram_id` without verification. Similarly, `POST /api/admin/system/nuke` exists in non-production. Both are correctly gated by `ENVIRONMENT != "production"`, but could be dangerous if environment detection is wrong.

**Fix:** Add an additional env var like `ENABLE_DEV_ENDPOINTS=true` that must be explicitly set.

---

### L-6. Exception Details Logged But Not Always Sanitized

**File:** [main.py](backend/app/main.py#L180-L200) (approx.)  
**Category:** Information Disclosure

The unhandled error middleware returns `"An internal error occurred"` in production (good), but the logged traceback may contain sensitive data (API keys, DB connection strings) that ends up in log files.

**Fix:** Ensure log rotation and access controls on log files. Consider structured logging that filters sensitive fields.

---

### L-7. `search` Parameters Could Cause Slow Queries

**Files:** Multiple routers  
**Category:** Performance / DoS

All search endpoints use `ILIKE '%term%'` which forces full table scans. For large datasets, this enables query-based DoS.

**Fix:** Add database indexes for common search patterns (trigram indexes in PostgreSQL). Consider full-text search or ElasticSearch for large deployments.

---

### L-8. `BannerBookingCreate.duration_days` Allows `ge=7` But Slot Pricing Uses Fixed 30-Day

**File:** [schemas.py](backend/app/schemas.py#L880-L895), [banners.py](backend/app/routers/banners.py#L320-L340)  
**Category:** Business Logic Inconsistency

The schema allows `duration_days` from 7 to 90, but the booking endpoint and availability check both use a fixed 30-day duration. The user pays based on position price regardless of `duration_days`. A user booking for 90 days pays the same as 7 days.

**Fix:** Either enforce `duration_days=30` in the schema, or scale the price by actual duration.

---

### L-9. PIN Hash Stored as String — Type Mismatch Possible

**File:** [models.py](backend/app/models.py#L30-L35) (approx.)  
**Category:** Code Quality

`pin_hash` is stored as `String`. The bcrypt hash includes the salt, so this works. However, there's no column length constraint, and the bcrypt output is always 60 chars.

**Fix:** Use `String(60)` for `pin_hash` to enforce length at the DB level.

---

### L-10. Withdrawal Destination Not Validated as TRC-20 Address

**File:** [wallet.py](backend/app/routers/wallet.py#L250-L280) / [sellers.py](backend/app/routers/sellers.py#L380-L420) (approx.)  
**Category:** Input Validation

The withdrawal creation endpoint accepts `destination` as an `Optional[str]` with a `max_length=500` but doesn't validate it as a valid TRC-20 address format. The `tron_payout.py` module validates at payout time, but rejected payouts waste admin processing time.

**Fix:** Validate TRC-20 address format (starts with 'T', 34 chars, base58 checksum) at withdrawal request time.

---

## Summary Table

| Severity | Count | Key Themes |
|----------|-------|------------|
| **CRITICAL** | 4 | Float financials, admin balance creation, impersonation scope, auction race condition |
| **HIGH** | 9 | Inconsistent admin auth, missing rate limits, fee manipulation, info disclosure |
| **MEDIUM** | 12 | PIN lockout bypass, input validation gaps, privacy leaks, weak randomness |
| **LOW** | 10 | Configuration risks, code quality, performance concerns |
| **Total** | **35** | |

## Positive Security Practices Observed

1. **HMAC verification** on both Telegram Login Widget and Mini App auth, plus NowPayments webhooks
2. **`with_for_update()` row locking** consistently used on balance mutations
3. **`token_version`** for JWT invalidation — proper session termination
4. **PIN exponential lockout** with bcrypt hashing
5. **LIKE-clause escaping** (`%` and `_` escaped) on all search endpoints
6. **Path traversal protection** in SPA middleware
7. **`os.path.basename()`** used on all file-serving endpoints
8. **File upload validation** (extension whitelist + size limits)
9. **Self-purchase/self-bid prevention** on orders and auctions
10. **Auth date freshness check** (5-min max age) on Telegram login
11. **Security headers** (HSTS, X-Content-Type-Options, X-Frame-Options) in production
12. **Audit logging** on sensitive operations (payouts, admin actions, login)
13. **`hmac.compare_digest()`** for timing-safe hash comparison
14. **Banned user enforcement** via `get_current_active_user` dependency
15. **Referral self-referral prevention** and duplicate check
