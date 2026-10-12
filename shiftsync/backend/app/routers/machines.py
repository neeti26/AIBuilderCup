"""Machine management and telemetry endpoints."""
from fastapi import APIRouter, HTTPException, status, Depends
from typing import List, Optional

from app.models.schemas import MachineUpdate
from app.services import firestore_service, auth_service, gemini_service

router = APIRouter(prefix="/machines", tags=["Machines"])


@router.get("/")
async def get_all_machines(
    current_user: dict = Depends(auth_service.get_current_user)
):
    """Get status of all machines/assets."""
    machines = await firestore_service.get_all_machines()
    return {"machines": machines, "count": len(machines)}


@router.get("/{machine_id}")
async def get_machine(
    machine_id: str,
    current_user: dict = Depends(auth_service.get_current_user)
):
    """Get detailed status for a specific machine."""
    machine = await firestore_service.get_machine(machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail=f"Machine {machine_id} not found")
    return machine


@router.post("/status")
async def update_machine_status(
    update: MachineUpdate,
    current_user: dict = Depends(auth_service.get_current_user)
):
    """Update machine status and telemetry readings."""
    # Get existing machine data for comparison
    existing = await firestore_service.get_machine(update.machine_id)

    machine_doc = {
        "machine_id": update.machine_id,
        "status": update.status,
        "notes": update.notes,
        "oee": update.oee,
        "temperature": update.temperature,
        "vibration": update.vibration,
        "pressure": update.pressure,
        "updated_by": current_user.get("id"),
    }

    result = await firestore_service.upsert_machine(machine_doc)

    # Check for anomalies if telemetry data provided
    anomalies = []
    if any([update.temperature, update.vibration, update.pressure, update.oee]):
        machines_for_analysis = [machine_doc]
        if existing:
            machines_for_analysis[0]["previous_oee"] = existing.get("oee")
            machines_for_analysis[0]["name"] = existing.get("name", update.machine_id)

        anomalies = await gemini_service.detect_anomalies(machines_for_analysis)

        # Create alerts for detected anomalies
        for anomaly in anomalies:
            if anomaly.get("confidence", 0) >= 0.7:  # Only high-confidence anomalies
                alert_doc = {
                    "machine_id": update.machine_id,
                    "machine_name": existing.get("name", update.machine_id) if existing else update.machine_id,
                    "alert_type": anomaly.get("alert_type", "telemetry_anomaly"),
                    "severity": anomaly.get("severity", "medium"),
                    "message": anomaly.get("message", "Anomaly detected"),
                    "ai_diagnosis": anomaly.get("ai_diagnosis"),
                    "recommended_action": anomaly.get("recommended_action"),
                }
                await firestore_service.create_alert(alert_doc)

    return {
        "machine": result,
        "anomalies_detected": len(anomalies),
        "anomalies": anomalies,
    }


@router.get("/{machine_id}/maintenance-recommendation")
async def get_maintenance_recommendation(
    machine_id: str,
    current_user: dict = Depends(auth_service.get_current_user)
):
    """Get AI-powered predictive maintenance recommendation for a machine."""
    machine = await firestore_service.get_machine(machine_id)
    if not machine:
        raise HTTPException(status_code=404, detail=f"Machine {machine_id} not found")

    # Get recent alerts for this machine
    all_alerts = await firestore_service.get_active_alerts(limit=100)
    machine_alerts = [a for a in all_alerts if a.get("machine_id") == machine_id]

    recommendation = await gemini_service.generate_maintenance_recommendation(
        machine_id=machine_id,
        machine_name=machine.get("name", machine_id),
        maintenance_history=[],  # Would come from CMMS integration
        current_status=machine,
        recent_alerts=machine_alerts
    )

    return {
        "machine_id": machine_id,
        "machine_name": machine.get("name", machine_id),
        "recommendation": recommendation,
    }


@router.post("/bulk-status")
async def bulk_update_machine_status(
    updates: List[MachineUpdate],
    current_user: dict = Depends(auth_service.get_current_user)
):
    """Bulk update multiple machines — useful for SCADA/OPC-UA integration."""
    results = []
    for update in updates:
        machine_doc = {
            "machine_id": update.machine_id,
            "status": update.status,
            "oee": update.oee,
            "temperature": update.temperature,
            "vibration": update.vibration,
            "pressure": update.pressure,
            "updated_by": current_user.get("id"),
        }
        result = await firestore_service.upsert_machine(machine_doc)
        results.append(result)

    # Run batch anomaly detection
    machines_data = [u.model_dump() for u in updates]
    anomalies = await gemini_service.detect_anomalies(machines_data)

    return {
        "updated": len(results),
        "anomalies_detected": len(anomalies),
        "anomalies": anomalies,
    }
