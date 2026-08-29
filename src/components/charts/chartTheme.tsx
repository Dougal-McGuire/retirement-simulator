'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Shared visual language for the simulation dashboard charts.
 *
 * All colors are derived from the active theme's `--neo-*-rgb` tokens so the
 * charts adapt automatically to every theme (including the dark "elegant" one)
 * without hard-coding palette values.
 */

/** rgb(var(<token>) / alpha) helper for theme-aware translucent colors. */
export const withAlpha = (rgbToken: string, alpha: number) => `rgb(var(${rgbToken}) / ${alpha})`

/** Recessive ink values for grid, axes, cursors and brush chrome. */
export const chartInk = {
  grid: withAlpha('--ink-rgb', 0.07),
  tick: withAlpha('--ink-rgb', 0.55),
  axisLine: withAlpha('--ink-rgb', 0.14),
  marker: withAlpha('--ink-rgb', 0.45),
  cursor: withAlpha('--ink-rgb', 0.35),
  brushStroke: withAlpha('--ink-rgb', 0.3),
  brushFill: withAlpha('--ink-rgb', 0.04),
  phase: withAlpha('--ink-rgb', 0.03),
}

/** One hue per chart: identity follows the measure, shade follows certainty. */
export const fanHue = {
  assets: { solid: 'var(--accent)', rgb: '--accent-rgb' },
  spending: { solid: 'var(--viz-purple)', rgb: '--viz-purple-rgb' },
  risk: { solid: 'var(--danger)', rgb: '--danger-rgb' },
} as const

/** Recharts `tick` prop for quiet, legible axis labels. */
export const axisTick = (isMobile: boolean) => ({
  fontSize: isMobile ? 10 : 11,
  fill: chartInk.tick,
  fontWeight: 500,
})

/**
 * Width the value axis needs for its widest tick label.
 *
 * Compact currency labels differ a lot per locale ("€4.5M" vs "4,5 Mio. €"),
 * and an axis that is too narrow clips the leading digits. Measure the widest
 * label we are going to draw instead of hard-coding a width.
 */
export function measureAxisWidth(labels: string[], isMobile: boolean): number {
  const fontSize = isMobile ? 10 : 11
  // ~0.62em per glyph for the mono/Inter stack used by the charts.
  const longest = labels.reduce((max, label) => Math.max(max, label.length), 0)
  const estimated = Math.ceil(longest * fontSize * 0.62) + 12
  const min = isMobile ? 46 : 58
  const max = isMobile ? 92 : 116
  return Math.min(max, Math.max(min, estimated))
}

/**
 * Round a value up to a "nice" axis bound (1, 1.5, 2, 2.5, 3, 4, 5, 7.5, 10 × 10^n)
 * so tick labels land on readable numbers.
 */
export function niceCeil(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0
  const exponent = Math.floor(Math.log10(value))
  const base = Math.pow(10, exponent)
  const normalized = value / base
  const step = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10].find((s) => normalized <= s + 1e-9) ?? 10
  return step * base
}

/**
 * Pick the upper bound of a fan chart's value axis.
 *
 * `focus` scales the plot to the likely range (P20–P80) plus headroom so the
 * median band fills the frame; otherwise the full P10–P90 range is shown.
 * Returns `undefined` when there is nothing to clamp, letting Recharts decide.
 */
export function fanDomainMax(
  medianMax: number,
  innerMax: number,
  outerMax: number,
  focus: boolean
): number | undefined {
  if (!Number.isFinite(outerMax) || outerMax <= 0) return undefined
  if (!focus) return niceCeil(outerMax * 1.02) || undefined
  // Give the median path roughly the lower two-thirds of the plot and keep at
  // least part of the P20–P80 band in frame.
  const target = Math.max(medianMax * 1.55, innerMax * 0.75, outerMax * 0.25)
  return niceCeil(Math.min(outerMax, target)) || undefined
}

