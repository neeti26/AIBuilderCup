"""
Gemini AI Service — the intelligence core of ShiftSync.
Production-hardened: circuit breaker, input sanitization, retry with backoff,
async REST via httpx (no grpc/thread issues on Python 3.14).
"""
from typing import Optional, List
import json
import asyncio
import httpx
import structlog
import os

from app.config import settings
from app.security import sanitize_text, sanitize_machine_id
from app.circuit_breaker import gemini_circuit_breaker, CircuitBreakerOpenError

logger = structlog.get_logger()

# ── Models ─────────────────────────────────────────────────────────────────────
MODEL_PRO   = "gemini-2.5-flash"       # Deep reasoning — handover, chat, maintenance
MODEL_FLASH = "gemini-2.5-flash-lite"  # Fast — log classification, anomaly detection

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

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
Always flag safety issues with highest priority. Be specific, not generic."""


def _get_api_key() -> str:
    """Read the Gemini API key fresh from env/settings every time — never cached."""
    key = os.environ.get("GEMINI_API_KEY", "") or settings.GEMINI_API_KEY or ""
    if not key or key in ("PASTE_YOUR_AISTUDIO_KEY_HERE", "placeholder", ""):
        raise ValueError("GEMINI_API_KEY is not set. Add it to your .env file.")
    return key


async def _generate(model: str, prompt: str) -> str:
    """
    Call Gemini REST API asynchronously via httpx with circuit breaker protection.
    Handles 429 rate limits with exponential backoff.
    """
    api_key = _get_api_key()
    url = f"{GEMINI_API_BASE}/{model}:generateContent?key={api_key}"

    payload = {
        "systemInstruction": {"parts": [{"text": SYSTEM_CONTEXT}]},
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {
            "temperature": 0.2,
            "topP": 0.8,
            "maxOutputTokens": 8192,
        },
    }

    async def _attempt() -> str:
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(url, json=payload)

        if response.status_code == 429:
            raise RateLimitError("Gemini rate limited")
        response.raise_for_status()
        data = response.json()
        candidates = data.get("candidates", [])
        if not candidates:
            raise ValueError(f"No candidates in Gemini response: {data}")
        parts = candidates[0].get("content", {}).get("parts", [])
        if not parts:
            finish = candidates[0].get("finishReason", "unknown")
            raise ValueError(f"No parts in response (finishReason={finish}).")
        return parts[0].get("text", "")

    class RateLimitError(Exception):
        pass

    # Try circuit breaker first
    try:
        return await gemini_circuit_breaker.call(_attempt)
    except CircuitBreakerOpenError as exc:
        logger.warning("gemini_circuit_open", model=model, error=str(exc)[:200])
        # Fall through to retry loop which will also hit the breaker — return degraded
        raise ValueError("AI service temporarily unavailable. Please retry in 30 seconds.")
    except RateLimitError:
        # Fall through to manual retry with backoff
        pass

    # Manual retry with exponential backoff (for rate limits / transient errors)
    last_error: Optional[Exception] = None
    for attempt in range(4):
        wait = 15 * (2 ** attempt)  # 15s, 30s, 60s, 120s
        logger.warning("gemini_retry", attempt=attempt + 1, wait_secs=wait, model=model)
        await asyncio.sleep(wait)
        try:
            return await gemini_circuit_breaker.call(_attempt)
        except CircuitBreakerOpenError:
            raise ValueError("AI service temporarily unavailable. Please retry in 30 seconds.")
        except RateLimitError as e:
            last_error = e
            continue
        except httpx.HTTPStatusError as e:
            last_error = e
            if e.response.status_code >= 500:
                continue
            raise
        except Exception as e:
            last_error = e
            break

    raise ValueError(f"Gemini API failed after retries: {last_error}")


def _parse_json(text: str) -> dict | list:
    """Strip markdown fences and parse JSON."""
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```")
        text = parts[1]
        if text.startswith("json"):
            text = text[4:]
    return json.loads(text.strip())


# ── AI Functions ───────────────────────────────────────────────────────────────

async def analyze_log_entry(raw_text: str, machine_id: Optional[str] = None) -> dict:
    """
    Analyze a raw operator log entry using Gemini Flash-Lite.
    Returns category, severity, ai_summary, action_items, tags.
    All inputs are sanitized before sending to the AI.
    """
    # Sanitize inputs
    safe_text = sanitize_text(raw_text)
    safe_machine = sanitize_machine_id(machine_id)

    prompt = f"""Analyze this manufacturing operator log entry and respond ONLY with valid JSON.

