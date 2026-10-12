import clsx from 'clsx';
import { ReactNode } from 'react';

interface CardProps {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  onClick?: () => void;
  'aria-label'?: string;
}

export default function Card({ children, className, hover = false, onClick, 'aria-label': ariaLabel }: CardProps) {
  return (
    <div
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-label={ariaLabel}
      onClick={onClick}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
      className={clsx(
        'bg-slate-800 border border-slate-700 rounded-xl p-4',
        hover && 'cursor-pointer hover:border-blue-500/50 hover:bg-slate-800/80 transition-all duration-200',
        onClick && 'focus:outline-none focus:ring-2 focus:ring-blue-500',
        className
      )}
    >
      {children}
    </div>
  );
}

export function CardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={clsx('flex items-center justify-between mb-4', className)}>
      {children}
    </div>
  );
}

export function CardTitle({ children, icon: Icon }: { children: ReactNode; icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <h3 className="text-sm font-semibold text-slate-200 flex items-center gap-2">
      {Icon && <Icon className="w-4 h-4 text-blue-400" aria-hidden="true" />}
      {children}
    </h3>
  );
}
