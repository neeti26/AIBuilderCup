import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ClipboardList, Plus, Send, AlertTriangle, CheckCircle,
  Clock, Tag, Cpu, ChevronDown, Loader2, Sparkles
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { shiftsApi, logsApi } from '../services/api';
import { useShiftStore } from '../store/shiftStore';
import { useAuthStore } from '../store/authStore';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { LogEntry, Severity, LogCategory } from '../types';
import clsx from 'clsx';

const LINES = ['Line-A', 'Line-B', 'Line-C', 'Line-D'];
const SHIFT_TYPES = [
  { value: 'day', label: 'Day Shift (06:00–14:00)' },
  { value: 'evening', label: 'Evening Shift (14:00–22:00)' },
  { value: 'night', label: 'Night Shift (22:00–06:00)' },
];
const MACHINE_IDS = ['CNC-A01', 'CNC-A02', 'ROBOT-A01', 'INSP-A01', 'DRILL-B01', 'RIVET-B01', 'WELD-B01', 'SMT-C01', 'XRAY-C01', 'TEST-C01'];

function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === 'critical' || severity === 'high') return <AlertTriangle className="w-4 h-4 text-red-400" aria-hidden="true" />;
  if (severity === 'medium') return <AlertTriangle className="w-4 h-4 text-yellow-400" aria-hidden="true" />;
  return <CheckCircle className="w-4 h-4 text-green-400" aria-hidden="true" />;
}

