"""
Firestore database service for ShiftSync AI.
Falls back to in-memory store when GOOGLE_CLOUD_PROJECT is 'shiftsync-local'
or when Firestore credentials are not available — enables full local dev.
"""
from typing import Optional, List, Any
from datetime import datetime
import uuid
import structlog

from app.config import settings

logger = structlog.get_logger()

# ─── Collection Names ─────────────────────────────────────────────────────────
SHIFTS = "shifts"
LOGS = "log_entries"
MACHINES = "machines"
ALERTS = "alerts"
USERS = "users"
HANDOVER_REPORTS = "handover_reports"

# ─── In-Memory Store (local dev / demo) ───────────────────────────────────────
_store: dict[str, dict] = {
    SHIFTS: {}, LOGS: {}, MACHINES: {}, ALERTS: {},
    USERS: {}, HANDOVER_REPORTS: {},
}

# ─── Firestore client (lazy init) ─────────────────────────────────────────────
_db = None
_use_firestore = False


def _get_db():
    global _db, _use_firestore
    if _db is not None:
        return _db
    if settings.GOOGLE_CLOUD_PROJECT in ("shiftsync-local", "your-gcp-project-id", ""):
        _use_firestore = False
        return None
    try:
        from google.cloud import firestore
        _db = firestore.AsyncClient(project=settings.GOOGLE_CLOUD_PROJECT)
        _use_firestore = True
        logger.info("firestore_connected", project=settings.GOOGLE_CLOUD_PROJECT)
        return _db
    except Exception as e:
        logger.warning("firestore_unavailable_using_memory", error=str(e))
        _use_firestore = False
        return None


def _now_str() -> str:
    return datetime.utcnow().isoformat() + "Z"


# ─── Generic helpers for in-memory store ─────────────────────────────────────

def _mem_set(collection: str, doc_id: str, data: dict) -> dict:
    doc = {**data, "id": doc_id}
    # Replace SERVER_TIMESTAMP placeholders with real timestamps
    for k, v in doc.items():
        if hasattr(v, '_sentinel') or (isinstance(v, object) and type(v).__name__ == '_ServerTimestampSentinel'):
            doc[k] = _now_str()
    _store[collection][doc_id] = doc
    return doc


def _mem_get(collection: str, doc_id: str) -> Optional[dict]:
    return _store[collection].get(doc_id)


def _mem_list(collection: str, filters: Optional[list] = None,
              order_by: Optional[str] = None, desc: bool = False,
              limit: Optional[int] = None) -> List[dict]:
    items = list(_store[collection].values())
    if filters:
        for field, op, value in filters:
            if op == "==":
                items = [i for i in items if i.get(field) == value]
            elif op == "in":
                items = [i for i in items if i.get(field) in value]
    if order_by:
        items.sort(key=lambda x: x.get(order_by, ""), reverse=desc)
    if limit:
        items = items[:limit]
    return items


# ─── Shift Operations ─────────────────────────────────────────────────────────

async def create_shift(shift_data: dict) -> dict:
    shift_id = f"SHIFT-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"
    doc = {
        **shift_data, "id": shift_id, "status": "active",
        "log_count": 0, "open_actions": 0, "production_actual": 0,
        "created_at": _now_str(), "completed_at": None,
    }
    db = _get_db()
    if db and _use_firestore:
        from google.cloud import firestore
        doc_fs = {**doc, "created_at": firestore.SERVER_TIMESTAMP}
        await db.collection(SHIFTS).document(shift_id).set(doc_fs)
    else:
        _mem_set(SHIFTS, shift_id, doc)
    logger.info("shift_created", shift_id=shift_id)
    return doc


async def get_shift(shift_id: str) -> Optional[dict]:
    db = _get_db()
    if db and _use_firestore:
        d = await db.collection(SHIFTS).document(shift_id).get()
        return {"id": d.id, **d.to_dict()} if d.exists else None
    return _mem_get(SHIFTS, shift_id)


async def get_active_shifts(line: Optional[str] = None) -> List[dict]:
    db = _get_db()
    if db and _use_firestore:
        from google.cloud import firestore
        q = db.collection(SHIFTS).where("status", "==", "active")
        if line:
            q = q.where("line", "==", line)
        docs = await q.order_by("created_at", direction=firestore.Query.DESCENDING).limit(10).get()
        return [{"id": d.id, **d.to_dict()} for d in docs]
    filters = [("status", "==", "active")]
    if line:
        filters.append(("line", "==", line))
    return _mem_list(SHIFTS, filters=filters, order_by="created_at", desc=True, limit=10)


async def get_shifts_by_date(date_str: str, line: Optional[str] = None) -> List[dict]:
    db = _get_db()
    if db and _use_firestore:
        q = db.collection(SHIFTS).where("date", "==", date_str)
        if line:
            q = q.where("line", "==", line)
        docs = await q.get()
        return [{"id": d.id, **d.to_dict()} for d in docs]
    filters = [("date", "==", date_str)]
    if line:
        filters.append(("line", "==", line))
    return _mem_list(SHIFTS, filters=filters)


