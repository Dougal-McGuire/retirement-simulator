'use client'

import { useMemo } from 'react'
import type { SimulationParams } from '@/types'
import { buildEquityGlidePath } from '@/lib/simulation/engine'
import { cn } from '@/lib/utils'

interface EquityGlideSparklineProps {
  params: SimulationParams
  /** Accessible name; also used as the SVG title. */
  label: string
  /** Rendered under the chart, e.g. "80% at 55 → 40% from 60". */
  caption?: string
  className?: string
}

const WIDTH = 240
const HEIGHT = 48

/**
 * Equity share by age, as a two-tone area: the plan's whole horizon in one
 * 240×48 strip. It exists because "start 80%, end 40%" is a pair of numbers
 * until you can see *when* the slide happens — the shape makes the plateau
 * after retirement, and the fact that the slide is over before drawdown even
 * starts, obvious at a glance.
 */
export function EquityGlideSparkline({
  params,
  label,
  caption,
  className,
}: EquityGlideSparklineProps) {
  const { linePath, areaPath, retirementX, points } = useMemo(() => {
    const yearCount = Math.max(2, params.endAge - params.currentAge + 1)
    const weights = buildEquityGlidePath(params, yearCount)
    const x = (index: number) => (index / (yearCount - 1)) * WIDTH
    // Fixed 0–100% scale: a glide from 80 to 40 must look like a descent, not
    // like a full-height cliff auto-scaled to its own range.
    const y = (weight: number) => HEIGHT - weight * HEIGHT

    const coords = weights.map((weight, index) => [x(index), y(weight)] as const)
    const line = coords
      .map(([px, py], index) => `${index === 0 ? 'M' : 'L'}${px.toFixed(2)} ${py.toFixed(2)}`)
      .join(' ')

    const retirementIndex = Math.min(
      yearCount - 1,
      Math.max(0, params.retirementAge - params.currentAge)
    )

    return {
      points: coords,
      linePath: line,
      areaPath: `${line} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z`,
      retirementX: x(retirementIndex),
    }
  }, [params])

  return (
    <figure className={cn('m-0 space-y-1', className)} data-testid="equity-glide-sparkline">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="img"
        aria-label={label}
        preserveAspectRatio="none"
        className="rounded-sm h-12 w-full border-2 border-border bg-white"
      >
        <title>{label}</title>
        {/* Half-way reference: the fixed 0-100% scale is only readable with one. */}
        <line
          x1={0}
          y1={HEIGHT / 2}
          x2={WIDTH}
          y2={HEIGHT / 2}
          className="stroke-ink/20"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
        <path d={areaPath} className="fill-accent/25" />
        <path
          d={linePath}
          fill="none"
          className="stroke-accent"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        {/* Retirement: where the slide stops and the allocation is held. */}
        <line
          x1={retirementX}
          y1={0}
          x2={retirementX}
          y2={HEIGHT}
          className="stroke-ink/50"
          strokeWidth={1}
          strokeDasharray="3 3"
          vectorEffect="non-scaling-stroke"
        />
        <circle
          cx={points[0]?.[0] ?? 0}
          cy={points[0]?.[1] ?? 0}
          r={2.5}
          className="fill-ink"
        />
      </svg>
      {caption && (
        <figcaption className="text-[0.58rem] font-semibold tabular-nums text-muted-foreground">
          {caption}
        </figcaption>
      )}
    </figure>
  )
}
