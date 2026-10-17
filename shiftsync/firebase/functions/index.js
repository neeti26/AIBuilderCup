/**
 * ShiftSync AI — Firebase Cloud Functions Backend
 * Production-hardened with security middleware, input validation, rate limiting
 * Deployed on Firebase Spark plan (free tier)
 */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const express = require("express");
const cors = require("cors");

// Security middleware
const {
  sanitizeInput,
  validateMachineId,
  rateLimiter,
  loginLimiter,
  recordLoginFailure,
  recordLoginSuccess,
  securityHeaders
} = require("./security");

const { hashPassword, verifyPassword, createToken, authMiddleware } = require("./auth");

// Init Firebase Admin
admin.initializeApp();

const db = require("./db");
const gemini = require("./gemini");

const app = express();
app.use(cors({ origin: true }));
app.use(express.json({ limit: "10kb" })); // Limit request body size
app.use(securityHeaders);
app.use(rateLimiter);

// Get Gemini API key from environment
const getGeminiKey = () => process.env.GEMINI_API_KEY || functions.config().shiftsync?.gemini_key || "";

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/", (req, res) => res.json({
  app: "ShiftSync AI", version: "1.0.0", status: "operational",
  ai_engine: "Gemini 2.5 Flash", platform: "Firebase Cloud Functions",
}));
app.get("/health", (req, res) => res.json({ status: "healthy" }));

// ── Auth ──────────────────────────────────────────────────────────────────────
app.post("/auth/login", loginLimiter, async (req, res) => {
  try {
    const { username, password } = req.body;

    // Input validation
    if (!username || typeof username !== 'string' || username.length < 3 || username.length > 100) {
      return res.status(400).json({ detail: "Invalid username" });
    }
    if (!password || typeof password !== 'string' || password.length < 6 || password.length > 128) {
      return res.status(400).json({ detail: "Invalid password" });
    }

    const sanitizedUsername = sanitizeInput(username);
    const user = await db.getUserByUsername(sanitizedUsername);
    if (!user || !verifyPassword(password, user.hashed_password)) {
      recordLoginFailure(req.ip || req.connection.remoteAddress || 'unknown');
      return res.status(401).json({ detail: "Incorrect username or password" });
    }

    recordLoginSuccess(req.ip || req.connection.remoteAddress || 'unknown');
    const token = createToken({ sub: user.username, id: user.id, role: user.role });
    res.json({ access_token: token, token_type: "bearer", user: { id: user.id, username: user.username, full_name: user.full_name, role: user.role, department: user.department } });
  } catch (e) { res.status(500).json({ detail: "Authentication failed" }); }
});

app.get("/auth/me", authMiddleware, async (req, res) => {
  try {
    const user = await db.getUserByUsername(req.user.sub);
    if (!user) return res.status(404).json({ detail: "User not found" });
    res.json({ id: user.id, username: user.username, full_name: user.full_name, role: user.role, department: user.department });
  } catch (e) { res.status(500).json({ detail: "Authentication failed" }); }
});

// ── Seed (init demo data) ─────────────────────────────────────────────────────
const DEMO_USERS = [
  { username: "supervisor", full_name: "Neeti Malu", role: "supervisor", department: "Production", password: "spidey@01" },
  { username: "staff", full_name: "Mike Torres", role: "operator", department: "Line-A", password: "webby001" },
  { username: "engineer", full_name: "Priya Nair", role: "engineer", department: "Process Engineering", password: "webby001" },
  { username: "manager", full_name: "James Okafor", role: "manager", department: "Operations", password: "webby001" },
];
const DEMO_MACHINES = [
  { machine_id: "CNC-A01", name: "CNC Machining Center A1", line: "Line-A", status: "running", oee: 87.3, temperature: 42.1, vibration: 0.8, active_alerts: 0 },
  { machine_id: "CNC-A02", name: "CNC Machining Center A2", line: "Line-A", status: "fault", oee: 0.0, temperature: 89.4, vibration: 4.2, active_alerts: 2 },
  { machine_id: "ROBOT-A01", name: "Fanuc Assembly Robot A1", line: "Line-A", status: "running", oee: 94.1, temperature: 35.2, vibration: 1.1, active_alerts: 0 },
  { machine_id: "INSP-A01", name: "Vision Inspection A1", line: "Line-A", status: "running", oee: 91.5, temperature: 28.0, vibration: 0.3, active_alerts: 0 },
  { machine_id: "DRILL-B01", name: "Automated Drill B1", line: "Line-B", status: "running", oee: 76.8, temperature: 38.5, vibration: 1.9, active_alerts: 1 },
  { machine_id: "RIVET-B01", name: "Rivet Installation B1", line: "Line-B", status: "maintenance", oee: 0.0, temperature: 22.0, vibration: 0.0, active_alerts: 0 },
  { machine_id: "WELD-B01", name: "Laser Welding B1", line: "Line-B", status: "running", oee: 83.2, temperature: 145.6, vibration: 0.6, active_alerts: 0 },
  { machine_id: "SMT-C01", name: "SMT Pick & Place C1", line: "Line-C", status: "running", oee: 92.7, temperature: 31.4, vibration: 0.4, active_alerts: 0 },
  { machine_id: "XRAY-C01", name: "X-Ray Inspection C1", line: "Line-C", status: "running", oee: 88.9, temperature: 29.1, vibration: 0.2, active_alerts: 0 },
  { machine_id: "TEST-C01", name: "Functional Test C1", line: "Line-C", status: "idle", oee: 45.2, temperature: 24.0, vibration: 0.1, active_alerts: 1 },
];

