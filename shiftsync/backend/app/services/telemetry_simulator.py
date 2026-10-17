"""
Machine Telemetry Simulator — generates realistic live machine data
and triggers AI-powered anomaly detection via WebSocket broadcasts.
"""
import asyncio
import random
import structlog
from datetime import datetime
from typing import Dict, List, Optional

from app.services import websocket_manager, firestore_service, gemini_service

logger = structlog.get_logger()

# Machine configurations with realistic baselines
MACHINE_BASELINES = {
    "CNC-A01": {"temp": 42.0, "vib": 0.8, "press": 6.2, "oee": 87.3, "status": "running"},
    "CNC-A02": {"temp": 45.0, "vib": 1.0, "press": 5.8, "oee": 0.0, "status": "fault"},
    "ROBOT-A01": {"temp": 35.0, "vib": 1.1, "press": None, "oee": 94.1, "status": "running"},
    "INSP-A01": {"temp": 28.0, "vib": 0.3, "press": None, "oee": 91.5, "status": "running"},
    "DRILL-B01": {"temp": 38.5, "vib": 1.9, "press": 8.5, "oee": 76.8, "status": "running"},
    "RIVET-B01": {"temp": 22.0, "vib": 0.0, "press": 0.0, "oee": 0.0, "status": "maintenance"},
    "WELD-B01": {"temp": 145.0, "vib": 0.6, "press": 12.1, "oee": 83.2, "status": "running"},
    "SMT-C01": {"temp": 31.4, "vib": 0.4, "press": None, "oee": 92.7, "status": "running"},
    "XRAY-C01": {"temp": 29.1, "vib": 0.2, "press": None, "oee": 88.9, "status": "running"},
    "TEST-C01": {"temp": 24.0, "vib": 0.1, "press": None, "oee": 45.2, "status": "idle"},
}


