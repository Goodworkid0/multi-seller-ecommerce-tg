# Gimmick — Project Summary (Single File)

## 1) Šta je ovo
Gimmick je Telegram Mini App marketplace za prodaju digitalnih proizvoda (game keys, in-game valuta, itd.) sa više user rola:
- Buyer (kupac)
- Seller (prodavac)
- Admin (ACP)

Backend je FastAPI + SQLAlchemy (async), frontend je React + Vite + Zustand.

---

## 2) Glavna ideja sistema
Platforma omogućava:
1. korisniku da se prijavi preko Telegram auth,
2. kupcu da kreira i plati porudžbinu,
3. sistemu da automatski isporuči ključeve,
4. selleru da upravlja listingom, key zalihama, withdraw-om,
5. adminu da upravlja celim sistemom (users/sellers/orders/disputes/payments/branding/broadcast).

---

## 3) Tehnologije i struktura
## Backend
- FastAPI (API i auth)
- SQLAlchemy Async ORM
- Pydantic schema sloj
- SlowAPI rate limiting
- NowPayments webhook/deposit integracija
- Telegram bot integracija

## Frontend
- React + Vite
- Zustand store (auth/cart/branding)
- Axios API client
- Tailwind + motion UI

## Folder map (high-level)
- `backend/app/models.py` — DB modeli
- `backend/app/schemas.py` — API modeli/response shape
- `backend/app/auth.py` — token/auth guard logika
- `backend/app/routers/*.py` — API po domenima
- `backend/main.py` — app boot, middleware, CORS, headers
- `frontend/src/pages/*` — view layer
- `frontend/src/store/*` — global state
- `frontend/src/lib/api.js` — HTTP client + token refresh

---

## 4) Role-based funkcionalnost
## Buyer
- login/session, profil, balance
- browse proizvoda/sellera
- create order + pay order
- dobija ključeve odmah po successful payment
- order confirmation/dispute/message
- notifications (read/all read)
- crypto deposit status/history

## Seller
- sve buyer funkcije +
- become-seller/renew plan
- seller profile/stats
- product CRUD
- key inventory upload/list/delete
- seller order views (pending/disputes/conversations)
- collateral deposit/withdraw
- withdraw request list/create
- featured purchase

## Admin
- sve iznad +
- dashboard/stats
- users list/role change/create/impersonate
- sellers management (feature/collateral)
- orders full view
- disputes resolution
- withdrawals approve/reject
- deposits manual credit/mark
- categories/banner/tag management
- branding/logo/system maintenance
- broadcast announcements (grupe + kanali + test mode)
- danger zone (nuke)

---

## 5) Core poslovni tokovi
## A) Order/Delivery flow
1. Buyer kreira order (`PENDING`)
2. Buyer plaća iz wallet balance
3. Sistem lock-uje redove i uzima realne nesold ključeve
4. Ključevi se označe kao sold + vezuju za order item
5. Status ide u `DELIVERED`
6. Seller dobija saldo minus platform fee model
7. Buyer/seller dobijaju notifikacije
8. Auto-complete timer (48h) radi ako nema dispute

## B) Dispute flow
- Buyer može otvoriti dispute sa reason
- Seller/buyer/admin komunikacija ide kroz order message thread
- Dispute može eskalirati adminu
- Resolution vodi u `COMPLETED` ili `REFUNDED` (zavisno od ishoda)
- Status-change notifikacije idu svim relevantnim učesnicima

## C) Seller subscription flow
- Seller planovi: 1/3/6/12 meseci
- Aktivacija i renew skidaju balance
- Expiry hard-sync: seller može biti downgradovan na buyer
- Expiring/expired notifications

## D) Broadcast flow
- Admin tab za broadcast sa presetima
- Ciljanje: all/buyers/sellers/admins
- Kanali: WebApp, Telegram ili oba
- Test send režim + metrics u response-u

---

## 6) Notifications sistem
Notifikacije su DB-backed (tip, title, body, link, read flag, created_at):
- order_paid, order_status_update, order_completed
- dispute_opened/escalated/message/resolved
- deposit_credited, withdrawal_approved/rejected
- seller_expiring_soon, seller_expired
- status_changed, admin_announcement

Frontend ima dedicated notifications page + unread badge sync.

---

## 7) Security / hardening koji je uveden
1. Token hardening
- access + refresh token model
- refresh endpoint
- automatski refresh na frontend 401
- token_type claim validation

2. Server-side revocation
- `token_version` po useru
- logout incrementuje `token_version`
- svi stariji access/refresh tokeni postaju invalidni

3. CORS hardening
- production više ne pada na wildcard default
- koristi ALLOWED_ORIGINS / WEBAPP_URL

4. Request tracing i audit
- `X-Request-ID` middleware
- unhandled exception response vraća request_id
- auth refresh/logout audit logovi uključuju request_id + ip

5. Startup DB safety
- auto create_tables blokiran u production osim ako je eksplicitno dozvoljen

---

## 8) Operativne napomene
- U produkciji koristiti PostgreSQL (ne SQLite) zbog konkurentnosti.
- Obavezna rotacija svih tajni i ključeva pre javnog deploy-a.
- Alembic migracije su preporučene kao sledeći korak (umesto oslanjanja na create_all kompatibilnost).
- Ngrok/free tunnel limit zahteva agresivno smanjenje polling-a (već optimizovano delimično).

---

## 9) Frontend UX logika
- Buyer/Seller/Admin view mode toggle u UI meniju
- Role-aware nav rendering
- Broadcast sada u posebnom Admin tabu, sa default presetom i custom modom
- Notifikacije ostaju vidljive posle mark-read (ne “nestaju”)

---

## 10) Trenutni status projekta
Projekat je funkcionalan end-to-end za:
- auth, browsing, ordering, delivery, disputes,
- seller lifecycle,
- admin operations,
- deposits/withdrawals,
- notifications i broadcast.

Najveći sledeći koraci za production-grade nivo:
1. puna migraciona strategija (Alembic)
2. secret management + rotacija
3. centralizovani monitoring/alerting (Sentry + metrics)
4. eventualno SSE/WebSocket za real-time umesto pollinga
