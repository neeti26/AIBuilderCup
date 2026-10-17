/**
 * LiveMachineCard — Real-time machine health card with animated gauges
 * Shows live telemetry with WebSocket-powered updates and AI anomaly detection
 */
import { useEffect, useState } from 'react';
import {
  Cpu, AlertTriangle, CheckCircle, Clock, Sparkles, Thermometer, Wifi,
  Activity, Battery, TrendingDown, TrendingUp, XCircle
} from 'lucide-react';
import Card from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import { useWebSocket } from '../hooks/useWebSocket';
import clsx from 'clsx';

interface MachineData {
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
}

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string; Icon: any }> = {
  running: { label: 'Running', color: 'text-green-400', dot: 'bg-green-500 animate-pulse', Icon: CheckCircle },
  idle: { label: 'Idle', color: 'text-slate-400', dot: 'bg-slate-500', Icon: Clock },
  maintenance: { label: 'Maintenance', color: 'text-blue-400', dot: 'bg-blue-500', Icon: Activity },
  fault: { label: 'Fault', color: 'text-red-400', dot: 'bg-red-500 animate-pulse', Icon: AlertTriangle },
  offline: { label: 'Offline', color: 'text-slate-600', dot: 'bg-slate-700', Icon: XCircle },
};

function OEEGauge({ oee }: { oee: number }) {
  const color =
    oee >= 85 ? 'text-green-400' :
    oee >= 70 ? 'text-yellow-400' :
    oee >= 50 ? 'text-orange-400' : 'text-red-400';

  return (
    <div className="flex items-center gap-2">
      <div
        className="flex-1 bg-slate-700 rounded-full h-2"
        role="progressbar"
        aria-valuenow={oee}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`OEE: ${oee}%`}
      >
        <div
          className={clsx('h-2 rounded-full transition-all duration-1000 ease-out', color)}
          style={{ width: `${Math.min(100, oee)}%` }}
        />
      </div>
      <span className={clsx('text-xs font-mono font-bold w-12 text-right', color)}>
        {oee.toFixed(1)}%
      </span>
    </div>
  );
}

function TelemetryMetric({ label, value, unit, warning, Icon }: {
  label: string; value?: number; unit: string; warning?: boolean; Icon: any;
}) {
  if (value == null) return null;
  const isWarning = warning ?? false;
  return (
    <div className="flex items-center justify-between text-[10px] mb-1">
      <div className="flex items-center gap-1">
        <Icon className="w-3 h-3 text-slate-500" aria-hidden="true" />
        <span className="text-slate-500">{label}</span>
      </div>
      <span className={clsx('font-mono font-bold', isWarning ? 'text-orange-400' : 'text-slate-300')}>
        {value.toFixed(1)} {unit}
      </span>
    </div>
  );
}

export default function LiveMachineCard({ machineId }: { machineId: string }) {
  const { machines, isConnected } = useWebSocket();
  const [localData, setLocalData] = useState<MachineData | null>(null);

  const machine = machines[machineId] || localData;

  useEffect(() => {
    if (machine && machine.machine_id) {
      setLocalData(machine);
    }
  }, [machine]);

  if (!machine) return null;

  const statusConfig = STATUS_CONFIG[machine.status] || STATUS_CONFIG.offline;
  const isCritical = machine.status === 'fault' || machine.active_alerts > 0;
  const tempWarning = (machine.temperature || 0) > 80;
  const vibWarning = (machine.vibration || 0) > 2.5;

  return (
    <Card
      className={clsx(
        'transition-all duration-300 hover:border-blue-500/40',
        isCritical ? 'border-red-600/40 bg-red-950/10' :
        machine.status === 'maintenance' ? 'border-blue-600/40 bg-blue-950/10' : '',
        'group'
      )}
    >
      <div className="absolute top-2 right-2 flex items-center gap-1">
        <div
          className={clsx('w-2 h-2 rounded-full', isConnected ? 'bg-green-500 animate-pulse' : 'bg-slate-600')}
          aria-hidden="true"
        />
        <span className="text-[10px] text-slate-500">{isConnected ? 'LIVE' : 'OFFLINE'}</span>
      </div>

      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={clsx(
            'w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0',
            machine.status === 'running' ? 'bg-green-500/10' :
            machine.status === 'fault' ? 'bg-red-500/10' :
            machine.status === 'maintenance' ? 'bg-blue-500/10' : 'bg-slate-700'
          )} aria-hidden="true">
            <statusConfig.Icon className={clsx('w-4 h-4', statusConfig.color)} />
          </div>
          <div>
            <p className="text-slate-200 text-sm font-medium">{machine.name || machine.machine_id}</p>
            <p className="text-slate-500 text-[10px]">{machine.machine_id} · {machine.line}</p>
          </div>
        </div>
        <div className={clsx('flex items-center gap-1.5 text-xs font-medium', statusConfig.color)}>
          <span className={clsx('w-1.5 h-1.5 rounded-full', statusConfig.dot)} aria-hidden="true" />
          {statusConfig.label}
        </div>
      </div>

      <div className="mb-3">
        <span className="text-[10px] text-slate-500 block mb-1">OEE</span>
        <OEEGauge oee={machine.oee ?? 0} />
      </div>

      <div className="space-y-1 mb-3">
        <TelemetryMetric
          label="Temp" value={machine.temperature} unit="°C"
          warning={tempWarning}
          Icon={Thermometer}
        />
        <TelemetryMetric
          label="Vibe" value={machine.vibration} unit="mm/s"
          warning={vibWarning}
          Icon={Activity}
        />
        {machine.pressure != null && (
          <TelemetryMetric
            label="Pres" value={machine.pressure} unit="bar"
            Icon={Sparkles}
          />
        )}
      </div>

      {machine.active_alerts > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-orange-400 mb-3">
          <AlertTriangle className="w-3.5 h-3.5 animate-pulse" aria-hidden="true" />
          <span>{machine.active_alerts} active alert{machine.active_alerts > 1 ? 's' : ''}</span>
        </div>
      )}

      <div className="pt-2 border-t border-slate-700/50">
        <div className="flex items-center justify-between text-[10px] text-slate-500">
          <span>Last update</span>
          <span>{new Date(machine.last_updated).toLocaleTimeString()}</span>
        </div>
      </div>
    </Card>
  );
}