Log Entry: "{safe_text}"
{f'Machine/Asset ID: {safe_machine}' if safe_machine else ''}

Respond with EXACTLY this JSON structure (no extra text):
{{
  "category": "<one of: machine|quality|safety|material|maintenance|production|other>",
  "severity": "<one of: critical|high|medium|low|info>",
  "ai_summary": "<concise 1-2 sentence summary>",
  "action_items": ["<specific actionable task 1>", "<specific actionable task 2>"],
  "tags": ["<tag1>", "<tag2>", "<tag3>"],
  "requires_immediate_attention": <true|false>,
  "root_cause_hint": "<brief hypothesis or null>"
}}

Severity guide:
- critical: Safety risk, production stopped, major quality escape
- high: Significant production impact, machine fault affecting output
- medium: Minor production impact, quality concern
- low: Informational
- info: Routine update"""

    try:
        text = await _generate(MODEL_FLASH, prompt)
        result = _parse_json(text)
        # Re-sanitize AI output before returning
        result["ai_summary"] = sanitize_text(result.get("ai_summary", ""), max_length=500)
        result["root_cause_hint"] = sanitize_text(result.get("root_cause_hint") or "", max_length=300) or None
        result["action_items"] = [sanitize_text(a, max_length=200) for a in result.get("action_items", [])]
        result["tags"] = [sanitize_text(t, max_length=50) for t in result.get("tags", [])]
        logger.info("log_analyzed", severity=result.get("severity"), category=result.get("category"))
        return result
    except Exception as e:
        logger.error("log_analysis_failed", error=str(e)[:200], raw_text=raw_text[:80])
        return {
            "category": "other",
            "severity": "medium",
            "ai_summary": sanitize_text(raw_text[:200]),
            "action_items": ["Review log entry manually"],
            "tags": ["unclassified"],
            "requires_immediate_attention": False,
            "root_cause_hint": None,
        }


async def generate_handover_report(
    shift_data: dict,
    log_entries: List[dict],
    machine_statuses: List[dict],
    previous_shift_actions: Optional[List[dict]] = None,
) -> dict:
    """Generate a comprehensive AI shift handover report using Gemini 2.5 Flash."""
    logs_text = "\n".join([
        f"[{log.get('created_at','')}] [{log.get('severity','').upper()}] "
        f"[{log.get('category','').upper()}] {sanitize_text(log.get('raw_text',''), max_length=300)} "
        f"(Machine: {sanitize_machine_id(log.get('machine_id','N/A'))})"
        for log in log_entries
    ])
    machines_text = "\n".join([
        f"- {sanitize_text(m.get('name', m.get('machine_id','')), max_length=100)} "
        f"({sanitize_machine_id(m.get('machine_id',''))}): "
        f"Status={sanitize_text(m.get('status',''), max_length=50).upper()}, "
        f"OEE={m.get('oee','N/A')}%, "
        f"Alerts={m.get('active_alerts',0)}"
        for m in machine_statuses
    ])
    prev_text = ""
    if previous_shift_actions:
        prev_text = "UNRESOLVED ACTIONS FROM PREVIOUS SHIFT:\n" + "\n".join([
            f"- [{sanitize_text(a.get('priority',''), max_length=20).upper()}] "
            f"{sanitize_text(a.get('description',''), max_length=200)}"
            for a in previous_shift_actions
        ])

    prompt = f"""Generate a comprehensive shift handover report. Respond ONLY with valid JSON.

