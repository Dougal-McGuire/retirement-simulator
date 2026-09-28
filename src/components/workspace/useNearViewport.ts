'use client'

import { useEffect, useState, type RefObject } from 'react'

/**
 * True once `ref` comes within `rootMargin` of the viewport.
 *
 * With `once` (the default) it latches: mount once, never unmount — what lazy
 * charts want. `once: false` follows the element in and out, for work that
 * should only run while something is near the screen (lever measurements).
 * Without IntersectionObserver it is simply true.
 */
export function useNearViewport(
  ref: RefObject<Element | null>,
  rootMargin = '800px 0px',
  options: { once?: boolean } = {}
): boolean {
  const { once = true } = options
  const [near, setNear] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return
    if (typeof IntersectionObserver === 'undefined') {
      setNear(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.some((entry) => entry.isIntersecting)
        if (once) {
          if (hit) {
            setNear(true)
            observer.disconnect()
          }
          return
        }
        setNear(hit)
      },
      { rootMargin }
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [ref, rootMargin, once])

  return near
}
