"""
Firestore database service for ShiftSync AI.
Handles all CRUD operations and real-time data management.
"""
from google.cloud import firestore
from google.cloud.firestore_v1 import AsyncClient
from typing import Optional, List, Any
from datetime import datetime, date
import uuid
import structlog

from app.config import settings

logger = structlog.get_logger()

# Singleton Firestore client
_db: Optional[AsyncClient] = None


def get_db() -> AsyncClient:
    global _db
    if _db is None:
        _db = firestore.AsyncClient(project=settings.GOOGLE_CLOUD_PROJECT)
    return _db


# ─── Collection Names ─────────────────────────────────────────────────────────
SHIFTS = "shifts"
LOGS = "log_entries"
MACHINES = "machines"
ALERTS = "alerts"
USERS = "users"
HANDOVER_REPORTS = "handover_reports"
MAINTENANCE_HISTORY = "maintenance_history"


# ─── Shift Operations ─────────────────────────────────────────────────────────

async def create_shift(shift_data: dict) -> dict:
    db = get_db()
    shift_id = f"SHIFT-{datetime.utcnow().strftime('%Y%m%d')}-{str(uuid.uuid4())[:8].upper()}"
    doc = {
        **shift_data,
        "id": shift_id,
        "status": "active",
        "log_count": 0,
        "open_actions": 0,
        "production_actual": 0,
        "created_at": firestore.SERVER_TIMESTAMP,
        "completed_at": None,
    }
    await db.collection(SHIFTS).document(shift_id).set(doc)
    doc["id"] = shift_id
    logger.info("shift_created", shift_id=shift_id)
    return doc


async def get_shift(shift_id: str) -> Optional[dict]:
    db = get_db()
    doc = await db.collection(SHIFTS).document(shift_id).get()
    if doc.exists:
        data = doc.to_dict()
        data["id"] = doc.id
        return data
    return None


async def get_active_shifts(line: Optional[str] = None) -> List[dict]:
    db = get_db()
    query = db.collection(SHIFTS).where("status", "==", "active")
    if line:
        query = query.where("line", "==", line)
    query = query.order_by("created_at", direction=firestore.Query.DESCENDING).limit(10)
    docs = await query.get()
    return [{"id": d.id, **d.to_dict()} for d in docs]


async def get_shifts_by_date(date_str: str, line: Optional[str] = None) -> List[dict]:
    db = get_db()
    query = db.collection(SHIFTS).where("date", "==", date_str)
    if line:
        query = query.where("line", "==", line)
    docs = await query.get()
    return [{"id": d.id, **d.to_dict()} for d in docs]


async def complete_shift(shift_id: str, production_actual: int) -> bool:
    db = get_db()
    await db.collection(SHIFTS).document(shift_id).update({
        "status": "completed",
        "production_actual": production_actual,
        "completed_at": firestore.SERVER_TIMESTAMP,
    })
    return True


# ─── Log Entry Operations ─────────────────────────────────────────────────────

async def create_log_entry(entry_data: dict) -> dict:
    db = get_db()
    entry_id = f"LOG-{str(uuid.uuid4())[:12].upper()}"
    doc = {
        **entry_data,
        "id": entry_id,
        "created_at": firestore.SERVER_TIMESTAMP,
    }
    await db.collection(LOGS).document(entry_id).set(doc)

    # Increment shift log count
    shift_ref = db.collection(SHIFTS).document(entry_data["shift_id"])
    await shift_ref.update({"log_count": firestore.Increment(1)})

    logger.info("log_entry_created", entry_id=entry_id, shift_id=entry_data["shift_id"])
    return {**doc, "id": entry_id}


async def get_logs_for_shift(shift_id: str) -> List[dict]:
    db = get_db()
    query = (db.collection(LOGS)
               .where("shift_id", "==", shift_id)
               .order_by("created_at", direction=firestore.Query.ASCENDING))
    docs = await query.get()
    return [{"id": d.id, **d.to_dict()} for d in docs]


async def get_recent_logs(line: Optional[str] = None, limit: int = 50) -> List[dict]:
    db = get_db()
    query = db.collection(LOGS).order_by("created_at", direction=firestore.Query.DESCENDING).limit(limit)
    docs = await query.get()
    return [{"id": d.id, **d.to_dict()} for d in docs]


async def get_critical_logs(shift_id: str) -> List[dict]:
    db = get_db()
    query = (db.collection(LOGS)
               .where("shift_id", "==", shift_id)
               .where("severity", "in", ["critical", "high"]))
    docs = await query.get()
    return [{"id": d.id, **d.to_dict()} for d in docs]


# ─── Machine Operations ───────────────────────────────────────────────────────

async def upsert_machine(machine_data: dict) -> dict:
    db = get_db()
    machine_id = machine_data["machine_id"]
    doc = {
        **machine_data,
        "last_updated": firestore.SERVER_TIMESTAMP,
    }
    await db.collection(MACHINES).document(machine_id).set(doc, merge=True)
    return doc


