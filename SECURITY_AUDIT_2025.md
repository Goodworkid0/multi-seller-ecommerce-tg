# Security Audit Report — Gimmick Marketplace

**Date:** 2025-07-13  
**Scope:** Full backend (FastAPI) + frontend API client  
**Audited files:** All routers, models, schemas, auth, database, main.py, frontend api.js  

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH     | 4 |
| MEDIUM   | 6 |
| LOW      | 4 |

The application demonstrates generally strong security practices: JWT tokens with version-based invalidation, `with_for_update()` row locking on financial operations, rate limiting on sensitive endpoints, Pydantic schema validation, CORS restricted in production, and Telegram auth signature verification. The findings below represent areas for improvement.

---

## CRITICAL

### 1. Middleman GET Endpoint Has Mutation Side Effects — Auto-Join Without Invite Code

**File:** `backend/app/routers/middleman.py` lines 362–452  
**Severity:** CRITICAL  
**CWE:** CWE-352 (Unexpected State Change via GET), CWE-284 (Improper Access Control)

**Code:**
```python
@router.get("/deals/{deal_id}", response_model=MiddlemanDealSchema)
async def get_deal(deal_id: int, current_user=Depends(get_current_active_user), ...):
    ...
    # Allow joining by username match
    if not is_participant and not is_admin:
        username_lower = (current_user.username or '').lower()
        if deal.seller_id is None and deal.seller_username and username_lower == deal.seller_username.lower():
            deal.seller_id = current_user.id
            deal.seller_username = current_user.username
            deal.status = MiddlemanStatus.NEGOTIATING
            ...
            await db.commit()
```

**Attack scenario:**
- Deal IDs are sequential integers. An attacker can enumerate `/api/middleman/deals/1`, `/api/middleman/deals/2`, etc.
- If the attacker's username matches the `seller_username` or `buyer_username` on any `PENDING_INVITE` deal, they are **silently auto-joined** just by issuing a GET request.
- While Telegram usernames are unique, the platform allows custom handles via the paid `$50` username change feature. A user who changes their platform username to match an invited party's handle before that party joins could hijack the deal.
- No `with_for_update()` on the deal row during auto-join — race condition with the legitimate `/deals/{deal_id}/accept` flow.
- A GET request should NEVER mutate state — this violates HTTP semantics and can be triggered by prefetch, browser history, link previews, etc.

**Recommended fix:**
1. Remove auto-join logic from `GET /deals/{deal_id}`. The proper `POST /deals/{deal_id}/accept` and `POST /join/{invite_code}` endpoints already exist.
2. If auto-join on GET is desired for UX, at minimum add `with_for_update()` on the deal row and validate that `deal.status == MiddlemanStatus.PENDING_INVITE` explicitly before mutating.

---

## HIGH

### 2. Unauthenticated Endpoint Under Admin Prefix Leaks Banned User Data

**File:** `backend/app/routers/admin.py` lines ~2280–2320  
**Severity:** HIGH  
**CWE:** CWE-200 (Exposure of Sensitive Information)

**Code:**
```python
@router.get("/blacklist")
async def get_blacklist(db: AsyncSession = Depends(get_db)):
    """Public: get list of all banned users. No auth required."""
    result = await db.execute(
        select(User).where(User.is_banned == True)
    )
    users = result.scalars().all()
    return [{
        "username": u.username,
        "first_name": u.first_name,
        "avatar_url": u.avatar_url,
        "ban_reason": u.ban_reason,
        "banned_at": u.banned_at.isoformat() if u.banned_at else None,
    } for u in users]
```

**Attack scenario:**
- Endpoint is at `GET /api/admin/blacklist` with **zero authentication**.
- Exposes usernames, display names, avatar URLs, and ban reasons of all banned users.
- Ban reasons may contain sensitive admin notes (e.g., "scammed user X out of $500", "chargebacks on stolen cards").
- Attacker can use this list for social engineering, impersonation, or reputation attacks.

**Recommended fix:**
- Add `current_user: User = Depends(get_current_active_user)` to the endpoint.
- Consider censoring `ban_reason` for non-admin viewers, or only return a sanitized subset.

### 3. Public Stats Endpoint Leaks Active Admin Usernames

**File:** `backend/main.py` lines ~220–260  
**Severity:** HIGH  
**CWE:** CWE-200 (Exposure of Sensitive Information)

**Code:**
```python
@app.get("/api/public/stats")
async def public_stats(db: AsyncSession = Depends(get_db)):
    ...
    active_admins = []
    if not hide_admin:
        admin_result = await db.execute(
            select(User.username).where(
                User.id.in_(active_user_ids),
                User.role == UserRole.ADMIN
            )
        )
        active_admins = [row[0] or "Admin" for row in admin_result.all()]
    ...
    return { ..., "active_admins": active_admins, ... }
```

**Attack scenario:**
- `hide_admin_activity` defaults to `False`. Any unauthenticated request to `GET /api/public/stats` reveals which admin usernames are currently active.
- This enables targeted social engineering or timing attacks — attackers know exactly when admins are online and which admin accounts to target.
- Also leaks `middleman_fee` and `middleman_min_fee` platform configuration.

