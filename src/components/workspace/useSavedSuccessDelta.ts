'use client'

import { useEffect, useRef } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { useSimulationStore } from '@/lib/stores/simulationStore'
import { useRunStatus } from './useRunStatus'
import { roundDelta, savedDeltaTone, savedSuccessDelta, type SavedDeltaTone } from './savedDelta'

export { roundDelta, savedDeltaTone, savedSuccessDelta, type SavedDeltaTone } from './savedDelta'

export interface SavedSuccessDelta {
  /** Points against the saved plan (rounded to 0.1), or null when clean/unknown. */
  delta: number | null
  tone: SavedDeltaTone
  /** "+1,3 Pkt." / "−2,1 pts" / "±0 Pkt." */
  text: string | null
  /** The signed number alone ("+1,3"), where the unit is clear from context. */
  short: string | null
  /** A run is in flight: the value is the previous one, shown dimmed. */
  pending: boolean
}

/**
 * Shared by the result bar and the phone sheet's mini result. While a run is
 * in flight the previous delta is kept (dimmed) instead of flickering to the
 * stale results' number.
 */
export function useSavedSuccessDelta(): SavedSuccessDelta {
  const t = useTranslations('planDashboard.scenarios')
  const format = useFormatter()
  // Scalars only: the rate map and the results object change on every clean
  // run, the numbers read here far less often.
  const isDirty = useSimulationStore((state) => state.isDirty)
  const savedRate = useSimulationStore((state) => state.planSuccessRates[state.activePlanId])
  const rate = useSimulationStore((state) => state.results?.successRate)
  const { status } = useRunStatus()
  const running = status === 'running'

  const raw = savedSuccessDelta({ isDirty, savedRate, rate })
  const settled = useRef<number | null>(null)
  useEffect(() => {
    if (!running) settled.current = raw
  }, [raw, running])

  // Clean again (saved or discarded): nothing to compare, even mid-run.
  const shown = !isDirty ? null : running ? (settled.current ?? null) : raw
  if (shown === null) {
    return { delta: null, tone: 'neutral', text: null, short: null, pending: running }
  }
  const delta = roundDelta(shown)
  const magnitude = format.number(Math.abs(delta), {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  const value = delta === 0 ? '±0' : `${delta > 0 ? '+' : '−'}${magnitude}`
  return {
    delta,
    tone: savedDeltaTone(delta),
    text: t('deltaPoints', { value }),
    short: value,
    pending: running,
  }
}
