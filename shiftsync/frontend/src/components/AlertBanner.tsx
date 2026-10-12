import { useEffect } from 'react';
import { AlertTriangle, X, BellRing } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { aiApi } from '../services/api';
import { useShiftStore } from '../store/shiftStore';
import { Alert } from '../types';
import clsx from 'clsx';

export default function AlertBanner() {
  const { alerts, setAlerts, acknowledgeAlert } = useShiftStore();

  const { data } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => aiApi.getAlerts().then(r => r.data),
    refetchInterval: 30000, // Poll every 30 seconds
  });

  useEffect(() => {
    if (data?.alerts) setAlerts(data.alerts);
  }, [data, setAlerts]);

  const criticalAlerts = alerts.filter(a => !a.acknowledged && a.severity === 'critical');

  if (criticalAlerts.length === 0) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      className="bg-red-950/80 border-b border-red-600/50 px-6 py-3"
    >
      <div className="flex items-start gap-3">
        <BellRing className="w-4 h-4 text-red-400 mt-0.5 animate-pulse flex-shrink-0" aria-hidden="true" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-red-400 text-xs font-semibold uppercase tracking-wide">
              {criticalAlerts.length} Critical Alert{criticalAlerts.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="space-y-1">
            {criticalAlerts.slice(0, 2).map((alert) => (
              <div key={alert.id} className="flex items-center justify-between gap-4">
                <p className="text-red-200 text-xs truncate">
                  <span className="font-medium">{alert.machine_name}:</span> {alert.message}
                </p>
                <button
                  onClick={() => acknowledgeAlert(alert.id)}
                  className="text-red-400 hover:text-red-200 transition-colors flex-shrink-0 focus:outline-none focus:ring-1 focus:ring-red-400 rounded"
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
