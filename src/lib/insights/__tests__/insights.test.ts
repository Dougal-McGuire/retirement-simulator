import { DEFAULT_PARAMS, SimulationParams, SimulationResults } from '@/types'
import { computeBridgeAnalysis } from '../bridge'
import { computePlanHealthScore } from '../planHealth'
import { estimateRecommendationUplift, generateRecommendations } from '../recommendations'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'

function makeResults(successRate: number, params: SimulationParams = DEFAULT_PARAMS): SimulationResults {
  const ages: number[] = []
  for (let age = params.currentAge; age <= params.endAge; age++) ages.push(age)
  const flat = (value: number) => ages.map(() => value)
  return {
    ages,
    assetPercentiles: { p10: flat(100_000), p20: flat(200_000), p50: flat(500_000), p80: flat(800_000), p90: flat(900_000) },
    spendingPercentiles: { p10: flat(3000), p20: flat(3500), p50: flat(4000), p80: flat(4500), p90: flat(5000) },
    successRate,
    depletionByAge: flat(0),
    params,
  }
}

describe('computeBridgeAnalysis', () => {
  it('computes the retirement-to-pension gap with inflation-adjusted need', () => {
    const bridge = computeBridgeAnalysis(DEFAULT_PARAMS)
    expect(bridge.startAge).toBe(60)
    expect(bridge.endAge).toBe(66)
    expect(bridge.yearsInBridge).toBe(7)
    expect(bridge.cashNeedEUR).toBeGreaterThan(0)
    expect(bridge.cashBucketSharePct + bridge.portfolioSharePct).toBe(100)
  })

  it('reports no bridge when retiring at pension age', () => {
    const bridge = computeBridgeAnalysis({ ...DEFAULT_PARAMS, retirementAge: 67 })
    expect(bridge.yearsInBridge).toBe(0)
    expect(bridge.cashNeedEUR).toBe(0)
  })
})

describe('computePlanHealthScore', () => {
  it('matches the transformer summary exactly (parity)', () => {
    const results = makeResults(82)
    const report = transformToReportData(DEFAULT_PARAMS, results)
    const health = computePlanHealthScore(DEFAULT_PARAMS, results)
    const summary = report.summary!
    expect(health.score).toBe(summary.planHealthScore)
    expect(health.label).toBe(summary.planHealthLabel)
    expect(health.why).toBe(summary.planHealthWhy)
  })
})

describe('generateRecommendations', () => {
  it('tags every recommendation with a stable id and derives it from the plan', () => {
    const recs = generateRecommendations(DEFAULT_PARAMS, makeResults(60))
    expect(recs.length).toBeGreaterThan(0)
    recs.forEach((rec) => expect(typeof rec.id).toBe('string'))
    const ids = recs.map((rec) => rec.id)
    expect(ids).toContain('increaseSavings')
    expect(ids).toContain('delayRetirement')
    // The pension bridge is real in DEFAULT_PARAMS (retire 60, pension 67).
    expect(ids).toContain('bridgeLiquidity')
  })

  it('drops the US retail-planning boilerplate entirely', () => {
    const ids = generateRecommendations(DEFAULT_PARAMS, makeResults(60)).map((rec) => rec.id)
    expect(ids).not.toContain('maximizeTaxDeferred')
    expect(ids).not.toContain('reviewInsurance')
  })

  it('suggests optimizing the mix in the 70-90 band', () => {
    const ids = generateRecommendations(DEFAULT_PARAMS, makeResults(80)).map((rec) => rec.id)
    expect(ids).toContain('optimizeMix')
    expect(ids).not.toContain('increaseSavings')
  })

  it('offers no bridge advice when there is no bridge', () => {
    const params = { ...DEFAULT_PARAMS, retirementAge: 67 }
    const ids = generateRecommendations(params, makeResults(95, params)).map((rec) => rec.id)
    expect(ids).not.toContain('bridgeLiquidity')
    expect(ids).not.toContain('delayRetirement')
  })

  it('raises the Sparerpauschbetrag only against a measured tax drag', () => {
    const withoutDrag = generateRecommendations(DEFAULT_PARAMS, makeResults(95)).map((r) => r.id)
    expect(withoutDrag).not.toContain('taxAllowance')

    const withDrag = generateRecommendations(DEFAULT_PARAMS, {
      ...makeResults(95),
      withdrawalTaxDrag: 0.14,
    })
    const drag = withDrag.find((rec) => rec.id === 'taxAllowance')!
    expect(drag.impact).toBe('High')
    expect(drag.body).toMatch(/Freistellungsauftrag/)
  })

  it('flags a missing allowance instead of the drag when none is modelled', () => {
    const params = { ...DEFAULT_PARAMS, taxAllowanceAnnual: 0 }
    const rec = generateRecommendations(params, makeResults(95, params)).find(
      (entry) => entry.id === 'taxAllowance'
    )!
    expect(rec.body).toMatch(/Sparerpauschbetrag/)
  })

  it('writes German bodies with German figures when asked for de', () => {
    const recs = generateRecommendations(DEFAULT_PARAMS, makeResults(60), 'de')
    const savings = recs.find((rec) => rec.id === 'increaseSavings')!
    expect(savings.title).toBe('Sparrate erhöhen')
    expect(savings.category).toBe('Sparstrategie')
    // German grouping, German percent spacing — not an English sentence.
    expect(savings.body).toMatch(/48\.000/)
    expect(savings.body).not.toMatch(/saving years left/)
  })

  it('ranks high-impact items first so the report top actions are the strongest', () => {
    const recs = generateRecommendations(DEFAULT_PARAMS, makeResults(55))
    const rank = { High: 0, Medium: 1, Low: 2 } as const
    const ranks = recs.map((rec) => rank[rec.impact])
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })
})

describe('estimateRecommendationUplift', () => {
  it('estimates a bounded uplift range for uplift-eligible recommendations', () => {
    const results = makeResults(60)
    const recs = generateRecommendations(DEFAULT_PARAMS, results)
    const delay = recs.find((rec) => rec.id === 'delayRetirement')!
    const uplift = estimateRecommendationUplift(delay, DEFAULT_PARAMS, results)!
    expect(uplift.upliftMin).toBeGreaterThanOrEqual(1)
    expect(uplift.upliftMax).toBeLessThanOrEqual(20)
    expect(uplift.upliftMax).toBeGreaterThanOrEqual(uplift.upliftMin)
  })

  it('returns null for recommendations without an uplift model', () => {
    const results = makeResults(60)
    const bridge = generateRecommendations(DEFAULT_PARAMS, results).find(
      (rec) => rec.id === 'bridgeLiquidity'
    )!
    expect(estimateRecommendationUplift(bridge, DEFAULT_PARAMS, results)).toBeNull()
  })
})
