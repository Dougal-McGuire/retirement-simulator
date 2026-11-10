'use client'

import { useCallback, useSyncExternalStore } from 'react'

/**
 * Whether a CSS media query matches — right on the first client render.
 *
 * The old effect-based version returned `false` until after mount, so a
 * component laid out for the desktop for one frame and then jumped. With
 * `useSyncExternalStore` the client reads the query during render; the
 * server (and hydration) see `false`, and React re-renders right after
 * hydration if the client differs, without a mismatch warning.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    [query]
  )
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false
  )
}

/**
 * The workspace's phone layout: ≤760 px, the breakpoint its CSS uses
 * (`ws-page.css`). One definition for every component that sizes itself in
 * script (the fan chart, the spending corridor).
 */
export const PHONE_QUERY = '(max-width: 760px)'

export const usePhoneLayout = () => useMediaQuery(PHONE_QUERY)
