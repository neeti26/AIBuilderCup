"""
Gemini AI Service — the intelligence core of ShiftSync.
Handles all AI operations: log analysis, handover generation, chat, anomaly detection.
"""
import google.generativeai as genai
from typing import Optional, List
import json
import structlog
from tenacity import retry, stop_after_attempt, wait_exponential

from app.config import settings

logger = structlog.get_logger()

# Configure Gemini
genai.configure(api_key=settings.GEMINI_API_KEY)

# Use Gemini 1.5 Pro for complex reasoning, Flash for quick classifications
MODEL_PRO = "gemini-1.5-pro-latest"
MODEL_FLASH = "gemini-1.5-flash-latest"


def _get_model(pro: bool = True):
    model_name = MODEL_PRO if pro else MODEL_FLASH
    return genai.GenerativeModel(
        model_name=model_name,
        generation_config={
            "temperature": 0.2,  # Low temp for factual manufacturing context
            "top_p": 0.8,
            "top_k": 40,
            "max_output_tokens": 4096,
        },
        safety_settings=[
            {"category": "HARM_CATEGORY_HARASSMENT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_HATE_SPEECH", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_SEXUALLY_EXPLICIT", "threshold": "BLOCK_NONE"},
            {"category": "HARM_CATEGORY_DANGEROUS_CONTENT", "threshold": "BLOCK_NONE"},
        ]
    )


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


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def analyze_log_entry(raw_text: str, machine_id: Optional[str] = None) -> dict:
    """
    Analyze a raw operator log entry using Gemini Flash (fast classification).
    Returns: category, severity, ai_summary, action_items, tags
    """
    model = _get_model(pro=False)

    prompt = f"""{SYSTEM_CONTEXT}

Analyze this manufacturing operator log entry and respond ONLY with valid JSON.

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
- info: Routine update, no action needed
"""

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        # Strip markdown code blocks if present
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())
    except (json.JSONDecodeError, Exception) as e:
        logger.error("log_analysis_failed", error=str(e), raw_text=raw_text[:100])
        # Fallback
        return {
            "category": "other",
            "severity": "medium",
            "ai_summary": raw_text[:200],
            "action_items": ["Review log entry manually"],
            "tags": ["unclassified"],
            "requires_immediate_attention": False,
            "root_cause_hint": None
        }


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def generate_handover_report(
    shift_data: dict,
    log_entries: List[dict],
    machine_statuses: List[dict],
    previous_shift_actions: Optional[List[dict]] = None
) -> dict:
    """
    Generate a comprehensive AI-powered shift handover report using Gemini Pro.
    This is the flagship feature.
    """
    model = _get_model(pro=True)

    # Format context data
    logs_text = "\n".join([
        f"[{log.get('created_at', '')}] [{log.get('severity', '').upper()}] [{log.get('category', '').upper()}] "
        f"{log.get('raw_text', '')} (Machine: {log.get('machine_id', 'N/A')})"
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

    prompt = f"""{SYSTEM_CONTEXT}

Generate a comprehensive shift handover report for the incoming shift supervisor.
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
  "executive_summary": "<3-4 sentence high-level summary of the shift — what happened, key achievements, critical issues. Write as if briefing the plant manager.>",
  "production_summary": "<Detailed production performance: targets vs actuals, efficiency, key bottlenecks and their impact>",
  "critical_issues": [
    {{
      "issue": "<issue description>",
      "machine_id": "<machine id or null>",
      "impact": "<production/quality/safety impact>",
      "status": "<resolved|ongoing|escalated>",
      "action_required": "<specific action for incoming shift>"
    }}
  ],
  "machine_health_overview": "<Assessment of overall machine health, notable OEE trends, any machines at risk>",
  "quality_incidents": [
    {{
      "description": "<quality issue description>",
      "severity": "<critical|high|medium|low>",
      "quantity_affected": "<number or unknown>",
      "disposition": "<scrap|rework|hold|released|unknown>",
      "follow_up": "<required follow-up action>"
    }}
  ],
  "maintenance_completed": ["<maintenance task completed during shift>"],
  "maintenance_pending": ["<maintenance task still pending with urgency>"],
  "material_status": "<Status of raw materials, WIP, any shortages or excesses affecting next shift>",
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
      "estimated_duration": "<e.g. 30 mins, 2 hours>",
      "assigned_to": null
    }}
  ],
  "next_shift_recommendations": "<3-5 specific recommendations for the incoming shift: what to watch, what to prioritize, what to prepare>",
  "shift_performance_score": <0-100 float score based on: safety (40%), quality (25%), production (25%), maintenance (10%)>,
  "performance_breakdown": {{
    "safety_score": <0-100>,
    "quality_score": <0-100>,
    "production_score": <0-100>,
    "maintenance_score": <0-100>
  }}
}}

Be specific and actionable. Reference actual machine IDs, quantities, and times from the logs.
If data is missing, note it rather than fabricating numbers.
"""

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())
    except (json.JSONDecodeError, Exception) as e:
        logger.error("handover_generation_failed", error=str(e))
        raise ValueError(f"AI handover generation failed: {str(e)}")


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def chat_with_shift_context(
    message: str,
    shift_context: Optional[dict] = None,
    conversation_history: Optional[List[dict]] = None
) -> dict:
    """
    Conversational AI interface — operators and supervisors can ask questions
    about their shift data in natural language.
    """
    model = _get_model(pro=True)

    context_text = ""
    if shift_context:
        logs = shift_context.get("logs", [])
        machines = shift_context.get("machines", [])
        recent_logs = "\n".join([
            f"[{l.get('severity', 'info').upper()}] {l.get('raw_text', '')}"
            for l in logs[-20:]  # Last 20 logs for context
        ])
        machine_summary = ", ".join([
            f"{m.get('name', m.get('machine_id', ''))}:{m.get('status', '').upper()}"
            for m in machines
        ])
        context_text = f"""
Current Shift Context:
- Shift: {shift_context.get('shift_type', 'N/A')} | Line: {shift_context.get('line', 'N/A')}
- Date: {shift_context.get('date', 'N/A')}
- Machines: {machine_summary}
- Recent Logs:
{recent_logs}
"""

    history_text = ""
    if conversation_history:
        for msg in conversation_history[-6:]:  # Last 3 exchanges
            role = "Operator" if msg.get("role") == "user" else "ShiftSync AI"
            history_text += f"{role}: {msg.get('content', '')}\n"

    prompt = f"""{SYSTEM_CONTEXT}

{context_text}

{f'Previous conversation:{chr(10)}{history_text}' if history_text else ''}

Operator/Supervisor asks: "{message}"

Respond as ShiftSync AI. Be direct and actionable. If referencing specific issues from the shift data,
cite the relevant log entries or machine IDs. If the question requires escalation or expert judgment,
say so clearly. Keep responses under 300 words unless a detailed technical explanation is needed.

Respond with JSON:
{{
  "response": "<your response>",
  "sources": ["<reference to specific log/machine if applicable>"],
  "suggested_actions": ["<follow-up action 1>", "<follow-up action 2>"]
}}
"""

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())
    except (json.JSONDecodeError, Exception) as e:
        logger.error("chat_failed", error=str(e))
        return {
            "response": "I encountered an error processing your request. Please try again.",
            "sources": [],
            "suggested_actions": []
        }


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def detect_anomalies(machine_data: List[dict]) -> List[dict]:
    """
    Analyze machine telemetry data for anomalies using Gemini.
    Returns list of detected anomalies with AI diagnosis.
    """
    model = _get_model(pro=False)

    machines_text = json.dumps(machine_data, indent=2, default=str)

    prompt = f"""{SYSTEM_CONTEXT}

Analyze this machine telemetry data for anomalies, patterns, and predictive maintenance signals.
Respond ONLY with valid JSON array.

Machine Data:
{machines_text}

For each anomaly detected, provide:
{{
  "machine_id": "<machine id>",
  "alert_type": "<e.g. temperature_spike|vibration_abnormal|oee_degradation|pressure_deviation|predictive_failure>",
  "severity": "<critical|high|medium|low>",
  "message": "<clear description of the anomaly>",
  "ai_diagnosis": "<technical explanation of likely cause based on the data pattern>",
  "recommended_action": "<specific maintenance or operational action to take>",
  "confidence": <0.0-1.0>
}}

Return a JSON array. If no anomalies detected, return an empty array [].
Only flag genuine anomalies, not normal operating variations.
"""

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        result = json.loads(text.strip())
        return result if isinstance(result, list) else []
    except (json.JSONDecodeError, Exception) as e:
        logger.error("anomaly_detection_failed", error=str(e))
        return []


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
async def generate_maintenance_recommendation(
    machine_id: str,
    machine_name: str,
    maintenance_history: List[dict],
    current_status: dict,
    recent_alerts: List[dict]
) -> dict:
    """Generate predictive maintenance recommendations for a specific machine."""
    model = _get_model(pro=True)

    prompt = f"""{SYSTEM_CONTEXT}

Generate a predictive maintenance recommendation for this machine.
Respond ONLY with valid JSON.

Machine: {machine_name} (ID: {machine_id})
Current Status: {json.dumps(current_status, default=str)}
Recent Alerts: {json.dumps(recent_alerts[-5:], default=str)}
Maintenance History (last 10 events): {json.dumps(maintenance_history[-10:], default=str)}

{{
  "health_score": <0-100, overall machine health>,
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
}}
"""

    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        return json.loads(text.strip())
    except Exception as e:
        logger.error("maintenance_rec_failed", error=str(e))
        raise ValueError(f"Maintenance recommendation generation failed: {str(e)}")
