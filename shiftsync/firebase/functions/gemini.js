/**
 * Gemini AI Service — calls Gemini REST API directly via axios.
 * Uses gemini-2.5-flash for deep reasoning, gemini-2.5-flash-lite for classification.
 */
const axios = require("axios");

const MODEL_PRO = "gemini-2.5-flash";
const MODEL_FLASH = "gemini-2.5-flash-lite";
const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

const SYSTEM_CONTEXT = `You are ShiftSync AI, an expert manufacturing operations intelligence system
specialized in aerospace and industrial manufacturing. You have expertise in:
- Lean manufacturing, Six Sigma, OEE analysis
- Predictive maintenance and reliability engineering  
- Quality management (AS9100, ISO 9001)
- Safety management (OSHA, ISO 45001)
- Root cause analysis (5-Why, Fishbone/Ishikawa)
Always flag safety issues with highest priority. Be specific and actionable.`;

async function generate(model, prompt, apiKey) {
  const url = `${GEMINI_BASE}/${model}:generateContent?key=${apiKey}`;
  const payload = {
    systemInstruction: { parts: [{ text: SYSTEM_CONTEXT }] },
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.2, topP: 0.8, maxOutputTokens: 8192 },
  };

  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const resp = await axios.post(url, payload, { timeout: 120000 });
      const candidates = resp.data?.candidates || [];
      if (!candidates.length) throw new Error("No candidates in response");
      const parts = candidates[0]?.content?.parts || [];
      if (!parts.length) throw new Error(`No parts (finishReason=${candidates[0]?.finishReason})`);
      return parts[0].text || "";
    } catch (err) {
      if (err.response?.status === 429) {
        const wait = 15000 * Math.pow(2, attempt);
        console.warn(`Rate limit hit, waiting ${wait}ms...`);
        await new Promise(r => setTimeout(r, wait));
        continue;
      }
      throw err;
    }
  }
  throw new Error("Rate limit exceeded after 4 attempts");
}

function parseJson(text) {
  let t = text.trim();
  if (t.startsWith("```")) {
    const parts = t.split("```");
    t = parts[1] || "";
    if (t.startsWith("json")) t = t.slice(4);
  }
  return JSON.parse(t.trim());
}

async function analyzeLogEntry(rawText, machineId, apiKey) {
  const prompt = `Analyze this manufacturing operator log entry and respond ONLY with valid JSON.

Log Entry: "${rawText}"
${machineId ? `Machine/Asset ID: ${machineId}` : ""}

Respond with EXACTLY this JSON structure:
{
  "category": "<machine|quality|safety|material|maintenance|production|other>",
  "severity": "<critical|high|medium|low|info>",
  "ai_summary": "<concise 1-2 sentence summary>",
  "action_items": ["<actionable task 1>", "<actionable task 2>"],
  "tags": ["<tag1>", "<tag2>", "<tag3>"],
  "requires_immediate_attention": <true|false>,
  "root_cause_hint": "<brief hypothesis or null>"
}

Severity: critical=safety/stopped, high=major impact, medium=minor, low=info`;

  try {
    const text = await generate(MODEL_FLASH, prompt, apiKey);
    return parseJson(text);
  } catch (e) {
    console.error("analyzeLogEntry failed:", e.message);
    return {
      category: "other", severity: "medium",
      ai_summary: rawText.slice(0, 200),
      action_items: ["Review manually"], tags: ["unclassified"],
      requires_immediate_attention: false, root_cause_hint: null,
    };
  }
}

