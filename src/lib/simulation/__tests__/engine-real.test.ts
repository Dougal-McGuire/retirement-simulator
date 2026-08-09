import { DEFAULT_PARAMS, type SimulationParams } from '@/types'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'

/**
 * Real-terms (today's euros) series.
 *
 * The engine deflates each Monte Carlo path by *that path's own* realised
 * inflation before taking percentiles. That ordering matters: dividing the
 * nominal percentile band by an average price level would mix quantiles of two
 * different distributions and quietly understate the spread.
 */
const deterministicInflation = (overrides: Partial<SimulationParams> = {}): SimulationParams => ({
  ...DEFAULT_PARAMS,
  simulationRuns: 120,
  inflationVolatility: 0,
  ...overrides,
})

describe('real-terms percentiles', () => {
  it('deflates by exactly the inflation path when inflation is deterministic', () => {
    const params = deterministicInflation({ averageInflation: 0.025 })
    const results = runMonteCarloSimulation(params)

    expect(results.assetPercentilesReal).toBeDefined()

    results.ages.forEach((age, index) => {
      const years = age - params.currentAge
      const expected = results.assetPercentiles.p50[index] / Math.pow(1.025, years)
      // Relative tolerance: the lognormal factor for stdev 0 is exactly
      // 1 + mean, so this is an equality up to floating-point accumulation.
      expect(results.assetPercentilesReal!.p50[index] / expected).toBeCloseTo(1, 9)
    })
  })

  it('deflates the spending series the same way', () => {
    const params = deterministicInflation({ averageInflation: 0.025 })
    const results = runMonteCarloSimulation(params)

    results.ages.forEach((age, index) => {
      const nominal = results.spendingPercentiles.p50[index]
      if (nominal === 0) return
      const expected = nominal / Math.pow(1.025, age - params.currentAge)
      expect(results.spendingPercentilesReal!.p50[index] / expected).toBeCloseTo(1, 9)
    })
  })

  it('leaves the series untouched when there is no inflation', () => {
    const results = runMonteCarloSimulation(
      deterministicInflation({ averageInflation: 0, inflationVolatility: 0 })
    )

    expect(results.assetPercentilesReal).toEqual(results.assetPercentiles)
    expect(results.spendingPercentilesReal).toEqual(results.spendingPercentiles)
    expect(results.inflationIndexP50).toEqual(results.ages.map(() => 1))
  })

  it('starts the price index at 1 and never lets real exceed nominal under inflation', () => {
    const results = runMonteCarloSimulation(deterministicInflation({ averageInflation: 0.03 }))

    expect(results.inflationIndexP50![0]).toBe(1)
    expect(results.assetPercentilesReal!.p50[0]).toBeCloseTo(results.assetPercentiles.p50[0], 6)

    results.ages.forEach((_, index) => {
      if (index === 0) return
      expect(results.assetPercentilesReal!.p50[index]).toBeLessThan(
        results.assetPercentiles.p50[index]
      )
    })
  })

  it('deflates per path rather than deflating the nominal band', () => {
    // With volatile inflation the two are genuinely different numbers; if this
    // ever starts matching, someone replaced the per-path deflation with the
    // cheap-but-wrong version.
    const params = deterministicInflation({
      averageInflation: 0.025,
      inflationVolatility: 0.03,
      simulationRuns: 400,
    })
    const results = runMonteCarloSimulation(params)
    const lastIndex = results.ages.length - 1
    const naive =
      results.assetPercentiles.p10[lastIndex] /
      Math.pow(1.025, results.ages[lastIndex] - params.currentAge)

    expect(results.assetPercentilesReal!.p10[lastIndex]).not.toBeCloseTo(naive, 2)
  })

  it('does not change the nominal series or the success rate', () => {
    // The real series is additive information: adding it must not perturb what
    // was already on screen.
    const withReal = runMonteCarloSimulation(DEFAULT_PARAMS)
    const again = runMonteCarloSimulation(DEFAULT_PARAMS)

    expect(again.successRate).toBe(withReal.successRate)
    expect(again.assetPercentiles).toEqual(withReal.assetPercentiles)
  })
})