class TelemetrySimulator:
    """
    Simulates real-time machine telemetry and broadcasts updates via WebSocket.
    Runs anomaly detection on each reading and broadcasts alerts.
    """

    def __init__(self):
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._interval = 5.0  # seconds between telemetry updates
        self._anomaly_chance = 0.15  # 15% chance of anomaly per update
        self._machine_data: Dict[str, dict] = {}

    async def start(self):
        """Start the telemetry simulation loop."""
        if self._running:
            return
        self._running = True
        # Initialize machine data from baselines
        for machine_id, baseline in MACHINE_BASELINES.items():
            self._machine_data[machine_id] = dict(baseline)
        self._task = asyncio.create_task(self._simulation_loop())
        logger.info("telemetry_simulator_started", machines=len(self._machine_data))

    async def stop(self):
        """Stop the telemetry simulation."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("telemetry_simulator_stopped")

    async def _simulation_loop(self):
        """Main simulation loop — generates telemetry and detects anomalies."""
        while self._running:
            try:
                await self._generate_telemetry_batch()
                await asyncio.sleep(self._interval)
            except asyncio.CancelledError:
                break
            except Exception as exc:
                logger.error("telemetry_loop_error", error=str(exc)[:200])
                await asyncio.sleep(self._interval)

    async def _generate_telemetry_batch(self):
        """Generate telemetry readings for all machines and detect anomalies."""
        now = datetime.utcnow().isoformat() + "Z"
        telemetry_updates = []
        anomalies = []

        for machine_id, baseline in self._machine_data.items():
            # Simulate realistic sensor drift
            temp_variance = random.uniform(-2.0, 2.0)
            vib_variance = random.uniform(-0.3, 0.3)
            press_variance = random.uniform(-0.5, 0.5) if baseline.get("press") else None
            oee_variance = random.uniform(-3.0, 3.0)

            # Inject anomalies occasionally
            is_anomaly = random.random() < self._anomaly_chance
            if is_anomaly:
                anomaly_type = random.choice(["temperature_spike", "vibration_spike", "pressure_drop", "oee_decline"])
                if anomaly_type == "temperature_spike":
                    temp_variance += random.uniform(15.0, 35.0)
                elif anomaly_type == "vibration_spike":
                    vib_variance += random.uniform(2.0, 5.0)
                elif anomaly_type == "pressure_drop" and baseline.get("press"):
                    press_variance -= random.uniform(3.0, 6.0)
                elif anomaly_type == "oee_decline":
                    oee_variance -= random.uniform(20.0, 40.0)

            # Update machine state
            new_temp = round(baseline["temp"] + temp_variance, 1)
            new_vib = round(max(0, baseline["vib"] + vib_variance), 1)
            new_press = round(max(0, baseline["press"] + press_variance), 1) if baseline.get("press") is not None else None
            new_oee = round(max(0, min(100, baseline["oee"] + oee_variance)), 1)

            # Determine status based on readings
            status = baseline["status"]
            if new_temp > 80 or new_vib > 3.0 or (new_press is not None and new_press < 1.0):
                status = "fault"
            elif new_oee < 30:
                status = "idle"
            elif new_vib > 1.5:
                status = "maintenance"

            # Update stored data
            self._machine_data[machine_id] = {
                "machine_id": machine_id,
                "name": MACHINE_BASELINES[machine_id].get("name", machine_id),
                "line": MACHINE_BASELINES[machine_id].get("line", "Unknown"),
                "status": status,
                "oee": new_oee,
                "temperature": new_temp,
                "vibration": new_vib,
                "pressure": new_press,
                "last_updated": now,
                "active_alerts": 0,
            }

            telemetry_updates.append(self._machine_data[machine_id])

            # Detect anomaly and create alert
            if is_anomaly:
                anomaly = await self._detect_anomaly(machine_id, self._machine_data[machine_id], anomaly_type)
                if anomaly:
                    anomalies.append(anomaly)
                    self._machine_data[machine_id]["active_alerts"] = (
                        self._machine_data[machine_id].get("active_alerts", 0) + 1
                    )

        # Broadcast telemetry updates
        if telemetry_updates:
            await websocket_manager.broadcast_to_topic(
                {
                    "type": "telemetry_update",
                    "timestamp": now,
                    "machines": telemetry_updates,
                },
                "machine_telemetry",
            )

        # Broadcast anomalies as alerts
        for anomaly in anomalies:
            await websocket_manager.broadcast_to_topic(
                {
                    "type": "anomaly_alert",
                    "timestamp": now,
                    "alert": anomaly,
                },
                "alerts",
            )
            # Also persist to Firestore
            try:
                await firestore_service.create_alert(anomaly)
            except Exception as exc:
                logger.error("alert_persist_failed", error=str(exc)[:200])

    async def _detect_anomaly(self, machine_id: str, machine_data: dict, anomaly_type: str) -> Optional[dict]:
        """Use Gemini AI to diagnose an anomaly and generate recommendations."""
        try:
            # Prepare data for Gemini anomaly detection
            telemetry_sample = [machine_data]
            anomalies = await gemini_service.detect_anomalies(telemetry_sample)

            if anomalies and len(anomalies) > 0:
                ai_anomaly = anomalies[0]
                alert = {
                    "alert_id": f"ALT-{machine_id}-{int(datetime.utcnow().timestamp())}",
                    "machine_id": machine_id,
                    "machine_name": machine_data.get("name", machine_id),
                    "alert_type": ai_anomaly.get("alert_type", anomaly_type),
                    "severity": ai_anomaly.get("severity", "high"),
                    "message": ai_anomaly.get("message", f"Anomaly detected on {machine_id}"),
                    "ai_diagnosis": ai_anomaly.get("ai_diagnosis", "AI analysis in progress"),
                    "recommended_action": ai_anomaly.get("recommended_action", "Inspect machine immediately"),
                    "confidence": ai_anomaly.get("confidence", 0.85),
                    "triggered_at": datetime.utcnow().isoformat() + "Z",
                    "acknowledged": False,
                    "source": "telemetry_simulator",
                }
                return alert
        except Exception as exc:
            logger.error("anomaly_detection_failed", machine_id=machine_id, error=str(exc)[:200])

        # Fallback alert without AI diagnosis
        return {
            "alert_id": f"ALT-{machine_id}-{int(datetime.utcnow().timestamp())}",
            "machine_id": machine_id,
            "machine_name": machine_data.get("name", machine_id),
            "alert_type": anomaly_type,
            "severity": "high",
            "message": f"Anomaly detected on {machine_id} — {anomaly_type.replace('_', ' ').title()}",
            "ai_diagnosis": "AI diagnosis pending",
            "recommended_action": "Inspect machine immediately and check sensor readings",
            "confidence": 0.75,
            "triggered_at": datetime.utcnow().isoformat() + "Z",
            "acknowledged": False,
            "source": "telemetry_simulator",
        }

    def get_machine_data(self) -> Dict[str, dict]:
        """Get current machine data snapshot."""
        return dict(self._machine_data)

    def get_machine(self, machine_id: str) -> Optional[dict]:
        """Get data for a specific machine."""
        return self._machine_data.get(machine_id)

    @property
    def is_running(self) -> bool:
        return self._running


# Global simulator instance
telemetry_simulator = TelemetrySimulator()
