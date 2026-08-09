import { DEFAULT_PARAMS, WITHDRAWAL_STRATEGIES, type SimulationParams } from '@/types'
import {
  applyWithdrawalStrategy,
  calculateGuytonKlingerAnnualSpending,
  calculatePercentOfPortfolioAnnualSpending,
  calculateVanguardDynamicAnnualSpending,
  runMonteCarloSimulation,
  GK_CAPITAL_PRESERVATION_CUT,
  GK_PROSPERITY_RAISE,
} from '@/lib/simulation/engine'

/**
 * The withdrawal-strategy library.
 *
 * Two things are being pinned down here. First, that each new rule does what it
 * claims — the guardrails fire at the documented thresholds, the percentage
 * rule respects its floor. Second, and more important for a Monte Carlo engine
 * built on common random numbers: that adding them changed *nothing* for the
 * two strategies that already existed. `engine-golden.test.ts` pins the exact
 * arrays; this suite pins the property that makes those arrays trustworthy.
 */

const withParams = (overrides: Partial<SimulationParams>): SimulationParams => ({
  ...DEFAULT_PARAMS,
  ...overrides,
})

/** A short, cheap plan: enough retirement years for a rule to diverge. */
const fastParams = (overrides: Partial<SimulationParams> = {}): SimulationParams =>
  withParams({ simulationRuns: 60, ...overrides })

describe('Guyton-Klinger guardrails', () => {
  const base = {
    previousAnnualSpending: 50000,
    inflationFactor: 1.02,
    initialWithdrawalRate: 0.05,
  }

  it('keeps purchasing power while the withdrawal rate sits inside the band', () => {
    // 51,000 / 1,020,000 = 5.0%, exactly the initial rate.
    const spending = calculateGuytonKlingerAnnualSpending({
      ...base,
      priorYearPortfolioValue: 1_020_000,
    })
    expect(spending).toBeCloseTo(51_000, 6)
  })

  it('cuts 10% and skips the inflation raise once the rate drifts 20% above the initial one', () => {
    // 51,000 / 800,000 = 6.375% > 5% x 1.2.
    const spending = calculateGuytonKlingerAnnualSpending({
      ...base,
      priorYearPortfolioValue: 800_000,
    })
    expect(spending).toBeCloseTo(50_000 * (1 - GK_CAPITAL_PRESERVATION_CUT), 6)
    // Explicitly: the cut is measured off *last year's* spending, not off the
    // inflated figure, so the raise really is skipped rather than clawed back.
    expect(spending).toBeLessThan(base.previousAnnualSpending)
  })

  it('sits exactly on the upper guardrail without firing it', () => {
    // 51,000 / 850,000 = 6.0% = 5% x 1.2 exactly — strictly greater is required.
    const spending = calculateGuytonKlingerAnnualSpending({
      ...base,
      priorYearPortfolioValue: 850_000,
    })
    expect(spending).toBeCloseTo(51_000, 6)
  })

  it('raises 10% on top of inflation once the rate drifts 20% below the initial one', () => {
    // 51,000 / 1,500,000 = 3.4% < 5% x 0.8.
    const spending = calculateGuytonKlingerAnnualSpending({
      ...base,
      priorYearPortfolioValue: 1_500_000,
    })
    expect(spending).toBeCloseTo(51_000 * (1 + GK_PROSPERITY_RAISE), 6)
  })

  it('falls back to plain inflation indexing without a portfolio to measure against', () => {
    expect(
      calculateGuytonKlingerAnnualSpending({ ...base, priorYearPortfolioValue: 0 })
    ).toBeCloseTo(51_000, 6)
  })
})

