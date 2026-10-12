import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import {
  TrendingUp, Sparkles, AlertTriangle, CheckCircle,
  Zap, BarChart2, Loader2
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell
} from 'recharts';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import { aiApi } from '../services/api';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Button from '../components/ui/Button';

const LINES = ['Line-A', 'Line-B', 'Line-C'];

const WEEKLY_OEE = [
  { day: 'Mon', lineA: 84, lineB: 78, lineC: 91 },
  { day: 'Tue', lineA: 87, lineB: 81, lineC: 88 },
  { day: 'Wed', lineA: 82, lineB: 74, lineC: 92 },
  { day: 'Thu', lineA: 89, lineB: 83, lineC: 90 },
  { day: 'Fri', lineA: 85, lineB: 79, lineC: 87 },
  { day: 'Sat', lineA: 91, lineB: 85, lineC: 93 },
  { day: 'Sun', lineA: 88, lineB: 80, lineC: 89 },
];

const ISSUE_BREAKDOWN = [
  { category: 'Machine', count: 12, fill: '#ef4444' },
  { category: 'Quality', count: 8, fill: '#f97316' },
  { category: 'Maintenance', count: 15, fill: '#3b82f6' },
  { category: 'Material', count: 6, fill: '#eab308' },
  { category: 'Safety', count: 2, fill: '#8b5cf6' },
  { category: 'Production', count: 9, fill: '#22c55e' },
];