SHIFT: {sanitize_text(shift_data.get('shift_type',''), max_length=50).upper()} | Line: {sanitize_text(shift_data.get('line','N/A'), max_length=100)} | Date: {sanitize_text(shift_data.get('date','N/A'), max_length=50)}
Supervisor: {sanitize_text(shift_data.get('supervisor_name','N/A'), max_length=100)} | Target: {shift_data.get('production_target','N/A')} units | Actual: {shift_data.get('production_actual','N/A')} units

MACHINES:
{machines_text or 'No machine data'}

LOGS ({len(log_entries)} entries):
{logs_text or 'No logs recorded'}

{prev_text}

Respond with this exact JSON:
{{
  "executive_summary": "<3-4 sentence high-level summary for the plant manager>",
  "production_summary": "<detailed production performance narrative>",
  "critical_issues": [{{"issue":"","machine_id":null,"impact":"","status":"ongoing","action_required":""}}],
  "machine_health_overview": "<overall machine health assessment>",
  "quality_incidents": [{{"description":"","severity":"medium","quantity_affected":"unknown","disposition":"hold","follow_up":""}}],
  "maintenance_completed": ["<task completed>"],
  "maintenance_pending": ["<task pending>"],
  "material_status": "<materials status>",
  "safety_incidents": [{{"description":"","severity":"high","persons_involved":"none","action_taken":"","reporting_required":false}}],
  "action_items": [
    {{"id":"ACT-001","description":"<task>","priority":"high","category":"machine","machine_id":null,"estimated_duration":"1 hour","assigned_to":null}}
  ],
  "next_shift_recommendations": "<3-5 specific recommendations>",
  "shift_performance_score": 75.0,
  "performance_breakdown": {{"safety_score":80,"quality_score":75,"production_score":70,"maintenance_score":75}}
}}"""

    text = await _generate(MODEL_PRO, prompt)
    result = _parse_json(text)
    # Sanitize all string outputs from AI
    for key in ("executive_summary", "production_summary", "machine_health_overview",
                "material_status", "next_shift_recommendations"):
        if key in result and isinstance(result[key], str):
            result[key] = sanitize_text(result[key], max_length=2000)
    return result


async def chat_with_shift_context(
    message: str,
    shift_context: Optional[dict] = None,
    conversation_history: Optional[List[dict]] = None,
) -> dict:
    """Natural language AI assistant for shift operations queries."""
    safe_message = sanitize_text(message, max_length=1000)

    ctx = ""
    if shift_context:
        logs = shift_context.get("logs", [])
        machines = shift_context.get("machines", [])
        recent = "\n".join([
            f"[{l.get('severity','info').upper()}] {sanitize_text(l.get('raw_text',''), max_length=120)}"
            for l in logs[-15:]
        ])
        mach_summary = ", ".join([
            f"{sanitize_text(m.get('name',m.get('machine_id','')), max_length=50)}:{sanitize_text(m.get('status',''), max_length=20).upper()}"
            for m in machines
        ])
        ctx = f"""
Shift Context:
- {sanitize_text(shift_context.get('shift_type','N/A'), max_length=50).upper()} shift on {sanitize_text(shift_context.get('line','N/A'), max_length=100)}
- Machines: {mach_summary}
- Recent logs:
{recent}
"""

    history = ""
    if conversation_history:
        for msg in conversation_history[-6:]:
            role = "Operator" if msg.get("role") == "user" else "ShiftSync AI"
            history += f"{role}: {sanitize_text(msg.get('content',''), max_length=200)}\n"

    prompt = f"""{ctx}
{f'Previous conversation:{chr(10)}{history}' if history else ''}
Question: "{safe_message}"

