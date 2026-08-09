import { DEFAULT_PARAMS, WITHDRAWAL_STRATEGIES, type SimulationParams } from '@/types'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import {
  baselineMonthlySpending,
  buildPlannedSpendingPaths,
  buildSpendingCorridor,
  corridorReferenceAge,
  plannedPathsAtDisplayUnit,
  summarizeStrategyOutcome,
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
        { id: 'roof', kind: 'expense', name: 'Roof', amount: 30000, frequency: 'once', startAge: 70 },
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
  it.each(['fixedReal', 'vanguardDynamic', 'guytonKlinger'] as const)(
    '%s never spends below its own planned floor, in any simulated future',
    (withdrawalStrategy) => {
      // The floor is measured against real spending, and the engine's own P10
      // is the lowest decile of that distribution. A floor that dips below what
      // even the unluckiest futures produce would be advertising a guarantee
      // the rule does not actually make.
      // Inflation volatility off: the Guyton-Klinger floor is stated at the
      // plan's central inflation assumption (see `corridorFactors`), so this is
      // the setting in which the bound is an identity rather than an estimate.
      const params = withParams({ withdrawalStrategy, inflationVolatility: 0 })
      const results = runMonteCarloSimulation(params)
      const paths = buildPlannedSpendingPaths(params, results.ages)
      const real = results.spendingPercentilesReal!

      results.ages.forEach((age, index) => {
        const floor = paths.floor[index]
        if (floor === null) return
        // A tiny tolerance: the engine compounds realised inflation path by
        // path, the corridor divides it out analytically.
        expect(real.p10[index]).toBeGreaterThanOrEqual(floor * 0.999 - 1e-6)
      })
    }
  )
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
    const spread = (withdrawalStrategy: SimulationParams['withdrawalStrategy']) => {
      const params = withParams({ withdrawalStrategy })
      return summarizeStrategyOutcome(params, runMonteCarloSimulation(params)).volatilityRatio ?? 0
    }

    // Fixed real spending is by construction the same in every future; the pure
    // percentage rule inherits the full spread of the market.
    expect(spread('fixedReal')).toBeCloseTo(1, 3)
    expect(spread('percentOfPortfolio')).toBeGreaterThan(spread('guytonKlinger'))
    expect(spread('guytonKlinger')).toBeGreaterThan(1)
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
