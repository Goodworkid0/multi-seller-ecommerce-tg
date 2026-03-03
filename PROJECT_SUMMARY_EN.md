# Gimmick — Project Summary (English, Single File)

## 1) What this project is
Gimmick is a Telegram Mini App marketplace for digital products (game keys, in-game currency, etc.) with multiple user roles:
- Buyer
- Seller
- Admin

Backend uses FastAPI + SQLAlchemy (async), frontend uses React + Vite + Zustand.

---

## 2) Core platform concept
The platform enables:
1. user authentication via Telegram,
2. buyers to create and pay orders,
3. automatic key delivery after successful payment,
4. sellers to manage listings, key inventory, and withdrawals,
5. admins to manage the entire platform (users/sellers/orders/disputes/payments/branding/broadcast).

---

## 3) Stack and structure
## Backend
- FastAPI (API + auth)
- SQLAlchemy Async ORM
- Pydantic schemas
- SlowAPI rate limiting
- NowPayments deposits/webhook integration
- Telegram bot integration

## Frontend
- React + Vite
- Zustand state stores (auth/cart/branding)
- Axios API client
- Tailwind + motion UI

## High-level file map
- `backend/app/models.py` — DB models
- `backend/app/schemas.py` — request/response schemas
- `backend/app/auth.py` — token and auth guard logic
- `backend/app/routers/*.py` — domain APIs
- `backend/main.py` — app bootstrap, middleware, CORS, headers
- `frontend/src/pages/*` — UI pages
- `frontend/src/store/*` — global state
- `frontend/src/lib/api.js` — HTTP client + token refresh flow

---

## 4) Role-based capabilities
## Buyer
- login/session, profile, balance
- browse products/sellers
- create order + pay order
- receive keys instantly after payment
- order confirm/dispute/message flows
- notifications (single/all read)
- crypto deposit status/history

## Seller
- everything from Buyer, plus:
- become-seller / renew plan
- seller profile and stats
- product CRUD
- key inventory upload/list/delete
- seller order views (pending/disputes/conversations)
- collateral deposit/withdraw
- withdrawal request create/list
- featured purchase

## Admin
- everything above, plus:
- dashboard/stats
- users list/role change/create/impersonate
- sellers management (feature/collateral)
- full orders management
- dispute resolution
- withdrawal approve/reject
- deposits manual credit/mark
- categories/banner/tag management
- branding/logo/system maintenance
- broadcast announcements (groups + channels + test mode)
- danger zone (full nuke)

---

## 5) Main business flows
## A) Order and delivery flow
1. Buyer creates order (`PENDING`)
2. Buyer pays from wallet balance
3. System row-locks records and reserves real unsold keys
4. Keys are marked sold and linked to order items
5. Order becomes `DELIVERED`
6. Seller balance is updated with platform fee model
7. Buyer/seller notifications are created
8. 48h auto-complete timer runs when no dispute is open

## B) Dispute flow
- Buyer can open dispute with reason
- Seller/buyer/admin communicate in order thread
- Dispute can be escalated to admin
- Resolution leads to `COMPLETED` or `REFUNDED`
- Status-change notifications are sent to relevant participants

## C) Seller subscription flow
- Plans: 1/3/6/12 months
- Activation/renewal deducts wallet balance
- Expiry hard-sync can downgrade seller to buyer
- Expiring/expired notifications are emitted

## D) Broadcast flow
- Dedicated Admin Broadcast tab with presets
- Targeting: all/buyers/sellers/admins
- Channels: WebApp, Telegram, or both
- Test mode + delivery metrics in API response

---

## 6) Notifications system
DB-backed notifications include type, title, body, link, read flag, and timestamp.
Examples:
- order_paid, order_status_update, order_completed
- dispute_opened/escalated/message/resolved
- deposit_credited, withdrawal_approved/rejected
- seller_expiring_soon, seller_expired
- status_changed, admin_announcement

Frontend has a dedicated notifications page with unread badge sync.

---

## 7) Security/hardening already implemented
1. Token hardening
- access + refresh token model
- refresh endpoint
- frontend auto-refresh on 401
- token type claim validation

2. Server-side token revocation
- per-user `token_version`
- logout increments `token_version`
- older access/refresh tokens become invalid

3. CORS hardening
- no wildcard fallback in production
- explicit `ALLOWED_ORIGINS`/`WEBAPP_URL` handling

4. Request tracing + audit
- `X-Request-ID` middleware
- unhandled exception responses include `request_id`
- auth refresh/logout audit logs include `request_id` + IP

5. Startup DB safety
- auto create_tables blocked in production unless explicitly enabled

---

## 8) Operational notes
- Use PostgreSQL in production (not SQLite) for concurrency/locking reliability.
- Rotate all exposed secrets before any public deployment.
- Add Alembic migrations as the next major infra step.
- Free tunnel limits require reduced polling (already partially optimized).

---

## 9) Frontend UX behavior
- Buyer/Seller/Admin role view switching in UI
- Role-aware bottom navigation and menus
- Broadcast moved into dedicated Admin tab with default preset + custom mode
- Read notifications remain visible after mark-read (no perceived disappearance)

---

## 10) Current project status
The project is functional end-to-end for:
- auth, browsing, ordering, delivery, disputes,
- seller lifecycle,
- admin operations,
- deposits/withdrawals,
- notifications and broadcast.

Highest-value next production steps:
1. full Alembic migration strategy
2. secret management + rotation
3. centralized monitoring/alerting (Sentry + metrics)
4. move from polling-heavy updates to SSE/WebSocket where practical
