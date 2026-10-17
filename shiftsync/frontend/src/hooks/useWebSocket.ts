/**
 * WebSocket service for real-time ShiftSync updates.
 * Connects to the backend WebSocket endpoint for live telemetry, alerts, and shift data.
 */
import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8080/ws/telemetry';

interface TelemetryUpdate {
  type: string;
  timestamp: string;
  machines: Array<{
    machine_id: string;
    name: string;
    line: string;
    status: string;
    oee: number;
    temperature: number;
    vibration: number;
    pressure: number | null;
    last_updated: string;
    active_alerts: number;
  }>;
}

interface AnomalyAlert {
  type: string;
  timestamp: string;
  alert: {
    alert_id: string;
    machine_id: string;
    machine_name: string;
    alert_type: string;
    severity: string;
    message: string;
    ai_diagnosis: string;
    recommended_action: string;
    confidence: number;
    triggered_at: string;
  };
}

interface ConnectedMessage {
  type: string;
  client_id: string;
  message: string;
  timestamp: string;
}

interface MachineState {
  [machineId: string]: {
    machine_id: string;
    name: string;
    line: string;
    status: string;
    oee: number;
    temperature: number;
    vibration: number;
    pressure: number | null;
    last_updated: string;
    active_alerts: number;
  };
}

interface UseWebSocketReturn {
  isConnected: boolean;
  machines: MachineState;
  recentAlerts: AnomalyAlert['alert'][];
  lastConnected: string | null;
  error: string | null;
  sendMessage: (message: object) => void;
  acknowledgeAlert: (alertId: string) => void;
}

/**
 * useWebSocket — hook for real-time WebSocket connection.
 * Provides live machine telemetry and anomaly alerts.
 */
export function useWebSocket(): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);
  const [machines, setMachines] = useState<MachineState>({});
  const [recentAlerts, setRecentAlerts] = useState<AnomalyAlert['alert'][]>([]);
  const [lastConnected, setLastConnected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const clientIdRef = useRef<string>(`client_${Date.now()}_${Math.random().toString(36).slice(2)}`);

  const connect = useCallback(() => {
    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
        setLastConnected(new Date().toISOString());
        console.log('[ShiftSync WS] Connected:', clientIdRef.current);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          switch (data.type) {
            case 'connected':
              console.log('[ShiftSync WS]', data.message);
              break;

            case 'telemetry_update':
              if (data.machines) {
                const newState: MachineState = {};
                data.machines.forEach((m: any) => {
                  newState[m.machine_id] = m;
                });
                setMachines((prev) => ({ ...prev, ...newState }));
              }
              break;

            case 'initial_state':
              if (data.machines) {
                const initialState: MachineState = {};
                data.machines.forEach((m: any) => {
                  initialState[m.machine_id] = m;
                });
                setMachines(initialState);
              }
              break;

            case 'anomaly_alert':
              if (data.alert) {
                setRecentAlerts((prev) => [data.alert, ...prev].slice(0, 10));
                // Dispatch custom event for toast notification
                window.dispatchEvent(
                  new CustomEvent('shiftSyncAlert', { detail: data.alert })
                );
              }
              break;

            case 'alert_acknowledged':
              if (data.alert_id) {
                setRecentAlerts((prev) =>
                  prev.map((a) =>
                    a.alert_id === data.alert_id ? { ...a, acknowledged: true } : a
                  )
                );
              }
              break;

            case 'pong':
              // Heartbeat response
              break;

            case 'error':
              setError(data.message || 'WebSocket error');
              console.error('[ShiftSync WS] Error:', data.message);
              break;

            default:
              console.log('[ShiftSync WS] Unknown message:', data.type);
          }
        } catch (err) {
          console.error('[ShiftSync WS] Parse error:', err);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        console.log('[ShiftSync WS] Disconnected');
        // Auto-reconnect after 3 seconds
        setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        setError('WebSocket connection error');
        console.error('[ShiftSync WS] Connection error:', err);
      };
    } catch (err) {
      setError('Failed to create WebSocket connection');
      console.error('[ShiftSync WS] Creation error:', err);
    }
  }, []);

  const sendMessage = useCallback(
    (message: object) => {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify(message));
      }
    },
    []
  );

  const acknowledgeAlert = useCallback(
    (alertId: string) => {
      sendMessage({ type: 'acknowledge_alert', alert_id: alertId });
    },
    [sendMessage]
  );

  useEffect(() => {
    connect();
    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [connect]);

  return {
    isConnected,
    machines,
    recentAlerts,
    lastConnected,
    error,
    sendMessage,
    acknowledgeAlert,
  };
}
