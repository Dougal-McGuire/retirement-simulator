'use client'

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import CountUp from 'react-countup'

interface AnimatedCounterProps {
  end: number
  duration?: number
  decimals?: number
  prefix?: string
  suffix?: string
  className?: string
  delay?: number
  /**
   * BCP-47 tag used for the group/decimal separators. Defaults to en-US so
   * existing callers are unaffected; pass the active UI locale wherever the
   * number is user-facing (German expects "99,6", not "99.6").
   */
  locale?: string
}

/** Group and decimal separators the given locale uses for plain numbers. */
function separatorsFor(locale: string): { separator: string; decimal: string } {
  const parts = new Intl.NumberFormat(locale).formatToParts(1234.5)
  return {
    separator: parts.find((part) => part.type === 'group')?.value ?? ',',
    decimal: parts.find((part) => part.type === 'decimal')?.value ?? '.',
  }
}

// useLayoutEffect logs a warning during SSR; fall back to useEffect there.
const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/**
 * Counter that always renders its final value.
 *
 * The count-up is a progressive enhancement: it only runs when the counter is
 * already inside the viewport at mount (decided before the first paint, so the
 * number never flashes). Anywhere else — below the fold, during SSR, or when
 * the visitor prefers reduced motion — the final value is painted directly
 * instead of a placeholder "0".
 */
export function AnimatedCounter({
  end,
  duration = 2,
  decimals = 0,
  prefix = '',
  suffix = '',
  className = '',
  delay = 0,
  locale = 'en-US',
}: AnimatedCounterProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [shouldAnimate, setShouldAnimate] = useState(false)

  useIsomorphicLayoutEffect(() => {
    const node = containerRef.current
    if (!node || typeof window === 'undefined') return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return

    const rect = node.getBoundingClientRect()
    const isInViewport = rect.top < window.innerHeight && rect.bottom > 0
    if (!isInViewport) return

    if (delay <= 0) {
      setShouldAnimate(true)
      return
    }

    const timer = setTimeout(() => setShouldAnimate(true), delay)
    return () => clearTimeout(timer)
  }, [delay])

  const { separator, decimal } = useMemo(() => separatorsFor(locale), [locale])

  const staticValue = useMemo(
    () =>
      `${prefix}${end.toLocaleString(locale, {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      })}${suffix}`,
    [decimals, end, locale, prefix, suffix]
  )

  return (
    <div ref={containerRef} className={className}>
      {shouldAnimate ? (
        <CountUp
          end={end}
          duration={duration}
          decimals={decimals}
          prefix={prefix}
          suffix={suffix}
          separator={separator}
          decimal={decimal}
          preserveValue
        />
      ) : (
        <span>{staticValue}</span>
      )}
    </div>
  )
}
