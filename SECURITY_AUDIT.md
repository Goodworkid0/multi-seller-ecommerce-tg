# Security Audit Report — Gimmick Backend

**Date:** 2025  
**Scope:** All FastAPI backend files (`backend/app/` — routers, models, auth, tasks, payout modules)  
**Methodology:** Full manual source-code review of all 23+ Python files  

---

## Executive Summary

The application is a crypto-powered digital goods marketplace built with FastAPI, SQLAlchemy (async), and JWT authentication. It handles real money through NowPayments deposits and Tron hot-wallet USDT payouts.

The codebase has **critical financial vulnerabilities** that can lead to direct monetary loss, including a hardcoded promo code giving any user $200, use of floating-point arithmetic for all monetary operations, multiple race conditions in balance operations, and a broken HMAC verification function in the payment webhook. There are also several authorization bypass vectors, information disclosure issues, and missing input validation across the platform.

**Summary of Findings:**

| Severity | Count |
|---|---|
| Critical | 7 |
| High | 11 |
| Medium | 14 |
| Low | 8 |
| Informational | 7 |
| **Total** | **47** |

---

## CRITICAL

### C-1 — Hardcoded Promo Code Gives $200 to Any User

**File:** `backend/app/routers/middleman.py`  
**Lines:** ~290 and ~1650

```python
# In create_deal (line ~290):
PROMO_CODES = {
    "XDEV#7429!TEST": 200.0,
}

promo_code = (payload.promo_code or "").strip()
if promo_code and promo_code in PROMO_CODES:
    bonus = PROMO_CODES[promo_code]
    user_row = await db.execute(select(User).where(User.id == current_user.id).with_for_update())
    user_obj = user_row.scalar_one()
    user_obj.balance += bonus
    ...
```

**Description:** A hardcoded promo code `XDEV#7429!TEST` exists in the middleman router that gives **$200 in free balance** to any user who supplies it when creating a deal or joining via invite. There is **no per-user usage limit** — the same user can apply it repeatedly by creating multiple deals with `amount=0`.

**Impact:** Unlimited free money. Any attacker who discovers the code (e.g. via leaked source, decompiled client, or brute force) can mint unlimited funds and withdraw them.

**Fix:** Remove the hardcoded promo code immediately. If promo codes are needed, implement them as database records with: single-use enforcement, per-user limits, expiration dates, and admin management.

---

### C-2 — Broken HMAC Verification in Payment Webhook (`hmac.new`)

**File:** `backend/app/routers/payments.py`  
**Lines:** 47-53

```python
def _verify_signature(raw_body: bytes, signature: str) -> bool:
    if not NOWPAYMENTS_IPN_SECRET or not signature:
        return False
    expected = hmac.new(                          # ← BUG: should be hmac.HMAC
        NOWPAYMENTS_IPN_SECRET.encode("utf-8"),
        raw_body,
        hashlib.sha512
    ).hexdigest()
    return hmac.compare_digest(expected, signature)
```

**Description:** `hmac.new` is not a valid Python function. The correct function is `hmac.HMAC` (or the shorthand `hmac.new` does not exist in the standard library — it's `hmac.HMAC`). However, Python's `hmac` module **does** define `hmac.new` as an alias for `hmac.HMAC`, so this actually works. Let me re-verify...

**Update after verification:** Python's `hmac.new()` IS a valid function (it's the documented constructor). This is NOT a bug. Reclassified to Informational (I-1).

---

### C-2 (Revised) — Float Arithmetic for All Monetary Operations

**File:** Every file handling money — `models.py`, `orders.py`, `payments.py`, `wallet.py`, `middleman.py`, `sellers.py`, `auctions.py`, `admin.py`, `tasks.py`, `database.py`

```python
# models.py
balance = Column(Float, default=0.0)
pending_balance = Column(Float, default=0.0)
escrow_balance = Column(Float, default=0.0)
collateral = Column(Float, default=0.0)
amount = Column(Float, default=0.0)
price = Column(Float)
# ...every single monetary column uses Float

# database.py
def calc_seller_amount(price: float, fee_percent: float) -> float:
    fee_percent = max(0, min(fee_percent, 99))
    return price * (1 - fee_percent / 100)
```

**Description:** Every monetary value in the system — user balances, order totals, fees, escrow amounts, withdrawal amounts — uses `Float` (IEEE 754 double-precision floating point). This leads to **rounding errors** that accumulate over time. For example: `0.1 + 0.2 = 0.30000000000000004` in floating point.

**Impact:** Over thousands of transactions, rounding errors can cause: balances going slightly negative (bypassing the `balance < amount` check), pennies appearing or disappearing, fee calculations being inconsistent, and auditing discrepancies. In a financial system handling real cryptocurrency, this is critical.

**Fix:** Use `Numeric(precision=18, scale=8)` (or `Numeric(12, 2)` for USD) for all monetary columns. Use Python's `decimal.Decimal` for all calculations. Add `CHECK` constraints to prevent negative balances at the database level.

---

### C-3 — Race Condition: Concurrent Order Payment Can Double-Spend Balance

**File:** `backend/app/routers/orders.py`  
**Lines:** ~160-230 (pay_order endpoint)

```python
@router.post("/{order_id}/pay")
async def pay_order(order_id: int, ...):
    # 1. Load order (no lock)
    result = await db.execute(select(Order).where(Order.id == order_id)...)
    order = result.scalar_one_or_none()
    ...
    # 2. Lock buyer row
    buyer_result = await db.execute(select(User).where(User.id == buyer.id).with_for_update())
    buyer = buyer_result.scalar_one()
    
    if buyer.balance < order.total_amount:
        raise HTTPException(...)
    
    buyer.balance -= order.total_amount
```