export default function ShiftPage() {
  const { user } = useAuthStore();
  const { activeShift, setActiveShift, logs, setLogs, addLog } = useShiftStore();
  const queryClient = useQueryClient();

  const [logText, setLogText] = useState('');
  const [selectedMachine, setSelectedMachine] = useState('');
  const [showStartShift, setShowStartShift] = useState(false);
  const [newShift, setNewShift] = useState({
    shift_type: 'day',
    line: 'Line-A',
    production_target: 200,
    date: format(new Date(), 'yyyy-MM-dd'),
  });

  // Load active shifts
  const { isLoading: shiftsLoading } = useQuery({
    queryKey: ['active-shifts'],
    queryFn: () => shiftsApi.getActive().then(r => r.data),
    onSuccess: (data) => {
      if (data.shifts.length > 0 && !activeShift) {
        setActiveShift(data.shifts[0]);
      }
    },
  });

  // Load logs for active shift
  const { isLoading: logsLoading } = useQuery({
    queryKey: ['shift-logs', activeShift?.id],
    queryFn: () => logsApi.getForShift(activeShift!.id).then(r => r.data),
    enabled: !!activeShift?.id,
    onSuccess: (data) => setLogs(data.logs),
  });

  // Create shift mutation
  const createShiftMutation = useMutation({
    mutationFn: (data: object) => shiftsApi.create(data),
    onSuccess: (response) => {
      setActiveShift(response.data);
      setShowStartShift(false);
      toast.success('Shift started successfully');
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
    onError: () => toast.error('Failed to start shift'),
  });

  // Submit log mutation
  const submitLogMutation = useMutation({
    mutationFn: (data: object) => logsApi.submit(data),
    onSuccess: (response) => {
      addLog(response.data.log as LogEntry);
      setLogText('');
      setSelectedMachine('');
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      if (response.data.alert_created) {
        toast('Alert created for critical issue', { icon: '⚠️' });
      } else {
        toast.success('Log entry submitted & analyzed by AI');
      }
    },
    onError: () => toast.error('Failed to submit log entry'),
  });

  const handleStartShift = () => {
    createShiftMutation.mutate({
      ...newShift,
      supervisor: user?.id || '',
      team_members: [],
      notes: '',
    });
  };

  const handleSubmitLog = (e: React.FormEvent) => {
    e.preventDefault();
    if (!logText.trim() || !activeShift) return;
    submitLogMutation.mutate({
      shift_id: activeShift.id,
      raw_text: logText,
      machine_id: selectedMachine || null,
    });
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Active Shift</h1>
          <p className="text-slate-400 text-sm">Log events — AI classifies severity and extracts action items</p>
        </div>
        {!activeShift && (
          <Button
            onClick={() => setShowStartShift(true)}
            icon={<Plus className="w-4 h-4" aria-hidden="true" />}
          >
            Start Shift
          </Button>
        )}
      </div>

      {/* Start Shift Modal */}
      {showStartShift && (
        <Card className="border-blue-600/40 bg-blue-950/20">
          <CardHeader>
            <CardTitle icon={ClipboardList}>Start New Shift</CardTitle>
            <button onClick={() => setShowStartShift(false)} className="text-slate-400 hover:text-slate-200 text-xs" aria-label="Cancel">Cancel</button>
          </CardHeader>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-slate-400 mb-1 block" htmlFor="shift-type">Shift Type</label>
              <select
                id="shift-type"
                value={newShift.shift_type}
                onChange={e => setNewShift(p => ({ ...p, shift_type: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {SHIFT_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block" htmlFor="line">Production Line</label>
              <select
                id="line"
                value={newShift.line}
                onChange={e => setNewShift(p => ({ ...p, line: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {LINES.map(l => <option key={l}>{l}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block" htmlFor="production-target">Production Target (units)</label>
              <input
                id="production-target"
                type="number"
                value={newShift.production_target}
                onChange={e => setNewShift(p => ({ ...p, production_target: parseInt(e.target.value) }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block" htmlFor="shift-date">Date</label>
              <input
                id="shift-date"
                type="date"
                value={newShift.date}
                onChange={e => setNewShift(p => ({ ...p, date: e.target.value }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-3">
            <Button onClick={handleStartShift} loading={createShiftMutation.isPending}>
              Start Shift
            </Button>
            <Button variant="secondary" onClick={() => setShowStartShift(false)}>
              Cancel
            </Button>
          </div>
        </Card>
      )}

      {/* Active Shift Banner */}
      {activeShift && (
        <Card className="border-green-600/30 bg-green-950/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" aria-hidden="true" />
              <div>
                <p className="text-green-400 font-semibold text-sm">
                  {activeShift.shift_type.toUpperCase()} SHIFT ACTIVE — {activeShift.line}
                </p>
                <p className="text-slate-400 text-xs">
                  Supervisor: {activeShift.supervisor_name} · Started: {format(new Date(activeShift.created_at), 'HH:mm')} · {activeShift.log_count} logs recorded
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <Cpu className="w-3.5 h-3.5" aria-hidden="true" />
              ID: {activeShift.id}
            </div>
          </div>
        </Card>
      )}

      {/* Log Entry Form */}
      {activeShift && (
        <Card>
          <CardHeader>
            <CardTitle icon={Sparkles}>New Log Entry</CardTitle>
            <span className="text-xs text-slate-500 flex items-center gap-1">
              <Sparkles className="w-3 h-3" aria-hidden="true" /> AI-powered analysis
            </span>
          </CardHeader>
          <form onSubmit={handleSubmitLog} aria-label="Submit operator log entry">
            <div className="mb-3">
              <label htmlFor="machine-select" className="text-xs text-slate-400 mb-1.5 block">
                Machine / Asset (optional)
              </label>
              <select
                id="machine-select"
                value={selectedMachine}
                onChange={e => setSelectedMachine(e.target.value)}
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">General / No specific machine</option>
                {MACHINE_IDS.map(id => <option key={id} value={id}>{id}</option>)}
              </select>
            </div>
            <div className="mb-3">
              <label htmlFor="log-text" className="text-xs text-slate-400 mb-1.5 block">
                Log Entry <span className="text-slate-500">(describe what happened — AI will classify and extract action items)</span>
              </label>
              <textarea
                id="log-text"
                value={logText}
                onChange={e => setLogText(e.target.value)}
                placeholder="e.g. CNC-A01 showing intermittent spindle fault E-047. Machine stopped twice during the 08:00–10:00 window. Maintenance notified. Parts reworked and released after inspection..."
                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-3 text-slate-200 text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                rows={4}
                minLength={10}
                required
              />
              <p className="text-slate-600 text-xs mt-1">{logText.length}/5000 characters</p>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-slate-500 text-xs">
                Gemini AI will automatically classify severity, category, and generate action items
              </p>
              <Button
                type="submit"
                loading={submitLogMutation.isPending}
                icon={<Send className="w-3.5 h-3.5" aria-hidden="true" />}
                disabled={!logText.trim()}
              >
                Submit & Analyze
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Log Feed */}
      {activeShift && (
        <Card>
          <CardHeader>
            <CardTitle icon={ClipboardList}>
              Shift Log Feed ({logs.length} entries)
            </CardTitle>
            <div className="flex items-center gap-2">
              {logsLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-400" aria-hidden="true" />}
              <span className="text-xs text-slate-500">Newest first</span>
            </div>
          </CardHeader>

          {logs.length === 0 ? (
            <div className="text-center py-10 text-slate-500">
              <ClipboardList className="w-8 h-8 mx-auto mb-2 opacity-50" aria-hidden="true" />
              <p className="text-sm">No log entries yet. Submit your first entry above.</p>
            </div>
          ) : (
            <div className="space-y-3" role="feed" aria-label="Shift log entries">
              {logs.map((log) => (
                <article key={log.id} className={clsx(
                  'border-l-2 pl-4 py-2',
                  log.severity === 'critical' ? 'border-red-500' :
                  log.severity === 'high' ? 'border-orange-500' :
                  log.severity === 'medium' ? 'border-yellow-500' :
                  log.severity === 'low' ? 'border-green-500' : 'border-slate-600'
                )}>
                  <div className="flex items-start justify-between gap-3 mb-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge severity={log.severity as Severity} label={log.severity.toUpperCase()} dot />
                      <Badge
                        label={log.category}
                        className="bg-slate-700/50 text-slate-400 border-slate-600"
                      />
                      {log.machine_id && (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <Cpu className="w-3 h-3" aria-hidden="true" />
                          {log.machine_id}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-slate-500 text-xs flex-shrink-0">
                      <Clock className="w-3 h-3" aria-hidden="true" />
                      <time dateTime={log.created_at}>{format(new Date(log.created_at), 'HH:mm')}</time>
                    </div>
                  </div>
                  <p className="text-slate-300 text-sm mb-2">{log.raw_text}</p>
                  {log.ai_summary && (
                    <div className="bg-blue-950/30 border border-blue-600/20 rounded-lg p-2.5 mb-2">
                      <p className="text-xs text-blue-400 font-medium mb-0.5 flex items-center gap-1">
                        <Sparkles className="w-3 h-3" aria-hidden="true" /> AI Analysis
                      </p>
                      <p className="text-slate-300 text-xs">{log.ai_summary}</p>
                      {log.root_cause_hint && (
                        <p className="text-slate-400 text-xs mt-1">
                          <span className="font-medium">Root cause hint:</span> {log.root_cause_hint}
                        </p>
                      )}
                    </div>
                  )}
                  {log.action_items && log.action_items.length > 0 && (
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Action Items:</p>
                      <ul className="space-y-0.5" aria-label="Action items">
                        {log.action_items.map((item, i) => (
                          <li key={i} className="flex items-start gap-1.5 text-xs text-slate-300">
                            <CheckCircle className="w-3 h-3 text-blue-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {log.tags && log.tags.length > 0 && (
                    <div className="flex items-center gap-1 mt-2 flex-wrap">
                      <Tag className="w-3 h-3 text-slate-600" aria-hidden="true" />
                      {log.tags.map((tag, i) => (
                        <span key={i} className="text-xs bg-slate-700/50 text-slate-500 px-1.5 py-0.5 rounded">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <p className="text-slate-600 text-xs mt-1">— {log.created_by_name}</p>
                </article>
              ))}
            </div>
          )}
        </Card>
      )}

      {!activeShift && !shiftsLoading && !showStartShift && (
        <Card className="text-center py-16">
          <ClipboardList className="w-12 h-12 text-slate-600 mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-slate-300 font-semibold mb-2">No Active Shift</h2>
          <p className="text-slate-500 text-sm mb-4">Start a shift to begin logging events and generating AI-powered handover reports.</p>
          <Button onClick={() => setShowStartShift(true)} icon={<Plus className="w-4 h-4" aria-hidden="true" />}>
            Start Shift
          </Button>
        </Card>
      )}
    </div>
  );
}
