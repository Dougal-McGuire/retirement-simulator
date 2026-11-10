'use client'

import { useEffect, useMemo, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Ellipsis } from 'lucide-react'
import type { SimulationResults } from '@/types'
import { Popover } from '@/components/workspace/Popover'
import { useMoney } from '@/lib/hooks/useMoney'
import {
  buildFanGeometry,
  FAN_H,
  FAN_W,
  GHOST_OUTLINE_OPACITY,
  seriesPeak,
  sliceByAge,
} from './fanGeometry'

interface FanChartCardProps {
  results: SimulationResults
  /** Which pre-computed series to draw; the switch lives in the bar. */
  displayReal: boolean
  /** Plot height in px. Without it the plot takes `--ws-fan-plot-h` from CSS. */
  height?: number
  /**
   * The saved plan's result while the plan has unsaved changes: drawn under
   * the draft as a dashed median and a thin outline of its outer band.
   */
  ghost?: SimulationResults | null
  /**
   * Keep the value axis where it is (the plan is dirty): the scale covers
   * the draft and the ghost and only ever grows, so an edit moves the fan,
   * not the axis. It re-fits when this turns false (save, discard).
   */
  holdScale?: boolean
}

type ScaleMode = 'focus' | 'full'

/**
 * The peak a held scale has seen. While `hold` is true the returned value
 * never shrinks; it grows (with some headroom, so the next small step fits
 * too) when the chart needs more, and starts over when `key` changes — a
 * different zoom, scale mode or € unit is a different axis.
 */
export function useHeldPeak(needed: number, hold: boolean, key: string): number {
  const [held, setHeld] = useState<{ key: string; peak: number } | null>(null)
  let next = held
  if (!hold) next = null
  else if (!held || held.key !== key) next = { key, peak: needed }
  else if (needed > held.peak) next = { key, peak: needed * 1.12 }
  // Derived state updated during render ("storing information from previous
  // renders"): the scale must be right in the frame that draws the new fan.
  if (next !== held) setHeld(next)
  return next ? next.peak : needed
}

const percentilesOf = (results: SimulationResults, displayReal: boolean) =>
  (displayReal ? results.assetPercentilesReal : undefined) ?? results.assetPercentiles

/**
 * The asset fan of the head: the band of 8 in 10 paths, the band of 6 in 10
 * and the median. While the plan is dirty the saved plan stays on the chart
 * as a ghost (dashed median, outline of its outer band), on a value axis that
 * holds still, so every edit shows the old and the new future. Markers name
 * the retirement start and the pension start on the age axis.
 *
 * Zoom, the value-axis scale and the table of the same numbers sit behind
 * one "⋯" menu; hover or touch inspects a year.
 */