**Description:** While the buyer row is locked with `with_for_update()`, the **order row is not locked**. Two concurrent requests for the same order can both pass the `order.status == PENDING` check before either commits. The buyer's balance is correctly serialized (locked), but if the same order is paid twice in rapid succession, the buyer pays twice for the same order and only gets keys once.

Additionally, the stock-assignment loop fetches available keys without a lock on the product row:
```python
keys_result = await db.execute(
    select(ProductKey).where(
        ProductKey.product_id == item.product_id,
        ProductKey.is_sold == False
    ).limit(item.quantity).with_for_update()
)
```
Keys are locked with `with_for_update()`, which is good, but if no keys are available after locking, the order still goes through as "paid" with 0 keys delivered.

**Impact:** Double payment for the same order; potential race in key assignment where two buyers get the same key or one buyer gets no keys.

**Fix:** Lock the order row with `with_for_update()` when loading it at the beginning of `pay_order`. Add a check after key assignment to verify the expected number of keys were actually assigned.

---

### C-4 — Race Condition in Middleman Deal Confirmation (Double Fund Locking)

**File:** `backend/app/routers/middleman.py`  
**Lines:** ~430-490 (confirm_deal endpoint)

```python
@router.post("/{deal_id}/confirm")
async def confirm_deal(deal_id: int, ...):
    deal = await db.get(MiddlemanDeal, deal_id)   # ← No lock!
    ...
    if is_buyer and not deal.buyer_confirmed:
        deal.buyer_confirmed = True
    if is_seller and not deal.seller_confirmed:
        deal.seller_confirmed = True
    
    if deal.buyer_confirmed and deal.seller_confirmed:
        # Lock buyer funds
        buyer_result = await db.execute(select(User).where(User.id == deal.buyer_id).with_for_update())
        buyer = buyer_result.scalar_one()
        total_cost = deal.amount + deal.fee_amount
        if buyer.balance < total_cost:
            raise HTTPException(...)
        buyer.balance -= total_cost
        deal.funds_locked = True
```

**Description:** The deal row is fetched without `with_for_update()`. Two concurrent confirmation requests (e.g., buyer and seller confirm simultaneously) can both see `buyer_confirmed=False, seller_confirmed=False`, both set their flag, and both try to lock funds — leading to funds being deducted twice, or concurrent transactions stepping on each other.

**Impact:** Double deduction of buyer funds for the same deal. Money lost.

**Fix:** Fetch the deal with `with_for_update()`: `deal = await db.get(MiddlemanDeal, deal_id, with_for_update=True)` or use the explicit select pattern.

---

### C-5 — Auction Buy-Now Does Not Lock Auction Row

**File:** `backend/app/routers/auctions.py`  
**Lines:** ~400-460 (buy_now endpoint)

```python
@router.post("/{auction_id}/buy-now")
async def buy_now(auction_id: int, ...):
    result = await db.execute(
        select(Auction).where(Auction.id == auction_id)  # ← No with_for_update()
        .options(selectinload(Auction.seller))
    )
    auction = result.scalar_one_or_none()
    ...
    if auction.status != AuctionStatus.ACTIVE:
        raise HTTPException(...)
    ...
    # Deduct buyer balance
    buyer_result = await db.execute(select(User).where(User.id == current_user.id).with_for_update())
    buyer = buyer_result.scalar_one()
    buyer.balance -= auction.buyout_price
```

**Description:** Two users hitting "Buy Now" simultaneously will both see `status == ACTIVE`, both pass the check, and both get charged. The auction row is not locked, so both transactions proceed. Only one order is created per transaction, but both buyers lose their money.

**Impact:** One buyer pays for an auction item but never receives it (the other buyer's order overwrites or conflicts).

**Fix:** Lock the auction row with `with_for_update()` when loading it.

---

### C-6 — Webhook Signature Bypass When IPN Secret Is Empty

**File:** `backend/app/routers/payments.py`  
**Lines:** 47-49

```python
def _verify_signature(raw_body: bytes, signature: str) -> bool:
    if not NOWPAYMENTS_IPN_SECRET or not signature:
        return False
```

**Description:** If `NOWPAYMENTS_IPN_SECRET` is not set (empty string is the default), the function returns `False` and correctly rejects the webhook. However, this means a **misconfigured deployment** (forgetting to set the env var) will reject all legitimate webhooks, causing deposits to never be credited. There is no startup check or warning for this critical configuration.

More importantly, the payout webhook at lines ~350-408:

```python
@router.post("/nowpayments/payout-webhook")
async def nowpayments_payout_webhook(request: Request, db: AsyncSession = Depends(get_db)):
    raw = await request.body()
    signature = request.headers.get("x-nowpayments-sig", "")
    if not _verify_signature(raw, signature):
        raise HTTPException(status_code=401, detail="Invalid signature")
```

If the secret IS set but an attacker sends a request with an empty `x-nowpayments-sig` header, the function correctly returns `False`. This is safe. **However, the issue is that the IPN secret defaults to empty string**, and there's no validation at startup that it's configured, meaning the entire deposit system silently stops working.

**Impact:** Deposits silently fail in misconfigured deployments. Not exploitable for injection but causes operational failure.

**Fix:** Add a startup validation check that raises an error if `NOWPAYMENTS_IPN_SECRET` is empty when `NOWPAYMENTS_API_KEY` is set. Log a clear error message.

---

### C-7 — Tron Private Key in Environment Variable Without Access Controls

**File:** `backend/app/tron_payout.py`  
**Lines:** 30-31

```python
TRON_PRIVATE_KEY = os.getenv("TRON_PRIVATE_KEY", "")
TRON_WALLET_ADDRESS = os.getenv("TRON_WALLET_ADDRESS", "")
```

**Description:** The Tron hot wallet private key is loaded as a plain environment variable. While env vars are a common approach, the key is:
1. Stored as module-level global — accessible to any code in the process
2. No mechanism to use a secrets manager, HSM, or encrypted vault
3. The hot wallet endpoint in admin.py exposes wallet balance publicly to any admin
4. The `_get_private_key()` function creates the key object on every call but also caches the client globally

Combined with the dev-login endpoint (see H-1) and admin impersonation (see H-3), compromise of a single admin account could lead to the attacker viewing the hot wallet balance and draining it through the admin withdrawal approval flow.

**Impact:** Full drainage of the hot wallet if the private key is compromised. The key controls all USDT payouts.

**Fix:** Use a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.). Implement transaction signing in an isolated service. Add withdrawal amount limits and velocity checks. Require multi-admin approval for large withdrawals.

