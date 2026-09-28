'use client'

import { useEffect, useRef, useState, type RefObject } from 'react'
import type { SimulationParams, SimulationResults } from '@/types'
import { simulationFingerprint } from '@/lib/simulation/context'
import {
  areSimulationParamsEqual,
  buildScenarioParams,
  type ScenarioId,
} from '@/lib/simulation/planInsights'
import { useSimulationResults, useSimulationStore } from '@/lib/stores/simulationStore'
import { isRunBusy } from '../useRunStatus'
import { useWorkspace } from '../WorkspaceProvider'

/**
 * Quiet time after the last result before the levers are measured. Each
 * measurement is three full simulations on the one shared worker, which runs
 * jobs in order: started mid-drag they would sit in front of the result bar's
 * next run.
 */
export const LEVER_SETTLE_MS = 800

/**
 * Above this success rate every lever reads "+0.4 pts → 100 %", which tells
 * the reader nothing. Past it the list compares the worst decile's end assets,
 * a constraint that still moves.
 */
export const LEVER_SATURATION = 99

export interface LeverResult {
  id: ScenarioId
  successRate: number
  /** Success-rate points against the base result. */
  delta: number
  /** P10 terminal assets. */
  worstDecileEnd: number
  worstDecileDelta: number
}

export interface LeverMeasurement {
  /** `simulationFingerprint` of the base parameters. */
  fingerprint: string
  /** The result every delta is measured against — the hero's own run. */
  base: SimulationResults
  /** Sorted: biggest effect first. */
  levers: LeverResult[]
  saturated: boolean
}

export interface LeverGateInputs {
  /** The lever list is near the viewport. */
  near: boolean
  /** An assumption panel is open (its edits run the simulation). */
  editorOpen: boolean
  /** Compare mode: the sections are hidden. */
  comparing: boolean
  /** A run is loading or queued. */
  busy: boolean
  /** The shown results were computed for the current draft. */
  current: boolean
  /** A quick slider is held: the next drag step must not wait for a lever run. */
  holding: boolean
}

/**
 * Whether background lever runs may use the worker now. Everything the reader
 * is doing wins: the main run, an open panel, a held slider, another place on
 * the page.
 */
export function shouldMeasureLevers(gate: LeverGateInputs): boolean {
  return (
    gate.near && !gate.editorOpen && !gate.comparing && !gate.busy && gate.current && !gate.holding
  )
}

export const isLeverSaturated = (successRate: number) => successRate >= LEVER_SATURATION

/** P10 end assets — the constraint that still moves once success saturates. */
export const terminalP10 = (results: SimulationResults) =>
  results.assetPercentiles.p10[Math.max(0, results.ages.length - 1)] ?? 0

/** One lever's effect: its run against the base result (same paths, same count). */
export function measureLever(
  id: ScenarioId,
  base: SimulationResults,
  scenario: SimulationResults
): LeverResult {
  const worstDecileEnd = terminalP10(scenario)
  return {
    id,
    successRate: scenario.successRate,
    delta: scenario.successRate - base.successRate,
    worstDecileEnd,
    worstDecileDelta: worstDecileEnd - terminalP10(base),
  }
}

/** Biggest effect first: by success-rate delta, or by worst-decile delta once saturated. */
export function sortLeverResults(levers: LeverResult[], saturated: boolean): LeverResult[] {
  return [...levers].sort((a, b) =>
    saturated ? b.worstDecileDelta - a.worstDecileDelta : b.delta - a.delta
  )
}

/**
 * One background job on the shared worker at a time, across every list that
 * measures in the background (stress levers, uncertain items). The worker
 * runs jobs in order, so this is what bounds the wait of the result bar's
 * next run to a single background job. `wanted` is checked once the slot is
 * free: a job whose gate closed while it waited is never sent.
 */
let backgroundTail: Promise<unknown> = Promise.resolve()

export function runInBackgroundSlot(
  params: SimulationParams,
  wanted: () => boolean
): Promise<SimulationResults | null> {
  const job = backgroundTail.then(async () => {
    if (!wanted()) return null
    const { runSimulationInClient } = await import('@/lib/simulation/workerClient')
    if (!wanted()) return null
    return runSimulationInClient(params)
  })
  backgroundTail = job.catch(() => null)
  return job
}

