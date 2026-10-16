"""
Operator log entry endpoints — AI-powered analysis on every submission.
Production-hardened: input sanitization, structured errors, rate-limit aware.
"""
import re
from fastapi import APIRouter, HTTPException, status, Depends
from typing import Optional

from app.models.schemas import LogEntryCreate, LogEntryResponse
from app.services import firestore_service, auth_service, gemini_service

router = APIRouter(prefix="/logs", tags=["Operator Logs"])


def _sanitize_log_text(raw_text: str) -> str:
    """Sanitize operator log input: strip null bytes, normalize whitespace."""
    text = raw_text.replace("\x00", "")
    text = re.sub(r"\s+", " ", text).strip()
    return text


@router.post("/", status_code=status.HTTP_201_CREATED)
async def submit_log_entry(
    entry: LogEntryCreate,
    current_user: dict = Depends(auth_service.get_current_user),
):
    """
    Submit a new operator log entry.
    AI automatically classifies severity, category, and generates action items.
    """
    # Verify shift exists
    shift = await firestore_service.get_shift(entry.shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    # Sanitize input
    raw_text = _sanitize_log_text(entry.raw_text)
    if len(raw_text) < 10:
        raise HTTPException(
            status_code=400,
            detail="Log entry too short. Please provide at least 10 characters describing what happened.",
        )

    # AI analysis — this is where the magic happens
    try:
        ai_analysis = await gemini_service.analyze_log_entry(
            raw_text=raw_text,
            machine_id=entry.machine_id,
        )
    except Exception as exc:
        logger = __import__("structlog").get_logger()
        logger.error("log_analysis_exception", shift_id=entry.shift_id, error=str(exc)[:200])
        ai_analysis = {
            "category": "other",
            "severity": "medium",
            "ai_summary": raw_text[:200],
            "action_items": ["Review log entry manually"],
            "tags": ["unclassified", "ai-error"],
            "requires_immediate_attention": False,
            "root_cause_hint": None,
        }

    # Build the log document
    log_doc = {
        "shift_id": entry.shift_id,
        "raw_text": raw_text,
        "machine_id": entry.machine_id,
        "category": ai_analysis.get("category", "other"),
        "severity": ai_analysis.get("severity", "medium"),
        "ai_summary": ai_analysis.get("ai_summary"),
        "action_items": ai_analysis.get("action_items", []),
        "tags": ai_analysis.get("tags", []),
        "requires_immediate_attention": ai_analysis.get("requires_immediate_attention", False),
        "root_cause_hint": ai_analysis.get("root_cause_hint"),
        "created_by": current_user["id"],
        "created_by_name": current_user.get("full_name", current_user["username"]),
        "attachments": entry.attachments or [],
    }

    result = await firestore_service.create_log_entry(log_doc)

    # If critical, auto-create an alert
    if ai_analysis.get("severity") in ["critical", "high"] or ai_analysis.get("requires_immediate_attention"):
        alert_doc = {
            "machine_id": entry.machine_id or "GENERAL",
            "machine_name": entry.machine_id or "General Operations",
            "alert_type": f"{ai_analysis.get('category', 'general')}_alert",
            "severity": ai_analysis.get("severity", "high"),
            "message": ai_analysis.get("ai_summary", raw_text[:200]),
            "ai_diagnosis": ai_analysis.get("root_cause_hint"),
            "recommended_action": (ai_analysis.get("action_items") or ["Investigate immediately"])[0],
            "source_log_id": result.get("id"),
            "shift_id": entry.shift_id,
        }
        await firestore_service.create_alert(alert_doc)

    return {
        "log": result,
        "ai_analysis": ai_analysis,
        "alert_created": ai_analysis.get("severity") in ["critical", "high"],
    }


@router.get("/shift/{shift_id}")
async def get_shift_logs(
    shift_id: str,
    current_user: dict = Depends(auth_service.get_current_user),
    limit: int = 100,
    offset: int = 0,
):
    """Get all log entries for a shift with pagination."""
    logs = await firestore_service.get_logs_for_shift(shift_id)
    total = len(logs)
    paginated = logs[offset:offset + limit]
    return {
        "logs": paginated,
        "count": len(paginated),
        "total": total,
        "limit": limit,
        "offset": offset,
    }


@router.get("/shift/{shift_id}/critical")
async def get_critical_logs(
    shift_id: str,
    current_user: dict = Depends(auth_service.get_current_user),
):
    """Get only critical and high severity logs for a shift."""
    logs = await firestore_service.get_critical_logs(shift_id)
    return {"logs": logs, "count": len(logs)}


@router.get("/recent")
async def get_recent_logs(
    limit: int = 50,
    current_user: dict = Depends(auth_service.get_current_user),
):
    """Get most recent log entries across all shifts."""
    logs = await firestore_service.get_recent_logs(limit=limit)
    return {"logs": logs, "count": len(logs)}
