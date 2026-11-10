'use client'

import type { SimulationResults } from '@/types'
import { usableResultsOrNull } from '@/lib/results/usableResults'
import { useSimulationResults, useSimulationStore } from '@/lib/stores/simulationStore'

/**
 * `useSimulationResults()` (deferred inside a `DeferredResultsScope`), with a
 * payload that cannot be drawn treated as "no results". Persisted results are
 * rehydrated unvalidated; the workspace page clears a malformed payload and
 * starts a fresh run, and until it lands every consumer shows its skeleton
 * instead of crashing on a missing series.
 */
export function useUsableResults(): SimulationResults | null {
  return usableResultsOrNull(useSimulationResults())
}

/** The store's own (never deferred) results, filtered the same way. */
export function useUsableStoreResults(): SimulationResults | null {
  return useSimulationStore((state) => usableResultsOrNull(state.results))
}
