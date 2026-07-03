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
  it('tags every recommendation with a stable id', () => {
    const recs = generateRecommendations(DEFAULT_PARAMS, makeResults(60))
    expect(recs.length).toBeGreaterThan(0)
    recs.forEach((rec) => expect(typeof rec.id).toBe('string'))
    const ids = recs.map((rec) => rec.id)
    expect(ids).toContain('increaseSavings')
    expect(ids).toContain('delayRetirement')
    expect(ids).toContain('maximizeTaxDeferred')
    expect(ids).toContain('reviewInsurance')
  })

  it('suggests optimizing the mix in the 70-85 band', () => {
    const ids = generateRecommendations(DEFAULT_PARAMS, makeResults(80)).map((rec) => rec.id)
    expect(ids).toContain('optimizeMix')
    expect(ids).not.toContain('increaseSavings')
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
    const insurance = generateRecommendations(DEFAULT_PARAMS, results).find(
      (rec) => rec.id === 'reviewInsurance'
    )!
    expect(estimateRecommendationUplift(insurance, DEFAULT_PARAMS, results)).toBeNull()
  })
})
