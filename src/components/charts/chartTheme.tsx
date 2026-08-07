'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Shared visual language for the simulation dashboard charts.
 *
 * All colors are derived from the active theme's `--neo-*-rgb` tokens so the
 * charts adapt automatically to every theme (including the dark "aurora" one)
 * without hard-coding palette values.
 */

/** rgb(var(<token>) / alpha) helper for theme-aware translucent colors. */
export const withAlpha = (rgbToken: string, alpha: number) => `rgb(var(${rgbToken}) / ${alpha})`

/** Recessive ink values for grid, axes, cursors and brush chrome. */
export const chartInk = {
  grid: withAlpha('--neo-black-rgb', 0.07),
  tick: withAlpha('--neo-black-rgb', 0.55),
  axisLine: withAlpha('--neo-black-rgb', 0.14),
  marker: withAlpha('--neo-black-rgb', 0.45),
  cursor: withAlpha('--neo-black-rgb', 0.35),
  brushStroke: withAlpha('--neo-black-rgb', 0.3),
  brushFill: withAlpha('--neo-black-rgb', 0.04),
  phase: withAlpha('--neo-black-rgb', 0.03),
}

/** One hue per chart: identity follows the measure, shade follows certainty. */
export const fanHue = {
  assets: { solid: 'var(--neo-blue)', rgb: '--neo-blue-rgb' },
  spending: { solid: 'var(--neo-purple)', rgb: '--neo-purple-rgb' },
  risk: { solid: 'var(--neo-red)', rgb: '--neo-red-rgb' },
} as const

/** Recharts `tick` prop for quiet, legible axis labels. */
export const axisTick = (isMobile: boolean) => ({
  fontSize: isMobile ? 10 : 11,
  fill: chartInk.tick,
  fontWeight: 500,
})

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
          <span className="text-[0.66rem] font-semibold tracking-[0.04em] text-muted-foreground">
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
    <div className="pointer-events-none min-w-[12.5rem] border-2 border-neo-black bg-neo-white/95 px-3.5 py-3 shadow-neo-sm backdrop-blur-sm">
      <div className="mb-2 border-b border-neo-black/15 pb-1.5 text-[0.66rem] font-extrabold uppercase tracking-[0.14em] text-neo-black">
        {title}
      </div>
      <dl className="m-0 space-y-1">
        {rows.map((row) => (
          <div
            key={row.key}
            className={cn(
              'flex items-center justify-between gap-6',
              row.dividerAbove && 'mt-1.5 border-t border-neo-black/15 pt-1.5'
            )}
          >
            <dt className="flex items-center gap-2 text-[0.66rem] font-medium text-muted-foreground">
              {row.color && <LegendSwatch kind={row.kind ?? 'line'} color={row.color} />}
              {row.label}
            </dt>
            <dd
              className={cn(
                'm-0 text-right text-[0.7rem] tabular-nums',
                row.emphasis ? 'font-extrabold text-neo-black' : 'font-semibold text-foreground/80'
              )}
            >
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
      {footer && (
        <div className="mt-2 border-t border-neo-black/15 pt-1.5 text-[0.6rem] font-medium text-muted-foreground">
          {footer}
        </div>
      )}
    </div>
  )
}
