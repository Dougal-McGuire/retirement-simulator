'use client'

import { useEffect, useRef, useState } from 'react'
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
  const loading = useSimulationStore((state) => state.isLoading)
  const pending = useSimulationStore((state) => state.pendingRun)
  const suspended = useSimulationStore((state) => state.autoRunSuspended)
  const error = useSimulationStore((state) => state.error)
  const params = useSimulationStore((state) => state.params)
  const results = useSimulationStore((state) => state.results)

  const stale = results ? !areSimulationParamsEqual(params, results.params) : false
  const inputs = { loading, pending, suspended, stale, hasResults: Boolean(results), error }
  const busy = isRunBusy({ ...inputs, holding: false })

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

  const { status, needsRun } = deriveRunStatus({ ...inputs, holding })
  return { status, needsRun, busy }
}
