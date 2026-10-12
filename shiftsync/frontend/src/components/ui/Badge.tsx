import clsx from 'clsx';
import { Severity } from '../../types';

interface BadgeProps {
  severity?: Severity;
  label: string;
  dot?: boolean;
  className?: string;
}

const severityStyles: Record<Severity, string> = {
  critical: 'bg-red-500/20 text-red-400 border border-red-500/30',
  high: 'bg-orange-500/20 text-orange-400 border border-orange-500/30',
  medium: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30',
  low: 'bg-green-500/20 text-green-400 border border-green-500/30',
  info: 'bg-slate-500/20 text-slate-400 border border-slate-500/30',
};

const dotColors: Record<Severity, string> = {
  critical: 'bg-red-500 animate-pulse',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-green-500',
  info: 'bg-slate-500',
};

export default function Badge({ severity = 'info', label, dot = false, className }: BadgeProps) {
  return (
    <span className={clsx(
      'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium',
      severityStyles[severity],
      className
    )}>
      {dot && <span className={clsx('w-1.5 h-1.5 rounded-full', dotColors[severity])} />}
      {label}
    </span>
  );
}
