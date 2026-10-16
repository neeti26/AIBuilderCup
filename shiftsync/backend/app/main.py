"""
ShiftSync AI — FastAPI Application Entry Point
Intelligent Shift Handover Platform for Manufacturing & Aerospace
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
import structlog
import logging

from app.config import settings
from app.routers import auth, shifts, logs, handover, machines, ai_assistant, seed

# Configure structured logging
structlog.configure(
    processors=[
        structlog.contextvars.merge_contextvars,
        structlog.processors.add_log_level,
        structlog.processors.StackInfoRenderer(),
        structlog.dev.set_exc_info,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.dev.ConsoleRenderer() if settings.DEBUG else structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(
        logging.DEBUG if settings.DEBUG else logging.INFO
    ),
    logger_factory=structlog.PrintLoggerFactory(),
)

logger = structlog.get_logger()

# ─── FastAPI App ───────────────────────────────────────────────────────────────

app = FastAPI(
    title="ShiftSync AI API",
    description="""
## ShiftSync AI — Intelligent Shift Handover Platform

Eliminates communication gaps in manufacturing shift transitions through AI-powered:
- **Operator Log Analysis** — Auto-classify severity, extract action items, detect anomalies
- **Shift Handover Reports** — Comprehensive AI-generated briefings using Gemini 2.5 Flash
- **Predictive Maintenance** — Real-time anomaly detection and maintenance recommendations
- **AI Assistant** — Natural language queries on shift data and machine health
- **Real-time Alerts** — Automatic escalation of critical issues across teams

### Authentication
All endpoints require Bearer token. Get one via `POST /auth/login`.
    """,
    version=settings.APP_VERSION,
    docs_url="/docs",
    redoc_url="/redoc",
)

# ─── Middleware ────────────────────────────────────────────────────────────────

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

# ─── Health & Root ────────────────────────────────────────────────────────────

@app.get("/", tags=["Health"])
async def root():
    return {
        "app": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "operational",
        "ai_engine": "Gemini 2.5 Flash",
        "description": "Intelligent Shift Handover Platform for Manufacturing & Aerospace",
    }


@app.get("/health", tags=["Health"])
async def health_check():
    return {
        "status": "healthy",
        "version": settings.APP_VERSION,
        "service": "shiftsync-api",
    }


# ─── Events ───────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup_event():
    # Validate critical config at startup so failures are obvious
    if not settings.GEMINI_API_KEY:
        logger.warning("GEMINI_API_KEY_NOT_SET — AI features will fail on first call")
    if settings.GOOGLE_CLOUD_PROJECT in ("shiftsync-local", "your-gcp-project-id", ""):
        logger.warning("running_in_memory_mode — data resets on restart (local dev only)")
    logger.info("shiftsync_started", version=settings.APP_VERSION, project=settings.GOOGLE_CLOUD_PROJECT)


@app.on_event("shutdown")
async def shutdown_event():
    logger.info("shiftsync_shutdown")
