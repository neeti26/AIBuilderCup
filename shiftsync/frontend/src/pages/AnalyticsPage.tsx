import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  TrendingUp, Sparkles, AlertTriangle, CheckCircle,
  Zap, BarChart2, Loader2, Activity, Clock, Cpu, Shield
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell
} from 'recharts';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { aiApi } from '../services/api';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';

const LINES = ['Line-A', 'Line-B', 'Line-C'];

const STATUS_COLORS: Record<string, string> = {
  running: '#22c55e',
  idle: '#6b7280',
  maintenance: '#3b82f6',
  fault: '#ef4444',
  offline: '#1e293b',
};

function StatCard({ label, value, icon: Icon, color, subtext, trend }: {
  label: string; value: string | number; icon: React.ComponentType<{ className?: string }>;
  color: string; subtext?: string; trend?: 'up' | 'down' | 'neutral';
}) {
  const trendIcon = trend === 'up' ? <TrendingUp className="w-4 h-4 text-green-400" /> :
    trend === 'down' ? <Clock className="w-4 h-4 text-red-400" /> :
    <CheckCircle className="w-4 h-4 text-slate-400" />;

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-medium text-slate-400 mb-1">{label}</p>
          <p className="text-2xl font-bold text-slate-100">{value}</p>
          {subtext && <p className="text-xs text-slate-500 mt-1">{subtext}</p>}
        </div>
        <div className="p-2 rounded-lg bg-slate-700/50">
          <Icon className="w-5 h-5 {color}" aria-hidden="true" />
        </div>
      </div>
      <div className="flex items-center gap-1 mt-3">
        {trendIcon}
        <span className="text-xs {trend === 'up' ? 'text-green-400' : trend === 'down' ? 'text-red-400' : 'text-slate-400'} font-medium">
          {trend === 'up' ? 'Improving' : trend === 'down' ? 'Declining' : 'Stable'}
        </span>
      </div>
    </div>
  );
}

const OEE_CHART_DATA = [
  { day: 'Mon', lineA: 84, lineB: 78, lineC: 91, target: 85 },
  { day: 'Tue', lineA: 87, lineB: 81, lineC: 88, target: 85 },
  { day: 'Wed', lineA: 82, lineB: 74, lineC: 92, target: 85 },
  { day: 'Thu', lineA: 89, lineB: 83, lineC: 90, target: 85 },
  { day: 'Fri', lineA: 85, lineB: 79, lineC: 87, target: 85 },
  { day: 'Sat', lineA: 91, lineB: 85, lineC: 93, target: 85 },
  { day: 'Sun', lineA: 88, lineB: 80, lineC: 89, target: 85 },
];