export interface SettledBase {
  /** `shouldMeasureLevers` for the current page state. */
  gateOpen: boolean
  /** The gate, readable from async code. */
  gateRef: RefObject<boolean>
  /**
   * Results that have stood for `LEVER_SETTLE_MS` with the gate open — the
   * base every background measurement is taken against.
   */
  settled: SimulationResults | null
}

/**
 * The gate and settle timer every background measurement shares: the list is
 * near the screen, no panel is open, nothing is running or held, and the
 * shown results describe the current draft — for `LEVER_SETTLE_MS`.
 */
export function useSettledBase({
  near,
  holding,
}: {
  near: boolean
  holding: boolean
}): SettledBase {
  const { editor, mode } = useWorkspace()
  // Deferred inside the page's results scope: a landing run reaches the list
  // after the result bar. The settle timer and the `getState()` checks
  // compare against the store, so a superseded result is never measured.
  const results = useSimulationResults()
  // Narrow selectors: while a slider is scrubbed these flip a few times, and
  // only then does the list re-render.
  const busy = useSimulationStore((state) =>
    isRunBusy({
      loading: state.isLoading,
      pending: state.pendingRun,
      suspended: state.autoRunSuspended,
      stale: false,
      hasResults: state.results !== null,
      error: state.error,
      holding: false,
    })
  )
  const current = useSimulationStore(
    (state) =>
      state.results !== null && areSimulationParamsEqual(state.params, state.results.params)
  )

  const gateOpen = shouldMeasureLevers({
    near,
    editorOpen: editor !== null,
    comparing: mode === 'compare',
    busy,
    current,
    holding,
  })
  const gateRef = useRef(gateOpen)
  useEffect(() => {
    gateRef.current = gateOpen
  }, [gateOpen])

  const [settled, setSettled] = useState<SimulationResults | null>(null)
  useEffect(() => {
    if (!gateOpen || !results || settled === results) return
    const timer = setTimeout(() => setSettled(results), LEVER_SETTLE_MS)
    return () => clearTimeout(timer)
  }, [gateOpen, results, settled])

  return { gateOpen, gateRef, settled }
}

export interface LeverMeasurementsState {
  /** The last complete measurement (possibly for an older draft). */
  measurement: LeverMeasurement | null
  /** `measurement` describes the current draft: its actions are safe to use. */
  fresh: boolean
  /** Lever runs are on the worker right now. */
  measuring: boolean
}

/**
 * Measures the three stress levers against the hero's result — at the hero's
 * run count over the same common random numbers, so the baseline is literally
 * the result bar's figure.
 *
 * Runs only when `shouldMeasureLevers` allows it and the inputs have settled
 * for `LEVER_SETTLE_MS`. The runs go to the worker one at a time and each is
 * re-checked against the gate before it is sent, so the moment the reader
 * touches something at most one lever run is still ahead of the main run.
 * Finished runs are cached by fingerprint, so an interrupted measurement
 * resumes instead of starting over, and a re-opened gate with nothing changed
 * measures nothing.
 */
export function useLeverMeasurements({
  near,
  holding,
}: {
  near: boolean
  holding: boolean
}): LeverMeasurementsState {
  const { gateOpen, gateRef, settled } = useSettledBase({ near, holding })

  const [measurement, setMeasurement] = useState<LeverMeasurement | null>(null)
  const [measuring, setMeasuring] = useState(false)
  const cacheRef = useRef<{ fingerprint: string; byId: Map<ScenarioId, LeverResult> } | null>(null)
  const measuredFingerprint = measurement?.fingerprint ?? null

  useEffect(() => {
    if (!settled || !gateOpen) return
    // Settled results that are no longer the store's are superseded; the
    // settle timer brings the new ones.
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

    const run = async () => {
      setMeasuring(true)
      try {
        for (const scenario of buildScenarioParams(settled.params)) {
          if (cache.byId.has(scenario.id)) continue
          if (!wanted()) return
          const scenarioResults = await runInBackgroundSlot(scenario.params, wanted)
          if (!scenarioResults) return
          // Valid for this fingerprint even if the gate closed meanwhile.
          cache.byId.set(scenario.id, measureLever(scenario.id, settled, scenarioResults))
        }
        if (cancelled) return
        const saturated = isLeverSaturated(settled.successRate)
        setMeasurement({
          fingerprint,
          base: settled,
          levers: sortLeverResults([...cache.byId.values()], saturated),
          saturated,
        })
      } catch {
        // The levers are an extra; a failed run keeps the last measurement.
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

  return { measurement, fresh, measuring }
}
