import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  FileText, Sparkles, ChevronDown, ChevronRight, AlertTriangle,
  CheckCircle, Clock, Shield, Package, Wrench, TrendingUp,
  Target, Download, Share2, ArrowRight, Star, Printer, RefreshCw
} from 'lucide-react';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import ReactMarkdown from 'react-markdown';
import { handoverApi, shiftsApi } from '../services/api';
import { useShiftStore } from '../store/shiftStore';
import Card, { CardHeader, CardTitle } from '../components/ui/Card';
import Badge from '../components/ui/Badge';
import Button from '../components/ui/Button';
import { SkeletonLoader, SkeletonText, SkeletonCard, SkeletonList } from '../components/ui/Skeleton';
import { HandoverReport, Severity } from '../types';
import clsx from 'clsx';

function ScoreGauge({ score, label }: { score: number; label: string }) {
  const color = score >= 80 ? 'text-green-400' : score >= 60 ? 'text-yellow-400' : 'text-red-400';
  const bgColor = score >= 80 ? 'stroke-green-500' : score >= 60 ? 'stroke-yellow-500' : 'stroke-red-500';
  const circumference = 2 * Math.PI * 28;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1">
      <div className="relative w-16 h-16" role="img" aria-label={`${label}: ${Math.round(score)}%`}>
        <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
          <circle cx="32" cy="32" r="28" fill="none" stroke="#1e293b" strokeWidth="6" />
          <circle cx="32" cy="32" r="28" fill="none" strokeWidth="6"
            strokeDasharray={circumference} strokeDashoffset={offset}
            className={`transition-all duration-700 ${bgColor}`} strokeLinecap="round" />
        </svg>
        <span className={clsx('absolute inset-0 flex items-center justify-center text-sm font-bold', color)}>
          {Math.round(score)}
        </span>
      </div>
      <p className="text-slate-400 text-xs text-center">{label}</p>
    </div>
  );
}

function CollapsibleSection({ title, icon: Icon, children, defaultOpen = false, badge }: {
  title: string; icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode; defaultOpen?: boolean; badge?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-700 rounded-xl overflow-hidden no-print">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-inset"
        aria-expanded={open}
      >
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-blue-400" aria-hidden="true" />
          <span className="text-slate-200 text-sm font-medium">{title}</span>
          {badge && <span className="bg-slate-700 text-slate-400 text-xs px-1.5 py-0.5 rounded">{badge}</span>}
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" aria-hidden="true" /> : <ChevronRight className="w-4 h-4 text-slate-400" aria-hidden="true" />}
      </button>
      {open && <div className="px-4 pb-4 pt-0">{children}</div>}
    </div>
  );
}

function HandoverSkeleton() {
  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-blue-950/40 to-slate-800 border-blue-600/30 rounded-xl p-6 animate-pulse">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center" />
            <div>
              <SkeletonLoader width="50%" height="20px" radius="full" />
              <SkeletonLoader width="80%" height="16px" className="mt-2" />
            </div>
          </div>
          <div className="text-right flex-shrink-0">
            <SkeletonLoader width="40%" height="24px" radius="full" />
            <div className="flex items-center gap-0.5 justify-end mt-2">
              {[1,2,3,4,5].map((_, i) => (
                <SkeletonLoader key={i} width="12" height="12" radius="full" />
              ))}
            </div>
          </div>
        </div>
      </div>

      <SkeletonCard />

      <div className="border-l-4 border-l-blue-500 bg-slate-800/30 rounded-lg p-4 animate-pulse">
        <SkeletonText lines={4} />
      </div>

      <div className="space-y-3">
        <SkeletonLoader width="100%" height="80px" radius="xl" />
        <SkeletonLoader width="100%" height="80px" radius="xl" />
        <SkeletonLoader width="60%" height="80px" radius="xl" />
      </div>

      <CollapsibleSection title="Action Items for Next Shift" icon={Target} defaultOpen>
        <SkeletonList count={4} />
      </CollapsibleSection>

      <CollapsibleSection title="Production Summary" icon={TrendingUp} defaultOpen>
        <SkeletonText lines={4} />
      </CollapsibleSection>
    </div>
  );
}

