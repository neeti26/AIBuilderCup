"""
ShiftSync AI — FastAPI Application Entry Point
Intelligent Shift Handover Platform for Manufacturing & Aerospace
Production-ready: rate limiting, request tracing, security headers, background AI tasks.
"""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.exception_handlers import http_exception_handler
import structlog
import logging

from app.config import settings
from app.routers import auth, shifts, logs, handover, machines, ai_assistant, seed
from app.middleware.production import (
    RateLimitMiddleware,
    RequestIDMiddleware,
    SecurityHeadersMiddleware,
)

logger = structlog.get_logger()


# ─── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application startup/shutdown lifecycle."""
    # Startup
    logger.info("shiftsync_starting", version=settings.APP_VERSION, project=settings.GOOGLE_CLOUD_PROJECT)

    # Validate critical config
    if not settings.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY_NOT_SET — AI features will fail")

    # Auto-seed demo data on first startup (if no users exist)
    try:
        from app.services import firestore_service, auth_service
        from app.routers.seed import DEMO_USERS, DEMO_MACHINES

        supervisor = await firestore_service.get_user_by_username("supervisor")
        if not supervisor:
            logger.info("auto_seeding_demo_data — initializing users and machines")
            for machine in DEMO_MACHINES:
                await firestore_service.upsert_machine(machine)
            for user_data in DEMO_USERS:
                # Use a copy to avoid mutating the global DEMO_USERS list
                user_copy = {k: v for k, v in user_data.items()}
                password = user_copy.pop("password", "demo123")
                hashed = auth_service.hash_password(password)
                user_copy["hashed_password"] = hashed
                await firestore_service.create_user(user_copy)
            logger.info("auto_seeding_complete")
    except Exception as e:
        logger.warning("auto_seed_failed", error=str(e)[:200])

    yield

    # Shutdown
    logger.info("shiftsync_shutdown")


# ─── FastAPI App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="ShiftSync AI API",
    description="""
# ShiftSync AI — Intelligent Shift Handover Platform

Eliminates communication gaps in manufacturing shift transitions through AI-powered:

- **Operator Log Analysis** — Auto-classify severity, extract action items, detect anomalies
- **Shift Handover Reports** — Comprehensive AI-generated briefings using Gemini 2.5 Flash
- **Predictive Maintenance** — Real-time anomaly detection and maintenance recommendations
- **AI Assistant** — Natural language queries on shift data and machine health
- **Real-time Alerts** — Automatic escalation of critical issues across teams

### Authentication
All endpoints require Bearer token. Get one via `POST /api/v1/auth/login`.

### Rate Limits
- Auth/login: 10 requests/minute
- Log submission: 60 requests/minute
- Handover generation: 20 requests/minute
- AI chat: 60 requests/minute
- Default: 120 requests/minute
    """,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── Middleware (order matters — last added runs first) ────────────────────────

app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(RequestIDMiddleware)
app.add_middleware(RateLimitMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────

app.include_router(auth.router, prefix="/api/v1")
app.include_router(shifts.router, prefix="/api/v1")
app.include_router(logs.router, prefix="/api/v1")
app.include_router(handover.router, prefix="/api/v1")
app.include_router(machines.router, prefix="/api/v1")
app.include_router(ai_assistant.router, prefix="/api/v1")
app.include_router(seed.router, prefix="/api/v1")

# ─── Global Exception Handler ─────────────────────────────────────────────────

@app.exception_handler(HTTPException)
async def structured_http_exception_handler(request: Request, exc: HTTPException):
    """Return consistent JSON error structure with request ID."""
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": exc.detail if isinstance(exc.detail, str) else exc.detail.get("message", "error"),
            "request_id": getattr(request.state, "request_id", None),
            "status_code": exc.status_code,
        },
        headers=getattr(request.state, "request_id", None) and {"X-Request-ID": request.state.request_id} or {},
    )


# ─── Health & Root ────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
async def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "operational",
        "ai_engine": "Gemini 2.5 Flash",
        "region": "asia-southeast1 (Singapore)",
        "description": "Intelligent Shift Handover Platform for Manufacturing & Aerospace",
        "docs": "/docs",
    }


@app.get("/health", tags=["Health"])
async def health_check():
    """
    Production health check.
    Verifies: Firestore connectivity, Gemini API key presence.
    """
    from app.services import firestore_service, gemini_service
    import os

    checks = {}
    overall = "healthy"

    # 1. Firestore check
    try:
        db = firestore_service._get_db()
        if db and firestore_service._use_firestore:
            # Lightweight: try to list a collection
            await asyncio.wait_for(db.collection("machines").limit(1).get(), timeout=5.0)
            checks["firestore"] = {"status": "healthy", "mode": "firestore"}
        else:
            checks["firestore"] = {"status": "healthy", "mode": "in-memory (local dev)"}
    except Exception as e:
        checks["firestore"] = {"status": "degraded", "error": str(e)[:200]}
        overall = "degraded"

    # 2. Gemini API key check
    api_key = os.environ.get("GEMINI_API_KEY", "") or settings.GEMINI_API_KEY or ""
    if api_key and api_key not in ("PASTE_YOUR_AISTUDIO_KEY_HERE", "placeholder", ""):
        checks["gemini"] = {"status": "healthy", "key_present": True}
    else:
        checks["gemini"] = {"status": "degraded", "error": "GEMINI_API_KEY not configured"}
        overall = "degraded"

    return {
        "status": overall,
        "version": settings.APP_VERSION,
        "service": "shiftsync-api",
        "region": "asia-southeast1",
        "checks": checks,
    }


@app.get("/ready", tags=["Health"])
async def readiness_check():
    """Kubernetes-style readiness probe — returns 200 only if all critical deps are up."""
    health = await health_check()
    if health["status"] == "healthy":
        return health
    raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=health)
