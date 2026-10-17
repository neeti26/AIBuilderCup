import { useQuery } from '@tanstack/react-query';
import {
  Activity, AlertTriangle, Cpu, TrendingUp,
  CheckCircle, XCircle, Clock, Zap, ArrowUpRight,
  RefreshCw
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell
} from 'recharts';
import { useEffect, useState } from 'react';
import { aiApi, shiftsApi } from '../services/api';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { format } from 'date-fns';
import { DashboardStats, MachineStatus } from '../types';
import clsx from 'clsx';
import { SkeletonLoader, SkeletonText } from '../components/ui/Skeleton';
import LiveMachineCard from '../components/LiveMachineCard';

const STATUS_COLORS: Record<MachineStatus, string> = {
  running: '#22c55e',
  idle: '#6b7280',
  maintenance: '#3b82f6',
  fault: '#ef4444',
  offline: '#1e293b',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: '#ef4444',
  high: '#f97316',
  medium: '#eab308',
  low: '#22c55e',
};

function StatCard({ label, value, icon: Icon, color, subtext }: {
  label: string; value: string | number; icon: React.ComponentType<{ className?: string }>;
  color: string; subtext?: string;
}) {
  return (
    <div className="stat-card">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400 mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-100">{value}</p>
          {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
        </div>
        <div className="p-2 rounded-lg bg-slate-700/50">
          <Icon className="w-5 h-5 text-slate-400" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function MachineStatusDot({ status }: { status: MachineStatus }) {
  const labels: Record<MachineStatus, string> = {
    running: 'Running', idle: 'Idle', maintenance: 'Maintenance',
    fault: 'Fault', offline: 'Offline'
  };
  return (
    <span className="inline-flex items-center gap-1.5 text-xs">
      <span
        className={clsx('w-2 h-2 rounded-full', status === 'running' ? 'bg-green-500 animate-pulse' :
          status === 'fault' ? 'bg-red-500 animate-pulse' :
          status === 'maintenance' ? 'bg-blue-500' :
          status === 'idle' ? 'bg-gray-500' : 'bg-slate-700')}
        aria-hidden="true"
      />
      <span className={clsx(
        status === 'running' ? 'text-green-400' :
        status === 'fault' ? 'text-red-400' :
        status === 'maintenance' ? 'text-blue-400' : 'text-slate-400'
      )}>{labels[status]}</span>
    </span>
  );
}

export default function Dashboard() {
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const { data: stats, isLoading } = useQuery<DashboardStats>({
    queryKey: ['dashboard', refreshTrigger],
    queryFn: () => aiApi.getDashboard().then(r => r.data),
    refetchInterval: 30000,
    refetchIntervalInBackground: true,
  });

  const handleRefresh = () => setRefreshTrigger(Date.now());

  if (isLoading && !stats) {
    return (
      <div className="space-y-6 animate-fade-in">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white">Operations Dashboard</h1>
            <p className="text-slate-400 text-sm">
              {format(new Date(), 'EEEE, MMMM d, yyyy')} · Real-time intelligence
            </p>
          </div>
          <button
            onClick={handleRefresh}
            className="p-2 text-slate-400 hover:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
            aria-label="Refresh dashboard"
          >
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="stat-card animate-pulse">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-medium text-slate-400 mb-1">Loading</p>
                  <p className="text-2xl font-bold text-slate-100 animate-pulse">--</p>
                </div>
                <div className="p-2 rounded-lg bg-slate-700/50 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
        <SkeletonText lines={2} />
      </div>
    );
  }

  const machineStatusData = [
    { name: 'Running', value: stats?.machines_running || 0, color: STATUS_COLORS.running },
    { name: 'Maintenance', value: stats?.machines_maintenance || 0, color: STATUS_COLORS.maintenance },
    { name: 'Fault', value: stats?.machines_fault || 0, color: STATUS_COLORS.fault },
    { name: 'Idle', value: Math.max(0, (stats?.machines_total || 0) - (stats?.machines_running || 0) - (stats?.machines_maintenance || 0) - (stats?.machines_fault || 0)), color: STATUS_COLORS.idle },
  ].filter(d => d.value > 0);

  const now = new Date();
  const OEE_TREND = [
    { time: '00:00', oee: Math.round((stats?.oee_average || 85) * 0.92) },
    { time: '04:00', oee: Math.round((stats?.oee_average || 85) * 0.95) },
    { time: '08:00', oee: Math.round((stats?.oee_average || 85) * 1.02) },
    { time: '12:00', oee: Math.round((stats?.oee_average || 85) * 0.98) },
    { time: '16:00', oee: Math.round((stats?.oee_average || 85) * 1.05) },
    { time: '20:00', oee: Math.round((stats?.oee_average || 85) * 0.90) },
    { time: 'Now', oee: Math.round(stats?.oee_average || 85) },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Operations Dashboard</h1>
          <p className="text-slate-400 text-sm">
            {format(new Date(), 'EEEE, MMMM d, yyyy')} · Real-time intelligence
          </p>
        </div>
        <div className="flex items-center gap-4">
          {stats?.active_shift && (
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/30 rounded-lg px-3 py-2">
              <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" aria-hidden="true" />
              <span className="text-green-400 text-sm font-medium capitalize">
                {stats.active_shift.shift_type} Shift Active — {stats.active_shift.line}
              </span>
            </div>
          )}
          <button
            onClick={handleRefresh}
            className="p-2 text-slate-400 hover:text-blue-400 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded"
            aria-label="Refresh dashboard data"
          >
            <span className="sr-only">Refresh</span>
            <RefreshCw className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* KPI Stats Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4" role="region" aria-label="Key performance indicators">
        <StatCard
          label="OEE Average"
          value={`${stats?.oee_average?.toFixed(1) || '--'}%`}
          icon={TrendingUp}
          color="text-blue-400"
          subtext="Overall Equipment Effectiveness"
        />
        <StatCard
          label="Machines Running"
          value={`${stats?.machines_running || 0}/${stats?.machines_total || 0}`}
          icon={Cpu}
          color="text-green-400"
          subtext={`${stats?.machines_fault || 0} fault · ${stats?.machines_maintenance || 0} maintenance`}
        />
        <StatCard
          label="Open Alerts"
          value={stats?.open_alerts || 0}
          icon={AlertTriangle}
          color={stats?.critical_alerts ? 'text-red-400' : 'text-orange-400'}
          subtext={`${stats?.critical_alerts || 0} critical`}
        />
        <StatCard
          label="Shift Performance"
          value={stats?.active_shift ? `${Math.round((stats.active_shift.production_actual || 0) / (stats.active_shift.production_target || 1) * 100)}%` : 'N/A'}
          icon={Zap}
          color="text-yellow-400"
          subtext="Production target achievement"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* OEE Trend */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="card-header">
              <div className="card-title">
                <TrendingUp className="w-4 h-4" aria-hidden="true" />
                OEE Trend — Today
              </div>
              <span className="text-xs text-slate-500">Updated live · every 30s</span>
            </div>
            <div className="button-ghost" onClick={handleRefresh} style={{ padding: '0.5rem', borderRadius: '0.5rem', marginBottom: '1rem', display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
              <span className="sr-only">Refresh</span>
              <RefreshCw className="w-4 h-4" aria-hidden="true" />
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={OEE_TREND} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id="oeeGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis domain={[60, 100]} tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8' }}
                  itemStyle={{ color: '#3b82f6' }}
                />
                <Area type="monotone" dataKey="oee" stroke="#3b82f6" fill="url(#oeeGrad)" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Machine Status Pie */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Cpu className="w-4 h-4" aria-hidden="true" />
              Machine Status
            </div>
          </div>
          <div className="flex flex-col items-center">
            <ResponsiveContainer width="100%" height={130}>
              <PieChart>
                <Pie
                  data={machineStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={55}
                  dataKey="value"
                  strokeWidth={0}
                >
                  {machineStatusData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  itemStyle={{ color: '#94a3b8' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-2 w-full mt-2">
              {machineStatusData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-1.5 text-xs">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} aria-hidden="true" />
                  <span className="text-slate-400">{entry.name}</span>
                  <span className="text-slate-200 font-medium ml-auto">{entry.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Live Machine Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {['CNC-A01', 'CNC-A02', 'ROBOT-A01', 'INSP-A01', 'DRILL-B01'].map((machineId) => (
          <LiveMachineCard key={machineId} machineId={machineId} />
        ))}
      </div>

      {/* Recent Alerts + Active Shift Info */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Recent Alerts */}
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <div className="card-title">
              <AlertTriangle className="w-4 h-4" aria-hidden="true" />
              Recent Alerts
            </div>
            <a href="/alerts" className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1" aria-label="View all alerts">
              View all <ArrowUpRight className="w-3 h-3" aria-hidden="true" />
            </a>
          </div>
          <div className="space-y-2" role="list" aria-label="Recent alerts">
            {stats?.recent_alerts?.length ? stats.recent_alerts.slice(0, 5).map((alert) => (
              <div key={alert.id} className="flex items-start gap-3 py-2 border-b border-slate-700/50 last:border-0" role="listitem">
                <Badge severity={alert.severity as any} label={alert.severity.toUpperCase()} dot />
                <div className="min-w-0 flex-1">
                  <p className="text-slate-200 text-xs font-medium truncate">{alert.machine_name}</p>
                  <p className="text-slate-400 text-xs truncate">{alert.message}</p>
                </div>
              </div>
            )) : (
              <div className="flex items-center gap-2 py-4 justify-center text-slate-500">
                <CheckCircle className="w-4 h-4" aria-hidden="true" />
                <span className="text-sm">No active alerts</span>
              </div>
            )}
          </div>
        </div>

        {/* Active Shift Details */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Activity className="w-4 h-4" aria-hidden="true" />
              Active Shift
            </div>
          </div>
          {stats?.active_shift ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs">Line</span>
                <span className="text-slate-200 text-sm font-medium">{stats.active_shift.line}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs">Shift Type</span>
                <span className="text-slate-200 text-sm capitalize">{stats.active_shift.shift_type}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs">Supervisor</span>
                <span className="text-slate-200 text-sm">{stats.active_shift.supervisor_name}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-xs">Logs Recorded</span>
                <span className="text-slate-200 text-sm font-medium">{stats.active_shift.log_count}</span>
              </div>
              {stats.active_shift.production_target && (
                <>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-slate-400 text-xs">Production Progress</span>
                    <span className="text-slate-200 text-sm">
                      {stats.active_shift.production_actual ?? 0} / {stats.active_shift.production_target}
                    </span>
                  </div>
                  <div className="w-full bg-slate-700 rounded-full h-2" role="progressbar"
                    aria-valuenow={stats.active_shift.production_actual ?? 0}
                    aria-valuemin={0}
                    aria-valuemax={stats.active_shift.production_target}>
                    <div
                      className="bg-blue-500 h-2 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(100, ((stats.active_shift.production_actual ?? 0) / stats.active_shift.production_target) * 100)}%` }}
                    />
                  </div>
                </>
              )}
              <a href="/shift" className="block mt-3 text-center text-xs text-blue-400 hover:text-blue-300 py-2 border border-blue-600/30 rounded-lg hover:bg-blue-600/10 transition-colors">
                Open Shift Details →
              </a>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-8 gap-3 text-center">
              <Clock className="w-8 h-8 text-slate-600" aria-hidden="true" />
              <p className="text-slate-400 text-sm">No active shift</p>
              <a href="/shift" className="text-xs text-blue-400 hover:text-blue-300">Start a shift →</a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
