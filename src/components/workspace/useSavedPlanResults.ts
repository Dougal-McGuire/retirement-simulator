'use client'

import { useEffect, useMemo, useSyncExternalStore } from 'react'
import type { SimulationParams, SimulationResults } from '@/types'
import { runInBackgroundSlot } from '@/lib/simulation/backgroundQueue'
import { simulationFingerprint } from '@/lib/simulation/context'
import { areSimulationParamsEqual } from '@/lib/simulation/planInsights'
import { isUsableResults } from '@/lib/results/usableResults'
import { useSimulationStore } from '@/lib/stores/simulationStore'

/**
 * The saved plan's result, for the ghost on the chart (and the deltas beside
 * the figures) while the plan has unsaved changes.
 *
 * The store keeps one result — the working copy's — and of the saved plan
 * only its success rate. The saved plan's series live here, in memory only:
 * nothing is persisted, and a reload recomputes them (the engine is seeded,
 * so the same plan gives the same numbers).
 *
 * - Every result the store receives is remembered under the fingerprint of
 *   the params it was computed for. The run that was on screen before the
 *   first edit *is* the saved plan's result, so the ghost is there the moment
 *   the plan turns dirty, at no cost.
 * - If it is not there (a reload with a draft, a plan switched to while
 *   dirty), it is computed through the worker client with the saved plan's
 *   own params — the same seed and run count, i.e. the same market paths —
 *   on the one background queue, and only while the plan's own run is not
 *   busy. The head never waits behind it.
 */

/** A handful of plans' worth; each entry is one result object. */
const CACHE_LIMIT = 6
const cache = new Map<string, SimulationResults>()
const listeners = new Set<() => void>()

function remember(fingerprint: string, results: SimulationResults) {
  // The engine is seeded: a second result for the same params is the same
  // result. Keeping the first keeps its identity, so nothing that shows it
  // re-renders; re-inserting only moves the entry to the fresh end.
  const known = cache.get(fingerprint)
  cache.delete(fingerprint)
  cache.set(fingerprint, known ?? results)
  while (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value as string)
  if (!known) listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

let watching = false

/** Starts remembering the store's results (once per page). */
function watchStoreResults() {
  if (watching) return
  watching = true
  const note = (state: ReturnType<typeof useSimulationStore.getState>) => {
    const { results, params } = state
    if (!isUsableResults(results) || !areSimulationParamsEqual(params, results.params)) return
    remember(simulationFingerprint(params), results)
  }
  note(useSimulationStore.getState())
  useSimulationStore.subscribe((state, previous) => {
    if (state.results !== previous.results) note(state)
  })
}

const busy = () => {
  const state = useSimulationStore.getState()
  return state.isLoading || (state.pendingRun && !state.autoRunSuspended)
}

/** How often a waiting ghost run looks whether the plan's own run has finished. */
const POLL_MS = 150

/** Test hook: forget everything (module state outlives a component). */
export function resetSavedPlanResults() {
  cache.clear()
}

/** The saved plan's results while the plan is dirty; `null` while clean or not computed yet. */
export function useSavedPlanResults(): SimulationResults | null {
  const dirty = useSimulationStore((state) => state.isDirty)
  const savedParams = useSimulationStore(
    (state) => state.plans.find((plan) => plan.id === state.activePlanId)?.params
  )
  const fingerprint = useMemo(
    () => (savedParams ? simulationFingerprint(savedParams) : null),
    [savedParams]
  )
  // Changes only when the saved plan's own result arrives: a landing draft
  // run (another fingerprint) does not re-render the caller.
  const saved = useSyncExternalStore(
    subscribe,
    () => (fingerprint ? (cache.get(fingerprint) ?? null) : null),
    () => null
  )

  useEffect(() => {
    watchStoreResults()
  }, [])

  useEffect(() => {
    if (!dirty || !savedParams || !fingerprint || cache.has(fingerprint)) return
    let cancelled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const wanted = () =>
      !cancelled && !busy() && useSimulationStore.getState().isDirty && !cache.has(fingerprint)
    const attempt = async (params: SimulationParams) => {
      if (cancelled || cache.has(fingerprint)) return
      if (!busy()) {
        try {
          const results = await runInBackgroundSlot(params, wanted)
          if (results && isUsableResults(results)) {
            remember(fingerprint, results)
            return
          }
        } catch {
          // The ghost is an extra: a failed run leaves the chart without it.
          return
        }
      }
      if (!cancelled) timer = setTimeout(() => void attempt(params), POLL_MS)
    }
    void attempt(savedParams)
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [dirty, savedParams, fingerprint])

  return dirty ? saved : null
}