async def complete_shift(shift_id: str, production_actual: int) -> bool:
    db = _get_db()
    if db and _use_firestore:
        from google.cloud import firestore
        await db.collection(SHIFTS).document(shift_id).update({
            "status": "completed", "production_actual": production_actual,
            "completed_at": firestore.SERVER_TIMESTAMP,
        })
    else:
        doc = _mem_get(SHIFTS, shift_id)
        if doc:
            doc.update({"status": "completed", "production_actual": production_actual,
                        "completed_at": _now_str()})
    return True


# ─── Log Entry Operations ─────────────────────────────────────────────────────

async def create_log_entry(entry_data: dict) -> dict:
    entry_id = f"LOG-{str(uuid.uuid4())[:12].upper()}"
    doc = {**entry_data, "id": entry_id, "created_at": _now_str()}
    db = _get_db()
    if db and _use_firestore:
        from google.cloud import firestore
        await db.collection(LOGS).document(entry_id).set(
            {**doc, "created_at": firestore.SERVER_TIMESTAMP})
        await db.collection(SHIFTS).document(entry_data["shift_id"]).update(
            {"log_count": firestore.Increment(1)})
    else:
        _mem_set(LOGS, entry_id, doc)
        shift = _mem_get(SHIFTS, entry_data["shift_id"])
        if shift:
            shift["log_count"] = shift.get("log_count", 0) + 1
    logger.info("log_entry_created", entry_id=entry_id)
    return doc


async def get_logs_for_shift(shift_id: str) -> List[dict]:
    db = _get_db()
    if db and _use_firestore:
        from google.cloud import firestore
        docs = await (db.collection(LOGS).where("shift_id", "==", shift_id)
                      .order_by("created_at").get())
        return [{"id": d.id, **d.to_dict()} for d in docs]
    return _mem_list(LOGS, filters=[("shift_id", "==", shift_id)], order_by="created_at")


async def get_recent_logs(line: Optional[str] = None, limit: int = 50) -> List[dict]:
    db = _get_db()
    if db and _use_firestore:
        from google.cloud import firestore
        docs = await (db.collection(LOGS)
                      .order_by("created_at", direction=firestore.Query.DESCENDING)
                      .limit(limit).get())
        return [{"id": d.id, **d.to_dict()} for d in docs]
    return _mem_list(LOGS, order_by="created_at", desc=True, limit=limit)


async def get_critical_logs(shift_id: str) -> List[dict]:
    db = _get_db()
    if db and _use_firestore:
        docs = await (db.collection(LOGS)
                      .where("shift_id", "==", shift_id)
                      .where("severity", "in", ["critical", "high"]).get())
        return [{"id": d.id, **d.to_dict()} for d in docs]
    return _mem_list(LOGS, filters=[("shift_id", "==", shift_id),
                                     ("severity", "in", ["critical", "high"])])


# ─── Machine Operations ───────────────────────────────────────────────────────

async def upsert_machine(machine_data: dict) -> dict:
    machine_id = machine_data["machine_id"]
    doc = {**machine_data, "last_updated": _now_str()}
    db = _get_db()
    if db and _use_firestore:
        from google.cloud import firestore
        await db.collection(MACHINES).document(machine_id).set(
            {**doc, "last_updated": firestore.SERVER_TIMESTAMP}, merge=True)
    else:
        existing = _mem_get(MACHINES, machine_id) or {}
        _mem_set(MACHINES, machine_id, {**existing, **doc})
    return doc


async def get_all_machines() -> List[dict]:
    db = _get_db()
    if db and _use_firestore:
        docs = await db.collection(MACHINES).get()
        return [{"id": d.id, **d.to_dict()} for d in docs]
    return list(_store[MACHINES].values())


async def get_machine(machine_id: str) -> Optional[dict]:
    db = _get_db()
    if db and _use_firestore:
        d = await db.collection(MACHINES).document(machine_id).get()
        return {"id": d.id, **d.to_dict()} if d.exists else None
    return _mem_get(MACHINES, machine_id)


# ─── Alert Operations ─────────────────────────────────────────────────────────

async def create_alert(alert_data: dict) -> dict:
    alert_id = f"ALT-{str(uuid.uuid4())[:10].upper()}"
    doc = {**alert_data, "id": alert_id, "triggered_at": _now_str(),
           "acknowledged": False, "acknowledged_by": None, "acknowledged_at": None}
    db = _get_db()
    if db and _use_firestore:
        from google.cloud import firestore
        await db.collection(ALERTS).document(alert_id).set(
            {**doc, "triggered_at": firestore.SERVER_TIMESTAMP})
    else:
        _mem_set(ALERTS, alert_id, doc)
    logger.warning("alert_created", alert_id=alert_id, severity=alert_data.get("severity"))
    return doc