---

## HIGH

### H-1 — Dev Login Endpoint Exists in All Environments

**File:** `backend/app/routers/auth.py`  
**Lines:** 163-195

```python
@router.post("/dev-login", response_model=Token)
@limiter.limit("5/minute")
async def dev_login(request: Request, telegram_id: str, db: AsyncSession = Depends(get_db)):
    """Development login - disabled in production!"""
    if ENVIRONMENT == "production":
        raise HTTPException(status_code=403, detail="Disabled in production")
    ...
```

**Description:** The `/api/auth/dev-login` endpoint is registered in **all environments**. It only checks the `ENVIRONMENT` env var at runtime. If the env var is misconfigured, misspelled (e.g., `"Production"` vs `"production"` — though `.lower()` is applied), or accidentally unset (defaults to `"production"` in auth.py but `"development"` in main.py), an attacker could authenticate as **any user** by simply providing their Telegram ID.

Note the inconsistency: `auth.py` line 18 has `ENVIRONMENT = os.getenv("ENVIRONMENT", "production")` but `main.py` line 22 has `ENVIRONMENT = os.getenv("ENVIRONMENT", "development")`.

**Impact:** Full authentication bypass — attacker can log in as any user including admins.

**Fix:** Do not register the dev-login route in production at all. Use a conditional `app.include_router()` based on environment, not a runtime check inside the handler. Fix the inconsistent ENVIRONMENT defaults.

---

### H-2 — Nuke Endpoint Registered in All Environments

**File:** `backend/app/routers/admin.py`  
**Lines:** ~1760-1800

```python
@router.post("/system/nuke")
async def nuke_everything(data: NukeConfirm, ...):
    if ENVIRONMENT == "production":
        raise HTTPException(status_code=403, detail="NUKE endpoint is disabled in production")
    ...
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
```

**Description:** The `/api/admin/system/nuke` endpoint **drops all database tables and deletes all uploaded files**. It's guarded by `ENVIRONMENT == "production"` but is registered and callable in all environments. Same risk as H-1 — if the ENVIRONMENT check fails, an admin can wipe the entire database.

**Impact:** Complete data loss — all users, orders, balances, and files destroyed.

**Fix:** Only register this route conditionally: `if ENVIRONMENT != "production": router.post("/system/nuke")(nuke_handler)`.

---

### H-3 — Admin Impersonation Without Audit Trail or Restrictions

**File:** `backend/app/routers/admin.py`  
**Lines:** ~180-210

```python
@router.post("/users/{user_id}/impersonate")
async def impersonate_user(user_id: int, ...):
    user = await db.get(User, user_id)
    ...
    access_token = create_access_token(data={"sub": user.telegram_id, "tv": int(user.token_version or 0)})
    refresh_token = create_refresh_token(data={"sub": user.telegram_id, "tv": int(user.token_version or 0)})
    return {"access_token": access_token, ...}
```

**Description:** Any admin can generate a fully functional token pair for **any user** with no restrictions:
- No audit log of who was impersonated and why
- The impersonation token is indistinguishable from a real user token
- No time limit on the impersonation token
- Can impersonate other admins
- Can be used to withdraw funds, create orders, etc.

**Impact:** Admin can perform any action as any user with no accountability. A compromised admin account can drain all user balances.

**Fix:** Log all impersonation events to an immutable audit log. Add an `impersonated_by` claim to the JWT so actions can be traced. Prevent impersonating other admins. Set a short expiry (e.g., 15 minutes). Require confirmation/2FA.

---

### H-4 — Admin Manual Deposit Credit Without Verification

**File:** `backend/app/routers/admin.py`  
**Lines:** ~350-400

```python
@router.post("/deposits/{deposit_id}/credit")
async def admin_credit_deposit(deposit_id: int, ...):
    ...
    user.balance += amount
    deposit.is_credited = True
    ...
```

And in auth.py:
```python
@router.post("/deposit", response_model=UserSchema)
async def deposit_balance(payload: BalanceUpdate, current_user: User = Depends(get_current_admin), ...):
    if ENVIRONMENT == "production":
        raise HTTPException(status_code=403, detail="Use crypto deposits in production")
    current_user.balance += payload.amount
```

