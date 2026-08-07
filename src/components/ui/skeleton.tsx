import { cn } from '@/lib/utils'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shimmer?: boolean
}

function Skeleton({ className, shimmer = true, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-none border border-dashed border-neo-black/50 bg-neo-white/70 text-transparent',
        className
      )}
      {...props}
    >
      {shimmer && <div className="skeleton-sweep pointer-events-none absolute inset-[-120%]" />}
    </div>
  )
}

// Chart skeleton loader shaped like the percentile fan chart it stands in for
function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('border-3 border-neo-black bg-neo-white shadow-neo p-6', className)}>
      <div className="space-y-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1 space-y-2.5">
            <Skeleton className="h-5 w-56 max-w-full" />
            <Skeleton className="h-3.5 w-3/4" />
          </div>
          <Skeleton className="h-8 w-24 shrink-0" />
        </div>

        {/* Legend placeholder */}
        <div className="flex flex-wrap items-center gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2">
              <div
                className="h-3 w-4 animate-pulse rounded-[2px]"
                style={{
                  backgroundColor: `rgb(var(--neo-blue-rgb) / ${0.4 - i * 0.12})`,
                  animationDelay: `${i * 180}ms`,
                }}
              />
              <Skeleton className="h-3 w-20" shimmer={false} />
            </div>
          ))}
        </div>

        {/* Fan-shaped chart placeholder */}
        <div className="relative h-72 overflow-hidden border border-neo-black/15 bg-neo-white">
          <div className="skeleton-sweep skeleton-sweep-soft pointer-events-none absolute inset-[-150%]" />
          <svg
            viewBox="0 0 600 240"
            preserveAspectRatio="none"
            className="h-full w-full"
            aria-hidden="true"
          >
            {/* Outer band */}
            <path
              d="M0,208 C120,196 220,150 340,96 C430,58 530,36 600,28 L600,196 C530,192 430,192 340,196 C220,202 120,208 0,214 Z"
              fill="rgb(var(--neo-blue-rgb) / 0.08)"
            />
            {/* Inner band */}
            <path
              d="M0,208 C120,198 230,164 350,120 C440,88 540,70 600,64 L600,164 C540,166 440,172 350,180 C230,190 120,204 0,211 Z"
              fill="rgb(var(--neo-blue-rgb) / 0.14)"
            />
            {/* Median line */}
            <path
              d="M0,209 C120,201 240,178 360,150 C450,130 545,118 600,114"
              fill="none"
              stroke="rgb(var(--neo-blue-rgb) / 0.45)"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        </div>

        {/* Brush placeholder */}
        <Skeleton className="h-5 w-full" shimmer={false} />
      </div>
    </div>
  )
}

// Progress indicator skeleton for setup wizard
function ProgressIndicatorSkeleton() {
  return (
    <div className="space-y-3">
      <div className="flex justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-2 w-full" />
      <div className="flex items-center justify-between">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center">
            <Skeleton className="h-10 w-10" />
            {i < 4 && <Skeleton className="w-16 h-0.5 ml-2" />}
          </div>
        ))}
      </div>
    </div>
  )
}

// Statistics card skeleton with enhanced styling
function StatCardSkeleton() {
  return (
    <div className="space-y-4 border-3 border-neo-black bg-neo-white p-5 shadow-neo">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32" />
        <div className="h-8 w-8 border-3 border-neo-black bg-muted animate-pulse" />
      </div>

      <div className="space-y-3">
        <div className="flex items-center space-x-3">
          <Skeleton className="h-10 w-20" />
          <div className="h-6 w-6 border-3 border-neo-black bg-neo-blue/70 animate-pulse" />
        </div>
        <Skeleton className="h-4 w-40" />
        <div className="flex space-x-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
    </div>
  )
}

export { Skeleton, ChartSkeleton, ProgressIndicatorSkeleton, StatCardSkeleton }
