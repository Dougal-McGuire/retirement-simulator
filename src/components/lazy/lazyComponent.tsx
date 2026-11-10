'use client'

import { useEffect, useState, type ComponentType, type ReactNode } from 'react'
import { importWithRetry } from '@/lib/lazy/chunkError'

export interface LazyComponent<P> {
  (props: P): ReactNode
  /** Starts (or joins) the load, e.g. on idle or on hover. */
  preload: () => Promise<ComponentType<P>>
  displayName?: string
}

/**
 * A client-only code-split component (the `next/dynamic(..., { ssr: false })`
 * shape) whose failed load can be retried.
 *
 * `next/dynamic` sits on `React.lazy`, which caches a rejected import for the
 * life of the page: once a chunk failed to arrive, every remount threw the
 * same error again and only a full reload helped. Here a failed load is
 * forgotten, retried twice with backoff first, and then thrown during render
 * so the nearest `SectionBoundary` shows its inline message; its "Try again"
 * remounts the component, which loads afresh. (Turbopack's runtime keeps a
 * failed chunk for the page's life, so there the retry fails again and the
 * boundary offers "Neu laden"; webpack forgets it and the retry succeeds.)
 */
export function lazyComponent<P extends object>(
  load: () => Promise<ComponentType<P>>,
  /** Placeholder while loading; gets the same props (e.g. a chart's title). */
  Loading?: ComponentType<P>
): LazyComponent<P> {
  let loaded: ComponentType<P> | null = null
  let inflight: Promise<ComponentType<P>> | null = null

  const preload = () => {
    if (loaded) return Promise.resolve(loaded)
    inflight ??= importWithRetry(load).then(
      (component) => {
        loaded = component
        return component
      },
      (error: unknown) => {
        inflight = null
        throw error
      }
    )
    return inflight
  }

  function Lazy(props: P) {
    const [Component, setComponent] = useState<ComponentType<P> | null>(() => loaded)
    const [failure, setFailure] = useState<{ error: unknown } | null>(null)

    useEffect(() => {
      if (Component) return
      let live = true
      preload().then(
        (component) => {
          if (live) setComponent(() => component)
        },
        (error: unknown) => {
          if (live) setFailure({ error })
        }
      )
      return () => {
        live = false
      }
    }, [Component])

    // Thrown during render, so an error boundary can catch it.
    if (failure) throw failure.error
    if (!Component) return Loading ? <Loading {...props} /> : null
    return <Component {...props} />
  }

  Lazy.preload = preload
  return Lazy
}
