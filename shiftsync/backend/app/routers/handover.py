"""
Handover report generation — the flagship AI feature of ShiftSync.
Uses FastAPI BackgroundTasks so long Gemini calls don't timeout on Cloud Run.
"""
from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks
from typing import Optional, Dict, Any
from datetime import datetime
import uuid

from app.models.schemas import HandoverReportRequest
from app.services import firestore_service, auth_service, gemini_service

router = APIRouter(prefix="/handover", tags=["Handover Reports"])

# In-memory store for async report generation status
# In production, this would be Firestore-backed
_report_status: Dict[str, Dict[str, Any]] = {}


def _generate_handover_background(
    shift_id: str,
    user_id: str,
) -> None:
    """
    Background task: generate handover report asynchronously.
    Updates _report_status with progress and final result.
    """
    import asyncio

    async def _run():
        try:
            _report_status[shift_id]["status"] = "generating"
            _report_status[shift_id]["progress"] = "Loading shift data..."

            shift = await firestore_service.get_shift(shift_id)
            if not shift:
                _report_status[shift_id]["status"] = "failed"
                _report_status[shift_id]["error"] = "Shift not found"
                return

            log_entries = await firestore_service.get_logs_for_shift(shift_id)
            machine_statuses = await firestore_service.get_all_machines()

            _report_status[shift_id]["progress"] = "Running AI analysis..."

            # Get unresolved actions from previous shift on the same line
            previous_actions = []
            if shift.get("line"):
                prev_report = await firestore_service.get_latest_handover_for_line(shift["line"])
                if prev_report:
                    previous_actions = [
                        a for a in prev_report.get("action_items", [])
                        if a.get("status") == "open"
                    ]

            shift_context = {
                **shift,
                "supervisor_name": shift.get("supervisor_name", shift.get("supervisor")),
                "log_count": len(log_entries),
            }

            _report_status[shift_id]["progress"] = "Generating report with Gemini 2.5 Flash..."

            ai_report = await gemini_service.generate_handover_report(
                shift_data=shift_context,
                log_entries=log_entries,
                machine_statuses=machine_statuses,
                previous_shift_actions=previous_actions,
            )

            report_doc = {
                **ai_report,
                "shift_id": shift_id,
                "line": shift.get("line"),
                "shift_type": shift.get("shift_type"),
                "date": shift.get("date"),
                "generated_by": user_id,
                "total_logs": len(log_entries),
                "critical_count": sum(1 for l in log_entries if l.get("severity") == "critical"),
                "high_count": sum(1 for l in log_entries if l.get("severity") == "high"),
            }

            saved_report = await firestore_service.save_handover_report(report_doc)

            _report_status[shift_id]["status"] = "completed"
            _report_status[shift_id]["report"] = saved_report
            _report_status[shift_id]["progress"] = "Ready"

        except Exception as exc:
            logger = __import__("structlog").get_logger()
            logger.error("handover_background_failed", shift_id=shift_id, error=str(exc)[:200])
            _report_status[shift_id]["status"] = "failed"
            _report_status[shift_id]["error"] = str(exc)[:200]

    asyncio.create_task(_run())


@router.post("/generate", status_code=status.HTTP_202_ACCEPTED)
async def generate_handover_report(
    request: HandoverReportRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(auth_service.get_current_user),
):
    """
    AI-powered shift handover report generation.

    Returns 202 Accepted immediately. The report is generated in the background
    to avoid Cloud Run timeouts on long Gemini calls. Poll `GET /handover/status/{shift_id}`
    until status is "completed", then fetch `GET /handover/shift/{shift_id}`.
    """
    shift = await firestore_service.get_shift(request.shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    # Initialize status tracker
    _report_status[request.shift_id] = {
        "status": "queued",
        "progress": "Queued for AI generation",
        "shift_id": request.shift_id,
        "created_at": datetime.utcnow().isoformat(),
    }

    background_tasks.add_task(
        _generate_handover_background,
        shift_id=request.shift_id,
        user_id=current_user.get("id"),
    )

    return {
        "message": "Handover report generation started",
        "shift_id": request.shift_id,
        "status": "queued",
        "poll_url": f"/handover/status/{request.shift_id}",
    }


@router.get("/status/{shift_id}")
async def get_handover_status(
    shift_id: str,
    current_user: dict = Depends(auth_service.get_current_user),
):
    """Check the status of an async handover report generation."""
    if shift_id not in _report_status:
        raise HTTPException(status_code=404, detail="No report generation found for this shift")

    status_info = _report_status[shift_id]
    response = {
        "shift_id": shift_id,
        "status": status_info["status"],
        "progress": status_info.get("progress", ""),
    }

    if status_info["status"] == "completed":
        response["report_id"] = status_info["report"].get("id")
        response["report"] = status_info["report"]
    elif status_info["status"] == "failed":
        response["error"] = status_info.get("error", "Unknown error")

    return response


@router.get("/shift/{shift_id}")
async def get_handover_reports(
    shift_id: str,
    current_user: dict = Depends(auth_service.get_current_user),
):
    """Get all handover reports for a shift."""
    reports = await firestore_service.get_handover_reports(shift_id)
    return {"reports": reports, "count": len(reports)}


@router.get("/latest/{line}")
async def get_latest_handover(
    line: str,
    current_user: dict = Depends(auth_service.get_current_user),
):
    """Get the most recent handover report for a production line."""
    report = await firestore_service.get_latest_handover_for_line(line)
    if not report:
        raise HTTPException(
            status_code=404,
            detail=f"No handover reports found for line: {line}"
        )
    return report
