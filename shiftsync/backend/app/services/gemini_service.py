"""
Gemini AI Service — the intelligence core of ShiftSync.
Uses the new google-genai SDK (v2+).
Handles all AI operations: log analysis, handover generation, chat, anomaly detection.
"""
from google import genai
from google.genai import types as genai_types
from typing import Optional, List
import json
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings

logger = structlog.get_logger()

# Single client instance
_client: Optional[genai.Client] = None

def get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=settings.GEMINI_API_KEY)
    return _client

MODEL_PRO   = "gemini-2.0-flash"        # Best available model for deep reasoning
MODEL_FLASH = "gemini-2.0-flash-lite"   # Fast + cheap for real-time classification

SYSTEM_CONTEXT = """You are ShiftSync AI, an expert manufacturing operations intelligence system 
specialized in aerospace and industrial manufacturing. You have deep expertise in:
- Lean manufacturing and Six Sigma
- OEE (Overall Equipment Effectiveness) analysis
- Predictive maintenance and reliability engineering
- Quality management systems (AS9100, ISO 9001)
- Safety management (OSHA, ISO 45001)
- Production planning and scheduling
- Root cause analysis (5-Why, Fishbone/Ishikawa)

You analyze operator logs, machine data, quality reports, and maintenance records.
Your responses are concise, actionable, and prioritized for manufacturing supervisors.
Always flag safety issues with highest priority. Be specific, not generic.
"""

def _generate(model: str, prompt: str) -> str:
    """Call Gemini and return the text response."""
    client = get_client()
    response = client.models.generate_content(
        model=model,
        contents=prompt,
        config=genai_types.GenerateContentConfig(
            temperature=0.2,
            top_p=0.8,
            max_output_tokens=4096,
            system_instruction=SYSTEM_CONTEXT,
        ),
    )
    return response.text