Respond as ShiftSync AI. Be direct, specific, and actionable. Under 300 words.
Reference machine IDs and log details when relevant.

Respond with JSON:
{{
  "response": "<your response>",
  "sources": ["<log/machine reference if applicable>"],
  "suggested_actions": ["<follow-up action 1>", "<follow-up action 2>"]
}}"""

    try:
        text = await _generate(MODEL_PRO, prompt)
        result = _parse_json(text)
        result["response"] = sanitize_text(result.get("response", ""), max_length=1000)
        result["suggested_actions"] = [sanitize_text(a, max_length=200) for a in result.get("suggested_actions", [])]
        return result
    except Exception as e:
        logger.error("chat_failed", error=str(e)[:200])
        return {
            "response": "I encountered an error. Please try again.",
            "sources": [],
            "suggested_actions": [],
        }


async def detect_anomalies(machine_data: List[dict]) -> List[dict]:
    """Analyze machine telemetry for anomalies using Gemini Flash-Lite."""
    # Sanitize machine data before sending
    safe_data = []
    for m in machine_data:
        safe_data.append({
            "machine_id": sanitize_machine_id(m.get("machine_id", "")),
            "status": sanitize_text(m.get("status", ""), max_length=50),
            "oee": m.get("oee"),
            "temperature": m.get("temperature"),
            "vibration": m.get("vibration"),
            "pressure": m.get("pressure"),
        })

    prompt = f"""Analyze this machine telemetry for anomalies. Respond ONLY with a JSON array.

{json.dumps(safe_data, indent=2, default=str)}

For each anomaly found:
{{"machine_id":"","alert_type":"temperature_spike","severity":"high","message":"","ai_diagnosis":"","recommended_action":"","confidence":0.85}}

Return [] if no anomalies. Only flag genuine issues, not normal variations."""

    try:
        text = await _generate(MODEL_FLASH, prompt)
        result = _parse_json(text)
        return result if isinstance(result, list) else []
    except Exception as e:
        logger.error("anomaly_detection_failed", error=str(e)[:200])
        return []


async def generate_maintenance_recommendation(
    machine_id: str,
    machine_name: str,
    maintenance_history: List[dict],
    current_status: dict,
    recent_alerts: List[dict],
) -> dict:
    """Predictive maintenance recommendation for a specific machine."""
    safe_machine_id = sanitize_machine_id(machine_id)
    safe_machine_name = sanitize_text(machine_name, max_length=100)

    prompt = f"""Generate a predictive maintenance recommendation. Respond ONLY with valid JSON.

Machine: {safe_machine_name} (ID: {safe_machine_id})
Status: {json.dumps(current_status, default=str)}
Recent Alerts: {json.dumps(recent_alerts[-5:], default=str)}
History: {json.dumps(maintenance_history[-10:], default=str)}

{{
  "health_score": <0-100>,
  "predicted_failure_risk": "<low|medium|high|critical>",
  "estimated_days_to_maintenance": <integer or null>,
  "recommended_maintenance_type": "<preventive|corrective|predictive|none>",
  "specific_actions": [
    {{"action":"","urgency":"within_week","estimated_duration":"2 hours","parts_required":[]}}
  ],
  "reasoning": "<technical explanation>",
  "cost_impact_if_ignored": "<impact estimate>"
}}"""

    text = await _generate(MODEL_PRO, prompt)
    result = _parse_json(text)
    result["reasoning"] = sanitize_text(result.get("reasoning", ""), max_length=1000)
    result["cost_impact_if_ignored"] = sanitize_text(result.get("cost_impact_if_ignored", ""), max_length=300)
    return result


async def analyze_trend(prompt: str) -> dict:
    """Run a trend analysis prompt and return parsed JSON."""
    safe_prompt = sanitize_text(prompt, max_length=3000)
    text = await _generate(MODEL_PRO, safe_prompt)
    return _parse_json(text)
