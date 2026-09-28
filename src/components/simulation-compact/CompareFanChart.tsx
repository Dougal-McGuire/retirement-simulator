'use client'

import { useEffect, useMemo, useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { buildFanGeometry, FAN_H, FAN_W } from './fanGeometry'
import { formatAxisEuro } from './format'
import {
  clampChartRange,
  sliceChartRange,
  type ChartIndexRange,
} from '@/components/charts/chartRange'

export interface CompareFanSeries {
  id: string
  name: string
  ages: number[]
  p20: number[]
  p50: number[]
  p80: number[]
  retirementAge: number
  color: string
  base?: boolean
}

interface CompareFanChartProps {
  series: CompareFanSeries[]
}

type ScaleMode = 'focus' | 'full'

export function CompareFanChart({ series }: CompareFanChartProps) {
  const tAssets = useTranslations('assetsChart')
  const tTable = useTranslations('simulationChart.assetTable')
  const tUi = useTranslations('ui')
  const format = useFormatter()
  const locale = useLocale()
  const base = series.find((entry) => entry.base) ?? series[0]
  const length = base?.ages.length ?? 0
  const [range, setRange] = useState<ChartIndexRange>({
    startIndex: 0,
    endIndex: Math.max(0, length - 1),
  })
  const [scaleMode, setScaleMode] = useState<ScaleMode>('focus')
  const [inspectIndex, setInspectIndex] = useState<number | null>(null)

  useEffect(() => {
    setRange({ startIndex: 0, endIndex: Math.max(0, length - 1) })
    setInspectIndex(null)
  }, [length])

  const safeRange = clampChartRange(range, length)
  const visible = useMemo(
    () =>
      series.map((entry) => ({
        ...entry,
        ages: sliceChartRange(entry.ages, safeRange),
        p20: sliceChartRange(entry.p20, safeRange),
        p50: sliceChartRange(entry.p50, safeRange),
        p80: sliceChartRange(entry.p80, safeRange),
      })),
    [series, safeRange.startIndex, safeRange.endIndex]
  )
  const visibleBase = visible.find((entry) => entry.base) ?? visible[0]

  const geometry = useMemo(() => {
    if (!visibleBase) return null
    const scaleSeries =
      scaleMode === 'focus' ? visible.map((entry) => entry.p50) : visible.map((entry) => entry.p80)
    return buildFanGeometry(visibleBase.ages, scaleSeries)
  }, [visible, visibleBase, scaleMode])

  if (!base || !visibleBase || !geometry) return null

  const isZoomed = safeRange.startIndex > 0 || safeRange.endIndex < length - 1
  const firstAge = visibleBase.ages[0] ?? 0
  const lastAge = visibleBase.ages[visibleBase.ages.length - 1] ?? firstAge

  const handlePointer = (clientX: number, target: HTMLDivElement) => {
    const rect = target.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)))
    setInspectIndex(Math.round(ratio * Math.max(0, visibleBase.ages.length - 1)))
  }

  const euro = (value: number) =>
    format.number(value, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

  const inspectX = inspectIndex == null ? 0 : geometry.x(inspectIndex) / FAN_W

  return (
    <div
      className="ds-card ws-fan"
      style={{ padding: '16px 16px 12px' }}
      data-testid="compare-fan-chart"
    >
      <div className="ws-chart-toolbar">
        <div role="group" aria-label={tAssets('scale.label')} className="ws-segmented">
          {(['focus', 'full'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={scaleMode === mode}
              onClick={() => setScaleMode(mode)}
            >
              {tAssets(`scale.${mode}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ws-chart-button"
          onClick={() => setRange({ startIndex: 0, endIndex: Math.max(0, length - 1) })}
          disabled={!isZoomed}
        >
          {tAssets('reset')}
        </button>
        <span className="ws-chart-meta">
          {firstAge}–{lastAge}
        </span>
      </div>

      <div
        className="ws-chart-plot"
        style={{ height: 266 }}
        onPointerMove={(event) => handlePointer(event.clientX, event.currentTarget)}
        onPointerDown={(event) => handlePointer(event.clientX, event.currentTarget)}
        onPointerLeave={() => setInspectIndex(null)}
      >
        <svg viewBox={`0 0 ${FAN_W} ${FAN_H}`} preserveAspectRatio="none" aria-hidden="true">
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
          {visible.map((entry, index) => (
            <g key={entry.id}>
              {entry.retirementAge > firstAge && entry.retirementAge < lastAge && (
                <line
                  x1={geometry.ageX(entry.retirementAge)}
                  x2={geometry.ageX(entry.retirementAge)}
                  y1={0}
                  y2={FAN_H}
                  stroke={entry.color}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                  opacity={entry.base ? 0.45 : 0.3}
                  vectorEffect="non-scaling-stroke"
                />
              )}
              <path
                d={geometry.band(entry.p20, entry.p80)}
                fill={entry.color}
                opacity={entry.base ? 0.18 : 0.1}
              />
              <path
                d={geometry.line(entry.p50)}
                fill="none"
                stroke={entry.color}
                strokeWidth={2}
                strokeDasharray={entry.base ? undefined : index === 1 ? '8 4' : '2 4'}
                vectorEffect="non-scaling-stroke"
              />
            </g>
          ))}
          {inspectIndex != null && (
            <line
              x1={geometry.x(inspectIndex)}
              x2={geometry.x(inspectIndex)}
              y1={0}
              y2={FAN_H}
              stroke="var(--text-label)"
              strokeWidth={1}
              strokeDasharray="2 3"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>
        {geometry.gridLines.map((grid) => (
          <span key={grid.value} className="ws-chart-ylabel" style={{ top: grid.topPct }}>
            {formatAxisEuro(grid.value, locale)}
          </span>
        ))}
        <div className="ws-chart-legend" style={{ color: 'var(--ui-text)' }}>
          {visible.map((entry, index) => (
            <span key={entry.id}>
              <span
                style={{
                  width: 14,
                  borderTop: `${entry.base ? '2px solid' : index === 1 ? '2px dashed' : '2px dotted'} ${entry.color}`,
                }}
              />
              {entry.name}
            </span>
          ))}
        </div>
        {inspectIndex != null && (
          <div
            className="ws-chart-tooltip"
            style={
              inspectX < 0.68
                ? { left: `calc(${inspectX * 100}% + 10px)`, minWidth: 190 }
                : { right: `calc(${100 - inspectX * 100}% + 10px)`, minWidth: 190 }
            }
          >
            <div>{tUi('ageLabel', { age: visibleBase.ages[inspectIndex] })}</div>
            {visible.map((entry) => (
              <div key={entry.id}>
                <span>{entry.name}</span>
                <strong style={{ color: entry.color }}>{euro(entry.p50[inspectIndex])}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="ws-chart-axis" aria-hidden="true">
        {geometry.axisTicks.map((tick) => (
          <span key={tick.age} style={{ left: tick.leftPct }}>
            {tick.age}
          </span>
        ))}
      </div>

      {length > 1 && (
        <div className="ws-chart-brush">
          <input
            type="range"
            min={0}
            max={length - 1}
            value={safeRange.startIndex}
            aria-label={tAssets('aria.brush', { startAge: firstAge, endAge: lastAge })}
            onChange={(event) =>
              setRange({
                startIndex: Math.min(Number(event.target.value), safeRange.endIndex),
                endIndex: safeRange.endIndex,
              })
            }
          />
          <input
            type="range"
            min={0}
            max={length - 1}
            value={safeRange.endIndex}
            aria-label={tAssets('aria.brush', { startAge: firstAge, endAge: lastAge })}
            onChange={(event) =>
              setRange({
                startIndex: safeRange.startIndex,
                endIndex: Math.max(Number(event.target.value), safeRange.startIndex),
              })
            }
          />
        </div>
      )}

      <details className="ws-chart-details">
        <summary>{tTable('toggle')}</summary>
        <div className="ws-chart-table">
          <table>
            <thead>
              <tr>
                <th>{tUi('age')}</th>
                {visible.map((entry) => (
                  <th key={entry.id} className="ds-num">
                    {entry.name} · P50
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleBase.ages.map((age, index) => (
                <tr key={age}>
                  <td>{age}</td>
                  {visible.map((entry) => (
                    <td key={entry.id} className="ds-num">
                      {euro(entry.p50[index])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
