import type { CSSProperties } from 'react'
import { cn } from '@/lib/utils'

export interface SkeletonProps {
  /** Height of the placeholder (px when a number). Reserve the final height. */
  height: number | string
  /** Width (px when a number); defaults to the full line. */
  width?: number | string
  /**
   * `block` (default): a quiet tinted block — a number, a line of text, a row.
   * `chart`: a plot area at the chart's final height, with three faint gridlines.
   */
  variant?: 'block' | 'chart'
  className?: string
  style?: CSSProperties
}

/**
 * Placeholder for content that is still computing or not yet mounted
 * (class `ws-skeleton`). A slow linear sheen runs across it, and stands still
 * under `prefers-reduced-motion`. It is always `aria-hidden`: pair a group of
 * skeletons with one visually hidden `role="status"` line (e.g.
 * `workspace.computing`) so screen readers hear what is happening once.
 *
 * ```tsx
 * <Skeleton height={20} width={72} />             // a KPI value
 * <Skeleton variant="chart" height={320} />      // a lazy chart
 * ```
 */
export function Skeleton({ height, width, variant = 'block', className, style }: SkeletonProps) {
  return (
    <div
      className={cn('ws-skeleton', className)}
      data-variant={variant === 'chart' ? 'chart' : undefined}
      style={{ height, width, ...style }}
      aria-hidden="true"
    />
  )
}
