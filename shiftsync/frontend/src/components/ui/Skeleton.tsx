import { Fragment } from 'react';

/**
 * SkeletonLoader — Google-level placeholder UI for content that is loading.
 * Replaces blank spaces with animated shimmer placeholders so the app
 * feels fast and polished instead of empty/broken.
 */
export function SkeletonLoader({
  className = '',
  width = '100%',
  height = '16px',
  radius = '4px',
}: {
  className?: string;
  width?: string | number;
  height?: string | number;
  radius?: string | number;
}) {
  return (
    <div
      className={`
        animate-pulse bg-slate-700/40 rounded-${radius}
        ${className}
      `}
      style={{ width, height }}
      aria-label="Loading"
    />
  );
}

/**
 * SkeletonText — multiple lines of skeleton text for paragraphs/cards.
 */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <Fragment key={i}>
          <SkeletonLoader width={i === lines - 1 ? '60%' : '100%'} height="16px" radius="full" />
        </Fragment>
      ))}
    </div>
  );
}

/**
 * SkeletonCard — full card placeholder for dashboard/machine cards.
 */
export function SkeletonCard() {
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl p-6 animate-pulse">
      <div className="flex items-start justify-between mb-4">
        <SkeletonLoader width="40%" height="20px" />
        <SkeletonLoader width="20%" height="20px" radius="full" />
      </div>
      <div className="space-y-3">
        <SkeletonText lines={3} />
      </div>
    </div>
  );
}

/**
 * SkeletonList — list of skeleton items for feeds.
 */
export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 animate-pulse">
          <div className="flex items-start justify-between mb-2">
            <SkeletonLoader width="35%" height="14px" />
            <SkeletonLoader width="15%" height="14px" radius="full" />
          </div>
          <SkeletonText lines={2} />
        </div>
      ))}
    </div>
  );
}
