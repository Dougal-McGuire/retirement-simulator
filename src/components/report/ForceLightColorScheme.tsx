'use client'

import { useLayoutEffect } from 'react'
import { COLOR_SCHEME_ATTRIBUTE } from '@/lib/colorScheme'

/**
 * Pins `<html data-color-scheme="light">` for pages that are light-only by
 * design (the legacy print report). The print layout also sets it with an
 * inline script before paint; this re-applies it whenever React (re)renders
 * the root on the client, which resets the attributes of `<html>`.
 */
export function ForceLightColorScheme() {
  useLayoutEffect(() => {
    const root = document.documentElement
    const previous = root.getAttribute(COLOR_SCHEME_ATTRIBUTE)
    root.setAttribute(COLOR_SCHEME_ATTRIBUTE, 'light')
    return () => {
      if (previous) root.setAttribute(COLOR_SCHEME_ATTRIBUTE, previous)
      else root.removeAttribute(COLOR_SCHEME_ATTRIBUTE)
    }
  }, [])
  return null
}
