"""
Gimmick - Digital Goods Marketplace
FastAPI Backend
"""
from fastapi import FastAPI, Request, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
import asyncio
import os
import uuid
import logging
from pathlib import Path

from app.database import create_tables, get_db, AsyncSession
from app.routers import auth, products, sellers, orders, admin, payments, banners, notifications, middleman, inquiries, referrals, services, auctions, wallet, wtb, dm, giveaways
from app.tasks import auto_complete_orders, finalize_auctions, check_auction_payment_deadlines, release_escrow_funds, auto_finish_giveaways, expire_stale_deposits, check_giveaway_keyword_compliance, cancel_stale_pending_orders

ENVIRONMENT = os.getenv("ENVIRONMENT", "production").strip().lower()
logger = logging.getLogger(__name__)


def _resolve_allowed_origins() -> list[str]:
    raw = os.getenv("ALLOWED_ORIGINS", "").strip()
    if raw:
        return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]

    webapp_url = os.getenv("WEBAPP_URL", "").strip().rstrip("/")
    if webapp_url:
        return [webapp_url]

    if ENVIRONMENT == "production":
        return []

    return [
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ]

# ---- Rate Limiter ----
from app.rate_limit import limiter

@asynccontextmanager
async def lifespan(app: FastAPI):
    await create_tables()
    task = asyncio.create_task(auto_complete_orders())
    auction_task = asyncio.create_task(finalize_auctions())
    payment_task = asyncio.create_task(check_auction_payment_deadlines())
    escrow_task = asyncio.create_task(release_escrow_funds())
    giveaway_task = asyncio.create_task(auto_finish_giveaways())
    deposit_expire_task = asyncio.create_task(expire_stale_deposits())
    keyword_check_task = asyncio.create_task(check_giveaway_keyword_compliance())
    pending_cancel_task = asyncio.create_task(cancel_stale_pending_orders())
    yield
    task.cancel()
    auction_task.cancel()
    payment_task.cancel()
    escrow_task.cancel()
    giveaway_task.cancel()
    deposit_expire_task.cancel()
    keyword_check_task.cancel()
    pending_cancel_task.cancel()

app = FastAPI(
    title="Gimmick API",
    description="Digital Goods Marketplace - Game Keys & In-Game Currency",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if ENVIRONMENT != "production" else None,
    redoc_url=None,
    openapi_url="/openapi.json" if ENVIRONMENT != "production" else None,
)

# ---- Rate Limiter registration ----
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ---- CORS ----
ALLOWED_ORIGINS = _resolve_allowed_origins()
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=bool(ALLOWED_ORIGINS),
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH"],
    allow_headers=["Authorization", "Content-Type"],
)

# ---- Security Headers + HSTS ----
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    incoming_request_id = request.headers.get("x-request-id", "").strip()
    # Sanitize client-supplied request ID to prevent log injection
    import re as _re
    if incoming_request_id and _re.fullmatch(r'[a-zA-Z0-9_\-]{1,64}', incoming_request_id):
        request_id = incoming_request_id
    else:
        request_id = str(uuid.uuid4())
    request.state.request_id = request_id

    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    response.headers["X-Content-Type-Options"] = "nosniff"
    # X-Frame-Options omitted — Telegram WebApp uses iframe/webview
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if ENVIRONMENT == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
    return response


@app.middleware("http")
async def handle_unexpected_errors(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:
        request_id = getattr(request.state, "request_id", None) or str(uuid.uuid4())
        logger.exception(
            "unhandled_exception method=%s path=%s request_id=%s",
            request.method,
            request.url.path,
            request_id,
        )
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error",
                "request_id": request_id,
            },
            headers={"X-Request-ID": str(request_id)},
        )

