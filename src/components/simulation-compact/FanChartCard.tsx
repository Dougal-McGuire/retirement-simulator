'use client'

import { useMemo } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import type { SimulationResults } from '@/types'
import { buildFanGeometry, FAN_H, FAN_W } from './fanGeometry'
import { formatAxisEuro } from './format'

interface FanChartCardProps {
  results: SimulationResults
  displayReal: boolean
  onDisplayRealChange: (real: boolean) => void
  /** Chart height in px; 1b uses 250, the compare view 266. */
  height?: number
}

/**
 * The Monte Carlo fan (design 1b): P10–90 and P20–80 bands, a handful of real
 * sample paths, the median, and dashed markers at retirement and pension age.
 * Pure SVG stretched to the card — no chart library, exactly the mockup's
 * geometry.
 */
export function FanChartCard({
  results,
  displayReal,
  onDisplayRealChange,
  height = 250,
}: FanChartCardProps) {
  const t = useTranslations('simulationCompact.chart')
  const format = useFormatter()
  const locale = useLocale()

  const percentiles =
    (displayReal ? results.assetPercentilesReal : undefined) ?? results.assetPercentiles
  const samples =
    (displayReal ? results.sampleAssetPathsReal : undefined) ?? results.sampleAssetPaths ?? []

  const geometry = useMemo(
    () => buildFanGeometry(results.ages, [percentiles.p90, ...samples]),
    [results.ages, percentiles, samples]
  )

  const { retirementAge, legalRetirementAge } = results.params
  const firstAge = results.ages[0] ?? 0
  const lastAge = results.ages[results.ages.length - 1] ?? firstAge

  const markerAges = [retirementAge, legalRetirementAge].filter(
    (age) => age > firstAge && age < lastAge
  )

  return (
    <div className="ds-card" style={{ padding: '10px 12px 6px' }} data-testid="fan-chart">
      <div style={{ position: 'relative', height }}>
        <svg
          viewBox={`0 0 ${FAN_W} ${FAN_H}`}
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          aria-hidden="true"
        >
          {geometry.gridLines.map((grid) => (
            <line
              key={grid.value}
              x1={0}
              x2={FAN_W}
              y1={grid.y}
              y2={grid.y}
              stroke="var(--gray-200)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          {markerAges.map((age) => (
            <line
              key={age}
              x1={geometry.ageX(age)}
              x2={geometry.ageX(age)}
              y1={0}
              y2={FAN_H}
              stroke="var(--gray-300)"
              strokeWidth={1}
              strokeDasharray="3 3"
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={geometry.band(percentiles.p10, percentiles.p90)} fill="var(--viz-seq-1)" />
          <path d={geometry.band(percentiles.p20, percentiles.p80)} fill="var(--viz-seq-2)" />
          {samples.map((sample, index) => (
            <path
              key={index}
              d={geometry.line(sample)}
              fill="none"
              stroke="var(--gray-500)"
              strokeWidth={0.8}
              opacity={0.35}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path
            d={geometry.line(percentiles.p50)}
            fill="none"
            stroke="var(--viz-seq-5)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        {geometry.gridLines.map((grid) => (
          <span
            key={grid.value}
            className="ds-meta"
            style={{
              position: 'absolute',
              left: 4,
              top: grid.topPct,
              transform: 'translateY(-110%)',
              background: 'rgba(255,255,255,.7)',
              padding: '0 3px',
              borderRadius: 2,
            }}
          >
            {formatAxisEuro(grid.value, locale)}
          </span>
        ))}
        <div
          style={{
            position: 'absolute',
            top: 4,
            right: 6,
            display: 'flex',
            gap: 10,
            alignItems: 'center',
            fontSize: 11,
            color: 'var(--text-label)',
            background: 'rgba(255,255,255,.8)',
            padding: '2px 6px',
            borderRadius: 'var(--radius)',
          }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 7, background: 'var(--viz-seq-1)' }} />
            {t('bandOuter')}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 7, background: 'var(--viz-seq-2)' }} />
            {t('bandInner')}
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 10, height: 2, background: 'var(--viz-seq-5)' }} />
            {t('median')}
          </span>
          <button
            type="button"
            onClick={() => onDisplayRealChange(false)}
            aria-pressed={!displayReal}
            style={{
              border: 0,
              borderLeft: '1px solid var(--line)',
              paddingLeft: 10,
              background: 'none',
              font: 'inherit',
              cursor: 'pointer',
              fontWeight: displayReal ? 400 : 600,
              color: displayReal ? 'var(--text-label)' : 'var(--text)',
            }}
          >
            {t('nominal')}
          </button>
          <button
            type="button"
            onClick={() => onDisplayRealChange(true)}
            aria-pressed={displayReal}
            style={{
              border: 0,
              padding: 0,
              background: 'none',
              font: 'inherit',
              cursor: 'pointer',
              fontWeight: displayReal ? 600 : 400,
              color: displayReal ? 'var(--text)' : 'var(--text-label)',
            }}
          >
            {t('real')}
          </button>
        </div>
      </div>
      <div style={{ position: 'relative', height: 14, marginTop: 2 }}>
        {geometry.axisTicks.map((tick) => (
          <span
            key={tick.age}
            className="ds-meta"
            style={{ position: 'absolute', left: tick.leftPct, transform: 'translateX(-50%)' }}
          >
            {format.number(tick.age)}
          </span>
        ))}
      </div>
    </div>
  )
}