**Description:** Admins can manually credit any deposit to any user's balance. The `/api/auth/deposit` endpoint also allows admin to add up to $10,000 to their own balance (disabled in production but same ENVIRONMENT risk as H-1). There's no blockchain verification that the deposit was actually received.

**Impact:** Rogue admin can mint unlimited funds and withdraw them.

**Fix:** Require dual-admin approval (maker-checker) for manual credits. Log all manual credits to an immutable audit log. Add a reconciliation check against actual blockchain receipts.

---

### H-5 — No PIN Lockout After Failed Attempts

**File:** `backend/app/routers/auth.py`  
**Lines:** ~430-450 (verify_pin)

```python
@router.post("/pin/verify")
@limiter.limit("10/minute")
async def verify_pin(request: Request, payload: PinVerifyRequest, ...):
    if not bcrypt.checkpw(payload.pin.encode(), current_user.pin_hash.encode()):
        raise HTTPException(status_code=403, detail="Invalid PIN")
    return {"message": "PIN verified"}
```

**Description:** The PIN verification has a rate limit of 10/minute via IP, but there is **no account-level lockout**. The model has `pin_failed_attempts` and `pin_locked_until` fields, but they are **never used**. A 4-digit PIN has only 10,000 combinations. At 10 attempts/minute, an attacker can brute-force any PIN in ~17 minutes from a single IP, or faster using multiple IPs.

**Impact:** PIN bypass through brute force, enabling unauthorized withdrawals and actions.

**Fix:** Implement the account lockout logic using the existing `pin_failed_attempts` and `pin_locked_until` fields. Lock the account after 5 failed attempts for 30 minutes. Increment the counter on each failure and reset on success.

---

### H-6 — Mass Assignment via `setattr` in Profile Update

**File:** `backend/app/routers/auth.py`  
**Lines:** ~370-380

```python
@router.put("/profile", response_model=UserSchema)
async def update_profile(updates: UserContactUpdate, ...):
    update_data = updates.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(current_user, field, value)
```

**Description:** `UserContactUpdate` only allows `email` and `other_contact`, which is safe. However, the same pattern exists in other places:

- `banners.py` line ~130: `for field, value in update_data.items(): setattr(banner, field, value)` — `BannerUpdate` schema is open-ended
- `banners.py` line ~505: Same pattern for booking updates — `BannerBookingUpdate` allows setting `is_approved` and `status`, but there are no checks that the resulting state is valid

The banners `BannerUpdate` schema allows any fields to be set including `is_active`, `position`, etc. While the schema constrains the types, it doesn't prevent updating fields that should require specific business logic.

**Impact:** Potential bypass of business logic constraints through direct field updates.

**Fix:** Explicitly set each allowed field instead of using `setattr` loops. Validate field combinations (e.g., `is_approved` should trigger additional business logic).

---

### H-7 — SQL Injection via Unsanitized Search in WTB Listing

**File:** `backend/app/routers/wtb.py`  
**Lines:** ~118-121

```python
if search:
    q = q.where(
        WtbPost.title.ilike(f"%{search}%") | WtbPost.description.ilike(f"%{search}%")
    )
```

**Description:** The `search` parameter is interpolated directly into the ILIKE pattern without escaping `%` or `_` wildcard characters. While using SQLAlchemy's `ilike()` prevents SQL injection because the value is parameterized, the **LIKE wildcards** `%` and `_` are not escaped, allowing pattern manipulation.

Compare with `services.py` which does it correctly:
```python
escaped = search.replace("%", r"\%").replace("_", r"\_")
query = query.where(Service.title.ilike(f"%{escaped}%", escape='\\'))
```

The same issue exists in:
- `admin.py` WTB post search (line ~1880)
- `products.py` product search

**Impact:** Users can craft search queries that match unintended records using SQL wildcards. Not classic SQL injection, but can cause denial of service through expensive regex-like patterns.

**Fix:** Escape `%` and `_` in all search inputs, as done in `services.py`.

---

### H-8 — Withdrawal Address Validation Is Insufficient

**File:** `backend/app/routers/wallet.py`  
**Lines:** ~90-100

```python
if destination and not destination.startswith("T"):
    raise HTTPException(status_code=400, detail="Only TRC-20 (USDT) withdrawal is supported. Address must start with T.")
if destination and len(destination) != 34:
    raise HTTPException(status_code=400, detail="Invalid TRC-20 address length")
```

**Description:** The withdrawal address is validated only by checking it starts with "T" and is 34 characters long. This does not verify:
- Base58Check encoding validity
- Correct checksum
- That the address actually exists on the Tron network

The `tron_payout.py` has a `validate_address()` function that does proper Base58Check validation, but **it's never called** during the withdrawal request flow.

**Impact:** Users could submit malformed addresses, causing failed payouts and funds stuck in limbo. The withdrawal amount is already deducted from their balance before payout.

**Fix:** Call `validate_address()` from `tron_payout.py` during the withdrawal request creation. Add it to both `wallet.py` and `sellers.py` withdrawal endpoints.

---

### H-9 — Duplicate Withdrawal Endpoints with Different Validation

**File:** `backend/app/routers/wallet.py` and `backend/app/routers/sellers.py`

