'use client'

import { memo, useMemo } from 'react'
import type { SimulationResults } from '@/types'
import { useHeldPeak } from './FanChartCard'
import { buildFanGeometry, FAN_H, FAN_W, seriesPeak } from './fanGeometry'

interface MiniFanChartProps {
  results: SimulationResults
  displayReal: boolean
  /** The saved plan's result while the plan is dirty: its median, dashed. */
  ghost?: SimulationResults | null
  /** Keep the value axis still while the plan is dirty (as the head's chart does). */
  holdScale?: boolean
}

const percentilesOf = (results: SimulationResults, displayReal: boolean) =>
  (displayReal ? results.assetPercentilesReal : undefined) ?? results.assetPercentiles

/**
 * The dock's picture: the head's fan at 240×64 — median, outer band, the
 * saved plan's median as a dashed ghost and a tick at the retirement start.
 * It shows direction, not detail; no axis, no labels, no interaction of its
 * own (the dock wraps it in the button that scrolls back to the head).
 */
export const MiniFanChart = memo(function MiniFanChart({
  results,
  displayReal,
  ghost = null,
  holdScale = false,
}: MiniFanChartProps) {
  const percentiles = percentilesOf(results, displayReal)
  const ghostPercentiles = ghost ? percentilesOf(ghost, displayReal) : null
  const needed = useMemo(
    () =>
      seriesPeak([
        percentiles.p80,
        percentiles.p50,
        ...(ghostPercentiles ? [ghostPercentiles.p50] : []),
      ]),
    [percentiles, ghostPercentiles]
  )
  const peak = useHeldPeak(needed, holdScale, displayReal ? 'real' : 'nominal')
  const geometry = useMemo(
    () => buildFanGeometry(results.ages, [], { minPeak: peak }),
    [results.ages, peak]
  )
  const { retirementAge } = results.params
  const firstAge = results.ages[0] ?? 0
  const lastAge = results.ages[results.ages.length - 1] ?? firstAge
  return (
    <svg
      className="ws-mini-fan"
      viewBox={`0 0 ${FAN_W} ${FAN_H}`}
      preserveAspectRatio="none"
      aria-hidden="true"
      data-testid="mini-fan"
      data-ghost={ghost ? 'true' : undefined}
    >
      <path d={geometry.band(percentiles.p10, percentiles.p90)} fill="var(--viz-seq-2)" />
      {retirementAge > firstAge && retirementAge < lastAge && (
        <line
          x1={geometry.ageX(retirementAge)}
          x2={geometry.ageX(retirementAge)}
          y1={0}
          y2={FAN_H}
          stroke="var(--viz-seq-5)"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      )}
      {ghost && ghostPercentiles && (
        <path
          d={geometry.lineByAge(ghost.ages, ghostPercentiles.p50)}
          fill="none"
          stroke="var(--viz-ghost)"
          strokeWidth={1.5}
          strokeDasharray="5 4"
          vectorEffect="non-scaling-stroke"
        />
      )}
      <path
        d={geometry.line(percentiles.p50)}
        fill="none"
        stroke="var(--viz-seq-5)"
        strokeWidth={2}
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
})