/** Chrome for the zoom brush: a deliberate range navigator, not a scrollbar. */
export const brushChrome = (isMobile: boolean) => ({
  height: isMobile ? 26 : 30,
  travellerWidth: isMobile ? 10 : 12,
  stroke: withAlpha('--ink-rgb', 0.18),
  fill: withAlpha('--ink-rgb', 0.02),
  traveller: <BrushTraveller />,
  className: 'chart-range-navigator',
})

interface TravellerProps {
  x?: number
  y?: number
  width?: number
  height?: number
}

/** Grab handle for the range navigator: a filled bar with two grip lines. */
export function BrushTraveller({ x = 0, y = 0, width = 12, height = 24 }: TravellerProps) {
  const gripX = x + width / 2
  const gripTop = y + height * 0.28
  const gripBottom = y + height * 0.72
  return (
    <g style={{ cursor: 'ew-resize' }}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={1}
        fill="var(--white)"
        stroke="var(--accent)"
        strokeWidth={1.5}
      />
      <line
        x1={gripX - 1.5}
        x2={gripX - 1.5}
        y1={gripTop}
        y2={gripBottom}
        stroke="var(--accent)"
        strokeWidth={1}
        strokeLinecap="round"
      />
      <line
        x1={gripX + 1.5}
        x2={gripX + 1.5}
        y1={gripTop}
        y2={gripBottom}
        stroke="var(--accent)"
        strokeWidth={1}
        strokeLinecap="round"
      />
    </g>
  )
}

type SwatchKind = 'line' | 'band' | 'dash'

export function LegendSwatch({ kind, color }: { kind: SwatchKind; color: string }) {
  if (kind === 'band') {
    return (
      <span
        aria-hidden="true"
        className="inline-block h-3 w-3.5 shrink-0 rounded-[2px]"
        style={{ backgroundColor: color }}
      />
    )
  }
  if (kind === 'dash') {
    return (
      <span
        aria-hidden="true"
        className="inline-block h-0 w-4 shrink-0 border-t-2 border-dashed"
        style={{ borderColor: color }}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className="inline-block h-[3px] w-4 shrink-0 rounded-full"
      style={{ backgroundColor: color }}
    />
  )
}

export interface LegendItem {
  key: string
  label: string
  kind: SwatchKind
  color: string
}

export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-5 gap-y-1.5', className)}>
      {items.map((item) => (
        <li key={item.key} className="flex items-center gap-2">
          <LegendSwatch kind={item.kind} color={item.color} />
          <span className="text-[0.66rem] font-semibold  text-muted-foreground">
            {item.label}
          </span>
        </li>
      ))}
    </ul>
  )
}

export interface TooltipRow {
  key: string
  label: string
  value: string
  kind?: SwatchKind
  color?: string
  emphasis?: boolean
  dividerAbove?: boolean
}

export function ChartTooltipCard({
  title,
  rows,
  footer,
}: {
  title: string
  rows: TooltipRow[]
  footer?: ReactNode
}) {
  return (
    <div className="rounded-sm pointer-events-none min-w-[12.5rem] border-2 border-border bg-white/95 px-3.5 py-3 shadow-sm backdrop-blur-sm">
      <div className="mb-2 border-b border-ink/15 pb-1.5 text-[0.66rem] font-extrabold   text-ink">
        {title}
      </div>
      <dl className="m-0 space-y-1">
        {rows.map((row) => (
          <div
            key={row.key}
            className={cn(
              'flex items-center justify-between gap-6',
              row.dividerAbove && 'mt-1.5 border-t border-ink/15 pt-1.5'
            )}
          >
            <dt className="flex items-center gap-2 text-[0.66rem] font-medium text-muted-foreground">
              {row.color && <LegendSwatch kind={row.kind ?? 'line'} color={row.color} />}
              {row.label}
            </dt>
            <dd
              className={cn(
                'm-0 text-right text-[0.7rem] tabular-nums',
                row.emphasis ? 'font-extrabold text-ink' : 'font-semibold text-foreground/80'
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {footer && (
        <div className="mt-2 border-t border-ink/15 pt-1.5 text-[0.6rem] font-medium text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  )
}
