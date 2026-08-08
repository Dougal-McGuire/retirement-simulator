import { DEFAULT_PARAMS, type SimulationResults } from '@/types'
import { runMonteCarloSimulation, hashSimulationParams } from '@/lib/simulation/engine'
import { areSimulationParamsEqual, buildPlanInsightMetrics } from '@/lib/simulation/planInsights'
import { useDisplayStore } from '@/lib/stores/displayStore'
import { useSimulationStore } from '@/lib/stores/simulationStore'

/**
 * `displayReal` is a view preference, not a model input. These tests pin the
 * two properties that make the toggle free: it cannot reach the simulation, and
 * results produced before it existed still render.
 */
describe('display preference', () => {
  beforeEach(() => {
    useDisplayStore.setState({ displayReal: false })
  })

  it('defaults to nominal and round-trips', () => {
    expect(useDisplayStore.getState().displayReal).toBe(false)
    useDisplayStore.getState().setDisplayReal(true)
    expect(useDisplayStore.getState().displayReal).toBe(true)
  })

  it('is not part of the simulation params, the hash, or the staleness check', () => {
    const params = useSimulationStore.getState().params

    expect(Object.keys(params)).not.toContain('displayReal')

    const before = hashSimulationParams(params)
    useDisplayStore.getState().setDisplayReal(true)
    const after = hashSimulationParams(useSimulationStore.getState().params)

    expect(after).toBe(before)
    expect(areSimulationParamsEqual(useSimulationStore.getState().params, params)).toBe(true)
    // ...and the two stores share no state at all.
    expect(useSimulationStore.getState()).not.toHaveProperty('displayReal')
  })

  it('flipping the toggle does not invalidate persisted results', () => {
    const results = runMonteCarloSimulation(DEFAULT_PARAMS)
    useDisplayStore.getState().setDisplayReal(true)

    expect(areSimulationParamsEqual(DEFAULT_PARAMS, results.params)).toBe(true)
  })
})

describe('plan insight metrics under the display flag', () => {
  const results = runMonteCarloSimulation({ ...DEFAULT_PARAMS, simulationRuns: 100 })

  it('reports smaller euro figures in real terms', () => {
    const nominal = buildPlanInsightMetrics(DEFAULT_PARAMS, results)
    const real = buildPlanInsightMetrics(DEFAULT_PARAMS, results, { displayReal: true })

    expect(real.horizonMedianAssets).toBeLessThan(nominal.horizonMedianAssets)
    expect(real.retirementMedianAssets).toBeLessThan(nominal.retirementMedianAssets)
    // Base-year amounts are already in today's euros and must not move.
    expect(real.annualSpending).toBe(nominal.annualSpending)
    expect(real.pensionAnnual).toBe(nominal.pensionAnnual)
    expect(real.realReturn).toBe(nominal.realReturn)
  })

  it('falls back to nominal for results persisted before the real series existed', () => {
    const legacy = { ...results } as SimulationResults
    delete legacy.assetPercentilesReal
    delete legacy.spendingPercentilesReal
    delete legacy.inflationIndexP50

    const nominal = buildPlanInsightMetrics(DEFAULT_PARAMS, legacy)
    const asReal = buildPlanInsightMetrics(DEFAULT_PARAMS, legacy, { displayReal: true })

    expect(asReal).toEqual(nominal)
  })

  it('tolerates having no results at all', () => {
    expect(() =>
      buildPlanInsightMetrics(DEFAULT_PARAMS, null, { displayReal: true })
    ).not.toThrow()
  })
})