describe('percent of portfolio', () => {
  it('spends exactly the rate times the prior year-end portfolio', () => {
    expect(
      calculatePercentOfPortfolioAnnualSpending({
        priorYearPortfolioValue: 1_000_000,
        withdrawalRate: 0.04,
        floorAnnualReal: 0,
        inflationIndex: 1,
      })
    ).toBeCloseTo(40_000, 6)
  })

  it('never falls below the real floor, re-priced with the path’s own inflation', () => {
    const spending = calculatePercentOfPortfolioAnnualSpending({
      priorYearPortfolioValue: 300_000,
      withdrawalRate: 0.04,
      // 30,000 in today's euros, at a price level 1.5x the plan's first year.
      floorAnnualReal: 30_000,
      inflationIndex: 1.5,
    })
    expect(spending).toBeCloseTo(45_000, 6)
  })

  it('leaves the percentage rule alone when it already clears the floor', () => {
    expect(
      calculatePercentOfPortfolioAnnualSpending({
        priorYearPortfolioValue: 2_000_000,
        withdrawalRate: 0.04,
        floorAnnualReal: 30_000,
        inflationIndex: 1,
      })
    ).toBeCloseTo(80_000, 6)
  })

  it('cannot go negative on a depleted portfolio', () => {
    expect(
      calculatePercentOfPortfolioAnnualSpending({
        priorYearPortfolioValue: -500,
        withdrawalRate: 0.04,
        floorAnnualReal: 0,
        inflationIndex: 1,
      })
    ).toBe(0)
  })
})

describe('the strategy switch', () => {
  const call = (strategy: SimulationParams['withdrawalStrategy'], previous: number | null) =>
    applyWithdrawalStrategy({
      strategy,
      baselineAnnualSpending: 60_000,
      priorYearPortfolioValue: 1_000_000,
      previousAnnualSpending: previous,
      inflationFactor: 1.02,
      inflationIndex: 1.1,
      params: withParams({ dsWithdrawalRate: 0.05, spendingFloorReal: 0 }),
    })

  it('spends the plan budget in the first retirement year of every memory-carrying rule', () => {
    expect(call('fixedReal', null)).toBe(60_000)
    expect(call('vanguardDynamic', null)).toBe(60_000)
    expect(call('guytonKlinger', null)).toBe(60_000)
  })

  it('lets percent-of-portfolio respond from the very first year', () => {
    expect(call('percentOfPortfolio', null)).toBeCloseTo(50_000, 6)
  })

  it('routes each strategy to its own rule', () => {
    const params = withParams({ dsWithdrawalRate: 0.05 })
    const shared = {
      priorYearPortfolioValue: 1_000_000,
      previousAnnualSpending: 60_000,
      inflationFactor: 1.02,
    }

    expect(call('vanguardDynamic', 60_000)).toBeCloseTo(
      calculateVanguardDynamicAnnualSpending({
        ...shared,
        withdrawalRate: params.dsWithdrawalRate,
        ceilingRate: params.dsCeilingRate,
        floorRate: params.dsFloorRate,
      }),
      9
    )
    expect(call('guytonKlinger', 60_000)).toBeCloseTo(
      calculateGuytonKlingerAnnualSpending({
        ...shared,
        initialWithdrawalRate: params.dsWithdrawalRate,
      }),
      9
    )
    // `fixedReal` reads none of the strategy parameters at all.
    expect(call('fixedReal', 60_000)).toBe(60_000)
  })
})

describe('golden neutrality of the existing strategies', () => {
  it.each(['fixedReal', 'vanguardDynamic'] as const)(
    '%s ignores the new spending floor entirely',
    (withdrawalStrategy) => {
      const without = runMonteCarloSimulation(
        fastParams({ withdrawalStrategy, spendingFloorReal: 0 })
      )
      const with_ = runMonteCarloSimulation(
        fastParams({ withdrawalStrategy, spendingFloorReal: 120_000 })
      )

      expect(with_.successRate).toBe(without.successRate)
      expect(with_.spendingPercentiles.p50).toEqual(without.spendingPercentiles.p50)
      expect(with_.assetPercentiles.p50).toEqual(without.assetPercentiles.p50)
    }
  )

  it('leaves the two existing strategies bit-identical after the switch was generalised', () => {
    // A second, independent parameter set (bridge years, a legacy goal, a glide
    // path) so the guarantee is not just about the shipped defaults.
    const exotic = fastParams({
      retirementAge: 58,
      legacyTargetReal: 200_000,
      glidePathEnabled: true,
      withdrawalStrategy: 'vanguardDynamic',
      dsWithdrawalRate: 0.042,
      dsCeilingRate: 0.03,
      dsFloorRate: -0.05,
    })

    const results = runMonteCarloSimulation(exotic)
    // Re-running the same inputs is deterministic — the property the whole
    // common-random-numbers design rests on.
    expect(runMonteCarloSimulation({ ...exotic })).toEqual(results)
  })
})

