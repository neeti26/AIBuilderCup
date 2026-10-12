"""Application configuration using pydantic-settings."""
from pydantic_settings import BaseSettings
from typing import Optional


class Settings(BaseSettings):
    # Google Cloud
    GOOGLE_CLOUD_PROJECT: str = "shiftsync-manufacturing"
    GEMINI_API_KEY: Optional[str] = None
    GOOGLE_APPLICATION_CREDENTIALS: Optional[str] = None

    # App
    APP_NAME: str = "ShiftSync AI"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False
    CORS_ORIGINS: list[str] = ["*"]

    # Firestore
    FIRESTORE_DATABASE: str = "(default)"

    # JWT (for demo auth)
    SECRET_KEY: str = "shiftsync-secret-change-in-production-2024"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours (one shift)

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