```python
# wallet.py - /api/wallet/withdraw
@router.post("/withdraw")
async def create_withdrawal(payload, current_user, ...):
    # Requires PIN verification
    if not current_user.pin_hash:
        raise HTTPException(400, "Set a PIN before withdrawing")
    if not bcrypt.checkpw(pin.encode(), current_user.pin_hash.encode()):
        raise HTTPException(403, "Invalid PIN")
    ...

# sellers.py - /api/sellers/withdraw  
@router.post("/withdraw", response_model=WithdrawalRequestSchema)
async def request_withdrawal(payload, current_user, ...):
    # NO PIN required!
    ...
```

**Description:** There are two separate withdrawal endpoints. The `wallet.py` endpoint requires PIN verification; the `sellers.py` endpoint does **not**. Both deduct from `user.balance` and create a `WithdrawalRequest`. An attacker who compromises a session token can withdraw via the sellers endpoint without knowing the PIN.

**Impact:** PIN bypass for withdrawals — any session hijack leads to immediate fund theft.

**Fix:** Remove one of the duplicate endpoints or ensure both require PIN verification. The sellers endpoint should at minimum require `get_current_seller` (which it does) AND a PIN.

---

### H-10 — Admin Can Approve Own Withdrawal

**File:** `backend/app/routers/admin.py`  
**Lines:** ~1150-1200

```python
@router.post("/withdrawals/{withdrawal_id}/approve")
async def approve_withdrawal(withdrawal_id: int, current_user: User = Depends(get_current_admin), ...):
    ...
    # No check that current_user != withdrawal.user_id
```

**Description:** An admin can approve their own withdrawal request. There is no segregation-of-duties check.

**Impact:** A single compromised admin can create and approve unlimited withdrawals, draining the hot wallet.

**Fix:** Add a check: `if withdrawal.user_id == current_user.id: raise HTTPException(403, "Cannot approve your own withdrawal")`. Require a different admin to approve.

---

### H-11 — Sensitive Data Exposure in Blacklist Endpoint

**File:** `backend/app/routers/admin.py`  
**Lines:** ~2100-2130

```python
@router.get("/blacklist")
async def get_blacklist(db: AsyncSession = Depends(get_db)):
    """Public: get list of all banned users. No auth required."""
    ...
    return [{
        "id": u.id,
        "telegram_id": u.telegram_id,  # ← exposes real Telegram ID
        "username": u.username,
        ...
    }]
```

**Description:** The public blacklist endpoint (no authentication required) exposes internal `telegram_id` values and database `id`s of banned users. This leaks PII and internal identifiers to unauthenticated callers.

**Impact:** Attacker can harvest Telegram IDs and internal user IDs for targeted attacks.

**Fix:** Remove `telegram_id` and `id` from the public response. Only expose `username` and `ban_reason`.

---

## MEDIUM

### M-1 — No CSRF Protection

**Description:** The API uses JWT Bearer tokens (not cookies), which inherently prevents CSRF for API calls. However, since this is a Telegram Mini App running inside an iframe/webview, and CORS allows credentials (`allow_credentials=True`), there may be edge cases where the token is stored in a way that could be CSRF-vulnerable (e.g., if stored in a cookie).

**File:** `backend/main.py`, lines 80-86

```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=bool(ALLOWED_ORIGINS),
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)
```

**Impact:** Low in current architecture (Bearer tokens in Authorization header), but `allow_credentials=True` with specific origins is a prerequisite for credential-based attacks if the auth mechanism changes.

**Fix:** Only set `allow_credentials=True` if cookies are actually used. Otherwise set it to `False`.

---

### M-2 — No Rate Limiting on Financial Endpoints

**File:** Multiple routers

The following critical financial endpoints have **no rate limiting**:
- `POST /api/orders/{id}/pay` — Pay for an order
- `POST /api/wallet/withdraw` — Request withdrawal
- `POST /api/sellers/withdraw` — Request withdrawal (duplicate)
- `POST /api/middleman/{id}/confirm` — Lock escrow funds
- `POST /api/auctions/{id}/bid` — Place a bid
- `POST /api/auctions/{id}/buy-now` — Instant purchase
- `POST /api/banners/slots/book` — Book banner slot (deducts balance)
- `POST /api/sellers/become-seller` — Purchase seller rank
- `POST /api/sellers/renew` — Renew seller subscription

While some endpoints like login and PIN have rate limits, the actual money-moving endpoints are unprotected.

**Impact:** Automated attacks can rapidly drain balances, create spam orders, or abuse the system.

**Fix:** Add `@limiter.limit()` decorators to all financial endpoints. Example: `@limiter.limit("5/minute")` for withdrawals, `@limiter.limit("30/minute")` for orders.

---

### M-3 — Order Messages Lack Content Sanitization

**File:** `backend/app/routers/orders.py`  
**Lines:** ~800-850

```python
@router.post("/{order_id}/messages")
async def send_order_message(order_id: int, data: OrderMessageCreate, ...):
    msg = OrderMessage(
        order_id=order.id,
        sender_id=current_user.id,
        content=data.content  # ← No sanitization
    )
```

**Description:** Messages in orders, DMs, inquiries, and middleman deals are stored as raw text without sanitization. If the frontend renders these with `dangerouslySetInnerHTML` or equivalent, it could lead to stored XSS.

Same issue in:
- `dm.py` — Direct messages
- `inquiries.py` — Inquiry messages
- `middleman.py` — Deal messages

**Impact:** Stored XSS if frontend doesn't sanitize output. Can steal JWT tokens, session data, or redirect users.

**Fix:** While the backend should store raw text (sanitization is a frontend concern), consider: (1) Adding a Content-Security-Policy header to mitigate XSS impact, (2) Adding explicit HTML entity encoding for fields that will be displayed, (3) Validating that message content doesn't contain script tags.