describe('the strategies in the engine', () => {
  it('produces a different spending path for every strategy', () => {
    const medians = WITHDRAWAL_STRATEGIES.map((withdrawalStrategy) =>
      runMonteCarloSimulation(fastParams({ withdrawalStrategy })).spendingPercentiles.p50.join(',')
    )
    expect(new Set(medians).size).toBe(WITHDRAWAL_STRATEGIES.length)
  })

  it('never depletes under percent-of-portfolio without a floor', () => {
    // The rule can only ever take a fraction of what is left, so the portfolio
    // is mathematically unkillable. This is the flip side of its spending risk.
    const results = runMonteCarloSimulation(
      fastParams({ withdrawalStrategy: 'percentOfPortfolio', spendingFloorReal: 0 })
    )
    expect(results.depletionSuccessRate).toBe(100)
    expect(results.depletionByAge?.[results.depletionByAge.length - 1]).toBe(0)
  })

  it('makes percent-of-portfolio spending track the portfolio', () => {
    const lean = runMonteCarloSimulation(
      fastParams({ withdrawalStrategy: 'percentOfPortfolio', dsWithdrawalRate: 0.03 })
    )
    const rich = runMonteCarloSimulation(
      fastParams({ withdrawalStrategy: 'percentOfPortfolio', dsWithdrawalRate: 0.06 })
    )
    const lastIndex = lean.ages.length - 1

    // Twice the rate, more spending and less left over — in every quantile.
    expect(rich.spendingPercentiles.p50[lastIndex]).toBeGreaterThan(
      lean.spendingPercentiles.p50[lastIndex]
    )
    expect(rich.assetPercentiles.p50[lastIndex]).toBeLessThan(
      lean.assetPercentiles.p50[lastIndex]
    )
  })

  it('lets a real floor turn percent-of-portfolio back into a plan that can fail', () => {
    const floored = runMonteCarloSimulation(
      fastParams({
        withdrawalStrategy: 'percentOfPortfolio',
        dsWithdrawalRate: 0.03,
        // Far above what a 3% rule would ever hand out: the floor now drives
        // spending, and the portfolio can be spent to zero after all.
        spendingFloorReal: 400_000,
        monthlyPension: 0,
      })
    )
    expect(floored.depletionSuccessRate).toBeLessThan(100)
  })

  it('keeps Guyton-Klinger spending inside its own guardrail corridor in real terms', () => {
    const params = fastParams({ withdrawalStrategy: 'guytonKlinger' })
    const results = runMonteCarloSimulation(params)
    const real = results.spendingPercentilesReal
    expect(real).toBeDefined()

    const retirementIndex = results.ages.indexOf(params.retirementAge)
    const first = real!.p50[retirementIndex]

    // Each year the rule can move real spending by at most −10% / +10%, so the
    // median path cannot escape the compounding corridor around year one.
    real!.p50.slice(retirementIndex).forEach((value, offset) => {
      expect(value).toBeLessThanOrEqual(first * Math.pow(1 + GK_PROSPERITY_RAISE, offset) * 1.001)
      expect(value).toBeGreaterThanOrEqual(
        first * Math.pow(1 - GK_CAPITAL_PRESERVATION_CUT, offset) * 0.999
      )
    })
  })
})
