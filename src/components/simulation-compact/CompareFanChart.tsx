'use client'

import { useEffect, useMemo, useState } from 'react'
import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { buildFanGeometry, FAN_H, FAN_W } from './fanGeometry'
import { formatAxisEuro } from './format'
import { clampChartRange, sliceChartRange, type ChartIndexRange } from '@/components/charts/chartRange'

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
  const [range, setRange] = useState<ChartIndexRange>({ startIndex: 0, endIndex: Math.max(0, length - 1) })
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
    const scaleSeries = scaleMode === 'focus'
      ? visible.map((entry) => entry.p50)
      : visible.map((entry) => entry.p80)
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

  return (
    <div className="ds-card" style={{ padding: '10px 12px 8px' }} data-testid="compare-fan-chart">
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
        <div role="group" aria-label={tAssets('scale.label')} style={{ display: 'inline-flex', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius-full)', overflow: 'hidden' }}>
          {(['focus', 'full'] as const).map((mode) => (
            <button key={mode} type="button" aria-pressed={scaleMode === mode} onClick={() => setScaleMode(mode)} className="ds-btn ds-btn--sm" style={{ border: 0, borderRadius: 0, minHeight: 30, background: scaleMode === mode ? 'var(--accent)' : 'var(--surface)', color: scaleMode === mode ? '#fff' : 'var(--text-label)' }}>
              {tAssets(`scale.${mode}`)}
            </button>
          ))}
        </div>
        <button type="button" className="ds-btn ds-btn--outline ds-btn--sm" onClick={() => setRange({ startIndex: 0, endIndex: Math.max(0, length - 1) })} disabled={!isZoomed}>
          {tAssets('reset')}
        </button>
        <span className="ds-meta" style={{ marginLeft: 'auto' }}>{firstAge}–{lastAge}</span>
      </div>

      <div
        style={{ position: 'relative', height: 266, touchAction: 'pan-y' }}
        onPointerMove={(event) => handlePointer(event.clientX, event.currentTarget)}
        onPointerDown={(event) => handlePointer(event.clientX, event.currentTarget)}
        onPointerLeave={() => setInspectIndex(null)}
      >
        <svg viewBox={`0 0 ${FAN_W} ${FAN_H}`} preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
          {geometry.gridLines.map((grid) => <line key={grid.value} x1={0} x2={FAN_W} y1={grid.y} y2={grid.y} stroke="var(--gray-200)" strokeWidth={1} vectorEffect="non-scaling-stroke" />)}
          {visible.map((entry) => (
            <g key={entry.id}>
              {entry.retirementAge > firstAge && entry.retirementAge < lastAge && <line x1={geometry.ageX(entry.retirementAge)} x2={geometry.ageX(entry.retirementAge)} y1={0} y2={FAN_H} stroke={entry.color} strokeWidth={1} strokeDasharray="3 3" opacity={entry.base ? 0.45 : 0.3} vectorEffect="non-scaling-stroke" />}
              <path d={geometry.band(entry.p20, entry.p80)} fill={entry.color} opacity={entry.base ? 0.18 : 0.1} />
              <path d={geometry.line(entry.p50)} fill="none" stroke={entry.color} strokeWidth={2} strokeDasharray={entry.base ? undefined : '6 4'} vectorEffect="non-scaling-stroke" />
            </g>
          ))}
          {inspectIndex != null && <line x1={geometry.x(inspectIndex)} x2={geometry.x(inspectIndex)} y1={0} y2={FAN_H} stroke="var(--text-label)" strokeWidth={1} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" />}
        </svg>
        {geometry.gridLines.map((grid) => <span key={grid.value} className="ds-meta" style={{ position: 'absolute', left: 4, top: grid.topPct, transform: 'translateY(-110%)', background: 'rgba(255,255,255,.78)', padding: '0 3px', borderRadius: 2 }}>{formatAxisEuro(grid.value, locale)}</span>)}
        <div style={{ position: 'absolute', top: 4, right: 6, display: 'flex', gap: 10, flexWrap: 'wrap', fontSize: 11, background: 'rgba(255,255,255,.88)', padding: '2px 6px', borderRadius: 'var(--radius)' }}>
          {visible.map((entry) => <span key={entry.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 12, borderTop: `${entry.base ? '2px solid' : '2px dashed'} ${entry.color}` }} />{entry.name}</span>)}
        </div>
        {inspectIndex != null && (
          <div style={{ position: 'absolute', left: geometry.x(inspectIndex) / FAN_W < 0.68 ? `calc(${(geometry.x(inspectIndex) / FAN_W) * 100}% + 10px)` : 'auto', right: geometry.x(inspectIndex) / FAN_W >= 0.68 ? `calc(${100 - (geometry.x(inspectIndex) / FAN_W) * 100}% + 10px)` : 'auto', bottom: 8, minWidth: 190, padding: '7px 9px', background: 'rgba(255,255,255,.96)', border: '1px solid var(--line-strong)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow-sm)', pointerEvents: 'none', zIndex: 2 }}>
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{tUi('ageLabel', { age: visibleBase.ages[inspectIndex] })}</div>
            {visible.map((entry) => <div key={entry.id} className="ds-meta" style={{ display: 'flex', justifyContent: 'space-between', gap: 14 }}><span>{entry.name}</span><strong style={{ color: entry.color }}>{euro(entry.p50[inspectIndex])}</strong></div>)}
          </div>
        )}
      </div>
      <div style={{ position: 'relative', height: 14, marginTop: 2 }}>{geometry.axisTicks.map((tick) => <span key={tick.age} className="ds-meta" style={{ position: 'absolute', left: tick.leftPct, transform: 'translateX(-50%)' }}>{tick.age}</span>)}</div>

      {length > 1 && <div style={{ marginTop: 8, display: 'grid', gap: 3 }}>
        <input type="range" min={0} max={length - 1} value={safeRange.startIndex} aria-label={tAssets('aria.brush', { startAge: firstAge, endAge: lastAge })} onChange={(event) => setRange({ startIndex: Math.min(Number(event.target.value), safeRange.endIndex), endIndex: safeRange.endIndex })} style={{ width: '100%', accentColor: 'var(--accent)' }} />
        <input type="range" min={0} max={length - 1} value={safeRange.endIndex} aria-label={tAssets('aria.brush', { startAge: firstAge, endAge: lastAge })} onChange={(event) => setRange({ startIndex: safeRange.startIndex, endIndex: Math.max(Number(event.target.value), safeRange.startIndex) })} style={{ width: '100%', accentColor: 'var(--accent)' }} />
      </div>}

      <details style={{ marginTop: 8, borderTop: '1px solid var(--line)', paddingTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 650, color: 'var(--accent)' }}>{tTable('toggle')}</summary>
        <div style={{ overflowX: 'auto', marginTop: 8 }}>
          <table className="ds-table" style={{ width: '100%' }}>
            <thead><tr><th>{tUi('age')}</th>{visible.map((entry) => <th key={entry.id} className="ds-num">{entry.name} · P50</th>)}</tr></thead>
            <tbody>{visibleBase.ages.map((age, index) => <tr key={age}><td>{age}</td>{visible.map((entry) => <td key={entry.id} className="ds-num">{euro(entry.p50[index])}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
