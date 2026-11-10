'use client'

import { useSyncExternalStore } from 'react'

/**
 * How the control column presents:
 *
 * - `docked` (≥1180): a permanent pane beside the result canvas;
 * - `drawer` (761–1179): over the right side of the canvas, below the dock,
 *   with no scrim — it folds away and back;
 * - `sheet` (≤760): the page's second mode, "Stellen", in place of the canvas.
 */
export type PanelMode = 'docked' | 'drawer' | 'sheet'

/** From here the canvas and the column sit side by side (R1). */
export const DOCKED_MIN_WIDTH = 1180
/** From here the drawer starts unfolded. */
export const DRAWER_OPEN_MIN_WIDTH = 1000
/** Up to here the page is the phone layout (two modes, bottom bar). */
export const PHONE_MAX_WIDTH = 760

const DOCKED = `(min-width: ${DOCKED_MIN_WIDTH}px)`
const DRAWER = `(min-width: ${PHONE_MAX_WIDTH + 1}px)`

function read(): PanelMode {
  if (window.matchMedia(DOCKED).matches) return 'docked'
  if (window.matchMedia(DRAWER).matches) return 'drawer'
  return 'sheet'
}

function subscribe(onChange: () => void) {
  const queries = [window.matchMedia(DOCKED), window.matchMedia(DRAWER)]
  queries.forEach((query) => query.addEventListener('change', onChange))
  return () => queries.forEach((query) => query.removeEventListener('change', onChange))
}

/**
 * The column's presentation at the current width. The server renders
 * `docked`; the client corrects it right after hydration.
 */
export function usePanelMode(): PanelMode {
  return useSyncExternalStore(subscribe, read, () => 'docked')
}
