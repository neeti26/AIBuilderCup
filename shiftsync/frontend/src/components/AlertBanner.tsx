import { useEffect, useCallback } from 'react';
import { AlertTriangle, X, BellRing } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { aiApi } from '../services/api';
import { useShiftStore } from '../store/shiftStore';
import { Alert } from '../types';
import clsx from 'clsx';

export default function AlertBanner() {
  const { alerts, setAlerts, addAlert, acknowledgeAlert } = useShiftStore();

  const { data } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => aiApi.getAlerts().then(r => r.data),
    refetchInterval: 30000, // Poll every 30 seconds as fallback
  });

  // Sync REST alerts to Zustand store
  useEffect(() => {
    if (data?.alerts) setAlerts(data.alerts);
  }, [data, setAlerts]);

  // Listen for real-time WebSocket alerts
  const handleWebSocketAlert = useCallback(
    (event: CustomEvent) => {
      const alert = event.detail as Alert & { alert_id?: string };
      if (alert) {
        addAlert(alert as any);
        // Also acknowledge via REST API in background
        aiApi.acknowledgeAlert(alert.alert_id || alert.id).catch(() => {});
      }
    },
    [addAlert]
  );

  useEffect(() => {
    window.addEventListener('shiftSyncAlert', handleWebSocketAlert as any);
    return () => {
      window.removeEventListener('shiftSyncAlert', handleWebSocketAlert as any);
    };
  }, [handleWebSocketAlert]);

  const criticalAlerts = alerts.filter(a => !a.acknowledged && a.severity === 'critical');
  const highAlerts = alerts.filter(a => !a.acknowledged && a.severity === 'high');

  if (criticalAlerts.length === 0 && highAlerts.length === 0) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className={clsx(
        'border-b px-6 py-3 transition-all duration-300',
        criticalAlerts.length > 0
          ? 'bg-red-950/80 border-red-600/50'
          : 'bg-amber-950/80 border-amber-600/50'
      )}
    >
      <div className="flex items-start gap-3">
        <BellRing
          className={clsx(
            'w-4 h-4 mt-0.5 animate-pulse flex-shrink-0',
            criticalAlerts.length > 0 ? 'text-red-400' : 'text-amber-400'
          )}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={clsx('text-xs font-semibold uppercase tracking-wide', criticalAlerts.length > 0 ? 'text-red-400' : 'text-amber-400')}>
              {criticalAlerts.length} Critical · {highAlerts.length} High
            </span>
            {criticalAlerts.length > 0 && (
              <span className="text-xs bg-red-600/30 text-red-200 px-2 py-0.5 rounded">
                AI DETECTED
              </span>
            )}
          </div>
          <div className="space-y-1">
            {[...criticalAlerts.slice(0, 2), ...highAlerts.slice(0, 2)].map((alert: Alert & { alert_id?: string }) => (
              <div key={alert.alert_id || alert.id} className="flex items-center justify-between gap-4">
                <p className="text-xs truncate">
                  <span className="font-medium">{alert.machine_name}:</span> {alert.message}
                  {alert.ai_diagnosis && (
                    <span className="text-[10px] ml-1 opacity-80">(AI: {alert.ai_diagnosis})</span>
                  )}
                </p>
                <button
                  onClick={() => acknowledgeAlert(alert.alert_id || alert.id)}
                  className={clsx(
                    'text-xs transition-colors flex-shrink-0 focus:outline-none focus:ring-1 rounded',
                    criticalAlerts.length > 0
                      ? 'text-red-400 hover:text-red-200 focus:ring-red-400'
                      : 'text-amber-400 hover:text-amber-200 focus:ring-amber-400'
                  )}
                  aria-label={`Acknowledge alert for ${alert.machine_name}`}
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
