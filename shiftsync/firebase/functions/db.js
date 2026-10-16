/**
 * Firestore database service for ShiftSync Firebase Functions.
 */
const admin = require("firebase-admin");
const { v4: uuidv4 } = require("uuid");

const db = () => admin.firestore();
const now = () => admin.firestore.FieldValue.serverTimestamp();
const nowStr = () => new Date().toISOString();

// Collections
const C = {
  SHIFTS: "shifts", LOGS: "log_entries", MACHINES: "machines",
  ALERTS: "alerts", USERS: "users", HANDOVER: "handover_reports",
};

// ── Shifts ────────────────────────────────────────────────────────────────────
async function createShift(data) {
  const id = `SHIFT-${new Date().toISOString().slice(0,10).replace(/-/g,"")}-${uuidv4().slice(0,8).toUpperCase()}`;
  const doc = { ...data, id, status: "active", log_count: 0, open_actions: 0, production_actual: 0, created_at: nowStr(), completed_at: null };
  await db().collection(C.SHIFTS).doc(id).set({ ...doc, created_at: now() });
  return doc;
}
async function getShift(id) {
  const d = await db().collection(C.SHIFTS).doc(id).get();
  return d.exists ? { id: d.id, ...d.data() } : null;
}
async function getActiveShifts(line) {
  let q = db().collection(C.SHIFTS).where("status", "==", "active");
  if (line) q = q.where("line", "==", line);
  const docs = await q.orderBy("created_at", "desc").limit(10).get();
  return docs.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Logs ──────────────────────────────────────────────────────────────────────
async function createLog(data) {
  const id = `LOG-${uuidv4().replace(/-/g,"").slice(0,12).toUpperCase()}`;
  const doc = { ...data, id, created_at: nowStr() };
  await db().collection(C.LOGS).doc(id).set({ ...doc, created_at: now() });
  await db().collection(C.SHIFTS).doc(data.shift_id).update({ log_count: admin.firestore.FieldValue.increment(1) });
  return doc;
}
async function getLogsForShift(shiftId) {
  const docs = await db().collection(C.LOGS).where("shift_id", "==", shiftId).orderBy("created_at").get();
  return docs.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function getRecentLogs(limit = 50) {
  const docs = await db().collection(C.LOGS).orderBy("created_at", "desc").limit(limit).get();
  return docs.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Machines ──────────────────────────────────────────────────────────────────
async function upsertMachine(data) {
  const id = data.machine_id;
  await db().collection(C.MACHINES).doc(id).set({ ...data, last_updated: now() }, { merge: true });
  return data;
}
async function getAllMachines() {
  const docs = await db().collection(C.MACHINES).get();
  return docs.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function getMachine(id) {
  const d = await db().collection(C.MACHINES).doc(id).get();
  return d.exists ? { id: d.id, ...d.data() } : null;
}

// ── Alerts ────────────────────────────────────────────────────────────────────
async function createAlert(data) {
  const id = `ALT-${uuidv4().slice(0,10).toUpperCase()}`;
  const doc = { ...data, id, triggered_at: nowStr(), acknowledged: false, acknowledged_by: null };
  await db().collection(C.ALERTS).doc(id).set({ ...doc, triggered_at: now() });
  return doc;
}
async function getActiveAlerts(limit = 50) {
  const docs = await db().collection(C.ALERTS).where("acknowledged", "==", false).orderBy("triggered_at", "desc").limit(limit).get();
  return docs.docs.map(d => ({ id: d.id, ...d.data() }));
}
async function acknowledgeAlert(id, userId) {
  await db().collection(C.ALERTS).doc(id).update({ acknowledged: true, acknowledged_by: userId, acknowledged_at: now() });
}

// ── Handover ──────────────────────────────────────────────────────────────────
async function saveHandover(data) {
  const id = `HDR-${uuidv4().slice(0,10).toUpperCase()}`;
  const doc = { ...data, id, generated_at: nowStr(), generated_by_ai: true };
  await db().collection(C.HANDOVER).doc(id).set({ ...doc, generated_at: now() });
  return doc;
}
async function getHandoversForShift(shiftId) {
  const docs = await db().collection(C.HANDOVER).where("shift_id", "==", shiftId).orderBy("generated_at", "desc").get();
  return docs.docs.map(d => ({ id: d.id, ...d.data() }));
}

// ── Users ─────────────────────────────────────────────────────────────────────
async function getUserByUsername(username) {
  const docs = await db().collection(C.USERS).where("username", "==", username).limit(1).get();
  return docs.empty ? null : { id: docs.docs[0].id, ...docs.docs[0].data() };
}
async function createUser(data) {
  const id = uuidv4();
  const doc = { ...data, id, created_at: nowStr(), is_active: true };
  await db().collection(C.USERS).doc(id).set(doc);
  return doc;
}

// ── Dashboard ─────────────────────────────────────────────────────────────────
async function getDashboardStats() {
  const [machines, alerts, shifts] = await Promise.all([
    getAllMachines(), getActiveAlerts(50), getActiveShifts(),
  ]);
  const running = machines.filter(m => m.status === "running").length;
  const fault = machines.filter(m => m.status === "fault").length;
  const maintenance = machines.filter(m => m.status === "maintenance").length;
  const oees = machines.filter(m => m.oee != null).map(m => m.oee);
  const oee_average = oees.length ? Math.round(oees.reduce((a, b) => a + b, 0) / oees.length * 10) / 10 : 0;
  return {
    machines_total: machines.length, machines_running: running,
    machines_fault: fault, machines_maintenance: maintenance,
    open_alerts: alerts.length,
    critical_alerts: alerts.filter(a => a.severity === "critical").length,
    oee_average, active_shift: shifts[0] || null, recent_alerts: alerts.slice(0, 5),
  };
}

module.exports = { createShift, getShift, getActiveShifts, createLog, getLogsForShift, getRecentLogs, upsertMachine, getAllMachines, getMachine, createAlert, getActiveAlerts, acknowledgeAlert, saveHandover, getHandoversForShift, getUserByUsername, createUser, getDashboardStats, C };