export default function AnalyticsPage() {
  const [selectedLine, setSelectedLine] = useState('Line-A');
  const [analysis, setAnalysis] = useState<any>(null);

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
          <p className="text-slate-400 text-sm">AI-powered operational insights across production lines</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={selectedLine}
            onChange={e => setSelectedLine(e.target.value)}
            className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="Select production line for analysis"
          >
            {LINES.map(l => <option key={l}>{l}</option>)}
          </select>
          <Button
            onClick={() => analyzeMutation.mutate()}
            loading={analyzeMutation.isPending}
            icon={<Sparkles className="w-4 h-4" aria-hidden="true" />}
          >
            Run AI Analysis
          </Button>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle icon={TrendingUp}>Weekly OEE by Line</CardTitle>
            <span className="text-xs text-slate-500">Target: ≥85%</span>
          </CardHeader>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={WEEKLY_OEE} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="day" tick={{ fill: '#64748b', fontSize: 11 }} />
              <YAxis domain={[60, 100]} tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
                itemStyle={{ fontSize: 11 }}
              />
              <Legend wrapperStyle={{ fontSize: '11px', color: '#64748b' }} />
              <Line type="monotone" dataKey="lineA" stroke="#3b82f6" strokeWidth={2} dot={false} name="Line A" />
              <Line type="monotone" dataKey="lineB" stroke="#f97316" strokeWidth={2} dot={false} name="Line B" />
              <Line type="monotone" dataKey="lineC" stroke="#22c55e" strokeWidth={2} dot={false} name="Line C" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle icon={BarChart2}>Issue Categories — 7 Days</CardTitle>
          </CardHeader>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={ISSUE_BREAKDOWN} margin={{ top: 5, right: 5, bottom: 0, left: -20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="category" tick={{ fill: '#64748b', fontSize: 10 }} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155', borderRadius: '8px' }}
              />
              <Bar dataKey="count" name="Issues" radius={[3, 3, 0, 0]}>
                {ISSUE_BREAKDOWN.map((entry, index) => (
                  <Cell key={index} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* AI Generating */}
      {analyzeMutation.isPending && (
        <Card className="border-blue-600/30 bg-blue-950/10">
          <div className="flex items-center gap-3 py-4">
            <Loader2 className="w-5 h-5 text-blue-400 animate-spin flex-shrink-0" aria-hidden="true" />
            <div>
              <p className="text-blue-400 text-sm font-medium">
                Gemini AI analyzing 7-day trends for {selectedLine}...
              </p>
              <p className="text-slate-500 text-xs mt-0.5">
                Identifying patterns, recurring issues, and improvement opportunities
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* AI Analysis Results */}
      {analysis && (
        <div className="space-y-4 animate-slide-up" role="region" aria-label="AI trend analysis results">
          {/* Trend narrative */}
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader>
              <CardTitle icon={Sparkles}>AI Trend Analysis — {selectedLine}</CardTitle>
              <span className={clsx(
                'text-xs font-medium px-2 py-0.5 rounded-full',
                analysis.oee_trend === 'improving' ? 'bg-green-500/20 text-green-400' :
                analysis.oee_trend === 'declining' ? 'bg-red-500/20 text-red-400' :
                'bg-yellow-500/20 text-yellow-400'
              )}>
                OEE: {(analysis.oee_trend || 'unknown').toUpperCase()}
              </span>
            </CardHeader>
            <p className="text-slate-300 text-sm leading-relaxed">{analysis.trend_analysis}</p>
          </Card>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Recurring Issues */}
            {analysis.top_recurring_issues?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle icon={AlertTriangle}>Top Recurring Issues</CardTitle>
                </CardHeader>
                <div className="space-y-2 mt-1" role="list">
                  {analysis.top_recurring_issues.map((issue: any, i: number) => (
                    <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-700/50 last:border-0" role="listitem">
                      <div className="w-6 h-6 bg-orange-500/10 rounded-full flex items-center justify-center flex-shrink-0" aria-hidden="true">
                        <span className="text-orange-400 text-xs font-bold">{i + 1}</span>
                      </div>
                      <div>
                        <p className="text-slate-200 text-sm">{issue.issue}</p>
                        <p className="text-slate-500 text-xs mt-0.5">{issue.frequency} · Impact: {issue.impact}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Priority Actions */}
            {analysis.priority_actions?.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle icon={Zap}>Priority Actions</CardTitle>
                </CardHeader>
                <div className="space-y-2 mt-1" role="list" aria-label="Priority actions">
                  {analysis.priority_actions.map((action: string, i: number) => (
                    <div key={i} className="flex items-start gap-2 py-1.5" role="listitem">
                      <CheckCircle className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
                      <p className="text-slate-300 text-sm">{action}</p>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>

          {/* Positive Trends */}
          {analysis.positive_trends?.length > 0 && (
            <Card className="border-green-600/20 bg-green-950/10">
              <CardHeader>
                <CardTitle icon={CheckCircle}>Positive Trends</CardTitle>
              </CardHeader>
              <div className="space-y-1 mt-1" role="list">
                {analysis.positive_trends.map((trend: string, i: number) => (
                  <div key={i} className="flex items-start gap-2" role="listitem">
                    <span className="text-green-400 text-sm mt-0.5">✓</span>
                    <p className="text-slate-300 text-sm">{trend}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Risk Areas */}
          {analysis.risk_areas?.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle icon={AlertTriangle}>Risk Areas to Watch</CardTitle>
              </CardHeader>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-1" role="list">
                {analysis.risk_areas.map((risk: any, i: number) => (
                  <div key={i} className="bg-red-950/20 border border-red-600/20 rounded-xl p-3" role="listitem">
                    <p className="text-slate-200 text-sm font-medium mb-1">{risk.area}</p>
                    <p className="text-slate-400 text-xs mb-2">{risk.evidence}</p>
                    <p className="text-blue-400 text-xs">→ {risk.recommended_action}</p>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Empty state */}
      {!analysis && !analyzeMutation.isPending && (
        <Card className="text-center py-12">
          <TrendingUp className="w-10 h-10 text-slate-600 mx-auto mb-3" aria-hidden="true" />
          <p className="text-slate-300 font-medium mb-1">No analysis yet</p>
          <p className="text-slate-500 text-sm">
            Select a production line and click "Run AI Analysis" to get Gemini-powered insights.
          </p>
        </Card>
      )}
    </div>
  );
}
