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
      // An asset value is the balance at the END of that age's year, so it is
      // deflated by the price level at the end of that year: one more year of
      // inflation than the age's distance from today.
      const yearsOfInflation = age - params.currentAge + 1
      const expected = results.assetPercentiles.p50[index] / Math.pow(1.025, yearsOfInflation)
      // Relative tolerance: the lognormal factor for stdev 0 is exactly
      // 1 + mean, so this is an equality up to floating-point accumulation.
      expect(results.assetPercentilesReal!.p50[index] / expected).toBeCloseTo(1, 9)
    })
  })

  it('reads flat when the portfolio earns exactly inflation', () => {
    // No savings, no spending, return = inflation: in today's money nothing
    // happens. The series used to read 102,500 for these 100,000 at every age,
    // because closing balances were divided by the opening price level.
    const results = runMonteCarloSimulation({
      ...DEFAULT_PARAMS,
      currentAssets: 100_000,
      annualSavings: 0,
      retirementAge: 90,
      legalRetirementAge: 90,
      endAge: 90,
      averageROI: 0.025,
      roiVolatility: 0,
      averageInflation: 0.025,
      inflationVolatility: 0,
      capitalGainsTax: 0,
      simulationRuns: 1,
      monthlyPension: 0,
      customExpenses: [],
      cashFlows: [],
    })

    expect(results.assetPercentiles.p50[0]).toBeCloseTo(102_500, 6)
    results.assetPercentilesReal!.p50.forEach((value) => expect(value).toBeCloseTo(100_000, 6))
    results.sampleAssetPathsReal![0].forEach((value) => expect(value).toBeCloseTo(100_000, 6))
    // The ledger agrees: no real return, and each year closes where the next opens.
    results.cashFlowMeansReal!.forEach((row, index, rows) => {
      expect(row.openingAssets).toBeCloseTo(100_000, 6)
      expect(row.closingAssets).toBeCloseTo(100_000, 6)
      expect(row.investmentReturn).toBeCloseTo(0, 6)
      if (index > 0) expect(row.openingAssets).toBeCloseTo(rows[index - 1].closingAssets, 6)
    })
    // The nominal ledger still shows the 2.5% it earned in euros.
    expect(results.cashFlowMeans![0].investmentReturn).toBeCloseTo(2_500, 6)
  })

  it('closes every real ledger year where the next one opens, on stochastic paths too', () => {
    const results = runMonteCarloSimulation(
      deterministicInflation({ inflationVolatility: 0.02, simulationRuns: 1 })
    )
    const rows = results.cashFlowMeansReal!
    for (let index = 1; index < rows.length; index++) {
      expect(rows[index].openingAssets).toBeCloseTo(rows[index - 1].closingAssets, 6)
      expect(rows[index].closingAssets).toBeCloseTo(results.assetPercentilesReal!.p50[index], 6)
    }
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

    // The index is the price level each year OPENS with — what its flows are
    // priced at — so it starts at 1 and the first year's spending is in
    // today's euros as it stands.
    expect(results.inflationIndexP50![0]).toBe(1)
    expect(results.inflationIndexP50![1]).toBeCloseTo(1.03, 12)
    // The first asset value is already a year-end balance: one year of
    // inflation has passed.
    expect(results.assetPercentilesReal!.p50[0]).toBeCloseTo(
      results.assetPercentiles.p50[0] / 1.03,
      6
    )

    results.ages.forEach((_, index) => {
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
    // P90, not P10: since the withdrawal rule spends the pension instead of
    // banking it, the default plan's unlucky decile ends at zero — and zero
    // deflates to zero whichever way it is done.
    const naive =
      results.assetPercentiles.p90[lastIndex] /
      Math.pow(1.025, results.ages[lastIndex] - params.currentAge)

    expect(results.assetPercentiles.p90[lastIndex]).toBeGreaterThan(0)
    expect(results.assetPercentilesReal!.p90[lastIndex]).not.toBeCloseTo(naive, 2)
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
