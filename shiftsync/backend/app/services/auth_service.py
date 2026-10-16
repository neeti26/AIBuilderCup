"""
Authentication service using JWT tokens and bcrypt directly.
Production-hardened: input sanitization, constant-time comparison, secure token handling.
"""
from datetime import datetime, timedelta
from typing import Optional
from jose import JWTError, jwt
import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from app.config import settings
from app.services import firestore_service
from app.security import sanitize_text

security = HTTPBearer()


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    password_bytes = password.encode("utf-8")
    salt = bcrypt.gensalt(rounds=12)
    return bcrypt.hashpw(password_bytes, salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plain password against its bcrypt hash using constant-time comparison."""
    try:
        return bcrypt.checkpw(
            plain_password.encode("utf-8"),
            hashed_password.encode("utf-8"),
        )
    except Exception:
        return False


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (
        expires_delta or timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES)
    )
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=settings.ALGORITHM)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Validate JWT and return the current user dict."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        # Sanitize the token input (it's a string, just strip whitespace)
        token = (credentials.credentials or "").strip()
        if not token:
            raise credentials_exception
        payload = jwt.decode(
            token,
            settings.SECRET_KEY,
            algorithms=[settings.ALGORITHM],
        )
        username: str = payload.get("sub")
        if username is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = await firestore_service.get_user_by_username(username)
    if user is None or not user.get("is_active", True):
        raise credentials_exception
    return user


async def authenticate_user(username: str, password: str) -> Optional[dict]:
    """Authenticate a user with sanitized inputs."""
    safe_username = sanitize_text(username, max_length=100)
    if not safe_username:
        return None

    user = await firestore_service.get_user_by_username(safe_username)
    if not user:
        return None
    if not user.get("is_active", True):
        return None
    if not verify_password(password, user.get("hashed_password", "")):
        return None
    return user