---

### M-4 — Product Keys Stored in Plaintext

**File:** `backend/app/models.py`  
**Lines:** ~192-195

```python
class ProductKey(Base):
    key_value = Column(String)  # The actual key/code - stored in plaintext
```

**Description:** Product keys (game keys, serial numbers, etc.) are stored as plaintext in the database. Keys are also returned directly via the API when an order is delivered.

**Impact:** A database breach exposes all product keys in cleartext. This includes both sold and unsold keys.

**Fix:** Encrypt keys at rest using a symmetric key (AES-256-GCM). Decrypt only when delivering to the buyer. Store the encryption key separately (in a KMS/vault, not in the database or env vars).

---

### M-5 — No Idempotency Protection on Financial Operations

**File:** Multiple routers

Endpoints like `pay_order`, `confirm_deal`, `buy_now`, `book_banner_slot`, and `become_seller` can be called multiple times. While some have status checks (e.g., `order.status == PENDING`), network retries or client-side double-clicks could cause issues:

```python
# orders.py - pay_order
if order.status != OrderStatus.PENDING:
    raise HTTPException(status_code=400, detail="Order is not pending")
# This check happens before the lock, creating a TOCTOU issue
```

**Impact:** Duplicate charges, double-spending, or inconsistent state.

**Fix:** Implement idempotency keys for all state-changing financial endpoints. Accept an `Idempotency-Key` header and cache responses for the same key.

---

### M-6 — Inconsistent ENVIRONMENT Default Values

**File:** Multiple files

```python
# auth.py
ENVIRONMENT = os.getenv("ENVIRONMENT", "production").strip().lower()

# main.py  
ENVIRONMENT = os.getenv("ENVIRONMENT", "development")

# admin.py
ENVIRONMENT = os.getenv("ENVIRONMENT", "production").strip().lower()
```

**Description:** `auth.py` and `admin.py` default to `"production"` (fail-safe), but `main.py` defaults to `"development"` (fail-open). If `ENVIRONMENT` is not set:
- `main.py` thinks it's development → exposes Swagger docs, allows localhost CORS
- `auth.py` thinks it's production → blocks dev-login (safe)

But `main.py` controls CORS origins and Swagger docs exposure, which could leak API documentation in production.

**Impact:** Swagger docs exposed in production if env var is not set. Inconsistent security posture across modules.

**Fix:** Standardize all ENVIRONMENT defaults to `"production"` (fail-safe). Better yet, read it once in a central config module and import from there.

---

### M-7 — Uploaded Files Not Scanned or Validated Beyond Extension

**File:** `backend/app/routers/admin.py`, `banners.py`, `products.py`

```python
# admin.py - logo upload
ext = (file.filename or "logo.png").rsplit(".", 1)[-1].lower()
if ext not in ("png", "jpg", "jpeg", "svg", "webp"):
    raise HTTPException(status_code=400, detail="Only PNG/JPG/SVG/WebP allowed")
filename = f"logo.{ext}"
filepath = os.path.join(UPLOAD_DIR, filename)
with open(filepath, "wb") as f:
    f.write(content)
```

**Description:** File uploads are validated only by extension, not by content (magic bytes). An attacker can upload a PHP shell or HTML file with a `.png` extension. SVG files can contain JavaScript.

**Impact:** XSS via SVG uploads, potential RCE if the web server executes uploaded files.

**Fix:** Validate file content by checking magic bytes. Strip SVG files of script elements. Serve uploaded files with `Content-Type` headers that prevent execution and `Content-Disposition: attachment`. Consider using `X-Content-Type-Options: nosniff` (already set).

---

### M-8 — Telegram Auth Verification Skipped in Development

**File:** `backend/app/auth.py`  
**Lines:** 42-45

```python
def verify_telegram_auth(auth_data: dict) -> bool:
    if not BOT_TOKEN:
        if ENVIRONMENT == "production":
            return False
        return True  # Dev mode only
```

**Description:** When `BOT_TOKEN` is not set and environment is not production, Telegram auth verification returns `True` for any data. This means anyone can authenticate as any Telegram user in development/staging environments. If a staging environment is accidentally exposed to the internet...

**Impact:** Full auth bypass on any non-production environment.

**Fix:** Never skip verification. In development, use a mock verification against a known test token. Log a clear warning if `BOT_TOKEN` is not set.

---

### M-9 — No Pagination Limit Enforcement on Some Endpoints

**File:** Multiple routers

Some endpoints allow unbounded data retrieval:

```python
# notifications.py
@router.get("", response_model=List[NotificationSchema])
async def get_notifications(limit: int = 50, ...):  # No max enforcement
```

```python
# dm.py - messages
@router.get("/{conversation_id}")
async def get_conversation(conversation_id: int, ...):
    # Returns ALL messages with no pagination
    ...selectinload(DirectConversation.messages)...
```

**Impact:** Denial of service through large responses. Memory exhaustion on the server.

**Fix:** Enforce maximum limits on all paginated endpoints. Add pagination to message retrieval endpoints.

---

### M-10 — No Withdrawal Amount Limits or Velocity Checks

**File:** `backend/app/routers/wallet.py`

```python
class WithdrawalCreate(BaseModel):
    amount: float = Field(gt=0)
    destination: str = Field(min_length=34, max_length=34)
    pin: str = Field(min_length=4, max_length=6, pattern=r'^\d{4,6}$')
```