export default function HandoverPage() {
  const { activeShift } = useShiftStore();
  const [report, setReport] = useState<HandoverReport | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pollInterval, setPollInterval] = useState<ReturnType<typeof setInterval> | null>(null);

  const generateMutation = useMutation({
    mutationFn: (shiftId: string) => handoverApi.generate(shiftId),
    onSuccess: (response) => {
      setGenerating(false);
      const data = response.data;
      if (data.status === 'completed') {
        setReport(data.report);
        toast.success('Handover report generated by Gemini AI');
      } else {
        // Start polling
        startPolling(activeShift!.id);
        toast('Report is being generated by Gemini AI...', { icon: '⏳' });
      }
    },
    onError: () => {
      setGenerating(false);
      toast.error('Failed to start handover report generation');
    },
  });

  const statusQuery = useQuery({
    queryKey: ['handover-status', activeShift?.id],
    queryFn: () => handoverApi.getStatus(activeShift!.id),
    enabled: !!activeShift?.id && generating,
    refetchInterval: 3000,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    const response = statusQuery.data;
    const data = response?.data;
    if (data?.status === 'completed' && data?.report) {
      setReport(data.report);
      setGenerating(false);
      stopPolling();
      toast.success('Handover report ready');
    } else if (data?.status === 'failed') {
      setGenerating(false);
      stopPolling();
      toast.error('Report generation failed: ' + (data.error || 'Unknown error'));
    }
  }, [statusQuery.data]);

  function startPolling(shiftId: string) {
    setGenerating(true);
    // statusQuery refetchInterval handles polling automatically
  }

  function stopPolling() {
    setPollInterval(null);
  }

  const handleGenerate = () => {
    if (!activeShift) {
      toast.error('No active shift. Start a shift first.');
      return;
    }
    generateMutation.mutate(activeShift.id);
  };

  const handlePrint = () => {
    window.print();
  };

  const overallScore = report?.shift_performance_score || 0;
  const scoreColor = overallScore >= 80 ? 'text-green-400' : overallScore >= 60 ? 'text-yellow-400' : 'text-red-400';

  const hasReport = !!report;
  const isLoading = generating || statusQuery.isLoading;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between no-print">
        <div>
          <h1 className="text-xl font-bold text-white">AI Shift Handover</h1>
          <p className="text-slate-400 text-sm">
            Gemini 2.5 Flash generates structured briefings from all shift data
          </p>
        </div>
        <div className="flex items-center gap-3">
          {hasReport && (
            <>
              <Button
                onClick={handlePrint}
                variant="secondary"
                size="sm"
                icon={<Printer className="w-3.5 h-3.5" aria-hidden="true" />}
                className="no-print"
              >
                Print Report
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Download className="w-3.5 h-3.5" aria-hidden="true" />}
                className="no-print"
                onClick={() => {
                  const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `handover-${activeShift?.id}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}
              >
                Export JSON
              </Button>
            </>
          )}
          <Button
            onClick={handleGenerate}
            loading={isLoading}
            icon={<Sparkles className="w-4 h-4" aria-hidden="true" />}
            disabled={!activeShift || isLoading}
          >
            {isLoading ? 'Generating Report...' : 'Generate Handover Report'}
          </Button>
        </div>
      </div>

      {/* Generation status indicator */}
      {isLoading && !hasReport && (
        <Card className="border-blue-600/40 bg-blue-950/20 no-print">
          <div className="flex items-center gap-4 py-4">
            <div className="flex-shrink-0">
              <div className="w-10 h-10 rounded-full bg-blue-600/20 flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-blue-400 animate-pulse" aria-hidden="true" />
              </div>
            </div>
            <div>
              <p className="text-blue-400 font-medium text-sm">Gemini AI is analyzing your shift data...</p>
              <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                <span>Analyzing {activeShift?.log_count || 0} log entries</span>
                <span>·</span>
                <span>Assessing machine health</span>
                <span>·</span>
                <span>Generating recommendations</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-1 mt-3">
                <div className="bg-blue-500 h-1 rounded-full animate-pulse w-2/3" />
              </div>
              <p className="text-xs text-slate-500 mt-2">
                This may take 10–30 seconds. You can stay on this page.
              </p>
            </div>
          </div>
        </Card>
      )}

      {!hasReport && !isLoading && (
        <Card className="text-center py-16 no-print">
          <FileText className="w-12 h-12 text-slate-600 mx-auto mb-3" aria-hidden="true" />
          <h2 className="text-slate-300 font-semibold mb-2">No Handover Report Yet</h2>
          <p className="text-slate-500 text-sm mb-6 max-w-md mx-auto">
            Generate a comprehensive AI-powered shift handover report. Gemini 2.5 Flash will analyze all logs, machine data, and quality records to create a structured briefing for the incoming shift supervisor.
          </p>
          <Button
            onClick={handleGenerate}
            disabled={!activeShift}
            icon={<Sparkles className="w-4 h-4" aria-hidden="true" />}
            size="lg"
          >
            Generate Handover Report
          </Button>
          {!activeShift && (
            <p className="text-slate-500 text-xs mt-3">Start a shift first to generate a handover report</p>
          )}
        </Card>
      )}

      {/* Skeleton while generating */}
      {isLoading && !hasReport && (
        <HandoverSkeleton />
      )}

      {hasReport && (
        <div className="space-y-5 print-only" style={{ display: 'block' }}>
          {/* Non-print content hidden above, report content shown below */}
        </div>
      )}

      {hasReport && (
        <div className="space-y-5 no-print">
          {/* Report Header */}
          <Card className="bg-gradient-to-r from-blue-950/40 to-slate-800 border-blue-600/30">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0" aria-hidden="true">
                  <Sparkles className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-white font-bold text-base">AI Shift Handover Report</h2>
                  <p className="text-slate-400 text-sm mt-0.5">
                    Generated by Gemini 2.5 Flash · {format(new Date(report.generated_at), 'MMM d, yyyy HH:mm')}
                  </p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                    <span>{report.total_logs} logs analyzed</span>
                    <span>·</span>
                    <span>{report.critical_count} critical · {report.high_count} high severity</span>
                  </div>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-slate-400 text-xs mb-1">Overall Score</p>
                <p className={clsx('text-3xl font-bold', scoreColor)} aria-label={`Overall shift score: ${Math.round(overallScore)}%`}>
                  {Math.round(overallScore)}
                </p>
                <div className="flex items-center gap-0.5 justify-end mt-1">
                  {[1,2,3,4,5].map(i => (
                    <Star key={i} className={clsx('w-3 h-3', i <= Math.round(overallScore/20) ? 'text-yellow-400 fill-yellow-400' : 'text-slate-600')} aria-hidden="true" />
                  ))}
                </div>
              </div>
            </div>
          </Card>

          {/* Performance Scores */}
          {report.performance_breakdown && (
            <Card>
              <CardHeader>
                <CardTitle icon={TrendingUp}>Performance Breakdown</CardTitle>
              </CardHeader>
              <div className="flex items-center justify-around py-2" role="group" aria-label="Performance scores">
                <ScoreGauge score={report.performance_breakdown.safety_score} label="Safety" />
                <ScoreGauge score={report.performance_breakdown.quality_score} label="Quality" />
                <ScoreGauge score={report.performance_breakdown.production_score} label="Production" />
                <ScoreGauge score={report.performance_breakdown.maintenance_score} label="Maintenance" />
              </div>
            </Card>
          )}

          {/* Executive Summary */}
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader>
              <CardTitle icon={FileText}>Executive Summary</CardTitle>
              <span className="text-xs bg-blue-600/20 text-blue-400 px-2 py-0.5 rounded">AI Generated</span>
            </CardHeader>
            <p className="text-slate-300 text-sm leading-relaxed">{report.executive_summary}</p>
          </Card>

          {/* Critical Issues — always open */}
          {report.critical_issues?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-red-400 mb-2 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4" aria-hidden="true" />
                Critical Issues ({report.critical_issues.length})
              </h3>
              <div className="space-y-2" role="list" aria-label="Critical issues">
                {report.critical_issues.map((issue, i) => (
                  <div key={i} className="bg-red-950/20 border border-red-600/30 rounded-xl p-4" role="listitem">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <p className="text-slate-200 text-sm font-medium">{issue.issue}</p>
                        <p className="text-slate-400 text-xs mt-1">
                          <span className="font-medium">Impact:</span> {issue.impact}
                        </p>
                        <p className="text-orange-300 text-xs mt-1 flex items-center gap-1">
                          <ArrowRight className="w-3 h-3" aria-hidden="true" />
                          <span className="font-medium">Action Required:</span> {issue.action_required}
                        </p>
                      </div>
                      <Badge
                        label={issue.status.replace('_', ' ').toUpperCase()}
                        severity={issue.status === 'resolved' ? 'low' : issue.status === 'ongoing' ? 'critical' : 'high'}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Action Items */}
          <CollapsibleSection
            title="Action Items for Next Shift"
            icon={Target}
            defaultOpen={true}
            badge={`${report.action_items?.length || 0}`}
          >
            <div className="space-y-2 mt-3" role="list" aria-label="Action items">
              {report.action_items?.map((action) => (
                <div key={action.id} className="flex items-start gap-3 py-2.5 border-b border-slate-700/50 last:border-0" role="listitem">
                  <Badge severity={action.priority as Severity} label={action.priority.toUpperCase()} />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-200 text-sm">{action.description}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-slate-500">
                      <span className="capitalize">{action.category}</span>
                      {action.machine_id && <span>· {action.machine_id}</span>}
                      {action.estimated_duration && <span>· {action.estimated_duration}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* Production Summary */}
          <CollapsibleSection title="Production Summary" icon={TrendingUp} defaultOpen={true}>
            <p className="text-slate-300 text-sm leading-relaxed mt-3">{report.production_summary}</p>
          </CollapsibleSection>

          {/* Machine Health */}
          <CollapsibleSection title="Machine Health Overview" icon={TrendingUp}>
            <p className="text-slate-300 text-sm leading-relaxed mt-3">{report.machine_health_overview}</p>
          </CollapsibleSection>

          {/* Quality Incidents */}
          {report.quality_incidents?.length > 0 && (
            <CollapsibleSection
              title="Quality Incidents"
              icon={Shield}
              badge={`${report.quality_incidents.length}`}
            >
              <div className="space-y-3 mt-3" role="list" aria-label="Quality incidents">
                {report.quality_incidents.map((qi, i) => (
                  <div key={i} className="bg-slate-700/30 rounded-lg p-3" role="listitem">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <p className="text-slate-200 text-sm">{qi.description}</p>
                      <Badge severity={qi.severity as Severity} label={qi.severity} />
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span>Qty: {qi.quantity_affected}</span>
                      <span>Disposition: {qi.disposition}</span>
                    </div>
                    {qi.follow_up && (
                      <p className="text-blue-400 text-xs mt-1">
                        Follow-up: {qi.follow_up}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Safety Incidents */}
          {report.safety_incidents?.length > 0 && (
            <CollapsibleSection
              title="Safety Incidents"
              icon={Shield}
              badge={`${report.safety_incidents.length}`}
            >
              <div className="space-y-3 mt-3" role="list" aria-label="Safety incidents">
                {report.safety_incidents.map((si, i) => (
                  <div key={i} className="bg-red-950/20 border border-red-600/20 rounded-lg p-3" role="listitem">
                    <p className="text-slate-200 text-sm mb-1">{si.description}</p>
                    <p className="text-slate-300 text-xs">Action taken: {si.action_taken}</p>
                    {si.reporting_required && (
                      <p className="text-red-400 text-xs mt-1 font-medium">⚠ Formal reporting required</p>
                    )}
                  </div>
                ))}
              </div>
            </CollapsibleSection>
          )}

          {/* Maintenance */}
          <CollapsibleSection title="Maintenance Status" icon={Wrench}>
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <p className="text-green-400 text-xs font-medium mb-2 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" aria-hidden="true" /> Completed
                </p>
                {report.maintenance_completed?.length ? (
                  <ul className="space-y-1" aria-label="Maintenance completed">
                    {report.maintenance_completed.map((item, i) => (
                      <li key={i} className="text-slate-300 text-xs flex items-start gap-1.5">
                        <span className="text-green-500 mt-0.5">✓</span> {item}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-slate-500 text-xs">None</p>}
              </div>
              <div>
                <p className="text-orange-400 text-xs font-medium mb-2 flex items-center gap-1">
                  <Clock className="w-3 h-3" aria-hidden="true" /> Pending
                </p>
                {report.maintenance_pending?.length ? (
                  <ul className="space-y-1" aria-label="Maintenance pending">
                    {report.maintenance_pending.map((item, i) => (
                      <li key={i} className="text-slate-300 text-xs flex items-start gap-1.5">
                        <span className="text-orange-400 mt-0.5">→</span> {item}
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-slate-500 text-xs">None</p>}
              </div>
            </div>
          </CollapsibleSection>

          {/* Materials */}
          <CollapsibleSection title="Material Status" icon={Package}>
            <p className="text-slate-300 text-sm leading-relaxed mt-3">{report.material_status}</p>
          </CollapsibleSection>

          {/* Next Shift Recommendations */}
          <Card className="border-l-4 border-l-green-500 bg-green-950/10">
            <CardHeader>
              <CardTitle icon={Target}>Recommendations for Incoming Shift</CardTitle>
            </CardHeader>
            <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">
              {report.next_shift_recommendations}
            </p>
          </Card>
        </div>
      )}
    </div>
  );
}