async def get_all_machines() -> List[dict]:
    db = get_db()
    docs = await db.collection(MACHINES).get()
    return [{"id": d.id, **d.to_dict()} for d in docs]


async def get_machine(machine_id: str) -> Optional[dict]:
    db = get_db()
    doc = await db.collection(MACHINES).document(machine_id).get()
    if doc.exists:
        return {"id": doc.id, **doc.to_dict()}
    return None


# ─── Alert Operations ─────────────────────────────────────────────────────────

async def create_alert(alert_data: dict) -> dict:
    db = get_db()
    alert_id = f"ALT-{str(uuid.uuid4())[:10].upper()}"
    doc = {
        **alert_data,
        "id": alert_id,
        "triggered_at": firestore.SERVER_TIMESTAMP,
        "acknowledged": False,
        "acknowledged_by": None,
        "acknowledged_at": None,
    }
    await db.collection(ALERTS).document(alert_id).set(doc)
    logger.warning("alert_created", alert_id=alert_id, severity=alert_data.get("severity"))
    return {**doc, "id": alert_id}


async def get_active_alerts(limit: int = 20) -> List[dict]:
    db = get_db()
    query = (db.collection(ALERTS)
               .where("acknowledged", "==", False)
               .order_by("triggered_at", direction=firestore.Query.DESCENDING)
               .limit(limit))
    docs = await query.get()
    return [{"id": d.id, **d.to_dict()} for d in docs]


async def acknowledge_alert(alert_id: str, user_id: str) -> bool:
    db = get_db()
    await db.collection(ALERTS).document(alert_id).update({
        "acknowledged": True,
        "acknowledged_by": user_id,
        "acknowledged_at": firestore.SERVER_TIMESTAMP,
    })
    return True


# ─── Handover Report Operations ───────────────────────────────────────────────

async def save_handover_report(report_data: dict) -> dict:
    db = get_db()
    report_id = f"HDR-{str(uuid.uuid4())[:10].upper()}"
    doc = {
        **report_data,
        "id": report_id,
        "generated_at": firestore.SERVER_TIMESTAMP,
        "generated_by_ai": True,
    }
    await db.collection(HANDOVER_REPORTS).document(report_id).set(doc)
    logger.info("handover_report_saved", report_id=report_id)
    return {**doc, "id": report_id}


async def get_handover_reports(shift_id: str) -> List[dict]:
    db = get_db()
    query = (db.collection(HANDOVER_REPORTS)
               .where("shift_id", "==", shift_id)
               .order_by("generated_at", direction=firestore.Query.DESCENDING))
    docs = await query.get()
    return [{"id": d.id, **d.to_dict()} for d in docs]


async def get_latest_handover_for_line(line: str) -> Optional[dict]:
    db = get_db()
    query = (db.collection(HANDOVER_REPORTS)
               .where("line", "==", line)
               .order_by("generated_at", direction=firestore.Query.DESCENDING)
               .limit(1))
    docs = await query.get()
    if docs:
        d = docs[0]
        return {"id": d.id, **d.to_dict()}
    return None


# ─── User Operations ──────────────────────────────────────────────────────────

async def get_user_by_username(username: str) -> Optional[dict]:
    db = get_db()
    query = db.collection(USERS).where("username", "==", username).limit(1)
    docs = await query.get()
    if docs:
        d = docs[0]
        return {"id": d.id, **d.to_dict()}
    return None


async def create_user(user_data: dict) -> dict:
    db = get_db()
    user_id = str(uuid.uuid4())
    doc = {
        **user_data,
        "id": user_id,
        "created_at": firestore.SERVER_TIMESTAMP,
        "is_active": True,
    }
    await db.collection(USERS).document(user_id).set(doc)
    return doc


async def get_dashboard_stats() -> dict:
    """Aggregate stats for the dashboard."""
    db = get_db()

    # Machine counts
    machines = await get_all_machines()
    running = sum(1 for m in machines if m.get("status") == "running")
    fault = sum(1 for m in machines if m.get("status") == "fault")
    maintenance = sum(1 for m in machines if m.get("status") == "maintenance")

    # OEE average
    oee_values = [m.get("oee", 0) for m in machines if m.get("oee") is not None]
    oee_avg = sum(oee_values) / len(oee_values) if oee_values else 0.0

    # Active alerts
    alerts = await get_active_alerts(limit=50)
    critical_alerts = [a for a in alerts if a.get("severity") == "critical"]

    # Active shift
    active_shifts = await get_active_shifts()
    active_shift = active_shifts[0] if active_shifts else None

    return {
        "machines_total": len(machines),
        "machines_running": running,
        "machines_fault": fault,
        "machines_maintenance": maintenance,
        "open_alerts": len(alerts),
        "critical_alerts": len(critical_alerts),
        "oee_average": round(oee_avg, 1),
        "active_shift": active_shift,
        "recent_alerts": alerts[:5],
    }
