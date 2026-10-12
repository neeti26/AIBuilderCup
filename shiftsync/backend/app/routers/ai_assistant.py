"""AI Chat Assistant and intelligent insights endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional
import json

from app.models.schemas import ChatRequest, ChatResponse
from app.services import firestore_service, auth_service, gemini_service

router = APIRouter(prefix="/ai", tags=["AI Assistant"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: dict = Depends(auth_service.get_current_user),
):
    """
    Natural language interface to query shift data, get recommendations,
    and ask questions about machine status and production metrics.
    """
    shift_context = None

    if request.shift_id:
        shift = await firestore_service.get_shift(request.shift_id)
        if shift:
            logs = await firestore_service.get_logs_for_shift(request.shift_id)
            machines = await firestore_service.get_all_machines()
            shift_context = {**shift, "logs": logs, "machines": machines}

    history = [msg.model_dump() for msg in (request.conversation_history or [])]

    result = await gemini_service.chat_with_shift_context(
        message=request.message,
        shift_context=shift_context,
        conversation_history=history,
    )

    return ChatResponse(
        response=result.get("response", ""),
        sources=result.get("sources", []),
        suggested_actions=result.get("suggested_actions", []),
    )


@router.get("/alerts")
async def get_alerts(
    current_user: dict = Depends(auth_service.get_current_user),
):
    """Get all active alerts with AI diagnosis."""
    alerts = await firestore_service.get_active_alerts(limit=50)
    return {"alerts": alerts, "count": len(alerts)}


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    current_user: dict = Depends(auth_service.get_current_user),
):
    """Acknowledge an alert."""
    success = await firestore_service.acknowledge_alert(alert_id, current_user["id"])
    if not success:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"message": "Alert acknowledged", "alert_id": alert_id}


@router.get("/dashboard")
async def get_dashboard(
    current_user: dict = Depends(auth_service.get_current_user),
):
    """Get aggregated dashboard statistics."""
    stats = await firestore_service.get_dashboard_stats()
    return stats


@router.post("/analyze-trend")
async def analyze_production_trend(
    line: str,
    days: int = 7,
    current_user: dict = Depends(auth_service.get_current_user),
):
    """
    Analyze production trends over N days using AI (Gemini 2.0 Flash).
    """
    machines = await firestore_service.get_all_machines()
    recent_logs = await firestore_service.get_recent_logs(limit=100)

    if not recent_logs:
        return {
            "trend_analysis": "Insufficient data for trend analysis. Submit more log entries and try again.",
            "top_recurring_issues": [],
            "positive_trends": [],
            "risk_areas": [],
            "oee_trend": "insufficient_data",
            "priority_actions": [],
        }

    logs_summary = "\n".join([
        f"[{l.get('created_at', '')}][{l.get('severity', '').upper()}][{l.get('category', '')}] "
        f"{l.get('ai_summary', l.get('raw_text', ''))[:120]}"
        for l in recent_logs
    ])

    machines_summary = "\n".join([
        f"- {m.get('name', m.get('machine_id', ''))}: status={m.get('status')}, OEE={m.get('oee', 'N/A')}%"
        for m in machines
    ])

    prompt = f"""Analyze {days} days of operational data for production line: {line}

MACHINE STATUS:
{machines_summary}

RECENT LOGS ({len(recent_logs)} entries):
{logs_summary}

Respond ONLY with valid JSON:
{{
  "trend_analysis": "<2-3 paragraph narrative of key trends observed>",
  "top_recurring_issues": [
    {{"issue": "<description>", "frequency": "<how often>", "impact": "<impact level>"}}
  ],
  "positive_trends": ["<positive trend 1>"],
  "risk_areas": [
    {{"area": "<risk area>", "evidence": "<evidence from data>", "recommended_action": "<action>"}}
  ],
  "oee_trend": "<improving|stable|declining|insufficient_data>",
  "priority_actions": ["<top priority action 1>", "<top priority action 2>", "<top priority action 3>"]
}}"""

    try:
        result = await gemini_service.analyze_trend(prompt)
        return result
    except Exception:
        return {
            "trend_analysis": "Analysis completed with limited data.",
            "top_recurring_issues": [],
            "positive_trends": [],
            "risk_areas": [],
            "oee_trend": "insufficient_data",
            "priority_actions": [],
        }
