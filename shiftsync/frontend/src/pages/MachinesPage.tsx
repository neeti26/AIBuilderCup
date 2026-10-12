import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Cpu, AlertTriangle, CheckCircle, Sparkles } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { machinesApi } from '../services/api';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { Machine, MachineStatus, Severity } from '../types';

const STATUS_CONFIG: Record<MachineStatus, { label: string; color: string; dot: string }> = {
  running: { label: 'Running', color: 'text-green-400', dot: 'bg-green-500 animate-pulse' },
  idle: { label: 'Idle', color: 'text-slate-400', dot: 'bg-slate-500' },
  maintenance: { label: 'Maintenance', color: 'text-blue-400', dot: 'bg-blue-500' },
  fault: { label: 'Fault', color: 'text-red-400', dot: 'bg-red-500 animate-pulse' },
  offline: { label: 'Offline', color: 'text-slate-600', dot: 'bg-slate-700' },
};

function OEEBar({ oee }: { oee: number }) {
  const color =
    oee >= 85 ? 'bg-green-500' :
    oee >= 70 ? 'bg-yellow-500' :
    oee >= 50 ? 'bg-orange-500' : 'bg-red-500';
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1 bg-slate-700 rounded-full h-1.5"
        role="progressbar"
        aria-valuenow={oee}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`OEE: ${oee}%`}
      >
        <div
          className={clsx('h-1.5 rounded-full transition-all duration-700', color)}
          style={{ width: `${Math.min(100, oee)}%` }}
        />
      </div>
      <span className={clsx('text-xs font-medium w-12 text-right',
        oee >= 85 ? 'text-green-400' : oee >= 70 ? 'text-yellow-400' : 'text-red-400'
      )}>
        {oee.toFixed(1)}%
      </span>
    </div>
  );
}

function TelemetryMetric({ label, value, unit, warning }: {
  label: string; value?: number; unit: string; warning?: boolean;
}) {
  if (value == null) return null;
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-slate-500">{label}</span>
      <span className={clsx('font-medium', warning ? 'text-orange-400' : 'text-slate-300')}>
        {value.toFixed(1)} {unit}
      </span>
    </div>
  );
}