async def get_active_alerts(limit: int = 20) -> List[dict]:
    db = _get_db()
    if db and _use_firestore:
        from google.cloud import firestore
        docs = await (db.collection(ALERTS).where("acknowledged", "==", False)
                      .order_by("triggered_at", direction=firestore.Query.DESCENDING)
                      .limit(limit).get())
        return [{"id": d.id, **d.to_dict()} for d in docs]
    return _mem_list(ALERTS, filters=[("acknowledged", "==", False)],
                     order_by="triggered_at", desc=True, limit=limit)


async def acknowledge_alert(alert_id: str, user_id: str) -> bool:
    db = _get_db()
    if db and _use_firestore:
        from google.cloud import firestore
        await db.collection(ALERTS).document(alert_id).update({
            "acknowledged": True, "acknowledged_by": user_id,
            "acknowledged_at": firestore.SERVER_TIMESTAMP,
        })
    else:
        doc = _mem_get(ALERTS, alert_id)
        if doc:
            doc.update({"acknowledged": True, "acknowledged_by": user_id,
                        "acknowledged_at": _now_str()})
    return True


# ─── Handover Report Operations ───────────────────────────────────────────────

async def save_handover_report(report_data: dict) -> dict:
    report_id = f"HDR-{str(uuid.uuid4())[:10].upper()}"
    doc = {**report_data, "id": report_id, "generated_at": _now_str(), "generated_by_ai": True}
    db = _get_db()
    if db and _use_firestore:
        from google.cloud import firestore
        await db.collection(HANDOVER_REPORTS).document(report_id).set(
            {**doc, "generated_at": firestore.SERVER_TIMESTAMP})
    else:
        _mem_set(HANDOVER_REPORTS, report_id, doc)
    logger.info("handover_report_saved", report_id=report_id)
    return doc


async def get_handover_reports(shift_id: str) -> List[dict]:
    db = _get_db()
    if db and _use_firestore:
        from google.cloud import firestore
        docs = await (db.collection(HANDOVER_REPORTS).where("shift_id", "==", shift_id)
                      .order_by("generated_at", direction=firestore.Query.DESCENDING).get())
        return [{"id": d.id, **d.to_dict()} for d in docs]
    return _mem_list(HANDOVER_REPORTS, filters=[("shift_id", "==", shift_id)],
                     order_by="generated_at", desc=True)


async def get_latest_handover_for_line(line: str) -> Optional[dict]:
    db = _get_db()
    if db and _use_firestore:
        from google.cloud import firestore
        docs = await (db.collection(HANDOVER_REPORTS).where("line", "==", line)
                      .order_by("generated_at", direction=firestore.Query.DESCENDING)
                      .limit(1).get())
        return {"id": docs[0].id, **docs[0].to_dict()} if docs else None
    items = _mem_list(HANDOVER_REPORTS, filters=[("line", "==", line)],
                      order_by="generated_at", desc=True, limit=1)
    return items[0] if items else None


# ─── User Operations ──────────────────────────────────────────────────────────

async def get_user_by_username(username: str) -> Optional[dict]:
    db = _get_db()
    if db and _use_firestore:
        docs = await (db.collection(USERS).where("username", "==", username).limit(1).get())
        return {"id": docs[0].id, **docs[0].to_dict()} if docs else None
    items = _mem_list(USERS, filters=[("username", "==", username)], limit=1)
    return items[0] if items else None


async def create_user(user_data: dict) -> dict:
    user_id = str(uuid.uuid4())
    doc = {**user_data, "id": user_id, "created_at": _now_str(), "is_active": True}
    db = _get_db()
    if db and _use_firestore:
        from google.cloud import firestore
        await db.collection(USERS).document(user_id).set(
            {**doc, "created_at": firestore.SERVER_TIMESTAMP})
    else:
        _mem_set(USERS, user_id, doc)
    return doc


# ─── Dashboard Stats ──────────────────────────────────────────────────────────

async def get_dashboard_stats() -> dict:
    machines = await get_all_machines()
    running = sum(1 for m in machines if m.get("status") == "running")
    fault = sum(1 for m in machines if m.get("status") == "fault")
    maintenance = sum(1 for m in machines if m.get("status") == "maintenance")
    oee_values = [m.get("oee", 0) for m in machines if m.get("oee") is not None]
    oee_avg = sum(oee_values) / len(oee_values) if oee_values else 0.0
    alerts = await get_active_alerts(limit=50)
    critical_alerts = [a for a in alerts if a.get("severity") == "critical"]
    active_shifts = await get_active_shifts()
    return {
        "machines_total": len(machines),
        "machines_running": running,
        "machines_fault": fault,
        "machines_maintenance": maintenance,
        "open_alerts": len(alerts),
        "critical_alerts": len(critical_alerts),
        "oee_average": round(oee_avg, 1),
        "active_shift": active_shifts[0] if active_shifts else None,
        "recent_alerts": alerts[:5],
    }
