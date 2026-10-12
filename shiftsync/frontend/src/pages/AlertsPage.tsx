import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle, Clock, Cpu, Sparkles, Filter } from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { aiApi } from '../services/api';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { Alert, Severity } from '../types';
import clsx from 'clsx';
import { useState } from 'react';

export default function AlertsPage() {
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState<Severity | 'all'>('all');

  const { data, isLoading } = useQuery({
    queryKey: ['alerts-page'],
    queryFn: () => aiApi.getAlerts().then(r => r.data),
    refetchInterval: 30000,
  });

  const ackMutation = useMutation({
    mutationFn: (alertId: string) => aiApi.acknowledgeAlert(alertId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts-page'] });
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast.success('Alert acknowledged');
    },
  });

  const alerts: Alert[] = data?.alerts || [];
  const filtered = filter === 'all' ? alerts : alerts.filter(a => a.severity === filter);

  const counts = {
    critical: alerts.filter(a => a.severity === 'critical').length,
    high: alerts.filter(a => a.severity === 'high').length,
    medium: alerts.filter(a => a.severity === 'medium').length,
    low: alerts.filter(a => a.severity === 'low').length,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Active Alerts</h1>
          <p className="text-slate-400 text-sm">AI-diagnosed machine and operations alerts</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span>{alerts.length} total unacknowledged</span>
        </div>
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 flex-wrap" role="group" aria-label="Filter alerts by severity">
        {(['all', 'critical', 'high', 'medium', 'low'] as const).map(sev => (
          <button
            key={sev}
            onClick={() => setFilter(sev)}
            className={clsx(
              'px-3 py-1.5 rounded-full text-xs font-medium transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500',
              filter === sev
                ? 'bg-blue-600 text-white'
                : 'bg-slate-700 text-slate-400 hover:bg-slate-600'
            )}
            aria-pressed={filter === sev}
          >
            {sev === 'all' ? `All (${alerts.length})` :
              `${sev.charAt(0).toUpperCase() + sev.slice(1)} (${counts[sev as keyof typeof counts]})`}
          </button>
        ))}
      </div>

      {/* Alerts List */}
      <div className="space-y-3" role="list" aria-label="Alerts list">
        {isLoading ? (
          <div className="text-center py-12 text-slate-400" role="status">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 animate-pulse" aria-hidden="true" />
            Loading alerts...
          </div>
        ) : filtered.length === 0 ? (
          <Card className="text-center py-16">
            <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" aria-hidden="true" />
            <p className="text-slate-300 font-medium">No active alerts</p>
            <p className="text-slate-500 text-sm">All systems nominal</p>
          </Card>
        ) : (
          filtered.map((alert) => (
            <Card
              key={alert.id}
              className={clsx(
                'border-l-4',
                alert.severity === 'critical' ? 'border-l-red-500' :
                alert.severity === 'high' ? 'border-l-orange-500' :
                alert.severity === 'medium' ? 'border-l-yellow-500' : 'border-l-green-500'
              )}
              role="listitem"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge severity={alert.severity as Severity} label={alert.severity.toUpperCase()} dot />
                    <span className="text-xs text-slate-500 flex items-center gap-1">
                      <Cpu className="w-3 h-3" aria-hidden="true" />
                      {alert.machine_name}
                    </span>
                    <span className="text-xs text-slate-600 bg-slate-700/50 px-1.5 py-0.5 rounded">
                      {alert.alert_type?.replace(/_/g, ' ')}
                    </span>
                  </div>
                  <p className="text-slate-200 text-sm font-medium mb-1">{alert.message}</p>

                  {alert.ai_diagnosis && (
                    <div className="bg-purple-950/20 border border-purple-600/20 rounded-lg p-2.5 mb-2">
                      <p className="text-xs text-purple-400 font-medium mb-0.5 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" aria-hidden="true" /> AI Diagnosis
                      </p>
                      <p className="text-slate-300 text-xs">{alert.ai_diagnosis}</p>
                    </div>
                  )}

                  {alert.recommended_action && (
                    <p className="text-blue-300 text-xs flex items-start gap-1">
                      <span className="text-blue-500 mt-0.5">→</span>
                      <span><span className="font-medium">Recommended:</span> {alert.recommended_action}</span>
                    </p>
                  )}

                  <div className="flex items-center gap-2 mt-2 text-xs text-slate-500">
                    <Clock className="w-3 h-3" aria-hidden="true" />
                    <time dateTime={alert.triggered_at}>
                      {format(new Date(alert.triggered_at), 'MMM d, HH:mm')}
                    </time>
                  </div>
                </div>

                <Button
                  variant="success"
                  size="sm"
                  onClick={() => ackMutation.mutate(alert.id)}
                  loading={ackMutation.isPending}
                  icon={<CheckCircle className="w-3.5 h-3.5" aria-hidden="true" />}
                  className="flex-shrink-0"
                  aria-label={`Acknowledge alert: ${alert.message}`}
                >
                  Acknowledge
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
