'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { SimulationResults } from '@/types'
import { simulationFingerprint } from '@/lib/simulation/context'
import { isCashFlowEnabled } from '@/lib/simulation/cashFlows'
import { areSimulationParamsEqual } from '@/lib/simulation/planInsights'
import { buildFlowToggleParams, selectUncertainFlows } from '@/lib/simulation/uncertainFlows'
import { useSimulationStore } from '@/lib/stores/simulationStore'
import {
  isLeverSaturated,
  runInBackgroundSlot,
  terminalP10,
  useSettledBase,
} from './useLeverMeasurements'

export interface FlowImpact {
  id: string
  /** The flow's state when measured: the run switched it the other way. */
  measuredEnabled: boolean
  /** Success rate of the plan with the flow switched. */
  successRate: number
  /** Points against the base result: "without" for an on flow, "with" for an off one. */
  delta: number
  worstDecileEnd: number
  worstDecileDelta: number
}

export interface FlowMeasurement {
  fingerprint: string
  base: SimulationResults
  byId: ReadonlyMap<string, FlowImpact>
  saturated: boolean
}

export function measureFlowImpact(
  id: string,
  measuredEnabled: boolean,
  base: SimulationResults,
  scenario: SimulationResults
): FlowImpact {
  const worstDecileEnd = terminalP10(scenario)
  return {
    id,
    measuredEnabled,
    successRate: scenario.successRate,
    delta: scenario.successRate - base.successRate,
    worstDecileEnd,
    worstDecileDelta: worstDecileEnd - terminalP10(base),
  }
}

/** Largest effect first — by points, or by worst-decile euros once saturated. */
export function impactMagnitude(impact: FlowImpact, saturated: boolean): number {
  return Math.abs(saturated ? impact.worstDecileDelta : impact.delta)
}

/**
 * Measures, for each uncertain item, the plan with that one item switched
 * the other way — at the hero's run count over the same random paths, so the
 * delta is against the result bar's own figure.
 *
 * Same gate, settle time and worker slot as the stress levers
 * (`useSettledBase`, `runInBackgroundSlot`): nothing is measured while the
 * reader edits, a run is pending, a panel is open or the list is off screen,
 * and at most one background job ever waits in front of the result bar.
 * Largest items are measured first; finished items are cached per draft, so
 * an interrupted pass resumes where it stopped.
 */
export function useFlowMeasurements({ near, holding }: { near: boolean; holding: boolean }): {
  measurement: FlowMeasurement | null
  fresh: boolean
  measuring: boolean
} {
  const { gateOpen, gateRef, settled } = useSettledBase({ near, holding })
  const [measurement, setMeasurement] = useState<FlowMeasurement | null>(null)
  const [measuring, setMeasuring] = useState(false)
  const cacheRef = useRef<{ fingerprint: string; byId: Map<string, FlowImpact> } | null>(null)
  const measuredFingerprint = measurement?.fingerprint ?? null

  useEffect(() => {
    if (!settled || !gateOpen) return
    if (useSimulationStore.getState().results !== settled) return
    const fingerprint = simulationFingerprint(settled.params)
    if (measuredFingerprint === fingerprint) return

    if (cacheRef.current?.fingerprint !== fingerprint) {
      cacheRef.current = { fingerprint, byId: new Map() }
    }
    const cache = cacheRef.current
    let cancelled = false
    const wanted = () =>
      !cancelled && gateRef.current && useSimulationStore.getState().results === settled
    const saturated = isLeverSaturated(settled.successRate)

    const run = async () => {
      setMeasuring(true)
      try {
        for (const flow of selectUncertainFlows(settled.params).flows) {
          if (cache.byId.has(flow.id)) continue
          if (!wanted()) return
          const scenario = await runInBackgroundSlot(
            buildFlowToggleParams(settled.params, flow.id),
            wanted
          )
          if (!scenario) return
          cache.byId.set(
            flow.id,
            measureFlowImpact(flow.id, isCashFlowEnabled(flow), settled, scenario)
          )
        }
        if (cancelled) return
        setMeasurement({ fingerprint, base: settled, byId: new Map(cache.byId), saturated })
      } catch {
        // An extra, like the levers: a failed run keeps the last measurement.
      } finally {
        if (!cancelled) setMeasuring(false)
      }
    }
    void run()

    return () => {
      cancelled = true
      setMeasuring(false)
    }
  }, [settled, gateOpen, gateRef, measuredFingerprint])

  const fresh = useSimulationStore(
    (state) =>
      measurement !== null && areSimulationParamsEqual(state.params, measurement.base.params)
  )

  return useMemo(() => ({ measurement, fresh, measuring }), [measurement, fresh, measuring])
}
