import { DEFAULT_PARAMS, SimulationParams, SimulationResults } from '@/types'
import { deriveDepletionAges } from '../depletion'
import { buildPlanWarnings } from '../warnings'

function makeResults(
  overrides: Partial<SimulationResults> = {},
  params: SimulationParams = DEFAULT_PARAMS
): SimulationResults {
  const ages: number[] = []
  for (let age = params.currentAge; age <= params.endAge; age++) ages.push(age)
  const flat = (value: number) => ages.map(() => value)
  return {
    ages,
    assetPercentiles: {
      // Realistically high medians: the default params carry ~€62.9k annual expenses,
      // so a small flat median would (correctly) trigger the highWithdrawal warning
      // and break the "healthy plan" test below.
      p10: flat(800_000),
      p20: flat(1_200_000),
      p50: flat(2_000_000),
      p80: flat(2_500_000),
      p90: flat(3_000_000),
    },
    spendingPercentiles: {
      p10: flat(3000),
      p20: flat(3500),
      p50: flat(4000),
      p80: flat(4500),
      p90: flat(5000),
    },
    successRate: 90,
    depletionByAge: flat(0),
    params,
    ...overrides,
  }
}

describe('deriveDepletionAges', () => {
  it('returns null when no percentile depletes', () => {
    expect(deriveDepletionAges(makeResults())).toEqual({
      p10DepletionAge: null,
      p50DepletionAge: null,
    })
  })

  it('finds the first at-or-after-retirement age where a percentile hits zero', () => {
    const results = makeResults()
    // Deplete P10 from age 78 onward
    results.assetPercentiles.p10 = results.ages.map((age) => (age >= 78 ? 0 : 100_000))
    expect(deriveDepletionAges(results).p10DepletionAge).toBe(78)
    expect(deriveDepletionAges(results).p50DepletionAge).toBeNull()
  })

  it('ignores zero assets before retirement', () => {
    const results = makeResults()
    results.assetPercentiles.p10 = results.ages.map((age) =>
      age < results.params.retirementAge ? 0 : 100_000
    )
    expect(deriveDepletionAges(results).p10DepletionAge).toBeNull()
  })
})

describe('buildPlanWarnings', () => {
  it('is empty for a healthy default plan', () => {
    expect(buildPlanWarnings(DEFAULT_PARAMS, makeResults())).toEqual([])
  })

  it('flags inconsistent ages even without results', () => {
    const warnings = buildPlanWarnings({ ...DEFAULT_PARAMS, retirementAge: 90, endAge: 90 }, null)
    expect(warnings).toEqual([{ id: 'inconsistentAges' }])
  })

  it('flags median depletion', () => {
    const results = makeResults()
    results.assetPercentiles.p50 = results.ages.map((age) => (age >= 80 ? 0 : 100_000))
    const warnings = buildPlanWarnings(DEFAULT_PARAMS, results)
    expect(warnings).toContainEqual({ id: 'medianDepletion', age: 80 })
  })

  it('flags an unsustainable first-year withdrawal rate', () => {
    const results = makeResults()
    // Median assets at retirement of 100k vs ~46k annual portfolio need -> way above 6%
    results.assetPercentiles.p50 = results.ages.map(() => 100_000)
    const warnings = buildPlanWarnings(DEFAULT_PARAMS, results)
    expect(warnings.some((w) => w.id === 'highWithdrawal')).toBe(true)
  })

  it('flags a bridge gap when the bridge need exceeds retirement median assets', () => {
    const results = makeResults()
    results.assetPercentiles.p50 = results.ages.map(() => 50_000)
    const warnings = buildPlanWarnings(DEFAULT_PARAMS, results)
    expect(warnings.some((w) => w.id === 'bridgeGap')).toBe(true)
  })
})
