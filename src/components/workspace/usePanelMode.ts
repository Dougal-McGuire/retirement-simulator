'use client'

import { useSyncExternalStore } from 'react'

export type PanelMode = 'docked' | 'overlay' | 'sheet'

const DOCKED = '(min-width: 1280px)'
const OVERLAY = '(min-width: 761px)'

function read(): PanelMode {
  if (window.matchMedia(DOCKED).matches) return 'docked'
  if (window.matchMedia(OVERLAY).matches) return 'overlay'
  return 'sheet'
}

function subscribe(onChange: () => void) {
  const queries = [window.matchMedia(DOCKED), window.matchMedia(OVERLAY)]
  queries.forEach((query) => query.addEventListener('change', onChange))
  return () => queries.forEach((query) => query.removeEventListener('change', onChange))
}

/**
 * How the edit panel presents at the current width: docked beside the page
 * (≥1280), an overlay sheet from the right (761–1279) or a bottom sheet on
 * phones. The server renders `docked`; the client corrects it right after
 * hydration, before anything can open a panel.
 */
export function usePanelMode(): PanelMode {
  return useSyncExternalStore(subscribe, read, () => 'docked')
}
