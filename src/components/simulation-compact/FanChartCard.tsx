'use client'

import { useEffect, useMemo, useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import type { SimulationResults } from '@/types'
import { buildFanGeometry, FAN_H, FAN_W } from './fanGeometry'
import { formatAxisEuro } from './format'

interface FanChartCardProps {
  results: SimulationResults
  /** Which pre-computed series to draw; the switch lives in the command bar. */
  displayReal: boolean
  /** Chart height in px; 1b uses 250, the compare view 266. */
  height?: number
}

type ScaleMode = 'focus' | 'full'

/**
 * Compact Monte-Carlo fan with the analytical affordances of the pre-redesign
 * chart: an X-range zoom, reset, focus/full Y scaling, precise hover/touch
 * inspection and a data table. Keeping those controls inside the compact chart
 * prevents future visual redesigns from silently dropping analysis features.
 */
export function FanChartCard({ results, displayReal, height = 250 }: FanChartCardProps) {
  const t = useTranslations('simulationCompact.chart')
  const tAssets = useTranslations('assetsChart')
  const tSimulation = useTranslations('simulationChart')
  const format = useFormatter()
  const locale = useLocale()

  const percentiles =
    (displayReal ? results.assetPercentilesReal : undefined) ?? results.assetPercentiles
  const samples =
    (displayReal ? results.sampleAssetPathsReal : undefined) ?? results.sampleAssetPaths ?? []

  const maxIndex = Math.max(0, results.ages.length - 1)
  const [startIndex, setStartIndex] = useState(0)
  const [endIndex, setEndIndex] = useState(maxIndex)
  const [scaleMode, setScaleMode] = useState<ScaleMode>('focus')
  const [inspectIndex, setInspectIndex] = useState<number | null>(null)

  useEffect(() => {
    setStartIndex(0)
    setEndIndex(maxIndex)
    setInspectIndex(null)
  }, [maxIndex])

  const start = Math.max(0, Math.min(startIndex, maxIndex))
  const end = Math.max(start, Math.min(endIndex, maxIndex))
  const slice = (series: number[]) => series.slice(start, end + 1)
  const visibleAges = results.ages.slice(start, end + 1)
  const visiblePercentiles = {
    p10: slice(percentiles.p10),
    p20: slice(percentiles.p20),
    p50: slice(percentiles.p50),
    p80: slice(percentiles.p80),
    p90: slice(percentiles.p90),
  }
  const visibleSamples = samples.map(slice)

  const geometry = useMemo(() => {
    const scaleSeries =
      scaleMode === 'focus'
        ? [visiblePercentiles.p80, visiblePercentiles.p50]
        : [visiblePercentiles.p90, ...visibleSamples]
    return buildFanGeometry(visibleAges, scaleSeries)
  }, [visibleAges, visiblePercentiles.p50, visiblePercentiles.p80, visiblePercentiles.p90, visibleSamples, scaleMode])

  const { retirementAge, legalRetirementAge } = results.params
  const firstAge = visibleAges[0] ?? 0
  const lastAge = visibleAges[visibleAges.length - 1] ?? firstAge
  const markerAges = [retirementAge, legalRetirementAge].filter(
    (age) => age > firstAge && age < lastAge
  )
  const isZoomed = start > 0 || end < maxIndex

  const resetZoom = () => {
    setStartIndex(0)
    setEndIndex(maxIndex)
    setInspectIndex(null)
  }

  const handlePointer = (clientX: number, currentTarget: HTMLDivElement) => {
    if (visibleAges.length === 0) return
    const rect = currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)))
    setInspectIndex(Math.round(ratio * (visibleAges.length - 1)))
  }

  const inspected = inspectIndex == null ? null : {
    age: visibleAges[inspectIndex],
    p10: visiblePercentiles.p10[inspectIndex],
    p20: visiblePercentiles.p20[inspectIndex],
    p50: visiblePercentiles.p50[inspectIndex],
    p80: visiblePercentiles.p80[inspectIndex],
    p90: visiblePercentiles.p90[inspectIndex],
  }

  const formatCurrency = (value: number) =>
    format.number(value, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    })

  return (
    <div className="ds-card" style={{ padding: '12px 14px 10px' }} data-testid="fan-chart">
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
          marginBottom: 8,
        }}
      >
        <div
          role="group"
          aria-label={tAssets('scale.label')}
          style={{
            display: 'inline-flex',
            border: '1px solid var(--line-strong)',
            borderRadius: 'var(--radius-full)',
            overflow: 'hidden',
          }}
        >
          {(['focus', 'full'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              className="ds-btn ds-btn--sm"
              aria-pressed={scaleMode === mode}
              onClick={() => setScaleMode(mode)}
              style={{
                border: 0,
                borderRadius: 0,
                minHeight: 30,
                background: scaleMode === mode ? 'var(--accent)' : 'var(--surface)',
                color: scaleMode === mode ? '#fff' : 'var(--text-label)',
              }}
            >
              {tAssets(`scale.${mode}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ds-btn ds-btn--outline ds-btn--sm"
          onClick={resetZoom}
          disabled={!isZoomed}
          style={{ minHeight: 30 }}
        >
          {tAssets('reset')}
        </button>
        <span className="ds-meta" style={{ marginLeft: 'auto' }}>
          {format.number(firstAge)}–{format.number(lastAge)}
        </span>
      </div>

      <div
        style={{ position: 'relative', height, touchAction: 'pan-y' }}
        onPointerMove={(event) => handlePointer(event.clientX, event.currentTarget)}
        onPointerDown={(event) => handlePointer(event.clientX, event.currentTarget)}
        onPointerLeave={() => setInspectIndex(null)}
      >
        <svg
          viewBox={`0 0 ${FAN_W} ${FAN_H}`}
          preserveAspectRatio="none"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          aria-hidden="true"
        >
          {geometry.gridLines.map((grid) => (
            <line key={grid.value} x1={0} x2={FAN_W} y1={grid.y} y2={grid.y} stroke="var(--gray-200)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {markerAges.map((age) => (
            <line key={age} x1={geometry.ageX(age)} x2={geometry.ageX(age)} y1={0} y2={FAN_H} stroke="var(--gray-300)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
          ))}
          <path d={geometry.band(visiblePercentiles.p10, visiblePercentiles.p90)} fill="var(--viz-seq-1)" />
          <path d={geometry.band(visiblePercentiles.p20, visiblePercentiles.p80)} fill="var(--viz-seq-2)" />
          {visibleSamples.map((sample, index) => (
            <path key={index} d={geometry.line(sample)} fill="none" stroke="var(--gray-500)" strokeWidth={0.8} opacity={0.35} vectorEffect="non-scaling-stroke" />
          ))}
          <path d={geometry.line(visiblePercentiles.p50)} fill="none" stroke="var(--viz-seq-5)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
          {inspectIndex != null && (
            <line x1={geometry.x(inspectIndex)} x2={geometry.x(inspectIndex)} y1={0} y2={FAN_H} stroke="var(--text-label)" strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
        {geometry.gridLines.map((grid) => (
          <span key={grid.value} className="ds-meta" style={{ position: 'absolute', left: 4, top: grid.topPct, transform: 'translateY(-110%)', background: 'rgba(255,255,255,.78)', padding: '0 3px', borderRadius: 2 }}>
            {formatAxisEuro(grid.value, locale)}
          </span>
        ))}
        <div style={{ position: 'absolute', top: 4, right: 6, display: 'flex', gap: 10, alignItems: 'center', fontSize: 11, color: 'var(--text-label)', background: 'rgba(255,255,255,.86)', padding: '2px 6px', borderRadius: 'var(--radius)' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 7, background: 'var(--viz-seq-1)' }} />{t('bandOuter')}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 7, background: 'var(--viz-seq-2)' }} />{t('bandInner')}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 10, height: 2, background: 'var(--viz-seq-5)' }} />{t('median')}</span>
          <span style={{ borderLeft: '1px solid var(--line)', paddingLeft: 10, fontWeight: 600, color: 'var(--text)' }}>{displayReal ? t('real') : t('nominal')}</span>
        </div>
        {inspected && (
          <div style={{ position: 'absolute', left: geometry.x(inspectIndex ?? 0) / FAN_W < 0.68 ? `calc(${(geometry.x(inspectIndex ?? 0) / FAN_W) * 100}% + 10px)` : 'auto', right: geometry.x(inspectIndex ?? 0) / FAN_W >= 0.68 ? `calc(${100 - (geometry.x(inspectIndex ?? 0) / FAN_W) * 100}% + 10px)` : 'auto', bottom: 8, minWidth: 170, padding: '7px 9px', background: 'rgba(255,255,255,.96)', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', pointerEvents: 'none', zIndex: 2 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{tAssets('tooltip.label', { age: inspected.age })}</div>
            {(['p90', 'p80', 'p50', 'p20', 'p10'] as const).map((key) => (
              <div key={key} className="ds-meta" style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}>
                <span>{key === 'p50' ? tAssets('tooltip.median') : tAssets(`tooltip.${key}`)}</span>
                <strong style={{ color: 'var(--text)' }}>{formatCurrency(inspected[key])}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ position: 'relative', height: 14, marginTop: 2 }}>
        {geometry.axisTicks.map((tick) => (
          <span key={tick.age} className="ds-meta" style={{ position: 'absolute', left: tick.leftPct, transform: 'translateX(-50%)' }}>{format.number(tick.age)}</span>
        ))}
      </div>

      {maxIndex > 0 && (
        <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr', gap: 3 }}>
          <input
            type="range"
            min={0}
            max={maxIndex}
            value={start}
            aria-label={tAssets('aria.brush', { startAge: firstAge, endAge: lastAge })}
            onChange={(event) => setStartIndex(Math.min(Number(event.target.value), end - 1))}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
          <input
            type="range"
            min={0}
            max={maxIndex}
            value={end}
            aria-label={tAssets('aria.brush', { startAge: firstAge, endAge: lastAge })}
            onChange={(event) => setEndIndex(Math.max(Number(event.target.value), start + 1))}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
        </div>
      )}

      <details style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 650, color: 'var(--accent)' }}>
          {tSimulation('assetTable.toggle')}
        </summary>
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, fontVariantNumeric: 'tabular-nums' }}>
            <caption className="sr-only">{tSimulation('assetTable.caption')}</caption>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--line-strong)' }}>
                {['age', 'p10', 'p20', 'p50', 'p80', 'p90'].map((key) => (
                  <th key={key} style={{ padding: '6px 8px', textAlign: key === 'age' ? 'left' : 'right', whiteSpace: 'nowrap' }}>
                    {key === 'age' ? tSimulation('assetTable.headers.age') : key === 'p50' ? tSimulation('assetTable.headers.p50') : key.toUpperCase()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleAges.map((age, index) => (
                <tr key={age} style={{ borderBottom: '1px solid var(--line)' }}>
                  <td style={{ padding: '6px 8px' }}>{format.number(age)}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatCurrency(visiblePercentiles.p10[index])}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatCurrency(visiblePercentiles.p20[index])}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(visiblePercentiles.p50[index])}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatCurrency(visiblePercentiles.p80[index])}</td>
                  <td style={{ padding: '6px 8px', textAlign: 'right' }}>{formatCurrency(visiblePercentiles.p90[index])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