app.post("/seed/init-users", async (req, res) => {
  const existing = await db.getUserByUsername("supervisor");
  if (existing) return res.json({ message: "Users already initialized" });
  let count = 0;
  for (const u of DEMO_USERS) {
    const { password, ...rest } = u;
    await db.createUser({ ...rest, hashed_password: hashPassword(password) });
    count++;
  }
  res.json({ message: `Initialized ${count} demo users`, credentials: [{ username: "supervisor", password: "spidey@01" }, { username: "staff", password: "webby001" }] });
});

app.post("/seed/demo-data", authMiddleware, async (req, res) => {
  for (const m of DEMO_MACHINES) await db.upsertMachine(m);
  res.json({ message: "Demo data seeded", seeded: { machines_seeded: DEMO_MACHINES.length } });
});

// ── Shifts ────────────────────────────────────────────────────────────────────
app.post("/shifts/", authMiddleware, async (req, res) => {
  try {
    const { shift_type, line, production_target, date } = req.body;
    if (!shift_type || !line) return res.status(400).json({ detail: "Missing required fields" });
    const shift = await db.createShift({ ...req.body, supervisor_name: req.user.full_name || req.user.sub });
    res.status(201).json(shift);
  } catch (e) { res.status(500).json({ detail: "Failed to create shift" }); }
});

app.get("/shifts/active", authMiddleware, async (req, res) => {
  const shifts = await db.getActiveShifts(req.query.line);
  res.json({ shifts, count: shifts.length });
});

app.get("/shifts/:id", authMiddleware, async (req, res) => {
  const shift = await db.getShift(req.params.id);
  if (!shift) return res.status(404).json({ detail: "Shift not found" });
  res.json(shift);
});

// ── Logs ──────────────────────────────────────────────────────────────────────
app.post("/logs/", authMiddleware, async (req, res) => {
  try {
    const { shift_id, raw_text, machine_id } = req.body;
    if (!shift_id || !raw_text) return res.status(400).json({ detail: "Missing required fields" });
    if (typeof raw_text !== 'string' || raw_text.length < 5 || raw_text.length > 5000) {
      return res.status(400).json({ detail: "Invalid log entry" });
    }

    const shift = await db.getShift(shift_id);
    if (!shift) return res.status(404).json({ detail: "Shift not found" });

    // Sanitize input
    const sanitizedText = sanitizeInput(raw_text);
    const safeMachineId = validateMachineId(machine_id);

    // AI Analysis
    const ai = await gemini.analyzeLogEntry(sanitizedText, safeMachineId, getGeminiKey());

    const logDoc = {
      shift_id, raw_text: sanitizedText, machine_id: safeMachineId || null,
      category: ai.category, severity: ai.severity,
      ai_summary: ai.ai_summary, action_items: ai.action_items || [],
      tags: ai.tags || [], requires_immediate_attention: ai.requires_immediate_attention || false,
      root_cause_hint: ai.root_cause_hint || null,
      created_by: req.user.id || req.user.sub,
      created_by_name: req.user.full_name || req.user.sub,
    };
    const log = await db.createLog(logDoc);

    let alertCreated = false;
    if (["critical", "high"].includes(ai.severity) || ai.requires_immediate_attention) {
      await db.createAlert({
        machine_id: safeMachineId || "GENERAL",
        machine_name: safeMachineId || "General Operations",
        alert_type: `${ai.category}_alert`,
        severity: ai.severity,
        message: ai.ai_summary || sanitizedText.slice(0, 200),
        ai_diagnosis: ai.root_cause_hint || null,
        recommended_action: (ai.action_items || ["Investigate immediately"])[0],
        source_log_id: log.id, shift_id,
      });
      alertCreated = true;
    }
    res.status(201).json({ log, ai_analysis: ai, alert_created: alertCreated });
  } catch (e) { res.status(500).json({ detail: "Failed to process log entry" }); }
});

app.get("/logs/shift/:id", authMiddleware, async (req, res) => {
  const logs = await db.getLogsForShift(req.params.id);
  res.json({ logs, count: logs.length });
});

app.get("/logs/recent", authMiddleware, async (req, res) => {
  const logs = await db.getRecentLogs(Number(req.query.limit) || 20);
  res.json({ logs, count: logs.length });
});

// ── Machines ──────────────────────────────────────────────────────────────────
app.get("/machines/", authMiddleware, async (req, res) => {
  const machines = await db.getAllMachines();
  res.json({ machines, count: machines.length });
});

