'use client'

import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import type { SimulationStore } from '@/types'
import { areSimulationParamsEqual } from '@/lib/simulation/planInsights'
import { useSimulationStore } from '@/lib/stores/simulationStore'

export type RunStatus = 'running' | 'updated' | 'stale' | 'empty'

/** A run that finishes faster than this still shows "Recalculating …" this long. */
export const MIN_RUNNING_MS = 400

export interface RunInputs {
  loading: boolean
  /** A run is queued (debounce, or waiting for auto-run to resume). */
  pending: boolean
  suspended: boolean
  /** Results exist but were computed for other params. */
  stale: boolean
  hasResults: boolean
  error: string | null
  /** The minimum display time of the last run has not elapsed yet. */
  holding: boolean
}

/** A queued run that is not suspended fires within the debounce window. */
export const isRunBusy = ({ loading, pending, suspended }: RunInputs) =>
  loading || (pending && !suspended)

export function deriveRunStatus(inputs: RunInputs): { status: RunStatus; needsRun: boolean } {
  const busy = isRunBusy(inputs)
  const { stale, hasResults, error, holding } = inputs
  const status: RunStatus =
    busy || holding ? 'running' : !hasResults ? 'empty' : stale ? 'stale' : 'updated'
  // `planLimitReached` is a plan-list error, not a failed simulation.
  const failed = Boolean(error) && error !== 'planLimitReached'
  return { status, needsRun: !busy && (!hasResults || stale || failed) }
}

/** Results exist but describe other params than the ones on screen. */
export const selectResultsStale = (state: SimulationStore): boolean =>
  state.results !== null && !areSimulationParamsEqual(state.params, state.results.params)

/**
 * The store fields run status depends on, already reduced: `busy` stays true
 * across the debounce → worker hand-off (`pendingRun` → `isLoading`), and a
 * keystroke that leaves results merely stale changes nothing until it flips
 * `stale`. Use with `useShallow`.
 */
export const selectRunState = (state: SimulationStore) => ({
  busy: isRunBusy({
    loading: state.isLoading,
    pending: state.pendingRun,
    suspended: state.autoRunSuspended,
    stale: false,
    hasResults: state.results !== null,
    error: state.error,
    holding: false,
  }),
  stale: selectResultsStale(state),
  hasResults: state.results !== null,
  error: state.error,
})

/**
 * What the workspace should say about its results.
 *
 * Parameter changes auto-run after a 100 ms debounce, so results are normally
 * current and "Recalculate" has nothing to do (the engine is seeded — the same
 * plan always gives the same numbers). Results only go stale while auto-run is
 * suspended (chart brushing, the wizard) or after a failed run; `needsRun` is
 * true exactly then, and is what makes the Recalculate button prominent.
 *
 * Runs typically take well under 400 ms, which made the old "Calculating …"
 * flash unreadably. `status` holds `running` for at least `MIN_RUNNING_MS`.
 */
export function useRunStatus(): { status: RunStatus; needsRun: boolean; busy: boolean } {
  // One narrow, derived selection: a keystroke (params change), the debounce
  // handing over to the worker (pendingRun → isLoading) and a landing result
  // only re-render the caller when busy / stale / hasResults / error flip.
  const { busy, stale, hasResults, error } = useSimulationStore(useShallow(selectRunState))

  const [holding, setHolding] = useState(false)
  const startedAt = useRef(0)
  useEffect(() => {
    if (busy) {
      startedAt.current = Date.now()
      setHolding(true)
      return
    }
    const remaining = MIN_RUNNING_MS - (Date.now() - startedAt.current)
    if (remaining <= 0) {
      setHolding(false)
      return
    }
    const timer = setTimeout(() => setHolding(false), remaining)
    return () => clearTimeout(timer)
  }, [busy])

  const { status, needsRun } = deriveRunStatus({
    loading: busy,
    pending: false,
    suspended: false,
    stale,
    hasResults,
    error,
    holding,
  })
  return { status, needsRun, busy }
}
