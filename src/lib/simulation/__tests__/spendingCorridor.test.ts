import { DEFAULT_PARAMS, WITHDRAWAL_STRATEGIES, type SimulationParams } from '@/types'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import {
  baselineMonthlySpending,
  bestStrategyValues,
  buildPlannedSpendingPaths,
  buildSpendingCorridor,
  corridorReferenceAge,
  isBestValue,
  meanWithdrawalRate,
  plannedPathsAtDisplayUnit,
  ruleWithdrawalRate,
  summarizeStrategyOutcome,
  type StrategyOutcomeMetrics,
} from '@/lib/simulation/spendingCorridor'

/**
 * The planned corridor is the part of the planner a user is invited to *rely*
 * on, so it gets the same scrutiny as the engine: the floor has to be a real
 * lower bound on what the rule can pay out, not a plausible-looking line.
 */

const withParams = (overrides: Partial<SimulationParams> = {}): SimulationParams => ({
  ...DEFAULT_PARAMS,
  simulationRuns: 60,
  ...overrides,
})

const agesOf = (params: SimulationParams) => {
  const ages: number[] = []
  for (let age = params.currentAge; age <= params.endAge; age++) ages.push(age)
  return ages
}

describe('the plan budget the corridor is anchored to', () => {
  it('matches the engine’s own baseline: monthly plus annual/12', () => {
    // The shipped defaults: €3,700/month of monthly items and €18,500/year of
    // annual ones.
    expect(baselineMonthlySpending(DEFAULT_PARAMS)).toBeCloseTo(3700 + 18500 / 12, 6)
  })

  it('ignores windowed and one-off flows, exactly like the engine', () => {
    const params = withParams({
      cashFlows: [
        ...DEFAULT_PARAMS.cashFlows,
        {
          id: 'care',
          kind: 'expense',
          name: 'Care',
          amount: 2000,
          frequency: 'monthly',
          startAge: 80,
        },
        {
          id: 'roof',
          kind: 'expense',
          name: 'Roof',
          amount: 30000,
          frequency: 'once',
          startAge: 70,
        },
      ],
    })
    expect(baselineMonthlySpending(params)).toBeCloseTo(baselineMonthlySpending(DEFAULT_PARAMS), 6)
  })
})

describe('planned floor and ceiling paths', () => {
  it('promises nothing before retirement', () => {
    const params = withParams()
    const paths = buildPlannedSpendingPaths(params, agesOf(params))
    const beforeRetirement = params.retirementAge - params.currentAge

    for (let index = 0; index < beforeRetirement; index++) {
      expect(paths.floor[index]).toBeNull()
      expect(paths.ceiling[index]).toBeNull()
    }
    expect(paths.floor[beforeRetirement]).not.toBeNull()
  })

  it('collapses to a single flat line for fixed real spending', () => {
    const params = withParams({ withdrawalStrategy: 'fixedReal' })
    const paths = buildPlannedSpendingPaths(params, agesOf(params))
    const baseline = baselineMonthlySpending(params)

    const retirementIndex = params.retirementAge - params.currentAge
    paths.floor.slice(retirementIndex).forEach((value) => expect(value).toBeCloseTo(baseline, 6))
    paths.ceiling.slice(retirementIndex).forEach((value) => expect(value).toBeCloseTo(baseline, 6))
    expect(paths.hasFloor).toBe(true)
    expect(paths.hasCeiling).toBe(true)
  })

  it('compounds the Vanguard guardrails one year at a time', () => {
    const params = withParams({
      withdrawalStrategy: 'vanguardDynamic',
      dsFloorRate: -0.025,
      dsCeilingRate: 0.05,
    })
    const paths = buildPlannedSpendingPaths(params, agesOf(params))
    const baseline = baselineMonthlySpending(params)
    const retirementIndex = params.retirementAge - params.currentAge

    expect(paths.floor[retirementIndex]).toBeCloseTo(baseline, 6)
    expect(paths.floor[retirementIndex + 1]).toBeCloseTo(baseline * 0.975, 6)
    expect(paths.floor[retirementIndex + 10]).toBeCloseTo(baseline * Math.pow(0.975, 10), 6)
    expect(paths.ceiling[retirementIndex + 10]).toBeCloseTo(baseline * Math.pow(1.05, 10), 6)
  })

  it('uses the fixed ±10% Guyton-Klinger adjustments', () => {
    const params = withParams({ withdrawalStrategy: 'guytonKlinger' })
    const paths = buildPlannedSpendingPaths(params, agesOf(params))
    const baseline = baselineMonthlySpending(params)
    const retirementIndex = params.retirementAge - params.currentAge

    const realCut = 0.9 / (1 + params.averageInflation)
    expect(paths.floor[retirementIndex + 5]).toBeCloseTo(baseline * Math.pow(realCut, 5), 6)
    expect(paths.ceiling[retirementIndex + 5]).toBeCloseTo(baseline * Math.pow(1.1, 5), 6)
    // The guardrails are constants, so the user's rate cannot move the corridor.
    const other = buildPlannedSpendingPaths(
      withParams({ withdrawalStrategy: 'guytonKlinger', dsWithdrawalRate: 0.035 }),
      agesOf(params)
    )
    expect(other.floor).toEqual(paths.floor)
  })

  it('gives percent-of-portfolio a flat real floor, or none at all', () => {
    const params = withParams({ withdrawalStrategy: 'percentOfPortfolio', spendingFloorReal: 0 })
    const bare = buildPlannedSpendingPaths(params, agesOf(params))
    expect(bare.hasFloor).toBe(false)
    expect(bare.hasCeiling).toBe(false)
    expect(bare.caveat).toBe('none')

    const floored = buildPlannedSpendingPaths(
      { ...params, spendingFloorReal: 36_000 },
      agesOf(params)
    )
    const retirementIndex = params.retirementAge - params.currentAge
    expect(floored.floor[retirementIndex]).toBeCloseTo(3000, 6)
    expect(floored.floor[retirementIndex + 20]).toBeCloseTo(3000, 6)
    expect(floored.hasCeiling).toBe(false)
    expect(floored.caveat).toBe('portfolioMustLast')
  })
})

