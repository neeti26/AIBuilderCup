"""
Real-time WebSocket manager for ShiftSync AI.
Handles live machine telemetry streaming, alert broadcasting, and shift updates.
"""
import asyncio
import json
import structlog
from typing import Dict, List, Set
from fastapi import WebSocket, WebSocketDisconnect

logger = structlog.get_logger()


class ConnectionManager:
    """Manages WebSocket connections for real-time updates."""

    def __init__(self):
        # Active WebSocket connections by client ID
        self.active_connections: Dict[str, WebSocket] = {}
        # Clients subscribed to specific topics
        self.topic_subscribers: Dict[str, Set[str]] = {
            "machine_telemetry": set(),
            "alerts": set(),
            "shift_updates": set(),
            "logs": set(),
        }

    async def connect(self, websocket: WebSocket, client_id: str):
        """Accept a new WebSocket connection."""
        await websocket.accept()
        self.active_connections[client_id] = websocket
        logger.info("websocket_connected", client_id=client_id, total=len(self.active_connections))

    def disconnect(self, client_id: str):
        """Remove a WebSocket connection."""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        # Remove from all topic subscriptions
        for topic, subscribers in self.topic_subscribers.items():
            subscribers.discard(client_id)
        logger.info("websocket_disconnected", client_id=client_id, total=len(self.active_connections))

    def subscribe(self, client_id: str, topic: str):
        """Subscribe a client to a topic."""
        if topic in self.topic_subscribers:
            self.topic_subscribers[topic].add(client_id)

    def unsubscribe(self, client_id: str, topic: str):
        """Unsubscribe a client from a topic."""
        if topic in self.topic_subscribers:
            self.topic_subscribers[topic].discard(client_id)

    async def send_personal_message(self, message: dict, client_id: str):
        """Send a message to a specific client."""
        if client_id in self.active_connections:
            try:
                await self.active_connections[client_id].send_json(message)
            except Exception as e:
                logger.error("websocket_send_failed", client_id=client_id, error=str(e)[:200])
                self.disconnect(client_id)

    async def broadcast_to_topic(self, message: dict, topic: str):
        """Broadcast a message to all subscribers of a topic."""
        if topic not in self.topic_subscribers:
            return
        dead_clients: List[str] = []
        for client_id in self.topic_subscribers[topic]:
            if client_id in self.active_connections:
                try:
                    await self.active_connections[client_id].send_json(message)
                except Exception as e:
                    logger.error("websocket_broadcast_failed", client_id=client_id, error=str(e)[:200])
                    dead_clients.append(client_id)
        for client_id in dead_clients:
            self.disconnect(client_id)

    async def broadcast(self, message: dict):
        """Broadcast a message to all connected clients."""
        dead_clients: List[str] = []
        for client_id, websocket in self.active_connections.items():
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.error("websocket_broadcast_failed", client_id=client_id, error=str(e)[:200])
                dead_clients.append(client_id)
        for client_id in dead_clients:
            self.disconnect(client_id)

    @property
    def connection_count(self) -> int:
        return len(self.active_connections)


# Global connection manager instance
manager = ConnectionManager()
