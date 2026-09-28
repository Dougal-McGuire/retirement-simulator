'use client'

import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'

/** Default tween length: long enough to read as a change, short enough to never lag a slider. */
export const DEFAULT_TWEEN_MS = 240

/** Ease-out cubic on [0, 1]; inputs outside the range are clamped. */
export function easeOutCubic(progress: number): number {
  const t = Math.min(1, Math.max(0, progress))
  return 1 - Math.pow(1 - t, 3)
}

/**
 * How long a change from `from` to `to` should animate: not at all under
 * reduced motion, when nothing changes, or when either end is not a finite
 * number (a placeholder cannot be tweened).
 */
export function tweenDuration(
  from: number | null,
  to: number | null,
  durationMs: number,
  reducedMotion: boolean
): number {
  if (reducedMotion || from === null || to === null || from === to) return 0
  if (!Number.isFinite(from) || !Number.isFinite(to) || !(durationMs > 0)) return 0
  return durationMs
}

/** The value `elapsedMs` into a tween from `from` to `to` (the end value once it is over). */
export function tweenValue(from: number, to: number, elapsedMs: number, durationMs: number): number {
  if (!(durationMs > 0) || elapsedMs >= durationMs) return to
  return from + (to - from) * easeOutCubic(elapsedMs / durationMs)
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export interface AnimatedNumberProps {
  /** The number to show. `null` / `undefined` shows `placeholder` (no tween). */
  value: number | null | undefined
  /** Formats the displayed value — also every in-between frame, so round there. */
  format: (value: number) => string
  /** Tween length in ms (default 240). Ignored under prefers-reduced-motion. */
  durationMs?: number
  /** Shown while there is no value. */
  placeholder?: string
  className?: string
}

/**
 * A number that glides to its new value instead of jumping: an ease-out tween
 * from whatever is on screen right now, so a change arriving mid-tween simply
 * redirects it. Under `prefers-reduced-motion` the value swaps instantly.
 *
 * Screen readers never hear the in-between frames: the animated text is
 * `aria-hidden` and a visually hidden copy carries the final value. Tests read
 * `data-value` (the final, unformatted number) rather than the text, which
 * contains both copies.
 *
 * ```tsx
 * <AnimatedNumber value={results.successRate} format={(v) => percent(v / 100)} />
 * ```
 */
export function AnimatedNumber({
  value,
  format,
  durationMs = DEFAULT_TWEEN_MS,
  placeholder = '—',
  className,
}: AnimatedNumberProps) {
  const target = value ?? null
  const [display, setDisplay] = useState<number | null>(target)
  // What is on screen right now (mid-tween included): the next tween starts here.
  const shownRef = useRef<number | null>(target)
  const frameRef = useRef(0)

  useEffect(() => {
    const from = shownRef.current
    const duration = tweenDuration(from, target, durationMs, prefersReducedMotion())
    if (duration === 0 || from === null || target === null) {
      shownRef.current = target
      setDisplay(target)
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      const elapsed = now - start
      const next = tweenValue(from, target, elapsed, duration)
      shownRef.current = next
      setDisplay(next)
      if (elapsed < duration) frameRef.current = window.requestAnimationFrame(step)
    }
    frameRef.current = window.requestAnimationFrame(step)
    return () => window.cancelAnimationFrame(frameRef.current)
  }, [target, durationMs])

  const finalText = target === null ? placeholder : format(target)
  const shownText = display === null ? placeholder : format(display)
  return (
    <span className={cn('ws-number', className)} data-value={target ?? undefined}>
      <span aria-hidden="true">{shownText}</span>
      <span className="sr-only">{finalText}</span>
    </span>
  )
}
