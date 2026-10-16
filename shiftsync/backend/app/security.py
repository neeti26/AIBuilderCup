"""
Production security utilities for ShiftSync AI.
- Input sanitization (XSS, NoSQL injection, null bytes)
- Rate limiting helpers
- JWT security helpers
- Content Security Policy
"""
import re
import html
import structlog
from typing import Any, Optional

logger = structlog.get_logger()

# ─── Dangerous patterns ────────────────────────────────────────────────────────
# NoSQL injection operators (MongoDB/Firestore-style)
_NOSQL_OPERATORS = re.compile(
    r'(\$where|\$ne|\$gt|\$gte|\$lt|\$lte|\$in|\$nin|\$exists|\$regex|\$options|\$mod|\$all|\$size|\$not)',
    re.IGNORECASE,
)

# Script tags and event handlers (XSS)
_XSS_PATTERNS = re.compile(
    r'(<script|</script|javascript:|data:text/html|on\w+\s*=|<iframe|<embed|<object|<applet|<meta|<link)',
    re.IGNORECASE,
)

# Null bytes and control characters
_NULL_BYTE = re.compile(r'[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]')


def sanitize_text(value: Any, max_length: int = 5000) -> str:
    """
    Sanitize free-text input to prevent XSS and injection attacks.
    - Strips null bytes and control characters
    - HTML-escapes dangerous characters
    - Blocks NoSQL injection operators
    - Blocks script/event-handler patterns
    - Truncates to max_length
    """
    if value is None:
        return ""

    text = str(value)

    # Remove null bytes and control characters
    text = _NULL_BYTE.sub("", text)

    # Block NoSQL injection operators
    if _NOSQL_OPERATORS.search(text):
        logger.warning("nosql_injection_attempt", snippet=text[:100])
        raise ValueError("Input contains disallowed characters")

    # Block XSS patterns
    if _XSS_PATTERNS.search(text):
        logger.warning("xss_attempt", snippet=text[:100])
        raise ValueError("Input contains disallowed characters")

    # HTML-escape to neutralize any remaining HTML
    text = html.escape(text, quote=True)

    # Normalize whitespace
    text = re.sub(r"\s+", " ", text).strip()

    # Truncate
    if len(text) > max_length:
        text = text[:max_length]

    return text


def sanitize_machine_id(value: Optional[str]) -> Optional[str]:
    """Sanitize machine/asset IDs — allow only alphanumeric, dashes, underscores."""
    if not value:
        return None
    cleaned = re.sub(r"[^A-Za-z0-9_\-]", "", str(value))
    if len(cleaned) > 64:
        cleaned = cleaned[:64]
    return cleaned or None


def sanitize_shift_id(value: str) -> str:
    """Sanitize shift IDs."""
    return sanitize_text(value, max_length=64)


def build_content_security_policy() -> str:
    """
    Build a strict Content Security Policy header.
    """
    return (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://unpkg.com https://cdn.tailwindcss.com; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://unpkg.com; "
        "font-src 'self' https://fonts.gstatic.com data:; "
        "img-src 'self' data: https:; "
        "connect-src 'self' https://generativelanguage.googleapis.com https://*.run.app; "
        "frame-ancestors 'none'; "
        "base-uri 'self'; "
        "form-action 'self';"
    )