**Recommended fix:**
- Default `hide_admin_activity` to `True`.
- Remove admin usernames from the public stats response entirely, or gate them behind admin auth.

### 4. User Schema Exposes Financial Fields to All Viewers

**File:** `backend/app/schemas.py` lines 49–105  
**Severity:** HIGH  
**CWE:** CWE-200 (Exposure of Sensitive Information)

**Code:**
```python
class User(UserBase):
    id: int
    role: UserRole
    balance: float = 0.0
    pending_balance: float = 0.0
    escrow_balance: float = 0.0
    collateral: float = 0.0
    warning_count: int = 0
    restricted_until: Optional[datetime] = None
    notification_prefs: Optional[dict] = None
    ...
```

**Attack scenario:**
- The `User` response schema includes `balance`, `pending_balance`, `escrow_balance`, `collateral`, `warning_count`, `restricted_until`, and `notification_prefs`.
- `SellerProfile` inherits from `User` and adds more financial fields.
- Any endpoint that returns another user's data via these schemas (seller profiles, order items, middleman deals) exposes private financial information.
- An attacker can determine which users have large balances to target for social engineering.

**Recommended fix:**
- Create separate `UserPublic` and `UserPrivate` schemas. Only return balance/escrow/pending_balance for the authenticated user's own profile (`GET /api/auth/me`).
- Audit all endpoints that return `User` or `SellerProfile` schemas to use the restricted public variant for non-owner views.

### 5. Product Keys (License Keys) Stored in Cleartext

**File:** `backend/app/models.py` lines 194–206  
**Severity:** HIGH  
**CWE:** CWE-312 (Cleartext Storage of Sensitive Information)

**Code:**
```python
class ProductKey(Base):
    __tablename__ = "product_keys"
    key_value = Column(String)  # The actual key/code
    is_sold = Column(Boolean, default=False)
```

**Attack scenario:**
- Game keys, license codes, and account credentials are stored as plaintext in the database.
- A database breach (SQL injection elsewhere, backup theft, insider threat) exposes all unsold and sold product keys in cleartext.
- These keys have direct monetary value — a breach would cause immediate financial loss to all sellers.

**Recommended fix:**
- Encrypt `key_value` at rest using application-level encryption (e.g., Fernet symmetric encryption with a key from environment variable).
- Decrypt only when delivering to the buyer after purchase.

---

## MEDIUM

### 6. Middleman Deal Terms Update Missing Row Lock

**File:** `backend/app/routers/middleman.py` lines 456–515  
**Severity:** MEDIUM  
**CWE:** CWE-362 (Race Condition)

**Code:**
```python
@router.put("/deals/{deal_id}", response_model=MiddlemanDealSchema)
async def update_deal_terms(deal_id, data, current_user, db):
    result = await db.execute(
        select(MiddlemanDeal).where(MiddlemanDeal.id == deal_id)
        # No .with_for_update() !
    )
```

**Attack scenario:**
- A race condition between `update_deal_terms` and `confirm_deal` (which does lock) could allow deal amount to change between confirmation check and fund locking.
- Attacker could lower the deal amount via concurrent request during the confirmation window.

**Recommended fix:** Add `.with_for_update()` to the deal query in `update_deal_terms`.

### 7. File Upload Extension Not Validated Against Content Type

**File:** `backend/app/routers/products.py`, `admin.py`, `banners.py`  
**Severity:** MEDIUM  
**CWE:** CWE-434 (Unrestricted Upload of File with Dangerous Type)

**Code:**
```python
safe_name = os.path.basename(file.filename or "upload")
filename = f"{uuid4().hex}_{safe_name}"
filepath = os.path.join(UPLOAD_DIR, filename)
```

**Analysis:**
- `os.path.basename()` strips directory components — prevents path traversal. UUID prefix ensures uniqueness.
- Content type is checked (must be image/\*), but the original file extension is preserved.
- A file named `payload.html` with a forged `image/png` content type would be saved and served. While `X-Content-Type-Options: nosniff` is set (good), serving files with `Content-Disposition: inline` could still enable stored XSS in older browsers.

**Recommended fix:**
- Validate that file extension matches the declared content type.
- Serve uploaded files with `Content-Disposition: attachment` or strip the original extension, using only UUID + validated extension.

### 8. Dead Code After Return in Join-by-Code

**File:** `backend/app/routers/middleman.py` line ~1682  
**Severity:** MEDIUM (code quality / correctness)

```python
    return result.scalar_one()
    await db.refresh(deal)   # ← Dead code, never executed
    return deal              # ← Dead code, never executed
```

**Recommended fix:** Remove the unreachable code.

### 9. Seller Profile Update Accessible to All Authenticated Users

**File:** `backend/app/routers/sellers.py` lines 247–255  
**Severity:** MEDIUM  
**CWE:** CWE-285 (Improper Authorization)

**Code:**
```python
@router.put("/profile", response_model=SellerProfile)
async def update_seller_profile(
    updates: UserUpdate,
    current_user: User = Depends(get_current_active_user),  # Not get_current_seller
    ...
):
    update_data = updates.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(current_user, field, value)
```

