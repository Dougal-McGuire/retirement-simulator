import {
  buildSimulationContext,
  effectiveRunCount,
  simulationFingerprint,
  successDefinitionFor,
} from '@/lib/simulation/context'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import { HISTORICAL_PATH_COUNT } from '@/lib/simulation/data/historicalMarket'
import { DEFAULT_PARAMS, type SimulationParams } from '@/types'

const params = (patch: Partial<SimulationParams> = {}): SimulationParams => ({
  ...DEFAULT_PARAMS,
  simulationRuns: 200,
  ...patch,
})

describe('effectiveRunCount', () => {
  it('is the requested count under Monte Carlo', () => {
    expect(effectiveRunCount(params({ simulationRuns: 750 }))).toBe(750)
  })

  it('is the number of available start years under the historical model', () => {
    expect(effectiveRunCount(params({ marketModel: 'historical', simulationRuns: 5000 }))).toBe(
      HISTORICAL_PATH_COUNT
    )
  })
})

describe('successDefinitionFor', () => {
  it('is plain depletion without a bequest goal', () => {
    expect(successDefinitionFor({ legacyTargetReal: 0 })).toBe('depletion')
  })

  it('is legacy-conditioned once a goal is set', () => {
    expect(successDefinitionFor({ legacyTargetReal: 1 })).toBe('legacyConditioned')
  })
})

describe('buildSimulationContext', () => {
  it('describes a Monte Carlo run at the engine’s own run count', () => {
    const input = params({ simulationRuns: 200 })
    const results = runMonteCarloSimulation(input)
    const context = buildSimulationContext(input, results)

    expect(context.marketModel).toBe('monteCarlo')
    expect(context.effectiveRuns).toBe(200)
    expect(context.successDefinition).toBe('depletion')
    expect(context.successRate).toBe(results.successRate)
    // Without a bequest goal the two definitions must collapse onto one number.
    expect(context.depletionSuccessRate).toBe(results.successRate)
    expect(context.hasResults).toBe(true)
  })

  it('reports the historical path count, not the requested run count', () => {
    const input = params({ marketModel: 'historical', simulationRuns: 5000 })
    const results = runMonteCarloSimulation(input)
    const context = buildSimulationContext(input, results)

    expect(context.marketModel).toBe('historical')
    expect(context.effectiveRuns).toBe(HISTORICAL_PATH_COUNT)
    expect(context.successCount).toBe(Math.round((results.successRate / 100) * 125))
    expect(context.historical.firstYear).toBe(1900)
    expect(context.historical.lastYear).toBe(2024)
  })

  it('separates the legacy-conditioned rate from plain survival', () => {
    const input = params({ legacyTargetReal: 400_000 })
    const results = runMonteCarloSimulation(input)
    const context = buildSimulationContext(input, results)

    expect(context.successDefinition).toBe('legacyConditioned')
    expect(context.legacyTargetReal).toBe(400_000)
    expect(context.successRate).toBe(results.successRate)
    expect(context.depletionSuccessRate).toBe(results.depletionSuccessRate)
    // A bequest goal can only ever be a *harder* bar than survival.
    expect(context.successRate).toBeLessThanOrEqual(context.depletionSuccessRate)
    expect(context.depletionRisk).toBeCloseTo(100 - context.depletionSuccessRate, 6)
  })

  it('counts the simulated years inclusively, matching the engine’s age grid', () => {
    const input = params({ currentAge: 55, endAge: 90 })
    const results = runMonteCarloSimulation(input)
    const context = buildSimulationContext(input, results)

    expect(results.ages).toHaveLength(36)
    expect(context.horizonYears).toBe(36)
    expect(context.firstAge).toBe(55)
    expect(context.lastAge).toBe(90)
  })

  it('describes the parameters the results were produced with, not the edited ones', () => {
    const ran = params({ simulationRuns: 200 })
    const results = runMonteCarloSimulation(ran)
    // The user has since switched the working copy to the historical model but
    // no run has happened yet; the caption must still describe what is on screen.
    const context = buildSimulationContext(params({ marketModel: 'historical' }), results)

    expect(context.marketModel).toBe('monteCarlo')
    expect(context.effectiveRuns).toBe(200)
  })

  it('falls back to a runnable description before the first run', () => {
    const context = buildSimulationContext(params({ simulationRuns: 300 }), null)

    expect(context.hasResults).toBe(false)
    expect(context.effectiveRuns).toBe(300)
    expect(context.successRate).toBe(0)
    expect(context.horizonYears).toBe(36)
  })
})

describe('simulationFingerprint', () => {
  it('is stable for identical parameters', () => {
    expect(simulationFingerprint(params())).toBe(simulationFingerprint(params()))
  })

  it('changes when any engine input changes', () => {
    const base = simulationFingerprint(params())
    expect(simulationFingerprint(params({ retirementAge: 61 }))).not.toBe(base)
    expect(simulationFingerprint(params({ legacyTargetReal: 1 }))).not.toBe(base)
    expect(simulationFingerprint(params({ marketModel: 'historical' }))).not.toBe(base)
  })

  it('ignores the requested run count once the historical model fixes it', () => {
    expect(simulationFingerprint(params({ marketModel: 'historical', simulationRuns: 400 }))).toBe(
      simulationFingerprint(params({ marketModel: 'historical', simulationRuns: 5000 }))
    )
  })

  it('is order-independent across list parameters', () => {
    const forwards = params()
    const reversed = params({ customExpenses: [...DEFAULT_PARAMS.customExpenses].reverse() })
    expect(simulationFingerprint(reversed)).toBe(simulationFingerprint(forwards))
  })
})
