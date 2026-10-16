"""
Production middleware for ShiftSync AI.
- Request ID tracing for distributed debugging
- In-memory sliding-window rate limiter (per IP + endpoint)
- Security headers including Content Security Policy
"""
import time
import uuid
import asyncio
from collections import defaultdict, deque
from typing import Callable, Deque, Dict, Tuple

from fastapi import Request, Response, HTTPException, status
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
import structlog

from app.security import build_content_security_policy

logger = structlog.get_logger()

# ─── Rate Limiter ──────────────────────────────────────────────────────────────
# Sliding window: key = (client_ip, path), values = timestamps of requests
_rate_store: Dict[Tuple[str, str], Deque[float]] = defaultdict(deque)
_rate_lock = asyncio.Lock()

# Limits: (max_requests, window_seconds)
RATE_LIMITS: Dict[str, Tuple[int, int]] = {
    "/api/v1/auth/login": (10, 60),        # 10 logins per minute
    "/api/v1/seed/init-users": (5, 60),    # 5 per minute
    "/api/v1/logs/": (60, 60),             # 60 log submissions per minute
    "/api/v1/handover/generate": (20, 60), # 20 reports per minute
    "/api/v1/ai/chat": (60, 60),           # 60 chats per minute
    "default": (120, 60),                  # 120 requests per minute
}


def _get_limit(path: str) -> Tuple[int, int]:
    for pattern, limit in RATE_LIMITS.items():
        if pattern != "default" and path.startswith(pattern):
            return limit
    return RATE_LIMITS["default"]


async def _is_rate_limited(client_ip: str, path: str) -> bool:
    now = time.monotonic()
    max_req, window = _get_limit(path)
    key = (client_ip, path)

    async with _rate_lock:
        timestamps = _rate_store[key]
        # Remove old entries outside the window
        while timestamps and timestamps[0] <= now - window:
            timestamps.popleft()

        if len(timestamps) >= max_req:
            return True

        timestamps.append(now)
        return False


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Sliding-window rate limiter per client IP and endpoint."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        client_ip = request.client.host if request.client else "unknown"
        path = request.url.path

        if await _is_rate_limited(client_ip, path):
            return JSONResponse(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                content={
                    "error": "rate_limited",
                    "message": "Too many requests. Please slow down and try again.",
                    "retry_after": 60,
                },
                headers={"Retry-After": "60"},
            )

        response = await call_next(request)
        return response


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Adds a unique X-Request-ID to every request for tracing."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        request_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = request_id

        # Bind request_id to structlog context for this request
        structlog.contextvars.clear_contextvars()
        structlog.contextvars.bind_contextvars(request_id=request_id, path=request.url.path)

        start = time.monotonic()
        try:
            response = await call_next(request)
            duration_ms = round((time.monotonic() - start) * 1000, 2)
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Process-Time"] = f"{duration_ms}ms"
            logger.info(
                "request_completed",
                method=request.method,
                path=request.url.path,
                status_code=response.status_code,
                duration_ms=duration_ms,
            )
            return response
        except Exception as exc:
            duration_ms = round((time.monotonic() - start) * 1000, 2)
            logger.error(
                "request_failed",
                method=request.method,
                path=request.url.path,
                error=str(exc)[:200],
                duration_ms=duration_ms,
            )
            raise


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Adds production security headers to every response."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        response.headers["Content-Security-Policy"] = build_content_security_policy()
        return response
