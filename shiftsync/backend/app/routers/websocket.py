"""
WebSocket endpoints for real-time ShiftSync AI updates.
Provides live machine telemetry, alerts, and shift data streaming.
"""
import uuid
import structlog
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query
from typing import Optional

from app.services.telemetry_simulator import telemetry_simulator
from app.services.websocket_manager import manager
from app.services.auth_service import get_current_user
from app.config import settings

logger = structlog.get_logger()

router = APIRouter(prefix="/ws", tags=["Real-time WebSocket"])


@router.websocket("/telemetry")
async def websocket_telemetry(
    websocket: WebSocket,
    client_id: Optional[str] = Query(None),
    subscribe_alerts: bool = Query(True),
    subscribe_shifts: bool = Query(True),
):
    """
    WebSocket endpoint for real-time machine telemetry and alerts.

    Query params:
    - client_id: Unique client identifier (auto-generated if not provided)
    - subscribe_alerts: Receive anomaly alerts
    - subscribe_shifts: Receive shift status updates
    """
    cid = client_id or str(uuid.uuid4())
    await manager.connect(websocket, cid)
    manager.subscribe(cid, "machine_telemetry")
    if subscribe_alerts:
        manager.subscribe(cid, "alerts")
    if subscribe_shifts:
        manager.subscribe(cid, "shift_updates")

    # Send initial connection confirmation
    await manager.send_personal_message(
        {
            "type": "connected",
            "client_id": cid,
            "message": "Connected to ShiftSync real-time feed",
            "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
        },
        cid,
    )

    # Send current machine state
    current_data = telemetry_simulator.get_machine_data()
    if current_data:
        await manager.send_personal_message(
            {
                "type": "initial_state",
                "machines": list(current_data.values()),
                "timestamp": __import__("datetime").datetime.utcnow().isoformat() + "Z",
            },
            cid,
        )

    try:
        while True:
            # Keep connection alive and handle incoming messages
            data = await websocket.receive_text()
            try:
                import json
                msg = json.loads(data)
                msg_type = msg.get("type", "")

                if msg_type == "subscribe":
                    topic = msg.get("topic")
                    if topic:
                        manager.subscribe(cid, topic)
                        await manager.send_personal_message(
                            {"type": "subscribed", "topic": topic}, cid
                        )
                elif msg_type == "unsubscribe":
                    topic = msg.get("topic")
                    if topic:
                        manager.unsubscribe(cid, topic)
                        await manager.send_personal_message(
                            {"type": "unsubscribed", "topic": topic}, cid
                        )
                elif msg_type == "ping":
                    await manager.send_personal_message(
                        {"type": "pong", "timestamp": msg.get("timestamp")}, cid
                    )
                elif msg_type == "acknowledge_alert":
                    alert_id = msg.get("alert_id")
                    if alert_id:
                        from app.services import firestore_service
                        await firestore_service.acknowledge_alert(alert_id, cid)
                        await manager.send_personal_message(
                            {"type": "alert_acknowledged", "alert_id": alert_id}, cid
                        )
            except json.JSONDecodeError:
                await manager.send_personal_message(
                    {"type": "error", "message": "Invalid JSON"}, cid
                )
            except Exception as exc:
                logger.error("websocket_message_error", error=str(exc)[:200])
                await manager.send_personal_message(
                    {"type": "error", "message": "Message processing error"}, cid
                )

    except WebSocketDisconnect:
        manager.disconnect(cid)
    except Exception as exc:
        logger.error("websocket_error", client_id=cid, error=str(exc)[:200])
        manager.disconnect(cid)


@router.get("/status")
async def websocket_status():
    """Get WebSocket connection status."""
    return {
        "active_connections": manager.connection_count,
        "telemetry_simulator_running": telemetry_simulator.is_running,
        "topics": list(manager.topic_subscribers.keys()),
    }