**Attack scenario:**
- Any authenticated buyer can set `shop_name` via `PUT /api/sellers/profile`, effectively gaining seller-level access since `get_current_seller` only checks for `shop_name` being non-null.
- This bypasses the formal `POST /api/sellers/become` seller registration flow.
- The `UserUpdate` schema is limited to safe profile fields (no `role`, `balance`, etc.) — so this is not mass assignment. But it circumvents business logic.

**Recommended fix:** Use `Depends(get_current_seller)` or prevent `shop_name` from being set outside the formal registration flow.

### 10. Inconsistent Admin Authorization Patterns

**File:** `backend/app/routers/middleman.py`, `dm.py`, `wtb.py`, `banners.py`  
**Severity:** MEDIUM  
**CWE:** CWE-863 (Incorrect Authorization)

Some admin endpoints use `get_current_active_user` + inline role check instead of `Depends(get_current_admin)`. While currently functionally equivalent, this pattern-mixing is error-prone and a maintenance risk.

**Recommended fix:** Standardize all admin-gated endpoints to use `Depends(get_current_admin)`.

### 11. Missing Startup Validation for Webhook Secret

**File:** `backend/app/routers/payments.py` lines 22–27 and 47–52  
**Severity:** MEDIUM  

```python
NOWPAYMENTS_IPN_SECRET = os.getenv("NOWPAYMENTS_IPN_SECRET", "")

def _verify_signature(raw_body, signature):
    if not NOWPAYMENTS_IPN_SECRET or not signature:
        return False
```

If `NOWPAYMENTS_IPN_SECRET` is not set while `NOWPAYMENTS_API_KEY` is set, deposits can be created via the API but the webhook will never credit them — all signature verifications silently fail. This is a silent misconfiguration that could cause fund loss.

**Recommended fix:** Log a warning at startup if `NOWPAYMENTS_API_KEY` is set but `NOWPAYMENTS_IPN_SECRET` is not.

---

## LOW

### 12. No Content-Security-Policy Header

**File:** `backend/main.py` lines 102–115  
**Severity:** LOW

Security headers include X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy, and HSTS — but no CSP.

**Recommended fix:** Add an appropriate CSP header for the SPA.

### 13. Sequential Integer IDs Enable Enumeration

**File:** `backend/app/models.py` (all models)  
**Severity:** LOW  
**CWE:** CWE-330 (Insufficient Randomness)

All entities use auto-increment integer primary keys, enabling enumeration of total entity counts and iteration through resources.

**Recommended fix:** For sensitive resources (deals, orders, deposits), consider adding a `public_id` UUID for external-facing references.

### 14. Telegram Auth Bypass in Non-Production

**File:** `backend/app/auth.py` lines 49–55  
**Severity:** LOW  

```python
if not BOT_TOKEN:
    if ENVIRONMENT != "production":
        return True  # Dev mode only
```

When `BOT_TOKEN` is unset and `ENVIRONMENT` is not `production`, auth verification is completely bypassed. If a staging instance is exposed without `BOT_TOKEN`, anyone can authenticate as any Telegram user.

**Recommended fix:** Require an explicit `ALLOW_DEV_AUTH=true` env var rather than inferring from environment name.

### 15. Dev Login Endpoint in Non-Production

**File:** `backend/app/routers/auth.py` lines ~174–210  
**Severity:** LOW

The `/dev-login` endpoint accepts any `telegram_id` and creates a session. While gated behind environment check and rate limited, an exposed staging instance would have a direct authentication bypass.

**Recommended fix:** Consider requiring a `DEV_LOGIN_SECRET` header value.

---

## Positive Security Observations

The following practices are well-implemented:

1. **JWT token versioning** — `token_version` checked on every request; logout invalidates all tokens.
2. **Row locking on financial operations** — `with_for_update()` used in order payment, auction bidding, withdrawals, middleman fund locking, banner booking.
3. **Rate limiting** — slowapi on auth, bidding, messaging, withdrawals, PIN operations.
4. **PIN with exponential lockout** — Withdrawals require PIN; failed attempts trigger exponential backoff (up to 60 min).
5. **CORS restricted in production** — Origins from env vars; empty list blocks all cross-origin requests.
6. **Docs/OpenAPI disabled in production** — `/docs` and `/openapi.json` not registered.
7. **Security headers** — HSTS, X-Content-Type-Options, Referrer-Policy, Permissions-Policy all set.
8. **SPA path traversal protection** — `.resolve()` + `.startswith()` check on served files.
9. **Request ID sanitization** — Client `X-Request-ID` validated with strict regex.
10. **URL protocol validation** — `_validate_url_protocol()` blocks `javascript:` and `data:` URIs.
11. **HMAC signature verification** — NowPayments webhooks verified via HMAC-SHA512 before processing.
12. **Audit logging** — Admin impersonation, dispute resolution, banning, PIN operations logged.
13. **Error handling** — Global exception handler returns generic errors with request ID; no stack traces leaked.
14. **Pydantic validation** — Input schemas enforce field lengths, ranges, and patterns.

---

*End of audit report.*