def _parse_json(text: str) -> dict | list:
    """Strip markdown code fences and parse JSON."""
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        # parts[1] is the content between first pair of fences
        text = parts[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def analyze_log_entry(raw_text: str, machine_id: Optional[str] = None) -> dict:
    """
    Analyze a raw operator log entry.
    Returns: category, severity, ai_summary, action_items, tags
    """
    prompt = f"""Analyze this manufacturing operator log entry and respond ONLY with valid JSON.

Log Entry: "{raw_text}"
{f'Machine/Asset ID: {machine_id}' if machine_id else ''}

Respond with this exact JSON structure:
{{
  "category": "<one of: machine|quality|safety|material|maintenance|production|other>",
  "severity": "<one of: critical|high|medium|low|info>",
  "ai_summary": "<concise 1-2 sentence summary of the issue>",
  "action_items": ["<specific actionable task 1>", "<specific actionable task 2>"],
  "tags": ["<relevant tag 1>", "<relevant tag 2>", "<relevant tag 3>"],
  "requires_immediate_attention": <true|false>,
  "root_cause_hint": "<brief hypothesis about what caused this, if apparent>"
}}

Severity guide:
- critical: Safety risk, production stopped, major quality escape
- high: Significant production impact, machine fault affecting output
- medium: Minor production impact, quality concern under control
- low: Informational, minor observation
- info: Routine update, no action needed"""

    try:
        text = _generate(MODEL_FLASH, prompt)
        return _parse_json(text)
    except Exception as e:
        logger.error("log_analysis_failed", error=str(e), raw_text=raw_text[:100])
        return {
            "category": "other",
            "severity": "medium",
            "ai_summary": raw_text[:200],
            "action_items": ["Review log entry manually"],
            "tags": ["unclassified"],
            "requires_immediate_attention": False,
            "root_cause_hint": None,
        }


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def generate_handover_report(
    shift_data: dict,
    log_entries: List[dict],
    machine_statuses: List[dict],
    previous_shift_actions: Optional[List[dict]] = None,
) -> dict:
    """
    Generate a comprehensive AI-powered shift handover report using Gemini Pro.
    """
    logs_text = "\n".join([
        f"[{log.get('created_at', '')}] [{log.get('severity', '').upper()}] "
        f"[{log.get('category', '').upper()}] {log.get('raw_text', '')} "
        f"(Machine: {log.get('machine_id', 'N/A')})"
        for log in log_entries
    ])

    machines_text = "\n".join([
        f"- {m.get('name', m.get('machine_id', ''))} ({m.get('machine_id', '')}): "
        f"Status={m.get('status', '').upper()}, OEE={m.get('oee', 'N/A')}%, "
        f"Alerts={m.get('active_alerts', 0)}"
        for m in machine_statuses
    ])

    prev_actions_text = ""
    if previous_shift_actions:
        prev_actions_text = "UNRESOLVED ACTIONS FROM PREVIOUS SHIFT:\n" + "\n".join([
            f"- [{a.get('priority', '').upper()}] {a.get('description', '')}"
            for a in previous_shift_actions
        ])

    prompt = f"""Generate a comprehensive shift handover report for the incoming shift supervisor.
Respond ONLY with valid JSON matching the exact structure below.

=== SHIFT INFORMATION ===
Shift: {shift_data.get('shift_type', '').upper()} SHIFT
Line/Area: {shift_data.get('line', 'N/A')}
Date: {shift_data.get('date', 'N/A')}
Outgoing Supervisor: {shift_data.get('supervisor_name', 'N/A')}
Production Target: {shift_data.get('production_target', 'N/A')} units
Production Actual: {shift_data.get('production_actual', 'N/A')} units

=== MACHINE STATUS ===
{machines_text if machines_text else 'No machine data available'}

=== OPERATOR LOGS ({len(log_entries)} entries) ===
{logs_text if logs_text else 'No log entries recorded'}

{prev_actions_text}

=== REQUIRED JSON OUTPUT ===
{{
  "executive_summary": "<3-4 sentence high-level summary of the shift>",
  "production_summary": "<Detailed production performance narrative>",
  "critical_issues": [
    {{
      "issue": "<issue description>",
      "machine_id": "<machine id or null>",
      "impact": "<production/quality/safety impact>",
      "status": "<resolved|ongoing|escalated>",
      "action_required": "<specific action for incoming shift>"
    }}
  ],
  "machine_health_overview": "<Assessment of overall machine health>",
  "quality_incidents": [
    {{
      "description": "<quality issue description>",
      "severity": "<critical|high|medium|low>",
      "quantity_affected": "<number or unknown>",
      "disposition": "<scrap|rework|hold|released|unknown>",
      "follow_up": "<required follow-up action>"
    }}
  ],
  "maintenance_completed": ["<completed task>"],
  "maintenance_pending": ["<pending task with urgency>"],
  "material_status": "<Status of raw materials, WIP, any shortages>",
  "safety_incidents": [
    {{
      "description": "<incident description>",
      "severity": "<critical|high|medium|low>",
      "persons_involved": "<number or none>",
      "action_taken": "<immediate action taken>",
      "reporting_required": <true|false>
    }}
  ],
  "action_items": [
    {{
      "id": "ACT-001",
      "description": "<specific, actionable task>",
      "priority": "<critical|high|medium|low>",
      "category": "<machine|quality|safety|material|maintenance|production|other>",
      "machine_id": "<machine id or null>",
      "estimated_duration": "<e.g. 30 mins>",
      "assigned_to": null
    }}
  ],
  "next_shift_recommendations": "<3-5 specific recommendations for the incoming shift>",
  "shift_performance_score": <0-100 float>,
  "performance_breakdown": {{
    "safety_score": <0-100>,
    "quality_score": <0-100>,
    "production_score": <0-100>,
    "maintenance_score": <0-100>
  }}
}}"""

    try:
        text = _generate(MODEL_PRO, prompt)
        return _parse_json(text)
    except Exception as e:
        logger.error("handover_generation_failed", error=str(e))
        raise ValueError(f"AI handover generation failed: {str(e)}")


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def chat_with_shift_context(
    message: str,
    shift_context: Optional[dict] = None,
    conversation_history: Optional[List[dict]] = None,
) -> dict:
    """Conversational AI interface for shift data queries."""
    context_text = ""
    if shift_context:
        logs = shift_context.get("logs", [])
        machines = shift_context.get("machines", [])
        recent_logs = "\n".join([
            f"[{l.get('severity', 'info').upper()}] {l.get('raw_text', '')}"
            for l in logs[-20:]
        ])
        machine_summary = ", ".join([
            f"{m.get('name', m.get('machine_id', ''))}:{m.get('status', '').upper()}"
            for m in machines
        ])
        context_text = f"""
Current Shift Context:
- Shift: {shift_context.get('shift_type', 'N/A')} | Line: {shift_context.get('line', 'N/A')}
- Machines: {machine_summary}
- Recent Logs:
{recent_logs}
"""

    history_text = ""
    if conversation_history:
        for msg in conversation_history[-6:]:
            role = "Operator" if msg.get("role") == "user" else "ShiftSync AI"
            history_text += f"{role}: {msg.get('content', '')}\n"

    prompt = f"""{context_text}

{f'Previous conversation:{chr(10)}{history_text}' if history_text else ''}

Operator/Supervisor asks: "{message}"

Respond as ShiftSync AI. Be direct and actionable. Keep responses under 300 words.
Reference specific machine IDs or log entries when relevant.

Respond with JSON:
{{
  "response": "<your response>",
  "sources": ["<reference to specific log/machine if applicable>"],
  "suggested_actions": ["<follow-up action 1>", "<follow-up action 2>"]
}}"""

    try:
        text = _generate(MODEL_PRO, prompt)
        return _parse_json(text)
    except Exception as e:
        logger.error("chat_failed", error=str(e))
        return {
            "response": "I encountered an error processing your request. Please try again.",
            "sources": [],
            "suggested_actions": [],
        }


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def detect_anomalies(machine_data: List[dict]) -> List[dict]:
    """Analyze machine telemetry for anomalies."""
    machines_text = json.dumps(machine_data, indent=2, default=str)

    prompt = f"""Analyze this machine telemetry data for anomalies and predictive maintenance signals.
Respond ONLY with a valid JSON array.

Machine Data:
{machines_text}

For each anomaly detected, provide:
{{
  "machine_id": "<machine id>",
  "alert_type": "<e.g. temperature_spike|vibration_abnormal|oee_degradation>",
  "severity": "<critical|high|medium|low>",
  "message": "<clear description of the anomaly>",
  "ai_diagnosis": "<technical explanation of likely cause>",
  "recommended_action": "<specific action to take>",
  "confidence": <0.0-1.0>
}}

Return a JSON array []. If no anomalies, return [].
Only flag genuine anomalies, not normal operating variations."""

    try:
        text = _generate(MODEL_FLASH, prompt)
        result = _parse_json(text)
        return result if isinstance(result, list) else []
    except Exception as e:
        logger.error("anomaly_detection_failed", error=str(e))
        return []


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def generate_maintenance_recommendation(
    machine_id: str,
    machine_name: str,
    maintenance_history: List[dict],
    current_status: dict,
    recent_alerts: List[dict],
) -> dict:
    """Generate predictive maintenance recommendations for a specific machine."""
    prompt = f"""Generate a predictive maintenance recommendation for this machine.
Respond ONLY with valid JSON.

Machine: {machine_name} (ID: {machine_id})
Current Status: {json.dumps(current_status, default=str)}
Recent Alerts: {json.dumps(recent_alerts[-5:], default=str)}
Maintenance History (last 10): {json.dumps(maintenance_history[-10:], default=str)}

{{
  "health_score": <0-100>,
  "predicted_failure_risk": "<low|medium|high|critical>",
  "estimated_days_to_maintenance": <integer or null if urgent>,
  "recommended_maintenance_type": "<preventive|corrective|predictive|none>",
  "specific_actions": [
    {{
      "action": "<specific maintenance task>",
      "urgency": "<immediate|within_24h|within_week|scheduled>",
      "estimated_duration": "<time estimate>",
      "parts_required": ["<part if known>"]
    }}
  ],
  "reasoning": "<technical explanation based on data patterns>",
  "cost_impact_if_ignored": "<estimated impact of deferring maintenance>"
}}"""

    try:
        text = _generate(MODEL_PRO, prompt)
        return _parse_json(text)
    except Exception as e:
        logger.error("maintenance_rec_failed", error=str(e))
        raise ValueError(f"Maintenance recommendation failed: {str(e)}")