describe('display units', () => {
  const params = withParams({ withdrawalStrategy: 'fixedReal' })
  const ages = agesOf(params)
  const paths = buildPlannedSpendingPaths(params, ages)

  it('leaves the paths alone in real mode', () => {
    expect(plannedPathsAtDisplayUnit(paths, [1, 1.5, 2], true)).toEqual(paths)
  })

  it('re-prices a today’s-euro floor with the median price level in nominal mode', () => {
    const index = ages.map((_, i) => 1 + i * 0.1)
    const nominal = plannedPathsAtDisplayUnit(paths, index, false)
    const retirementIndex = params.retirementAge - params.currentAge

    expect(nominal.floor[retirementIndex]).toBeCloseTo(
      (paths.floor[retirementIndex] as number) * index[retirementIndex],
      6
    )
    // Nulls stay nulls: an inflated "nothing" is still nothing.
    expect(nominal.floor[0]).toBeNull()
  })
})

describe('the floor really is a lower bound', () => {
  // Inflation volatility off: the Guyton-Klinger floor is stated at the plan's
  // central inflation assumption (see `corridorFactors`), so this is the
  // setting in which the bound is an identity rather than an estimate.
  //
  // A scheduled expense is in the plan on purpose: the planned lines carry it
  // (it is paid on top of the rule), so the bound has to hold with it.
  const scheduled = [
    ...DEFAULT_PARAMS.cashFlows,
    {
      id: 'care',
      kind: 'expense' as const,
      name: 'Care',
      amount: 1500,
      frequency: 'monthly' as const,
      startAge: 80,
    },
  ]

  it.each(['fixedReal', 'vanguardDynamic', 'guytonKlinger'] as const)(
    '%s never spends below its own planned floor while the portfolio lasts',
    (withdrawalStrategy) => {
      // The floor is measured against real spending, and the engine's own P10
      // is the lowest decile of that distribution. A floor that dips below what
      // even the unluckiest futures produce would be advertising a guarantee
      // the rule does not actually make. A portfolio no market can empty, so
      // every path is still paying what its rule asks for.
      const params = withParams({
        withdrawalStrategy,
        inflationVolatility: 0,
        currentAssets: 20_000_000,
        cashFlows: scheduled,
      })
      const results = runMonteCarloSimulation(params)
      const paths = buildPlannedSpendingPaths(params, results.ages)
      const real = results.spendingPercentilesReal!

      expect(results.depletionByAge![results.ages.length - 1]).toBe(0)
      results.ages.forEach((age, index) => {
        const floor = paths.floor[index]
        if (floor === null) return
        // A tiny tolerance: the engine compounds realised inflation path by
        // path, the corridor divides it out analytically.
        expect(real.p10[index]).toBeGreaterThanOrEqual(floor * 0.999 - 1e-6)
      })
    }
  )

  it.each(['fixedReal', 'vanguardDynamic', 'guytonKlinger'] as const)(
    '%s never *asks* for less than its floor, even on paths that run dry',
    (withdrawalStrategy) => {
      // The shipped default plan, where a good share of the paths do run out.
      // What they could still pay drops below the floor — that is the caveat
      // printed next to it — but what the rule requests never does. Requested
      // spending is in the ledger; its mean is bounded by the floor because
      // every single path is.
      const params = withParams({
        withdrawalStrategy,
        inflationVolatility: 0,
        cashFlows: scheduled,
      })
      const results = runMonteCarloSimulation(params)
      const paths = buildPlannedSpendingPaths(params, results.ages)

      results.ages.forEach((age, index) => {
        const floor = paths.floor[index]
        if (floor === null) return
        const requestedMonthly = results.cashFlowMeansReal![index].expenses / 12
        expect(requestedMonthly).toBeGreaterThanOrEqual(floor * 0.999 - 1e-6)
      })
    }
  )

  it('lets paid spending fall through the floor once the money is gone', () => {
    const params = withParams({ withdrawalStrategy: 'fixedReal', inflationVolatility: 0 })
    const results = runMonteCarloSimulation(params)
    const paths = buildPlannedSpendingPaths(params, results.ages)
    const last = results.ages.length - 1

    expect(results.depletionByAge![last]).toBeGreaterThan(0.1)
    expect(results.spendingPercentilesReal!.p10[last]).toBeLessThan(paths.floor[last] as number)
    expect(paths.caveat).toBe('portfolioMustLast')
  })
})