# Routers
app.include_router(auth.router, prefix="/api/auth", tags=["Authentication"])
app.include_router(products.router, prefix="/api/products", tags=["Products"])
app.include_router(sellers.router, prefix="/api/sellers", tags=["Sellers"])
app.include_router(orders.router, prefix="/api/orders", tags=["Orders"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(payments.router, prefix="/api/payments", tags=["Payments"])
app.include_router(banners.router, prefix="/api/banners", tags=["Banners"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["Notifications"])
app.include_router(middleman.router, prefix="/api/middleman", tags=["Middleman"])
app.include_router(wallet.router, prefix="/api/wallet", tags=["Wallet"])
app.include_router(inquiries.router, prefix="/api/inquiries", tags=["Pre-sale Inquiries"])
app.include_router(referrals.router, prefix="/api/referrals", tags=["Referrals"])
app.include_router(services.router)
app.include_router(auctions.router)
app.include_router(wtb.router)
app.include_router(dm.router)
app.include_router(giveaways.router)

@app.get("/")
async def root():
    # If frontend is built, serve it; otherwise return API info
    index = Path(__file__).resolve().parent.parent / "frontend" / "dist" / "index.html"
    if index.is_file():
        return FileResponse(str(index))
    return {"message": "Gimmick API", "version": "1.0.0"}

@app.get("/api/branding")
async def public_branding():
    """Public branding endpoint — no auth required."""
    import json as _json
    from app.database import async_session
    from app.models import AppSettings
    from sqlalchemy import select
    async with async_session() as db:
        result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
        s = result.scalar_one_or_none()
        if not s:
            return {"app_name": "", "logo_url": None, "show_logo": True, "bot_username": "", "maintenance_mode": False, "announcements_url": None, "vouches_url": None, "official_group_url": None, "suggestion_group_url": None, "marketplace_rules": []}
        # Parse marketplace rules
        rules = []
        if getattr(s, 'marketplace_rules', None):
            try:
                rules = _json.loads(s.marketplace_rules)
            except Exception:
                rules = []
        return {
            "app_name": s.app_name,
            "logo_url": s.logo_url,
            "show_logo": s.show_logo if s.show_logo is not None else True,
            "bot_username": s.bot_username,
            "maintenance_mode": s.maintenance_mode,
            "announcements_url": s.announcements_url,
            "vouches_url": s.vouches_url,
            "official_group_url": s.official_group_url,
            "suggestion_group_url": s.suggestion_group_url,
            "marketplace_rules": rules,
        }

@app.get("/health")
async def health():
    return {"status": "healthy"}


@app.get("/api/public/stats")
async def public_stats(db: AsyncSession = Depends(get_db)):
    """Public stats: total users and sellers count + fee settings + 30-min activity"""
    from sqlalchemy import func, select
    from sqlalchemy.orm import selectinload
    from datetime import datetime, timedelta
    from app.models import User, AppSettings, LoginHistory, Product, Auction, Service, UserRole
    
    total_users = await db.scalar(select(func.count()).select_from(User))
    total_sellers = await db.scalar(
        select(func.count()).select_from(User).where(User.shop_name.isnot(None))
    )
    
    # Active users in last 30 minutes (distinct users who logged in)
    cutoff = datetime.utcnow() - timedelta(minutes=30)
    active_count = await db.scalar(
        select(func.count(func.distinct(LoginHistory.user_id))).where(
            LoginHistory.created_at >= cutoff
        )
    )
    
    # Get settings to check hide_admin_activity flag
    settings_result = await db.execute(select(AppSettings).where(AppSettings.id == 1))
    settings_row = settings_result.scalar_one_or_none()
    hide_admin = getattr(settings_row, 'hide_admin_activity', False) if settings_row else False
    
    # Active admin count in last 30 minutes (never expose admin usernames publicly)
    active_admin_count = 0
    if not hide_admin:
        active_admin_count = await db.scalar(
            select(func.count(func.distinct(LoginHistory.user_id)))
            .select_from(LoginHistory)
            .join(User, LoginHistory.user_id == User.id)
            .where(
                LoginHistory.created_at >= cutoff,
                User.role == UserRole.ADMIN
            )
        ) or 0
    
    # Totals for products, auctions, services
    total_products = await db.scalar(select(func.count()).select_from(Product))
    total_auctions = await db.scalar(select(func.count()).select_from(Auction))
    total_services = await db.scalar(select(func.count()).select_from(Service))
    
    # Get fee settings (reuse settings_row fetched above)
    middleman_fee = 5.0
    middleman_min_fee = 0.0
    if settings_row:
        middleman_fee = settings_row.middleman_fee_percent if settings_row.middleman_fee_percent is not None else 5.0
        middleman_min_fee = settings_row.middleman_min_fee if settings_row.middleman_min_fee is not None else 0.0
    
    return {
        "total_users": total_users or 0,
        "total_sellers": total_sellers or 0,
        "active_count": active_count or 0,
        "active_admin_count": active_admin_count,
        "total_products": total_products or 0,
        "total_auctions": total_auctions or 0,
        "total_services": total_services or 0,
        "middleman_fee": middleman_fee,
        "middleman_min_fee": middleman_min_fee
    }


# ---- Serve Frontend (SPA) ----
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if FRONTEND_DIR.is_dir():
    # Serve static assets (js, css, images, etc.)
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIR / "assets")), name="static-assets")

    @app.middleware("http")
    async def spa_middleware(request: Request, call_next):
        response = await call_next(request)
        # If no API or static route matched (404) and it's a GET for a non-API path, serve SPA
        path = request.url.path
        if (
            response.status_code == 404
            and request.method == "GET"
            and not path.startswith(("/api/", "/docs", "/redoc", "/openapi.json"))
        ):
            # Check if it's a real file in dist (with path traversal protection)
            file_path = (FRONTEND_DIR / path.lstrip("/")).resolve()
            if file_path.is_file() and str(file_path).startswith(str(FRONTEND_DIR.resolve())):
                return FileResponse(str(file_path))
            return FileResponse(str(FRONTEND_DIR / "index.html"))
        return response