app.get("/machines/:id", authMiddleware, async (req, res) => {
  const m = await db.getMachine(req.params.id);
  if (!m) return res.status(404).json({ detail: "Machine not found" });
  res.json(m);
});

app.post("/machines/status", authMiddleware, async (req, res) => {
  try {
    const { machine_id, status, oee, temperature, vibration, pressure } = req.body;
    if (!machine_id) return res.status(400).json({ detail: "Missing machine_id" });

    const safeMachineId = validateMachineId(machine_id);
    if (!safeMachineId) return res.status(400).json({ detail: "Invalid machine ID" });

    await db.upsertMachine({ ...req.body, machine_id: safeMachineId, updated_by: req.user.sub });

    // Anomaly detection
    const anomalies = await gemini.detectAnomalies([{ ...req.body, machine_id: safeMachineId }], getGeminiKey());
    for (const a of anomalies.filter(x => (x.confidence || 0) >= 0.7)) {
      await db.createAlert({
        machine_id: safeMachineId,
        machine_name: safeMachineId,
        alert_type: a.alert_type,
        severity: a.severity,
        message: a.message,
        ai_diagnosis: a.ai_diagnosis,
        recommended_action: a.recommended_action,
      });
    }
    res.json({ machine: { ...req.body, machine_id: safeMachineId }, anomalies_detected: anomalies.length, anomalies });
  } catch (e) { res.status(500).json({ detail: "Failed to update machine status" }); }
});

app.get("/machines/:id/maintenance-recommendation", authMiddleware, async (req, res) => {
  try {
    const m = await db.getMachine(req.params.id);
    if (!m) return res.status(404).json({ detail: "Machine not found" });
    const alerts = await db.getActiveAlerts(100);
    const machineAlerts = alerts.filter(a => a.machine_id === req.params.id);
    const rec = await gemini.getMaintenanceRec(req.params.id, m.name || req.params.id, m, machineAlerts, getGeminiKey());
    res.json({ machine_id: req.params.id, machine_name: m.name, recommendation: rec });
  } catch (e) { res.status(500).json({ detail: "Failed to get maintenance recommendation" }); }
});

// ── Handover ──────────────────────────────────────────────────────────────────
app.post("/handover/generate", authMiddleware, async (req, res) => {
  try {
    const { shift_id } = req.body;
    if (!shift_id) return res.status(404).json({ detail: "Shift not found" });

    const shift = await db.getShift(shift_id);
    if (!shift) return res.status(404).json({ detail: "Shift not found" });

    const [logs, machines] = await Promise.all([
      db.getLogsForShift(shift_id), db.getAllMachines()
    ]);

    const report = await gemini.generateHandoverReport(
      { ...shift, supervisor_name: shift.supervisor_name || shift.supervisor },
      logs, machines, getGeminiKey()
    );

    const saved = await db.saveHandover({
      ...report, shift_id, line: shift.line, shift_type: shift.shift_type,
      date: shift.date, generated_by: req.user.sub,
      total_logs: logs.length,
      critical_count: logs.filter(l => l.severity === "critical").length,
      high_count: logs.filter(l => l.severity === "high").length,
    });
    res.json({ report: saved, metadata: { logs_analyzed: logs.length, machines_assessed: machines.length } });
  } catch (e) { res.status(500).json({ detail: "Failed to generate handover report" }); }
});

app.get("/handover/shift/:id", authMiddleware, async (req, res) => {
  const reports = await db.getHandoversForShift(req.params.id);
  res.json({ reports, count: reports.length });
});

// ── AI ────────────────────────────────────────────────────────────────────────
app.post("/ai/chat", authMiddleware, async (req, res) => {
  try {
    const { message, shift_id, conversation_history } = req.body;
    if (!message || typeof message !== 'string' || message.length < 1 || message.length > 2000) {
      return res.status(400).json({ detail: "Invalid message" });
    }

    let ctx = null;
    if (shift_id) {
      const shift = await db.getShift(shift_id);
      if (shift) {
        const [logs, machines] = await Promise.all([db.getLogsForShift(shift_id), db.getAllMachines()]);
        ctx = { ...shift, logs, machines };
      }
    }
    const result = await gemini.chatWithContext(message, ctx, conversation_history || [], getGeminiKey());
    res.json({ response: result.response || "", sources: result.sources || [], suggested_actions: result.suggested_actions || [] });
  } catch (e) { res.status(500).json({ detail: "AI assistant failed" }); }
});

app.get("/ai/alerts", authMiddleware, async (req, res) => {
  const alerts = await db.getActiveAlerts(50);
  res.json({ alerts, count: alerts.length });
});

app.post("/ai/alerts/:id/acknowledge", authMiddleware, async (req, res) => {
  await db.acknowledgeAlert(req.params.id, req.user.sub);
  res.json({ message: "Alert acknowledged", alert_id: req.params.id });
});

app.get("/ai/dashboard", authMiddleware, async (req, res) => {
  const stats = await db.getDashboardStats();
  res.json(stats);
});

// ── Export ────────────────────────────────────────────────────────────────────
exports.api = functions
  .runWith({ timeoutSeconds: 300, memory: "512MB" })
  .https.onRequest(app);
