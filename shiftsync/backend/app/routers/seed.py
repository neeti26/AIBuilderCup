"""
Seed endpoint — populates demo data for the AI Builder Cup demo.
Creates realistic aerospace manufacturing scenario with 3 production lines,
10 machines, and demo user accounts.
"""
from fastapi import APIRouter, Depends
from datetime import datetime

from app.services import firestore_service, auth_service

router = APIRouter(prefix="/seed", tags=["Demo Data"])

DEMO_MACHINES = [
    # Assembly Line A — Wing Section
    {
        "machine_id": "CNC-A01", "name": "CNC Machining Center A1",
        "line": "Line-A", "status": "running", "oee": 87.3,
        "temperature": 42.1, "vibration": 0.8, "pressure": 6.2, "active_alerts": 0
    },
    {
        "machine_id": "CNC-A02", "name": "CNC Machining Center A2",
        "line": "Line-A", "status": "fault", "oee": 0.0,
        "temperature": 89.4, "vibration": 4.2, "pressure": 0.0, "active_alerts": 2
    },
    {
        "machine_id": "ROBOT-A01", "name": "Fanuc Assembly Robot A1",
        "line": "Line-A", "status": "running", "oee": 94.1,
        "temperature": 35.2, "vibration": 1.1, "pressure": None, "active_alerts": 0
    },
    {
        "machine_id": "INSP-A01", "name": "Automated Vision Inspection A1",
        "line": "Line-A", "status": "running", "oee": 91.5,
        "temperature": 28.0, "vibration": 0.3, "pressure": None, "active_alerts": 0
    },
    # Assembly Line B — Fuselage Section
    {
        "machine_id": "DRILL-B01", "name": "Automated Drill B1",
        "line": "Line-B", "status": "running", "oee": 76.8,
        "temperature": 38.5, "vibration": 1.9, "pressure": 8.5, "active_alerts": 1
    },
    {
        "machine_id": "RIVET-B01", "name": "Rivet Installation System B1",
        "line": "Line-B", "status": "maintenance", "oee": 0.0,
        "temperature": 22.0, "vibration": 0.0, "pressure": 0.0, "active_alerts": 0
    },
    {
        "machine_id": "WELD-B01", "name": "Laser Welding Station B1",
        "line": "Line-B", "status": "running", "oee": 83.2,
        "temperature": 145.6, "vibration": 0.6, "pressure": 12.1, "active_alerts": 0
    },
    # Assembly Line C — Avionics Bay
    {
        "machine_id": "SMT-C01", "name": "SMT Pick & Place C1",
        "line": "Line-C", "status": "running", "oee": 92.7,
        "temperature": 31.4, "vibration": 0.4, "pressure": None, "active_alerts": 0
    },
    {
        "machine_id": "XRAY-C01", "name": "X-Ray Inspection System C1",
        "line": "Line-C", "status": "running", "oee": 88.9,
        "temperature": 29.1, "vibration": 0.2, "pressure": None, "active_alerts": 0
    },
    {
        "machine_id": "TEST-C01", "name": "Functional Test Station C1",
        "line": "Line-C", "status": "idle", "oee": 45.2,
        "temperature": 24.0, "vibration": 0.1, "pressure": None, "active_alerts": 1
    },
]

DEMO_USERS = [
    {
        "username": "supervisor",
        "full_name": "Neeti Malu",
        "role": "supervisor",
        "department": "Production",
        "password": "spidey@01",
    },
    {
        "username": "staff",
        "full_name": "Mike Torres",
        "role": "operator",
        "department": "Line-A",
        "password": "webby001",
    },
    {
        "username": "engineer",
        "full_name": "Priya Nair",
        "role": "engineer",
        "department": "Process Engineering",
        "password": "webby001",
    },
    {
        "username": "manager",
        "full_name": "James Okafor",
        "role": "manager",
        "department": "Operations",
        "password": "webby001",
    },
]


@router.post("/demo-data")
async def seed_demo_data(
    current_user: dict = Depends(auth_service.get_current_user)
):
    """
    Populate the system with realistic aerospace manufacturing demo data.
    Seeds machines and demo user accounts.
    """
    results = {"machines_seeded": 0, "users_seeded": 0, "users_skipped": 0}

    # Seed machines
    for machine in DEMO_MACHINES:
        await firestore_service.upsert_machine(machine)
        results["machines_seeded"] += 1

    # Seed demo users (skip if already exist)
    for user_data in DEMO_USERS:
        existing = await firestore_service.get_user_by_username(user_data["username"])
        if existing:
            results["users_skipped"] += 1
            continue
        # Use a copy to avoid mutating the global DEMO_USERS list
        user_copy = {k: v for k, v in user_data.items()}
        password = user_copy.pop("password", "demo123")
        hashed = auth_service.hash_password(password)
        user_copy["hashed_password"] = hashed
        await firestore_service.create_user(user_copy)
        results["users_seeded"] += 1

    return {
        "message": "Demo data seeded successfully",
        "seeded": results,
        "demo_scenario": "Aerospace Wing, Fuselage & Avionics Assembly — 3 Production Lines",
        "demo_credentials": [
            {"username": "supervisor", "password": "spidey@01", "role": "supervisor"},
            {"username": "staff", "password": "webby001", "role": "operator"},
        ],
        "next_steps": [
            "1. Login with supervisor / demo123",
            "2. Go to Active Shift → Start Shift",
            "3. Submit some operator log entries",
            "4. Go to Handover → Generate Report",
            "5. Chat with the AI Assistant about your shift",
        ]
    }


@router.post("/init-users")
async def init_users_only():
    """
    Public endpoint (no auth required) to create initial demo users.
    Only works if NO users exist yet (first-time setup).
    Auto-seeds demo machines so data is ready on first login.
    """
    # Check if any user already exists
    supervisor = await firestore_service.get_user_by_username("supervisor")
    if supervisor:
        return {"message": "Users already initialized", "status": "skip"}

    # Seed machines first
    for machine in DEMO_MACHINES:
        await firestore_service.upsert_machine(machine)

    seeded = 0
    for user_data in DEMO_USERS:
        # Use a copy to avoid mutating the global DEMO_USERS list
        user_copy = {k: v for k, v in user_data.items()}
        password = user_copy.pop("password", "demo123")
        hashed = auth_service.hash_password(password)
        user_copy["hashed_password"] = hashed
        await firestore_service.create_user(user_copy)
        seeded += 1

    return {
        "message": f"Initialized {seeded} demo users and seeded {len(DEMO_MACHINES)} machines",
        "credentials": [
            {"username": "supervisor", "password": "spidey@01", "role": "supervisor"},
            {"username": "staff", "password": "webby001", "role": "operator"},
            {"username": "engineer", "password": "webby001", "role": "engineer"},
            {"username": "manager", "password": "webby001", "role": "manager"},
        ],
        "demo_scenario": "Aerospace Wing, Fuselage & Avionics Assembly — 3 Production Lines",
        "next_steps": [
            "1. Login with supervisor / spidey@01",
            "2. Go to Active Shift → Start Shift",
            "3. Submit some operator log entries",
            "4. Go to Handover → Generate Report",
            "5. Chat with the AI Assistant about your shift",
        ]
    }
