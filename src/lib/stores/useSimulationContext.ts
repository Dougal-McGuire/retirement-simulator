'use client'

import { useMemo } from 'react'
import type { SimulationParams, SimulationResults } from '@/types'
import { buildSimulationContext, type SimulationContext } from '@/lib/simulation/context'
import {
  useSimulationParams,
  useSimulationResults,
  useSimulationStore,
} from '@/lib/stores/simulationStore'

/**
 * The one description of the run behind the dashboard.
 *
 * Every surface that quotes a run count, a success rate or a market-model label
 * reads it from here. Deriving any of those locally is what let the hero, the
 * stress levers and the PDF disagree about the same simulation.
 */
export function useSimulationContext(): SimulationContext {
  const params = useSimulationParams()
  const results = useSimulationResults()
  const computedAt = useSimulationStore((state) => state.resultsComputedAt)

  return useMemo(
    () => buildSimulationContext(params, results, { computedAt }),
    [params, results, computedAt]
  )
}

/**
 * Same context for an arbitrary (params, results) pair — used where the numbers
 * do not come from the store, e.g. the report transformer's inputs in a test.
 */
export function simulationContextOf(
  params: SimulationParams,
  results: SimulationResults | null,
  computedAt?: number | null
): SimulationContext {
  return buildSimulationContext(params, results, { computedAt })
}
