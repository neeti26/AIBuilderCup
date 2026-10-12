"""AI Chat Assistant and intelligent insights endpoints."""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional

from app.models.schemas import ChatRequest, ChatResponse
from app.services import firestore_service, auth_service, gemini_service

router = APIRouter(prefix="/ai", tags=["AI Assistant"])


@router.post("/chat", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    current_user: dict = Depends(auth_service.get_current_user)
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
            shift_context = {
                **shift,
                "logs": logs,
                "machines": machines,
            }

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
    acknowledged: bool = False,
    current_user: dict = Depends(auth_service.get_current_user)
):
    """Get all active alerts with AI diagnosis."""
    alerts = await firestore_service.get_active_alerts(limit=50)
    return {"alerts": alerts, "count": len(alerts)}


@router.post("/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
    alert_id: str,
    current_user: dict = Depends(auth_service.get_current_user)
):
    """Acknowledge an alert."""
    success = await firestore_service.acknowledge_alert(alert_id, current_user["id"])
    if not success:
        raise HTTPException(status_code=404, detail="Alert not found")
    return {"message": "Alert acknowledged", "alert_id": alert_id}


@router.get("/dashboard")
async def get_dashboard(
    current_user: dict = Depends(auth_service.get_current_user)
):
    """Get aggregated dashboard statistics."""
    stats = await firestore_service.get_dashboard_stats()
    return stats


@router.post("/analyze-trend")
async def analyze_production_trend(
    line: str,
    days: int = 7,
    current_user: dict = Depends(auth_service.get_current_user)
):
    """
    Analyze production trends over N days using AI.
    Identifies patterns, recurring issues, and improvement opportunities.
    """
    # Gather data for analysis
    machines = await firestore_service.get_all_machines()
    recent_logs = await firestore_service.get_recent_logs(limit=100)

    if not recent_logs:
        return {
            "trend_analysis": "Insufficient data for trend analysis. Continue logging operations.",
            "insights": [],
            "recommendations": []
        }

    # Use AI to analyze trends
    from app.services.gemini_service import _get_model, SYSTEM_CONTEXT
    import json

    model = _get_model(pro=True)
    logs_summary = "\n".join([
        f"[{l.get('created_at', '')}][{l.get('severity', '').upper()}][{l.get('category', '')}] {l.get('ai_summary', l.get('raw_text', ''))[:100]}"
        for l in recent_logs
    ])

    prompt = f"""{SYSTEM_CONTEXT}

Analyze {days} days of operational data for production line: {line}

Recent Logs ({len(recent_logs)} entries):
{logs_summary}

Provide a trend analysis as JSON:
{{
  "trend_analysis": "<2-3 paragraph narrative of key trends>",
  "top_recurring_issues": [
    {{"issue": "<description>", "frequency": "<how often>", "impact": "<impact level>"}}
  ],
  "positive_trends": ["<positive trend 1>"],
  "risk_areas": [
    {{"area": "<risk area>", "evidence": "<evidence from data>", "recommended_action": "<action>"}}
  ],
  "oee_trend": "<improving|stable|declining|insufficient_data>",
  "priority_actions": ["<top priority action 1>", "<top priority action 2>", "<top priority action 3>"]
}}
"""

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text.strip())
        return result
    except Exception as e:
        return {
            "trend_analysis": "Analysis completed with limited data.",
            "top_recurring_issues": [],
            "positive_trends": [],
            "risk_areas": [],
            "oee_trend": "insufficient_data",
            "priority_actions": []
        }