export default function AnalyticsPage() {
  const [selectedLine, setSelectedLine] = useState('Line-A');
  const [analysis, setAnalysis] = useState<any>(null);

  const { data: dashboardStats, isLoading } = useQuery({
    queryKey: ['dashboard'],
    queryFn: () => aiApi.getDashboard().then(r => r.data),
    refetchInterval: 30000,
  });

  const analyzeMutation = useMutation({
    mutationFn: () => aiApi.analyzeTrend(selectedLine, 7),
    onSuccess: (response) => {
      setAnalysis(response.data);
      toast.success('Trend analysis complete');
    },
    onError: () => toast.error('Analysis failed — check shift data'),
  });

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Analytics & Trends</h1>
          <p className="text-slate-400 text-sm">
            AI-powered operational insights across production lines
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedLine}
            onChange={e => setSelectedLine(e.target.value)}
            className="input-field"
            aria-label="Select production line for analysis"
          >
            {LINES.map(l => <option key={l}>{l}</option>)}
          </select>
          <button
            onClick={() => analyzeMutation.mutate()}
            className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={analyzeMutation.isPending}
          >
            {analyzeMutation.isPending ? 'Analyzing...' : 'Run AI Analysis'}
          </button>
        </div>
      </div>

      {/* KPI Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="OEE Average"
          value={`${dashboardStats?.oee_average?.toFixed(1) || '--'}%`}
          icon={Activity}
          color="text-blue-400"
          subtext="Overall Equipment Effectiveness"
          trend="up"
        />
        <StatCard
          label="Production Efficiency"
          value={`${dashboardStats?.oee_average?.toFixed(1) || '--'}%`}
          icon={Zap}
          color="text-yellow-400"
          subtext="Target achievement"
          trend="up"
        />
        <StatCard
          label="Quality Rate"
          value="98.5%"
          icon={Shield}
          color="text-green-400"
          subtext="First-pass yield"
          trend="up"
        />
        <StatCard
          label="Safety Score"
          value="99.2%"
          icon={AlertTriangle}
          color="text-green-400"
          subtext="Days since incident"
          trend="up"
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Weekly OEE */}
        <div className="lg:col-span-2">
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <div className="card-title flex items-center gap-2">
                <TrendingUp className="w-4 h-4" aria-hidden="true" />
                Weekly OEE by Line
              </div>
              <span className="text-xs text-slate-500">Target: ≥85%</span>
            </div>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={OEE_CHART_DATA} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                <defs>
                  <linearGradient id="colorA" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorB" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#f97316" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#f97316" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorC" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#22c55e" stopOpacity={0.8} />
                    <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} />
                <YAxis domain={[60, 100]} tick={{ fill: '#64748b', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                  labelStyle={{ color: '#94a3b8' }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', color: '#64748b' }} />
                <Line type="monotone" dataKey="lineA" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} name="Line A" />
                <Line type="monotone" dataKey="lineB" stroke="#f97316" strokeWidth={2} dot={{ fill: '#f97316' }} name="Line B" />
                <Line type="monotone" dataKey="lineC" stroke="#22c55e" strokeWidth={2} dot={{ fill: '#22c55e' }} name="Line C" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Efficiency Gauge */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              <Activity className="w-4 h-4" aria-hidden="true" />
              Production Efficiency
            </div>
          </div>
          <div className="flex flex-col items-center justify-center py-8">
            <div className="relative w-48 h-48">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 64 64">
                <circle cx="32" cy="32" r="28" fill="none" stroke="#1e293b" strokeWidth="8" />
                <circle cx="32" cy="32" r="28" fill="none" strokeWidth="8"
                  strokeDasharray="176" strokeDashoffset={44}
                  className="text-blue-400 transition-all duration-1000" strokeLinecap="round" />
                <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle"
                  fontSize="24" fontWeight="bold" fill="#e2e8f0">87%</text>
              </svg>
            </div>
            <p className="mt-4 text-slate-100 font-bold text-xl">Overall OEE</p>
            <p className="text-xs text-slate-500">Target: 85% · Above target by 2 points</p>
          </div>
        </div>
      </div>

      {/* AI Analysis Results */}
      {analyzeMutation.isPending && (
        <div className="card border-blue-600/30 bg-blue-950/10">
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin" aria-hidden="true" />
            <div>
              <p className="text-blue-400 text-sm font-medium">Gemini AI analyzing 7-day trends for {selectedLine}...</p>
              <p className="text-slate-500 text-xs mt-0.5">Identifying patterns, recurring issues, and improvement opportunities</p>
            </div>
          </div>
        </div>
      )}

      {analysis && (
        <div className="space-y-6 animate-slide-up" role="region" aria-label="AI trend analysis results">
          <div className="card border-l-4 border-l-blue-500">
            <div className="card-header">
              <div className="card-title flex items-center gap-2">
                <Sparkles className="w-4 h-4" aria-hidden="true" />
                AI Trend Analysis — {selectedLine}
              </div>
              <span className={clsx(
                'text-xs font-medium px-2 py-0.5 rounded-full',
                analysis.oee_trend === 'improving' ? 'bg-green-500/20 text-green-400' :
                analysis.oee_trend === 'declining' ? 'bg-red-500/20 text-red-400' :
                'bg-yellow-500/20 text-yellow-400'
              )}>
                OEE: {(analysis.oee_trend || 'unknown').toUpperCase()}
              </span>
            </div>
            <p className="text-slate-300 text-sm leading-relaxed">{analysis.trend_analysis}</p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Recurring Issues */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                  Top Recurring Issues
                </div>
              </div>
              <div className="space-y-3 mt-1">
                {analysis.top_recurring_issues?.length > 0 ? (
                  analysis.top_recurring_issues.map((issue: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-700/50 last:border-0">
                      <div className="w-6 h-6 bg-orange-500/10 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-orange-400 text-xs font-bold">{i + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-slate-200 text-sm">{issue.issue}</p>
                        <p className="text-slate-500 text-xs mt-0.5">{issue.frequency} · Impact: {issue.impact}</p>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-slate-500 text-sm">
                    No recurring issues detected
                  </div>
                )}
              </div>
            </div>

            {/* Risk Areas */}
            <div className="card">
              <div className="card-header">
                <div className="card-title">
                  <Shield className="w-4 h-4" aria-hidden="true" />
                  Risk Areas to Watch
                </div>
              </div>
              <div className="space-y-3 mt-1">
                {analysis.risk_areas?.length > 0 ? (
                  analysis.risk_areas.map((risk: any, i: number) => (
                    <div key={i} className="bg-red-950/20 border border-red-600/20 rounded-lg p-3">
                      <p className="text-slate-200 text-sm font-medium">{risk.area}</p>
                      <p className="text-slate-400 text-xs mb-2">{risk.evidence}</p>
                      <p className="text-blue-400 text-xs">→ {risk.recommended_action}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-slate-500 text-sm">
                    No significant risk areas
                  </div>
                )}
              </div>
            </div>

            {/* Priority Actions */}
            <div className="card border-green-600/20 bg-green-950/10">
              <div className="card-header">
                <div className="card-title">
                  <CheckCircle className="w-4 h-4" aria-hidden="true" />
                  Priority Actions
                </div>
              </div>
              <div className="space-y-2 mt-1">
                {analysis.priority_actions?.length > 0 ? (
                  analysis.priority_actions.map((action: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 py-1.5">
                      <CheckCircle className="w-3 h-3 text-green-400 mt-0.5 flex-shrink-0" />
                      <p className="text-slate-300 text-sm">{action}</p>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-slate-500 text-sm">
                    No priority actions needed
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Positive Trends */}
          {analysis.positive_trends?.length > 0 && (
            <div className="card border-green-600/20 bg-green-950/10">
              <div className="card-header">
                <div className="card-title">
                  <CheckCircle className="w-4 h-4" aria-hidden="true" />
                  Positive Trends
                </div>
              </div>
              <div className="space-y-2 mt-1">
                {analysis.positive_trends.map((trend: string, i: number) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-green-400 text-sm mt-0.5">✓</span>
                    <p className="text-slate-300 text-sm">{trend}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {!analysis && !analyzeMutation.isPending && (
        <div className="card text-center py-12">
          <TrendingUp className="w-10 h-10 text-slate-600 mx-auto mb-3" aria-hidden="true" />
          <p className="text-slate-300 font-medium mb-1">No analysis yet</p>
          <p className="text-slate-500 text-sm">
            Select a production line and click "Run AI Analysis" to get Gemini-powered insights.
          </p>
        </div>
      )}
    </div>
  );
}
