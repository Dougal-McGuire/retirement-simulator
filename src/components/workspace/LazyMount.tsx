'use client'

import { useRef, type CSSProperties, type ReactNode } from 'react'
import { useNearViewport } from './useNearViewport'

export interface LazyMountProps {
  children: ReactNode
  /** Height reserved (and filled by the placeholder) until the content mounts. */
  minHeight: number | string
  /** Placeholder while pending; defaults to a plain skeleton block. */
  fallback?: ReactNode
  /** How far outside the viewport mounting starts. */
  rootMargin?: string
  className?: string
  testId?: string
}

/**
 * Mounts heavy content (charts, background measurements) once it comes near
 * the viewport, and then keeps it: mount once, never unmount. Until then it
 * reserves the content's height so the page does not jump; browser scroll
 * anchoring absorbs any difference above the viewport.
 *
 * `data-lazy-state="pending|mounted"` is the hook tests wait on.
 */
export function LazyMount({
  children,
  minHeight,
  fallback,
  rootMargin = '800px 0px',
  className,
  testId,
}: LazyMountProps) {
  const ref = useRef<HTMLDivElement>(null)
  const near = useNearViewport(ref, rootMargin)
  const reserve: CSSProperties | undefined = near ? undefined : { minHeight }
  return (
    <div
      ref={ref}
      className={className}
      data-lazy-state={near ? 'mounted' : 'pending'}
      data-testid={testId}
      style={reserve}
    >
      {near
        ? children
        : (fallback ?? (
            <div
              className="ws-skeleton ws-lazy-skeleton"
              style={{ height: minHeight }}
              aria-hidden="true"
            />
          ))}
    </div>
  )
}