describe('the planned lines carry the scheduled expenses', () => {
  const care = {
    id: 'care',
    kind: 'expense' as const,
    name: 'Care',
    amount: 1500,
    frequency: 'monthly' as const,
    startAge: 80,
  }
  const roof = {
    id: 'roof',
    kind: 'expense' as const,
    name: 'Roof',
    amount: 30_000,
    frequency: 'once' as const,
    startAge: 70,
    inflationLinked: false,
  }

  it('adds each age’s scheduled expenses to floor and ceiling alike', () => {
    const plain = withParams({ withdrawalStrategy: 'vanguardDynamic' })
    const withFlows = withParams({
      withdrawalStrategy: 'vanguardDynamic',
      cashFlows: [...DEFAULT_PARAMS.cashFlows, care, roof],
    })
    const ages = agesOf(plain)
    const base = buildPlannedSpendingPaths(plain, ages)
    const lifted = buildPlannedSpendingPaths(withFlows, ages)
    const at = (age: number) => age - plain.currentAge

    for (const line of ['floor', 'ceiling'] as const) {
      // Nothing scheduled at 75: the lines are the rule's own.
      expect(lifted[line][at(75)]).toBeCloseTo(base[line][at(75)] as number, 6)
      // Care from 80, inflation-linked: +1,500 a month in today's euros.
      expect(lifted[line][at(80)]).toBeCloseTo((base[line][at(80)] as number) + 1500, 6)
      expect(lifted[line][at(90)]).toBeCloseTo((base[line][at(90)] as number) + 1500, 6)
      // The roof is 30,000 *nominal* euros at 70: worth 30,000 / 1.025^15 today.
      expect(lifted[line][at(70)]).toBeCloseTo(
        (base[line][at(70)] as number) + 30_000 / Math.pow(1.025, 15) / 12,
        6
      )
    }
  })

  it('keeps the median inside the corridor in the years care costs are paid', () => {
    // Under fixed real spending floor and ceiling are one line, and before
    // this the median sat €1,500 above its own "ceiling" from 80 on.
    const params = withParams({
      withdrawalStrategy: 'fixedReal',
      simulationRuns: 200,
      inflationVolatility: 0,
      cashFlows: [...DEFAULT_PARAMS.cashFlows, care],
    })
    const results = runMonteCarloSimulation(params)
    const { points } = buildSpendingCorridor(params, results, true)
    const budget = baselineMonthlySpending(params)

    const at79 = points.find((point) => point.age === 79)!
    const at80 = points.find((point) => point.age === 80)!
    expect(at79.ceiling).toBeCloseTo(budget, 6)
    expect(at80.ceiling).toBeCloseTo(budget + 1500, 6)
    expect(at80.floor).toBeCloseTo(budget + 1500, 6)
    points.forEach((point) => {
      expect(point.spending_p50).toBeLessThanOrEqual((point.ceiling as number) * (1 + 1e-9))
      expect(point.spending_p90).toBeLessThanOrEqual((point.ceiling as number) * (1 + 1e-9))
    })
    expect(at80.spending_p50).toBeCloseTo(budget + 1500, 6)
  })

  it('never lets any rule’s spending exceed its ceiling', () => {
    for (const withdrawalStrategy of ['vanguardDynamic', 'guytonKlinger'] as const) {
      const params = withParams({
        withdrawalStrategy,
        inflationVolatility: 0,
        currentAssets: 5_000_000,
        cashFlows: [...DEFAULT_PARAMS.cashFlows, care, roof],
      })
      const results = runMonteCarloSimulation(params)
      const { points } = buildSpendingCorridor(params, results, true)
      points.forEach((point) => {
        expect(point.spending_p90).toBeLessThanOrEqual((point.ceiling as number) * 1.001)
      })
    }
  })

  it('leaves a bare percentage rule without lines, scheduled expenses or not', () => {
    const params = withParams({
      withdrawalStrategy: 'percentOfPortfolio',
      spendingFloorReal: 0,
      cashFlows: [...DEFAULT_PARAMS.cashFlows, care],
    })
    const paths = buildPlannedSpendingPaths(params, agesOf(params))
    expect(paths.hasFloor).toBe(false)
    expect(paths.hasCeiling).toBe(false)
  })
})

