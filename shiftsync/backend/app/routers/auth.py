"""Authentication endpoints."""
from fastapi import APIRouter, HTTPException, status, Depends
from datetime import timedelta

from app.models.schemas import UserLogin, TokenResponse, UserCreate
from app.services import auth_service, firestore_service
from app.config import settings

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    user = await auth_service.authenticate_user(credentials.username, credentials.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    token = auth_service.create_access_token(
        data={"sub": user["username"]},
        expires_delta=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRE_MINUTES),
    )
    return TokenResponse(
        access_token=token,
        user={
            "id": user.get("id"),
            "username": user.get("username"),
            "full_name": user.get("full_name"),
            "role": user.get("role"),
            "department": user.get("department"),
        }
    )


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate):
    """Register a new user (admin operation in production)."""
    existing = await firestore_service.get_user_by_username(user_data.username)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already exists",
        )
    hashed = auth_service.hash_password(user_data.password)
    user_dict = user_data.model_dump(exclude={"password"})
    user_dict["hashed_password"] = hashed
    new_user = await firestore_service.create_user(user_dict)
    return {"message": "User created successfully", "user_id": new_user["id"]}


@router.get("/me")
async def get_me(current_user: dict = Depends(auth_service.get_current_user)):
    return {
        "id": current_user.get("id"),
        "username": current_user.get("username"),
        "full_name": current_user.get("full_name"),
        "role": current_user.get("role"),
        "department": current_user.get("department"),
    }
