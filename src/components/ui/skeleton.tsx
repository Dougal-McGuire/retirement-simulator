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
      {shimmer && (
        <div className="pointer-events-none absolute inset-[-120%] animate-[shimmer_2s_linear_infinite] bg-[linear-gradient(120deg,transparent 0%,rgba(14,103,246,0.12) 40%,rgba(14,103,246,0.12) 60%,transparent 100%)]" />
      )}
    </div>
  )
}

// Chart skeleton loader with enhanced shimmer
function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('border-3 border-neo-black bg-neo-white shadow-neo p-6', className)}>
      <div className="space-y-7">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-48" />
          <div className="flex items-center gap-3">
            <div className="h-3 w-3 border-3 border-neo-black bg-neo-blue animate-pulse" />
            <Skeleton className="h-3 w-16" />
          </div>
        </div>
        <Skeleton className="h-4 w-3/4" />

        {/* Chart area with animated bars */}
        <div className="relative h-64 border-3 border-neo-black bg-neo-white p-4">
          <div className="absolute inset-[-150%] bg-[linear-gradient(115deg,transparent 0%,rgba(14,103,246,0.08) 45%,rgba(242,196,15,0.14) 55%,transparent 100%)] animate-[shimmer_3s_linear_infinite]" />

          {/* Animated chart lines */}
          <div className="relative flex h-full items-end justify-between gap-[6px]">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex flex-1 flex-col justify-end gap-[6px]">
                <Skeleton
                  style={{
                    height: `${Math.random() * 60 + 20}%`,
                    animationDelay: `${i * 100}ms`,
                  }}
                />
                <Skeleton
                  style={{
                    height: `${Math.random() * 80 + 40}%`,
                    animationDelay: `${i * 150}ms`,
                  }}
                />
                <Skeleton
                  style={{
                    height: `${Math.random() * 40 + 10}%`,
                    animationDelay: `${i * 200}ms`,
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Legend skeleton */}
        <div className="flex justify-center gap-4 border-3 border-neo-black bg-neo-white p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div
                className="h-3 w-3 border-3 border-neo-black animate-pulse"
                style={{
                  backgroundColor: i === 0 ? '#ff3b5c' : i === 1 ? '#0e67f6' : '#2ad576',
                  animationDelay: `${i * 220}ms`,
                }}
              />
              <Skeleton className="h-4 w-24" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// Success rate card skeleton
function SuccessRateCardSkeleton() {
  return (
    <div className="border-3 border-neo-black bg-neo-white p-6 shadow-neo">
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
        <div className="flex flex-col gap-3">
          <Skeleton className="h-12 w-28" />
          <Skeleton className="h-4 w-48" />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-5 w-16" />
              <Skeleton className="h-6 w-24" />
            </div>
          ))}
        </div>
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

export {
  Skeleton,
  ChartSkeleton,
  SuccessRateCardSkeleton,
  ProgressIndicatorSkeleton,
  StatCardSkeleton,
}