**Description:** There are no daily/weekly withdrawal limits, no velocity checks (e.g., detecting rapid consecutive withdrawals), and no cooling-off period after changing the withdrawal address.

**Impact:** A compromised account can immediately withdraw all funds in a single transaction.

**Fix:** Add configurable daily/weekly withdrawal limits. Implement a 24-hour delay on first withdrawal after address change. Alert the user via Telegram for large withdrawals. Require re-authentication (PIN + Telegram) for withdrawals above a threshold.

---

### M-11 — Referral Self-Referencing Not Fully Prevented

**File:** `backend/app/routers/referrals.py`  
**Lines:** ~180-210

```python
if referrer.id == current_user.id:
    raise HTTPException(status_code=400, detail="Cannot use your own referral code")
```

**Description:** While using your own code is blocked, there's no check for **referral chains** (A refers B, B refers A) or multi-account referral farming. The referral reward is % of each future purchase, creating an incentive for fake referrals.

**Impact:** Users with multiple accounts can farm referral bonuses indefinitely.

**Fix:** Track referral chains and flag circular references. Implement anti-fraud heuristics (same IP, rapid account creation, etc.). Cap total referral earnings.

---

### M-12 — Notification Telegram Messages Sent via Fire-and-Forget

**File:** `backend/app/telegram.py`  
**Lines:** ~85-90

```python
try:
    asyncio.create_task(send_telegram(tid, msg))
except RuntimeError:
    pass
```

**Description:** Telegram notifications are sent as fire-and-forget tasks with no retry logic, no tracking, and errors are silently swallowed. Failed Telegram messages are lost.

**Impact:** Users miss critical notifications about deposits, withdrawals, dispute resolutions, and order status changes.

**Fix:** Add retry logic with exponential backoff. Log failed deliveries. Track delivery status in the database.

---

### M-13 — Banner Booking Refund Not Atomic with Delete

**File:** `backend/app/routers/banners.py`  
**Lines:** ~530-550

```python
@router.delete("/admin/bookings/{booking_id}")
async def delete_booking(booking_id: int, refund: bool = Query(False), ...):
    if refund and booking.price_paid > 0:
        user_result = await db.execute(select(User).where(User.id == booking.user_id).with_for_update())
        user = user_result.scalar_one_or_none()
        if user:
            user.balance = (user.balance or 0) + booking.price_paid
    await db.delete(booking)
    await db.commit()
```

**Description:** The refund amount is taken from `booking.price_paid` without any audit trail. If this endpoint is called multiple times before the booking is deleted (unlikely but possible if the delete fails), the user could be refunded multiple times. Also, if the `db.commit()` fails after the balance update but before the booking delete, the balance is incremented but the booking still exists, allowing another refund.

**Impact:** Potential double refund due to non-atomic operation.

**Fix:** Use a single transaction and add an audit record. Mark the booking as refunded before deleting.

---

### M-14 — Service Category Endpoint Accepts Raw Dict Instead of Pydantic Model

**File:** `backend/app/routers/admin.py`  
**Lines:** ~1960

```python
@router.post("/service-categories")
async def admin_create_service_category(
    payload: dict,  # ← No validation!
    current_user: User = Depends(get_current_admin),
    ...
):
    name = (payload.get("name") or "").strip()
```

**Description:** This endpoint accepts a raw `dict` instead of a Pydantic model, bypassing all input validation. Any keys in the payload are accepted without type checking or constraint validation.

**Impact:** No input validation — could pass unexpected data types or oversized values.

**Fix:** Create a proper Pydantic model: `class ServiceCategoryCreate(BaseModel): name: str = Field(min_length=2, max_length=100); icon: str = "briefcase"`.

---

## LOW

### L-1 — No Content-Security-Policy Header

**File:** `backend/main.py`

The security headers middleware adds several headers but omits `Content-Security-Policy`, which is the most effective defense against XSS.

**Fix:** Add `Content-Security-Policy: default-src 'self'; script-src 'self'` or appropriate policy.

---

### L-2 — `datetime.utcnow()` Is Deprecated

**File:** All files

Every file uses `datetime.utcnow()` which is deprecated in Python 3.12+. It returns a naive datetime without timezone info, which can cause issues when comparing with timezone-aware datetimes.

**Fix:** Use `datetime.now(datetime.UTC)` or `datetime.now(timezone.utc)`.

---

### L-3 — Swagger Docs Exposed in Non-Production

**File:** `backend/main.py`  
**Lines:** 67-70

```python
docs_url="/docs" if os.getenv("ENVIRONMENT", "development") != "production" else None,
```

Since `ENVIRONMENT` defaults to `"development"` in `main.py`, Swagger docs are exposed unless explicitly set to `"production"`.

**Fix:** Default to `None` (no docs) and only enable with explicit opt-in.

---

### L-4 — Login History Shows IP Addresses Without Privacy Controls

**File:** `backend/app/routers/auth.py`  
**Lines:** ~335-365

IP addresses are stored and returned to the user without hashing or masking. Under GDPR and similar regulations, IP addresses are considered personal data.

**Fix:** Consider hashing IPs for storage and showing only partial IPs (e.g., `192.168.xxx.xxx`) in the UI.

---

### L-5 — No Request Size Limits

**File:** `backend/main.py`

There's no global request body size limit. FastAPI/Starlette has a default of ~1MB, but endpoints like key upload (`/products/{id}/keys/upload`) can accept large files. The file upload endpoints have per-endpoint size checks, but these read the entire file into memory first.