describe('strategy metrics', () => {
  it('reports the reference age it measured at, clamped to the horizon', () => {
    expect(corridorReferenceAge(withParams())).toBe(80)
    expect(corridorReferenceAge(withParams({ endAge: 75, retirementAge: 62 }))).toBe(75)
    expect(corridorReferenceAge(withParams({ retirementAge: 85, endAge: 95 }))).toBe(85)
  })

  it('is deterministic for a given plan', () => {
    const params = withParams({ withdrawalStrategy: 'guytonKlinger' })
    const first = summarizeStrategyOutcome(params, runMonteCarloSimulation(params))
    const second = summarizeStrategyOutcome(params, runMonteCarloSimulation({ ...params }))
    expect(second).toEqual(first)
  })

  it('reads every strategy without throwing, and always names a reference age', () => {
    WITHDRAWAL_STRATEGIES.forEach((withdrawalStrategy) => {
      const params = withParams({ withdrawalStrategy })
      const metrics = summarizeStrategyOutcome(params, runMonteCarloSimulation(params))
      expect(metrics.referenceAge).toBe(80)
      expect(metrics.firstYearMonthlySpending).toBeGreaterThan(0)
      expect(metrics.medianLifetimeSpending).toBeGreaterThan(0)
      expect(metrics.volatilityRatio).not.toBeNull()
    })
  })

  it('ranks spending stability the way the strategies are designed to', () => {
    const spread = (
      withdrawalStrategy: SimulationParams['withdrawalStrategy'],
      overrides: Partial<SimulationParams> = {}
    ) => {
      const params = withParams({ withdrawalStrategy, ...overrides })
      return summarizeStrategyOutcome(params, runMonteCarloSimulation(params)).volatilityRatio ?? 0
    }

    // Fixed real spending is by construction the same in every future the
    // portfolio survives; the pure percentage rule inherits the full spread of
    // the market.
    const funded = { currentAssets: 5_000_000 }
    expect(spread('fixedReal', funded)).toBeCloseTo(1, 3)
    expect(spread('percentOfPortfolio', funded)).toBeGreaterThan(spread('guytonKlinger', funded))
    expect(spread('guytonKlinger', funded)).toBeGreaterThan(1)
  })

  it('measures stability on what was paid: a fixed budget that runs dry is not stable', () => {
    // The shipped default under fixed real spending: by 80 the unlucky decile
    // is out of money and living on the pension. The old series reported the
    // budget for those paths too and called the strategy perfectly stable.
    const params = withParams({ withdrawalStrategy: 'fixedReal', simulationRuns: 200 })
    const results = runMonteCarloSimulation(params)
    const metrics = summarizeStrategyOutcome(params, results)

    expect(results.depletionByAge![results.ages.indexOf(80)]).toBeGreaterThan(0.1)
    expect(metrics.volatilityRatio as number).toBeGreaterThan(1.2)
    // Lifetime spending is the paid median path, so it cannot exceed the budget.
    const years = params.endAge - params.retirementAge + 1
    expect(metrics.medianLifetimeSpending).toBeLessThanOrEqual(
      baselineMonthlySpending(params) * 12 * years * (1 + 1e-9)
    )
  })

  it('has no floor to report for a bare percentage rule', () => {
    const params = withParams({ withdrawalStrategy: 'percentOfPortfolio', spendingFloorReal: 0 })
    const metrics = summarizeStrategyOutcome(params, runMonteCarloSimulation(params))
    expect(metrics.guaranteedFloor).toBeNull()
  })
})

