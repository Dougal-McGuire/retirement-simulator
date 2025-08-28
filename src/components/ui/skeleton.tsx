import { cn } from "@/lib/utils"

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  shimmer?: boolean
}

function Skeleton({ className, shimmer = true, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        "rounded-md bg-gray-200 relative overflow-hidden",
        shimmer ? "animate-pulse" : "",
        className
      )}
      {...props}
    >
      {shimmer && (
        <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-white/60 to-transparent" />
      )}
    </div>
  )
}

// Chart skeleton loader with enhanced shimmer
function ChartSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("bg-white rounded-xl shadow-sm border border-gray-200/50 p-6", className)}>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-5 w-48 bg-gradient-to-r from-gray-200 to-gray-300" />
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse" />
            <Skeleton className="h-3 w-16 bg-gray-200" />
          </div>
        </div>
        <Skeleton className="h-4 w-3/4 bg-gray-200" />
        
        {/* Chart area with animated bars */}
        <div className="h-64 bg-gray-50 rounded-lg border border-gray-200/50 p-4 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-[shimmer_3s_infinite] -translate-x-full" />
          
          {/* Animated chart lines */}
          <div className="flex items-end justify-between h-full space-x-1">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className="flex flex-col justify-end space-y-1 flex-1">
                <Skeleton 
                  className="bg-gradient-to-t from-blue-200 to-blue-300 opacity-60" 
                  style={{ 
                    height: `${Math.random() * 60 + 20}%`,
                    animationDelay: `${i * 100}ms`
                  }} 
                />
                <Skeleton 
                  className="bg-gradient-to-t from-green-200 to-green-300 opacity-60" 
                  style={{ 
                    height: `${Math.random() * 80 + 40}%`,
                    animationDelay: `${i * 150}ms`
                  }} 
                />
                <Skeleton 
                  className="bg-gradient-to-t from-red-200 to-red-300 opacity-60" 
                  style={{ 
                    height: `${Math.random() * 40 + 10}%`,
                    animationDelay: `${i * 200}ms`
                  }} 
                />
              </div>
            ))}
          </div>
        </div>
        
        {/* Legend skeleton */}
        <div className="flex justify-center gap-6 p-4 bg-gray-50/50 rounded-lg border border-gray-200/50">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={`w-6 h-1 rounded-full bg-gradient-to-r ${
                i === 0 ? 'from-red-300 to-red-400' :
                i === 1 ? 'from-blue-300 to-blue-400' :
                'from-green-300 to-green-400'
              } animate-pulse`} style={{ animationDelay: `${i * 300}ms` }} />
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
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="space-y-2">
        <Skeleton className="h-12 w-24" />
        <Skeleton className="h-4 w-40" />
      </div>
      <div className="grid grid-cols-3 gap-4 mt-4">
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-20" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-20" />
        </div>
        <div className="space-y-2">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-6 w-20" />
        </div>
      </div>
    </div>
  )
}

// Progress indicator skeleton for setup wizard
function ProgressIndicatorSkeleton() {
  return (
    <div className="space-y-4">
      <div className="flex justify-between">
        <Skeleton className="h-4 w-20" />
        <Skeleton className="h-4 w-24" />
      </div>
      <Skeleton className="h-2 w-full rounded-full" />
      <div className="flex items-center justify-between">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center">
            <Skeleton className="h-10 w-10 rounded-full" />
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
    <div className="p-6 space-y-4 bg-white rounded-xl shadow-sm border border-gray-200/50">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-32 bg-gradient-to-r from-gray-200 to-gray-300" />
        <div className="w-8 h-8 bg-gray-200 rounded-full animate-pulse" />
      </div>
      
      <div className="space-y-3">
        <div className="flex items-center space-x-3">
          <Skeleton className="h-10 w-20 bg-gradient-to-r from-blue-200 to-blue-300" />
          <div className="w-6 h-6 bg-gradient-to-r from-blue-300 to-blue-400 rounded-full animate-pulse" />
        </div>
        <Skeleton className="h-4 w-40 bg-gray-200" />
        <div className="flex space-x-2">
          <Skeleton className="h-3 w-16 bg-gray-200" />
          <Skeleton className="h-3 w-20 bg-gray-200" />
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
  StatCardSkeleton
}