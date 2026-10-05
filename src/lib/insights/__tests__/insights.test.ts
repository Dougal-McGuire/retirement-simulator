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

/**
 * 60.000 € a year, retiring at 60 from 55 (five years from now), first pension
 * at 63: three bridge years (60, 61, 62), 2 % inflation.
 */
const SIMPLE_BRIDGE: SimulationParams = {
  ...DEFAULT_PARAMS,
  currentAge: 55,
  retirementAge: 60,
  legalRetirementAge: 63,
  averageInflation: 0.02,
  customExpenses: [{ id: 'budget', name: 'Budget', amount: 5000, interval: 'monthly' }],
}

describe('computeBridgeAnalysis', () => {
  it('computes the retirement-to-pension gap', () => {
    for (const unit of ['nominal', 'real'] as const) {
      const bridge = computeBridgeAnalysis(DEFAULT_PARAMS, { unit })
      expect(bridge.unit).toBe(unit)
      expect(bridge.startAge).toBe(60)
      expect(bridge.endAge).toBe(66)
      expect(bridge.yearsInBridge).toBe(7)
      expect(bridge.cashNeedEUR).toBeGreaterThan(0)
      expect(bridge.cashBucketSharePct + bridge.portfolioSharePct).toBe(100)
    }
  })

  it('states the real need in today’s purchasing power: budget × years', () => {
    const bridge = computeBridgeAnalysis(SIMPLE_BRIDGE, { unit: 'real' })
    expect(bridge.yearsInBridge).toBe(3)
    expect(bridge.cashNeedEUR).toBeCloseTo(180_000, 6)
    // First two of three equal years.
    expect(bridge.cashBucketSharePct).toBe(67)
  })

  it('prices each nominal bridge year at its price level relative to today', () => {
    // 60.000 × (1,02⁵ + 1,02⁶ + 1,02⁷) = 60.000 × 3,37892889… — inflation
    // runs from today, not from the first bridge year.
    const bridge = computeBridgeAnalysis(SIMPLE_BRIDGE, { unit: 'nominal' })
    expect(bridge.cashNeedEUR).toBeCloseTo(202_735.7334068, 4)
    // (1,02⁵ + 1,02⁶) / (1,02⁵ + 1,02⁶ + 1,02⁷) = 66,0 %
    expect(bridge.cashBucketSharePct).toBe(66)
  })

  it('takes the run’s median price level when the results carry one', () => {
    const results = makeResults(80, SIMPLE_BRIDGE)
    // A made-up index so the source is unmistakable: 1,10 at 60, 1,20 at 61, 1,30 at 62.
    const inflationIndexP50 = results.ages.map((age) => 1 + Math.max(0, age - 59) * 0.1)
    const bridge = computeBridgeAnalysis(SIMPLE_BRIDGE, {
      unit: 'nominal',
      results: { ...results, inflationIndexP50 },
    })
    expect(bridge.cashNeedEUR).toBeCloseTo(60_000 * (1.1 + 1.2 + 1.3), 6)
    // Real mode does not read the index.
    expect(
      computeBridgeAnalysis(SIMPLE_BRIDGE, {
        unit: 'real',
        results: { ...results, inflationIndexP50 },
      }).cashNeedEUR
    ).toBeCloseTo(180_000, 6)
  })

  it('compounds the plan’s inflation when the index is missing or does not line up', () => {
    const results = makeResults(80, SIMPLE_BRIDGE)
    const expected = 202_735.7334068
    for (const inflationIndexP50 of [undefined, [1, 1.02], results.ages.map(() => Number.NaN)]) {
      const bridge = computeBridgeAnalysis(SIMPLE_BRIDGE, {
        unit: 'nominal',
        results: { ...results, inflationIndexP50 },
      })
      expect(bridge.cashNeedEUR).toBeCloseTo(expected, 4)
    }
  })

  it('starts the price level at today when already retired', () => {
    const retired = { ...SIMPLE_BRIDGE, currentAge: 61 }
    const bridge = computeBridgeAnalysis(retired, { unit: 'nominal' })
    expect(bridge.startAge).toBe(61)
    expect(bridge.cashNeedEUR).toBeCloseTo(60_000 * (1 + 1.02), 6)
  })

  it('reports no bridge when retiring at pension age', () => {
    for (const unit of ['nominal', 'real'] as const) {
      const bridge = computeBridgeAnalysis({ ...DEFAULT_PARAMS, retirementAge: 67 }, { unit })
      expect(bridge.yearsInBridge).toBe(0)
      expect(bridge.cashNeedEUR).toBe(0)
    }
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

  it('quotes the bridge need in the requested unit and says which one', () => {
    const results = makeResults(60, SIMPLE_BRIDGE)
    // Intl puts a no-break space between the amount and the € sign.
    const spaces = (text: string) => text.replace(/\u00a0/g, ' ')
    const body = (unit: 'nominal' | 'real' | undefined, locale: 'de' | 'en') =>
      spaces(
        generateRecommendations(SIMPLE_BRIDGE, results, locale, unit ? { unit } : {}).find(
          (rec) => rec.id === 'bridgeLiquidity'
        )!.body
      )

    // 60.000 × (1,02⁵ + 1,02⁶ + 1,02⁷) and 60.000 × 3.
    expect(body('nominal', 'de')).toContain('202.736 € in nominalen Euro')
    expect(body('real', 'de')).toContain('180.000 € in heutiger Kaufkraft')
    expect(body('nominal', 'en')).toContain('€202,736 in nominal euros')
    expect(body('real', 'en')).toContain("€180,000 in today's euros")
    // Nominal is the default, like the switch.
    expect(body(undefined, 'de')).toBe(body('nominal', 'de'))

    const delay = (unit: 'nominal' | 'real') =>
      spaces(
        generateRecommendations(SIMPLE_BRIDGE, results, 'de', { unit }).find(
          (rec) => rec.id === 'delayRetirement'
        )!.body
      )
    expect(delay('nominal')).toContain('202.736 € an Ausgaben in nominalen Euro')
    expect(delay('real')).toContain('180.000 € an Ausgaben in heutiger Kaufkraft')
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