describe('corridor chart data', () => {
  const params = withParams({ withdrawalStrategy: 'vanguardDynamic' })
  const results = runMonteCarloSimulation(params)

  it('starts at retirement and carries the band plus both planned lines', () => {
    const { points, paths } = buildSpendingCorridor(params, results, true)

    expect(points[0].age).toBe(params.retirementAge)
    expect(points[points.length - 1].age).toBe(params.endAge)
    expect(paths.hasFloor).toBe(true)
    expect(paths.hasCeiling).toBe(true)
    points.forEach((point) => {
      expect(point.spending_band_lower).toBe(point.spending_p10)
      expect(point.spending_band_height).toBeCloseTo(point.spending_p90 - point.spending_p10, 6)
      expect(point.floor).not.toBeNull()
    })
  })

  it('draws a higher nominal floor than a real one, for the same plan', () => {
    const real = buildSpendingCorridor(params, results, true)
    const nominal = buildSpendingCorridor(params, results, false)
    const lastIndex = real.points.length - 1

    expect(nominal.points[lastIndex].floor as number).toBeGreaterThan(
      real.points[lastIndex].floor as number
    )
  })
})

describe('best value per comparison column', () => {
  const outcome = (overrides: Partial<StrategyOutcomeMetrics>): StrategyOutcomeMetrics => ({
    successRate: 90,
    firstYearMonthlySpending: 4000,
    medianLifetimeSpending: 1_000_000,
    guaranteedFloor: null,
    volatilityRatio: 1.5,
    referenceAge: 80,
    ...overrides,
  })

  it('takes the highest success, spending and floor, and the lowest spread', () => {
    const best = bestStrategyValues([
      outcome({ successRate: 88, guaranteedFloor: 3000, volatilityRatio: 1 }),
      outcome({ successRate: 97.5, medianLifetimeSpending: 1_200_000, volatilityRatio: 2.4 }),
      outcome({ guaranteedFloor: 3600, volatilityRatio: null }),
    ])
    expect(best).toEqual({
      successRate: 97.5,
      medianLifetimeSpending: 1_200_000,
      guaranteedFloor: 3600,
      volatilityRatio: 1,
    })
  })

  it('lets nobody win a column without a real value (no floor of zero is "best")', () => {
    const best = bestStrategyValues([
      outcome({ guaranteedFloor: 0, volatilityRatio: null }),
      outcome({ guaranteedFloor: null, volatilityRatio: Number.NaN }),
    ])
    expect(best?.guaranteedFloor).toBeNull()
    expect(best?.volatilityRatio).toBeNull()
    expect(bestStrategyValues([])).toBeNull()
  })

  it('matches winners with a floating-point tolerance', () => {
    expect(isBestValue(0.1 + 0.2, 0.3)).toBe(true)
    expect(isBestValue(0.31, 0.3)).toBe(false)
    expect(isBestValue(null, 0.3)).toBe(false)
    expect(isBestValue(0.3, null)).toBe(false)
  })
})