**Fix:** Set a global body size limit via middleware. Stream large file uploads instead of reading into memory.

---

### L-6 — Auction Bid Does Not Prevent Shill Bidding

**File:** `backend/app/routers/auctions.py`

```python
if auction.seller_id == current_user.id:
    raise HTTPException(status_code=400, detail="Cannot bid on your own auction")
```

While self-bidding is prevented, there's no detection of shill bidding (seller using alternate accounts to artificially inflate the price).

**Fix:** Track bidder IP addresses and flag suspicious patterns. Monitor for accounts that only bid on specific sellers' auctions.

---

### L-7 — Giveaway Entry Accepts Null User or Guest Key

**File:** `backend/app/models.py`

```python
class GiveawayEntry(Base):
    user_id = Column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    guest_key = Column(String(64), index=True, nullable=True)
```

Both `user_id` and `guest_key` are nullable, meaning an entry could exist with neither, creating ghost entries.

**Fix:** Add a database constraint: `CheckConstraint('user_id IS NOT NULL OR guest_key IS NOT NULL')`.

---

### L-8 — Error Messages Leak Internal Details

**File:** Multiple routers

```python
# payments.py
error_detail = err_data.get("message") or err_data.get("description") or str(err_data)
raise HTTPException(status_code=502, detail=error_detail)

# tron_payout.py
return {"success": False, "error": f"Insufficient USDT balance. Have: {balance_raw/1_000_000:.2f}, Need: {amount:.2f}"}
```

**Description:** Error messages from external APIs (NowPayments, Tron) are passed directly to the client, potentially exposing internal infrastructure details, API keys, or wallet balances.

**Fix:** Return generic error messages to the client. Log detailed errors server-side.

---

## INFORMATIONAL

### I-1 — `hmac.new` Is Valid (Not a Bug)

Python's `hmac.new()` is a valid function — it's the documented way to create HMAC objects. The payments.py signature verification is correct.

---

### I-2 — No Database-Level Constraints on Balances

All balance columns use `Float` with no `CHECK` constraints. The application relies entirely on application-level checks (`if balance < amount`) to prevent negative balances.

**Recommendation:** Add `CHECK(balance >= 0)` constraints at the database level as a safety net.

---

### I-3 — No Audit Logging for Balance Changes

Balance changes are tracked inconsistently. Some operations log to `audit_logger`, others don't. There's no `balance_ledger` table to track every credit/debit.

**Recommendation:** Create a ledger table that records every balance mutation with: user_id, amount, type (credit/debit), reason, reference (order_id, withdrawal_id, etc.), timestamp, and running balance.

---

### I-4 — Background Tasks Have No Health Monitoring

All background tasks (`auto_complete_orders`, `finalize_auctions`, etc.) run as `asyncio.create_task()` within the FastAPI process. If a task crashes silently, there's no alerting or restart mechanism.

**Recommendation:** Add health check endpoints that report task status. Consider using Celery or a proper task queue for reliability.

---

### I-5 — Tron Client Is Globally Cached and Never Reset

**File:** `backend/app/tron_payout.py`

```python
_tron_client = None
def _get_client():
    global _tron_client
    if _tron_client is not None:
        return _tron_client
    ...
    _tron_client = Tron(provider=provider)
```

If the Tron connection fails, the cached client may be in a bad state and never recover until the process restarts.

**Recommendation:** Add a TTL or health check for the cached client.

---

### I-6 — `X-XSS-Protection` Header Is Deprecated

**File:** `backend/main.py`

```python
response.headers["X-XSS-Protection"] = "1; mode=block"
```

This header is deprecated and can introduce vulnerabilities in older browsers. Modern browsers have removed their XSS auditors.

**Recommendation:** Remove `X-XSS-Protection` and rely on `Content-Security-Policy` instead.

---

### I-7 — NowPayments Payout Token Cached in Global Variable

**File:** `backend/app/payout.py`

```python
_jwt_token: Optional[str] = None
_jwt_expires: Optional[datetime] = None
```

The NowPayments JWT token is cached in a module-level global, which is process-scoped. In a multi-worker deployment, each worker authenticates separately. The token could become stale if the clock drifts.

**Recommendation:** Use a shared cache (Redis) for the token in multi-worker deployments.

---

## Summary of Recommended Priority Actions

1. **IMMEDIATE (Critical):**
   - Remove hardcoded promo code (C-1)
   - Fix race conditions with `with_for_update()` on all financial entity loads (C-3, C-4, C-5)
   - Migrate all monetary columns from `Float` to `Numeric`/`Decimal` (C-2)
   - Secure Tron private key management (C-7)

2. **URGENT (High):**
   - Conditionally register dev-login/nuke endpoints (H-1, H-2)
   - Implement PIN lockout logic (H-5)
   - Unify withdrawal endpoints and require PIN on both (H-9)
   - Add admin self-approval check for withdrawals (H-10)
   - Remove PII from public blacklist endpoint (H-11)
   - Add address validation using base58check (H-8)

3. **IMPORTANT (Medium):**
   - Add rate limiting to all financial endpoints (M-2)
   - Standardize ENVIRONMENT defaults (M-6)
   - Add file content validation for uploads (M-7)
   - Implement withdrawal velocity checks (M-10)
   - Add CSP header (L-1)

4. **RECOMMENDED (Low/Info):**
   - Create a balance ledger table (I-3)
   - Add database-level CHECK constraints (I-2)
   - Add task health monitoring (I-4)
   - Fix deprecated `datetime.utcnow()` usage (L-2)