async function generateHandoverReport(shiftData, logEntries, machines, apiKey) {
  const logsText = logEntries.map(l =>
    `[${l.created_at}] [${(l.severity||"").toUpperCase()}] [${(l.category||"").toUpperCase()}] ${l.raw_text} (Machine: ${l.machine_id || "N/A"})`
  ).join("\n");

  const machinesText = machines.map(m =>
    `- ${m.name || m.machine_id} (${m.machine_id}): Status=${(m.status||"").toUpperCase()}, OEE=${m.oee ?? "N/A"}%, Alerts=${m.active_alerts || 0}`
  ).join("\n");

  const prompt = `Generate a comprehensive shift handover report. Respond ONLY with valid JSON.

SHIFT: ${(shiftData.shift_type||"").toUpperCase()} | Line: ${shiftData.line || "N/A"} | Date: ${shiftData.date || "N/A"}
Supervisor: ${shiftData.supervisor_name || "N/A"} | Target: ${shiftData.production_target || "N/A"} units | Actual: ${shiftData.production_actual || 0} units

MACHINES:
${machinesText || "No machine data"}

LOGS (${logEntries.length} entries):
${logsText || "No logs recorded"}

Respond with this JSON:
{
  "executive_summary": "<3-4 sentence plant manager brief>",
  "production_summary": "<production performance narrative>",
  "critical_issues": [{"issue":"","machine_id":null,"impact":"","status":"ongoing","action_required":""}],
  "machine_health_overview": "<machine health assessment>",
  "quality_incidents": [{"description":"","severity":"medium","quantity_affected":"unknown","disposition":"hold","follow_up":""}],
  "maintenance_completed": ["<task>"],
  "maintenance_pending": ["<task>"],
  "material_status": "<status>",
  "safety_incidents": [{"description":"","severity":"high","persons_involved":"none","action_taken":"","reporting_required":false}],
  "action_items": [{"id":"ACT-001","description":"<task>","priority":"high","category":"machine","machine_id":null,"estimated_duration":"1 hour","assigned_to":null}],
  "next_shift_recommendations": "<3-5 specific recommendations>",
  "shift_performance_score": 75.0,
  "performance_breakdown": {"safety_score":80,"quality_score":75,"production_score":70,"maintenance_score":75}
}`;

  const text = await generate(MODEL_PRO, prompt, apiKey);
  return parseJson(text);
}

async function chatWithContext(message, shiftContext, history, apiKey) {
  let ctx = "";
  if (shiftContext) {
    const logs = (shiftContext.logs || []).slice(-15).map(l =>
      `[${(l.severity||"info").toUpperCase()}] ${(l.raw_text||"").slice(0, 120)}`
    ).join("\n");
    const machSummary = (shiftContext.machines || []).map(m =>
      `${m.name || m.machine_id}:${(m.status||"").toUpperCase()}`
    ).join(", ");
    ctx = `Shift Context:\n- ${(shiftContext.shift_type||"").toUpperCase()} shift on ${shiftContext.line || "N/A"}\n- Machines: ${machSummary}\n- Recent logs:\n${logs}\n`;
  }
  const histText = (history || []).slice(-6).map(m =>
    `${m.role === "user" ? "Operator" : "ShiftSync AI"}: ${m.content}`
  ).join("\n");

  const prompt = `${ctx}\n${histText ? `Previous conversation:\n${histText}\n` : ""}Question: "${message}"\n\nBe direct, specific, actionable. Under 300 words. Reference machine IDs when relevant.\n\nRespond with JSON:\n{"response":"<answer>","sources":["<ref>"],"suggested_actions":["<action1>","<action2>"]}`;

  try {
    const text = await generate(MODEL_PRO, prompt, apiKey);
    return parseJson(text);
  } catch (e) {
    return { response: "I encountered an error. Please try again.", sources: [], suggested_actions: [] };
  }
}

async function detectAnomalies(machineData, apiKey) {
  const prompt = `Analyze this machine telemetry for anomalies. Respond ONLY with a JSON array.\n\n${JSON.stringify(machineData, null, 2)}\n\nFor each anomaly: {"machine_id":"","alert_type":"","severity":"high","message":"","ai_diagnosis":"","recommended_action":"","confidence":0.85}\n\nReturn [] if no anomalies.`;
  try {
    const text = await generate(MODEL_FLASH, prompt, apiKey);
    const result = parseJson(text);
    return Array.isArray(result) ? result : [];
  } catch { return []; }
}

async function getMaintenanceRec(machineId, machineName, status, alerts, apiKey) {
  const prompt = `Generate predictive maintenance recommendation. Respond ONLY with valid JSON.\n\nMachine: ${machineName} (ID: ${machineId})\nStatus: ${JSON.stringify(status)}\nAlerts: ${JSON.stringify(alerts.slice(-5))}\n\n{"health_score":85,"predicted_failure_risk":"medium","estimated_days_to_maintenance":7,"recommended_maintenance_type":"preventive","specific_actions":[{"action":"","urgency":"within_week","estimated_duration":"2 hours","parts_required":[]}],"reasoning":"<technical>","cost_impact_if_ignored":"<impact>"}`;
  const text = await generate(MODEL_PRO, prompt, apiKey);
  return parseJson(text);
}

module.exports = { analyzeLogEntry, generateHandoverReport, chatWithContext, detectAnomalies, getMaintenanceRec };