describe('mean withdrawal rate on the corridor', () => {
  const params = withParams({ withdrawalStrategy: 'vanguardDynamic' })
  const results = runMonteCarloSimulation(params)

  it('is mean gross withdrawal ÷ mean opening portfolio, age by age', () => {
    const { points } = buildSpendingCorridor(params, results, true)
    const means = results.cashFlowMeans!

    points.forEach((point) => {
      const flow = means[results.ages.indexOf(point.age)]
      expect(point.withdrawalRateMean).not.toBeNull()
      expect(point.withdrawalRateMean as number).toBeCloseTo(
        flow.portfolioWithdrawal / flow.openingAssets,
        12
      )
    })
    // Retirement is funded from the portfolio: a real, positive rate.
    expect(points[0].withdrawalRateMean as number).toBeGreaterThan(0)
    expect(points[0].withdrawalRateMean as number).toBeLessThan(0.5)
  })

  it('is the same ratio in today’s and in nominal euros', () => {
    const real = buildSpendingCorridor(params, results, true)
    const nominal = buildSpendingCorridor(params, results, false)
    expect(nominal.points.map((point) => point.withdrawalRateMean)).toEqual(
      real.points.map((point) => point.withdrawalRateMean)
    )
  })

  it('is null for results without cash-flow means (persisted by an older build)', () => {
    const legacy = { ...results, cashFlowMeans: undefined }
    const { points } = buildSpendingCorridor(params, legacy, true)
    expect(points.length).toBeGreaterThan(0)
    points.forEach((point) => expect(point.withdrawalRateMean).toBeNull())
  })

  it('is null for an empty portfolio instead of dividing by zero', () => {
    expect(meanWithdrawalRate({ openingAssets: 0, portfolioWithdrawal: 1200 })).toBeNull()
    expect(meanWithdrawalRate({ openingAssets: -5, portfolioWithdrawal: 0 })).toBeNull()
    expect(meanWithdrawalRate(undefined)).toBeNull()
    expect(meanWithdrawalRate({ openingAssets: 400_000, portfolioWithdrawal: 16_000 })).toBe(0.04)
  })
})

describe('the rule’s own withdrawal rate on the corridor', () => {
  // What the tooltip shows. `engine-incomeRules.test.ts` proves it is the rate
  // each rule used; this covers the plumbing around it.
  const params = withParams({ withdrawalStrategy: 'vanguardDynamic' })
  const results = runMonteCarloSimulation(params)

  it('is mean rule draw ÷ mean rule portfolio, and the same in either euro unit', () => {
    const real = buildSpendingCorridor(params, results, true)
    const nominal = buildSpendingCorridor(params, results, false)
    const means = results.cashFlowMeans!

    real.points.forEach((point, index) => {
      const row = means[results.ages.indexOf(point.age)]
      expect(point.ruleWithdrawalRate as number).toBeCloseTo(
        row.ruleWithdrawal! / row.rulePortfolio!,
        12
      )
      expect(nominal.points[index].ruleWithdrawalRate).toBe(point.ruleWithdrawalRate)
    })
  })

  it('is below the gross rate: tax on the sale is not part of what the rule decided', () => {
    const { points } = buildSpendingCorridor(params, results, true)
    // First retirement year: no pension yet, no scheduled expenses, same base.
    expect(points[0].ruleWithdrawalRate as number).toBeGreaterThan(0)
    expect(points[0].ruleWithdrawalRate as number).toBeLessThan(
      points[0].withdrawalRateMean as number
    )
  })

  it('is null for rows without the two fields, or with an empty portfolio', () => {
    expect(ruleWithdrawalRate(undefined)).toBeNull()
    expect(ruleWithdrawalRate({})).toBeNull()
    expect(ruleWithdrawalRate({ ruleWithdrawal: 100, rulePortfolio: 0 })).toBeNull()
    expect(ruleWithdrawalRate({ ruleWithdrawal: 20_000, rulePortfolio: 400_000 })).toBe(0.05)
    const legacy = { ...results, cashFlowMeans: undefined }
    buildSpendingCorridor(params, legacy, true).points.forEach((point) =>
      expect(point.ruleWithdrawalRate).toBeNull()
    )
  })
})