export function FanChartCard({
  results,
  displayReal,
  height,
  ghost = null,
  holdScale = false,
}: FanChartCardProps) {
  const t = useTranslations('simulationCompact.chart')
  const tAssets = useTranslations('assetsChart')
  const tSimulation = useTranslations('simulationChart')
  const format = useFormatter()
  const money = useMoney()

  const percentiles = percentilesOf(results, displayReal)
  const ghostPercentiles = ghost ? percentilesOf(ghost, displayReal) : null

  const maxIndex = Math.max(0, results.ages.length - 1)
  const [startIndex, setStartIndex] = useState(0)
  const [endIndex, setEndIndex] = useState(maxIndex)
  const [scaleMode, setScaleMode] = useState<ScaleMode>('focus')
  const [inspectIndex, setInspectIndex] = useState<number | null>(null)
  const [tableOpen, setTableOpen] = useState(false)

  useEffect(() => {
    setStartIndex(0)
    setEndIndex(maxIndex)
    setInspectIndex(null)
  }, [maxIndex])

  const start = Math.max(0, Math.min(startIndex, maxIndex))
  const end = Math.max(start, Math.min(endIndex, maxIndex))
  const visibleAges = useMemo(() => results.ages.slice(start, end + 1), [results.ages, start, end])
  const visible = useMemo(() => {
    const slice = (series: number[]) => series.slice(start, end + 1)
    return {
      p10: slice(percentiles.p10),
      p20: slice(percentiles.p20),
      p50: slice(percentiles.p50),
      p80: slice(percentiles.p80),
      p90: slice(percentiles.p90),
    }
  }, [percentiles, start, end])

  const firstAge = visibleAges[0] ?? 0
  const lastAge = visibleAges[visibleAges.length - 1] ?? firstAge

  // What the value axis has to cover: the draft's upper band (or its 9-in-10
  // edge on the full scale) and the ghost's, cut to the ages on screen.
  const needed = useMemo(() => {
    const series: number[][] =
      scaleMode === 'focus' ? [visible.p80, visible.p50] : [visible.p90, visible.p50]
    if (ghost && ghostPercentiles) {
      const cut = (values: number[]) => sliceByAge(ghost.ages, values, firstAge, lastAge)
      series.push(cut(ghostPercentiles.p50))
      series.push(cut(scaleMode === 'focus' ? ghostPercentiles.p80 : ghostPercentiles.p90))
    }
    return seriesPeak(series)
  }, [visible, scaleMode, ghost, ghostPercentiles, firstAge, lastAge])
  const peak = useHeldPeak(
    needed,
    holdScale,
    `${start}:${end}:${scaleMode}:${displayReal ? 'real' : 'nominal'}`
  )
  const geometry = useMemo(
    () => buildFanGeometry(visibleAges, [], { minPeak: peak }),
    [visibleAges, peak]
  )

  const { retirementAge, legalRetirementAge } = results.params
  const inRange = (age: number) => age > firstAge && age < lastAge
  const savedRetirementAge =
    ghost && ghost.params.retirementAge !== retirementAge ? ghost.params.retirementAge : null
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

  /** The saved plan's median at an age of this chart, when it has that age. */
  const ghostMedianAt = (age: number): number | null => {
    if (!ghost || !ghostPercentiles) return null
    const index = ghost.ages.indexOf(age)
    return index === -1 ? null : (ghostPercentiles.p50[index] ?? null)
  }

  const inspected =
    inspectIndex == null
      ? null
      : {
          age: visibleAges[inspectIndex],
          p10: visible.p10[inspectIndex],
          p20: visible.p20[inspectIndex],
          p50: visible.p50[inspectIndex],
          p80: visible.p80[inspectIndex],
          p90: visible.p90[inspectIndex],
          saved: ghostMedianAt(visibleAges[inspectIndex]),
        }
  const inspectX = inspectIndex == null ? 0 : geometry.x(inspectIndex) / FAN_W

  return (
    <div className="ws-fan" data-testid="fan-chart" data-ghost={ghost ? 'true' : undefined}>
      <div className="ws-fan-head">
        <h3 id="result-assets-title" className="ws-fan-title">
          {t('title')}
        </h3>
        <ul className="ws-fan-legend" data-testid="fan-legend">
          <li>
            <span className="ws-fan-key" data-key="now" aria-hidden="true" />
            {ghost ? t('now') : t('median')}
          </li>
          {ghost && (
            <li data-testid="fan-legend-saved">
              <span className="ws-fan-key" data-key="saved" aria-hidden="true" />
              {t('saved')}
            </li>
          )}
          <li>
            <span className="ws-fan-key" data-key="outer" aria-hidden="true" />
            {t('bandOuter')}
          </li>
          <li className="ws-fan-legend-inner">
            <span className="ws-fan-key" data-key="inner" aria-hidden="true" />
            {t('bandInner')}
          </li>
        </ul>
        {/* Which euros the axis shows; follows the bar's switch. */}
        <span className="ws-fan-unit" data-testid="fan-unit">
          {displayReal ? t('real') : t('nominal')}
        </span>
        <Popover
          label={t('options')}
          className="ws-fan-options"
          testId="fan-options"
          trigger={(props) => (
            <button
              {...props}
              className="ws-icon-button"
              data-testid="fan-options-trigger"
              aria-label={t('options')}
              title={t('options')}
            >
              <Ellipsis size={18} aria-hidden="true" />
            </button>
          )}
        >
          {() => (
            <div className="ws-fan-menu">
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
              {maxIndex > 0 && (
                <div className="ws-chart-brush">
                  <span className="ws-fan-menu-label">
                    {t('range', { from: format.number(firstAge), to: format.number(lastAge) })}
                  </span>
                  <input
                    type="range"
                    min={0}
                    max={maxIndex}
                    value={start}
                    aria-label={tAssets('aria.brushStart', { startAge: firstAge, endAge: lastAge })}
                    onChange={(event) =>
                      setStartIndex(Math.min(Number(event.target.value), end - 1))
                    }
                  />
                  <input
                    type="range"
                    min={0}
                    max={maxIndex}
                    value={end}
                    aria-label={tAssets('aria.brushEnd', { startAge: firstAge, endAge: lastAge })}
                    onChange={(event) =>
                      setEndIndex(Math.max(Number(event.target.value), start + 1))
                    }
                  />
                </div>
              )}
              <button
                type="button"
                className="ws-chart-button"
                onClick={resetZoom}
                disabled={!isZoomed}
              >
                {tAssets('reset')}
              </button>
              <button
                type="button"
                className="ws-chart-button"
                aria-pressed={tableOpen}
                data-testid="fan-table-toggle"
                onClick={() => setTableOpen((open) => !open)}
              >
                {tSimulation('assetTable.toggle')}
              </button>
            </div>
          )}
        </Popover>
      </div>

      <div
        className="ws-chart-plot"
        style={height ? { height } : undefined}
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
          <path d={geometry.band(visible.p10, visible.p90)} fill="var(--viz-seq-1)" />
          <path d={geometry.band(visible.p20, visible.p80)} fill="var(--viz-seq-2)" />
          {inRange(legalRetirementAge) && (
            <line
              x1={geometry.ageX(legalRetirementAge)}
              x2={geometry.ageX(legalRetirementAge)}
              y1={0}
              y2={FAN_H}
              stroke="var(--line-strong)"
              strokeWidth={1}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {savedRetirementAge !== null && inRange(savedRetirementAge) && (
            <line
              x1={geometry.ageX(savedRetirementAge)}
              x2={geometry.ageX(savedRetirementAge)}
              y1={0}
              y2={FAN_H}
              stroke="var(--viz-ghost)"
              strokeWidth={1}
              strokeDasharray="3 4"
              vectorEffect="non-scaling-stroke"
            />
          )}
          {inRange(retirementAge) && (
            <line
              x1={geometry.ageX(retirementAge)}
              x2={geometry.ageX(retirementAge)}
              y1={0}
              y2={FAN_H}
              stroke="var(--viz-seq-5)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          )}
          {ghost && ghostPercentiles && (
            <g data-testid="fan-ghost">
              {(['p10', 'p90'] as const).map((key) => (
                <path
                  key={key}
                  d={geometry.lineByAge(ghost.ages, ghostPercentiles[key])}
                  fill="none"
                  stroke="var(--viz-ghost)"
                  strokeWidth={1}
                  strokeDasharray="2 4"
                  opacity={GHOST_OUTLINE_OPACITY}
                  vectorEffect="non-scaling-stroke"
                />
              ))}
              <path
                data-testid="fan-ghost-median"
                d={geometry.lineByAge(ghost.ages, ghostPercentiles.p50)}
                fill="none"
                stroke="var(--viz-ghost)"
                strokeWidth={2}
                strokeDasharray="7 5"
                vectorEffect="non-scaling-stroke"
              />
            </g>
          )}
          <path
            d={geometry.line(visible.p50)}
            fill="none"
            stroke="var(--viz-seq-5)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
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
            {money.axis(grid.value)}
          </span>
        ))}
        {/* Markers on the age axis, named at the top of the plot. */}
        {inRange(retirementAge) && (
          <span
            className="ws-fan-marker"
            data-marker="retirement"
            style={{ left: geometry.agePct(retirementAge) }}
          >
            {t('retirementMarker', { age: retirementAge })}
          </span>
        )}
        {savedRetirementAge !== null && inRange(savedRetirementAge) && (
          <span
            className="ws-fan-marker"
            data-marker="saved"
            data-side={savedRetirementAge < retirementAge ? 'before' : 'after'}
            style={{ left: geometry.agePct(savedRetirementAge) }}
          >
            {t('savedMarker', { age: savedRetirementAge })}
          </span>
        )}
        {inRange(legalRetirementAge) && legalRetirementAge !== retirementAge && (
          <span
            className="ws-fan-marker"
            data-marker="pension"
            style={{ left: geometry.agePct(legalRetirementAge) }}
          >
            {t('pensionMarker', { age: legalRetirementAge })}
          </span>
        )}
        {inspected && (
          <div
            className="ws-chart-tooltip"
            style={
              inspectX < 0.68
                ? { left: `calc(${inspectX * 100}% + 10px)` }
                : { right: `calc(${100 - inspectX * 100}% + 10px)` }
            }
          >
            <div>{tAssets('tooltip.label', { age: inspected.age })}</div>
            {(['p90', 'p80', 'p50', 'p20', 'p10'] as const).map((key) => (
              <div key={key}>
                <span>{key === 'p50' ? tAssets('tooltip.median') : tAssets(`tooltip.${key}`)}</span>
                <strong>{money.full(inspected[key])}</strong>
              </div>
            ))}
            {inspected.saved !== null && (
              <div className="ws-chart-tooltip-saved">
                <span>{t('savedMedian')}</span>
                <strong>{money.full(inspected.saved)}</strong>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="ws-chart-axis" aria-hidden="true">
        {geometry.axisTicks.map((tick) => (
          <span key={tick.age} style={{ left: tick.leftPct }}>
            {format.number(tick.age)}
          </span>
        ))}
      </div>

      {/* Always in the document (the chart's text equivalent); shown from the menu. */}
      <div className="ws-chart-table" data-testid="fan-table" hidden={!tableOpen}>
        <table>
          <caption className="sr-only">{tSimulation('assetTable.caption')}</caption>
          <thead>
            <tr>
              {['age', 'p10', 'p20', 'p50', 'p80', 'p90'].map((key) => (
                <th key={key} className={key === 'age' ? undefined : 'ds-num'}>
                  {key === 'age'
                    ? tSimulation('assetTable.headers.age')
                    : key === 'p50'
                      ? tSimulation('assetTable.headers.p50')
                      : key.toUpperCase()}
                </th>
              ))}
              {ghost && <th className="ds-num">{t('savedMedian')}</th>}
            </tr>
          </thead>
          <tbody>
            {visibleAges.map((age, index) => {
              const saved = ghostMedianAt(age)
              return (
                <tr key={age}>
                  <td>{format.number(age)}</td>
                  <td className="ds-num">{money.full(visible.p10[index])}</td>
                  <td className="ds-num">{money.full(visible.p20[index])}</td>
                  <td className="ds-num ws-chart-table-strong">{money.full(visible.p50[index])}</td>
                  <td className="ds-num">{money.full(visible.p80[index])}</td>
                  <td className="ds-num">{money.full(visible.p90[index])}</td>
                  {ghost && <td className="ds-num">{saved === null ? '—' : money.full(saved)}</td>}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
