"""Shift management endpoints."""
from fastapi import APIRouter, HTTPException, status, Depends
from typing import Optional, List
from datetime import date

from app.models.schemas import ShiftCreate, ShiftResponse
from app.services import firestore_service, auth_service

router = APIRouter(prefix="/shifts", tags=["Shifts"])


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_shift(
    shift: ShiftCreate,
    current_user: dict = Depends(auth_service.get_current_user)
):
    """Start a new shift."""
    shift_dict = shift.model_dump()
    shift_dict["supervisor_name"] = current_user.get("full_name", current_user["username"])
    result = await firestore_service.create_shift(shift_dict)
    return result


@router.get("/active")
async def get_active_shifts(
    line: Optional[str] = None,
    current_user: dict = Depends(auth_service.get_current_user)
):
    """Get all currently active shifts."""
    shifts = await firestore_service.get_active_shifts(line=line)
    return {"shifts": shifts, "count": len(shifts)}


@router.get("/date/{date_str}")
async def get_shifts_by_date(
    date_str: str,
    line: Optional[str] = None,
    current_user: dict = Depends(auth_service.get_current_user)
):
    """Get all shifts for a specific date (YYYY-MM-DD)."""
    shifts = await firestore_service.get_shifts_by_date(date_str, line=line)
    return {"shifts": shifts, "count": len(shifts)}


@router.get("/{shift_id}")
async def get_shift(
    shift_id: str,
    current_user: dict = Depends(auth_service.get_current_user)
):
    """Get a specific shift by ID."""
    shift = await firestore_service.get_shift(shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    return shift


@router.post("/{shift_id}/complete")
async def complete_shift(
    shift_id: str,
    production_actual: int = 0,
    current_user: dict = Depends(auth_service.get_current_user)
):
    """Mark a shift as completed."""
    shift = await firestore_service.get_shift(shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    await firestore_service.complete_shift(shift_id, production_actual)
    return {"message": "Shift completed successfully", "shift_id": shift_id}