export default function MachinesPage() {
  const [selectedMachine, setSelectedMachine] = useState<string | null>(null);
  const [maintRec, setMaintRec] = useState<any>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['machines'],
    queryFn: () => machinesApi.getAll().then(r => r.data),
    refetchInterval: 30000,
  });

  const maintMutation = useMutation({
    mutationFn: (machineId: string) => machinesApi.getMaintenanceRec(machineId),
    onSuccess: (response) => {
      setMaintRec(response.data);
      toast.success('Maintenance recommendation generated');
    },
    onError: () => toast.error('Failed to get recommendation'),
  });

  const machines: Machine[] = data?.machines || [];
  const byStatus = {
    running: machines.filter(m => m.status === 'running').length,
    fault: machines.filter(m => m.status === 'fault').length,
    maintenance: machines.filter(m => m.status === 'maintenance').length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64" role="status">
        <div className="flex items-center gap-2 text-slate-400">
          <Cpu className="w-5 h-5 animate-pulse" aria-hidden="true" />
          <span>Loading machine data...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Machine Status</h1>
          <p className="text-slate-400 text-sm">Real-time telemetry with AI anomaly detection</p>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5 text-green-400">
            <span className="w-2 h-2 bg-green-500 rounded-full" aria-hidden="true" />
            {byStatus.running} Running
          </span>
          <span className="flex items-center gap-1.5 text-red-400">
            <span className="w-2 h-2 bg-red-500 rounded-full" aria-hidden="true" />
            {byStatus.fault} Fault
          </span>
          <span className="flex items-center gap-1.5 text-blue-400">
            <span className="w-2 h-2 bg-blue-500 rounded-full" aria-hidden="true" />
            {byStatus.maintenance} Maintenance
          </span>
        </div>
      </div>

      {/* Machine Grid */}
      <div
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        role="list"
        aria-label="Machine status list"
      >
        {machines.map(machine => {
          const statusConfig = STATUS_CONFIG[machine.status] || STATUS_CONFIG.offline;
          const isSelected = selectedMachine === machine.machine_id;

          return (
            <Card
              key={machine.machine_id}
              className={clsx(
                'transition-all duration-200',
                machine.status === 'fault' ? 'border-red-600/40' :
                machine.status === 'maintenance' ? 'border-blue-600/40' : '',
                isSelected ? 'ring-2 ring-blue-500' : ''
              )}
              role="listitem"
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className={clsx(
                    'w-8 h-8 rounded-lg flex items-center justify-center',
                    machine.status === 'running' ? 'bg-green-500/10' :
                    machine.status === 'fault' ? 'bg-red-500/10' :
                    machine.status === 'maintenance' ? 'bg-blue-500/10' : 'bg-slate-700'
                  )} aria-hidden="true">
                    <Cpu className={clsx('w-4 h-4', statusConfig.color)} />
                  </div>
                  <div>
                    <p className="text-slate-200 text-sm font-medium">{machine.name || machine.machine_id}</p>
                    <p className="text-slate-500 text-xs">{machine.machine_id} · {machine.line}</p>
                  </div>
                </div>
                <div className={clsx('flex items-center gap-1.5 text-xs font-medium', statusConfig.color)}>
                  <span className={clsx('w-1.5 h-1.5 rounded-full', statusConfig.dot)} aria-hidden="true" />
                  {statusConfig.label}
                </div>
              </div>

              {/* OEE */}
              {machine.oee != null && (
                <div className="mb-3">
                  <span className="text-xs text-slate-500 block mb-1">OEE</span>
                  <OEEBar oee={machine.oee} />
                </div>
              )}

              {/* Telemetry */}
              <div className="space-y-1 mb-3">
                <TelemetryMetric label="Temperature" value={machine.temperature} unit="°C"
                  warning={(machine.temperature || 0) > 80} />
                <TelemetryMetric label="Vibration" value={machine.vibration} unit="mm/s"
                  warning={(machine.vibration || 0) > 2.5} />
                <TelemetryMetric label="Pressure" value={machine.pressure} unit="bar" />
              </div>

              {/* Alerts */}
              {machine.active_alerts > 0 && (
                <div className="flex items-center gap-1.5 text-xs text-orange-400 mb-3">
                  <AlertTriangle className="w-3.5 h-3.5" aria-hidden="true" />
                  {machine.active_alerts} active alert{machine.active_alerts > 1 ? 's' : ''}
                </div>
              )}

              {/* AI Recommendation Button */}
              <div className="pt-3 border-t border-slate-700/50">
                <Button
                  variant="ghost"
                  size="sm"
                  loading={maintMutation.isPending && selectedMachine === machine.machine_id}
                  icon={<Sparkles className="w-3.5 h-3.5" aria-hidden="true" />}
                  className="w-full justify-center"
                  aria-label={`Get AI maintenance recommendation for ${machine.name || machine.machine_id}`}
                  onClick={() => {
                    setSelectedMachine(machine.machine_id);
                    maintMutation.mutate(machine.machine_id);
                  }}
                >
                  AI Recommendation
                </Button>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Maintenance Recommendation Panel */}
      {maintRec && (
        <Card className="border-blue-600/40 bg-blue-950/20">
          <CardHeader>
            <CardTitle icon={Sparkles}>
              AI Maintenance Recommendation — {maintRec.machine_name}
            </CardTitle>
            <button
              onClick={() => setMaintRec(null)}
              className="text-slate-400 hover:text-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-slate-400 rounded px-2 py-1"
              aria-label="Close recommendation"
            >
              Dismiss
            </button>
          </CardHeader>

          <div className="grid grid-cols-2 gap-4 mb-4">
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Health Score</p>
              <p className={clsx('text-2xl font-bold',
                maintRec.recommendation?.health_score >= 70 ? 'text-green-400' : 'text-red-400'
              )}>
                {maintRec.recommendation?.health_score ?? '--'}/100
              </p>
            </div>
            <div className="bg-slate-700/50 rounded-lg p-3">
              <p className="text-xs text-slate-400 mb-1">Failure Risk</p>
              <Badge
                severity={
                  maintRec.recommendation?.predicted_failure_risk === 'critical' ? 'critical' :
                  maintRec.recommendation?.predicted_failure_risk === 'high' ? 'high' :
                  maintRec.recommendation?.predicted_failure_risk === 'medium' ? 'medium' : 'low'
                }
                label={(maintRec.recommendation?.predicted_failure_risk || 'unknown').toUpperCase()}
              />
            </div>
          </div>

          {maintRec.recommendation?.reasoning && (
            <div className="bg-slate-700/30 rounded-lg p-3 mb-3">
              <p className="text-xs text-slate-400 mb-1">AI Reasoning</p>
              <p className="text-slate-300 text-sm">{maintRec.recommendation.reasoning}</p>
            </div>
          )}

          {maintRec.recommendation?.specific_actions?.length > 0 && (
            <div className="space-y-2" role="list" aria-label="Recommended actions">
              {maintRec.recommendation.specific_actions.map((action: any, i: number) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-700/50 last:border-0" role="listitem">
                  <Badge
                    severity={
                      action.urgency === 'immediate' ? 'critical' :
                      action.urgency === 'within_24h' ? 'high' : 'medium'
                    }
                    label={action.urgency?.replace(/_/g, ' ') || 'scheduled'}
                  />
                  <div className="flex-1">
                    <p className="text-slate-200 text-sm">{action.action}</p>
                    <p className="text-slate-500 text-xs">{action.estimated_duration}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {machines.length === 0 && (
        <Card className="text-center py-16">
          <Cpu className="w-10 h-10 text-slate-600 mx-auto mb-3" aria-hidden="true" />
          <p className="text-slate-300 font-medium mb-1">No machines registered</p>
          <p className="text-slate-500 text-sm">Use the demo seed endpoint to load sample machine data.</p>
        </Card>
      )}
    </div>
  );
}
