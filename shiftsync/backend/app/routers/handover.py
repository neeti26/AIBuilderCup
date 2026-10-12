"""Handover report generation — the flagship AI feature of ShiftSync."""
from fastapi import APIRouter, HTTPException, status, Depends, BackgroundTasks
from typing import Optional

from app.models.schemas import HandoverReportRequest
from app.services import firestore_service, auth_service, gemini_service

router = APIRouter(prefix="/handover", tags=["Handover Reports"])


@router.post("/generate")
async def generate_handover_report(
    request: HandoverReportRequest,
    current_user: dict = Depends(auth_service.get_current_user)
):
    """
    AI-powered shift handover report generation.
    Analyzes all shift data and produces a structured briefing for the incoming supervisor.
    This is ShiftSync's core value proposition.
    """
    # Load all shift data
    shift = await firestore_service.get_shift(request.shift_id)
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")

    # Gather all data sources
    log_entries = await firestore_service.get_logs_for_shift(request.shift_id)
    machine_statuses = await firestore_service.get_all_machines()

    # Get unresolved actions from previous shift on the same line
    previous_actions = []
    if shift.get("line"):
        prev_report = await firestore_service.get_latest_handover_for_line(shift["line"])
        if prev_report:
            previous_actions = [
                a for a in prev_report.get("action_items", [])
                if a.get("status") == "open"
            ]

    # Enrich shift data for the AI
    shift_context = {
        **shift,
        "supervisor_name": shift.get("supervisor_name", shift.get("supervisor")),
        "log_count": len(log_entries),
    }

    # Call Gemini Pro to generate the comprehensive report
    ai_report = await gemini_service.generate_handover_report(
        shift_data=shift_context,
        log_entries=log_entries,
        machine_statuses=machine_statuses,
        previous_shift_actions=previous_actions
    )

    # Save to Firestore
    report_doc = {
        **ai_report,
        "shift_id": request.shift_id,
        "line": shift.get("line"),
        "shift_type": shift.get("shift_type"),
        "date": shift.get("date"),
        "generated_by": current_user.get("id"),
        "total_logs": len(log_entries),
        "critical_count": sum(1 for l in log_entries if l.get("severity") == "critical"),
        "high_count": sum(1 for l in log_entries if l.get("severity") == "high"),
    }

    saved_report = await firestore_service.save_handover_report(report_doc)

    return {
        "report": saved_report,
        "metadata": {
            "logs_analyzed": len(log_entries),
            "machines_assessed": len(machine_statuses),
            "previous_actions_carried_over": len(previous_actions),
        }
    }


@router.get("/shift/{shift_id}")
async def get_handover_reports(
    shift_id: str,
    current_user: dict = Depends(auth_service.get_current_user)
):
    """Get all handover reports for a shift."""
    reports = await firestore_service.get_handover_reports(shift_id)
    return {"reports": reports, "count": len(reports)}


@router.get("/latest/{line}")
async def get_latest_handover(
    line: str,
    current_user: dict = Depends(auth_service.get_current_user)
):
    """Get the most recent handover report for a production line."""
    report = await firestore_service.get_latest_handover_for_line(line)
    if not report:
        raise HTTPException(
            status_code=404,
            detail=f"No handover reports found for line: {line}"
        )
    return report
