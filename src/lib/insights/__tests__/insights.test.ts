import { DEFAULT_PARAMS, type CashFlow, type SimulationParams } from '@/types'
import { computeBridgeAnalysis } from '../bridge'
import { computePlanHealthScore, withdrawalSubScore } from '../planHealth'
import { generateRecommendations } from '../recommendations'
import * as recommendationsModule from '../recommendations'
import {
  firstRetirementYear,
  firstYearWithdrawalRate,
  ledgerRows,
  mainPension,
  pensionYear,
  phaseFlow,
  retirementSpending,
} from '../ledger'
import { closingPriceLevels } from '../priceLevels'
import { HAND_LEDGER, HAND_PARAMS, HAND_PRICE_LEVELS, handResults } from '../testing/handLedger'
import { getPlanHealth } from '@/lib/simulation/planInsights'
import { applyCashFlows } from '@/lib/simulation/cashFlows'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'

/**
 * Every expectation in the first half of this file is derived by hand from
 * the ledger written out in `testing/handLedger.ts` (see the table there).
 * The second half runs the real engine and checks that the same functions
 * return exactly what its ledger says — definitions, not magic numbers, so
 * the tests hold when the engine's numbers move.
 */

const spaces = (text: string) => text.replace(/[\u00a0\u202f]/g, ' ')

describe('ledgerRows', () => {
  it('returns the booked rows for nominal and the per-path rows for real', () => {
    const results = handResults()
    expect(ledgerRows(results, 'nominal')).toBe(results.cashFlowMeans)
    expect(ledgerRows(results, 'real')).toBe(results.cashFlowMeansReal)
  })

  it('deflates by the median price index when there is no per-path real ledger', () => {
    const rows = ledgerRows(handResults({ ledger: 'index' }), 'real')!
    // 42,000 / 1.05, 43,100 / 1.0775, 44,200 / 1.105
    expect(rows[2].portfolioWithdrawal).toBeCloseTo(40_000, 6)
    expect(rows[3].portfolioWithdrawal).toBeCloseTo(40_000, 6)
    expect(rows[4].portfolioWithdrawal).toBeCloseTo(40_000, 6)
    expect(rows[2].openingAssets).toBeCloseTo(600_000 / 1.05, 6)
  })

  it('prices a year-end balance at the level its year closes with', () => {
    const rows = ledgerRows(handResults({ ledger: 'index' }), 'real')!
    // Age 60 opens at 1.05 and closes at 1.0775 (the level 61 opens with).
    expect(rows[2].closingAssets).toBeCloseTo(588_000 / 1.0775, 6)
    // …so a year's closing balance is the next year's opening balance, in
    // today's euros too: 588,000 / 1.0775 either way.
    expect(rows[2].closingAssets).toBeCloseTo(rows[3].openingAssets, 6)
    // The last year has no successor: it closes one year of the plan's 2.5 %
    // inflation above its opening level, 1.26 × 1.025 = 1.2915.
    expect(rows[7].closingAssets).toBeCloseTo(578_400 / 1.2915, 6)
    // The balance identity holds in real terms: closing = opening + return −
    // withdrawal. Age 60: 588,000/1.0775 = 600,000/1.05 + return − 40,000.
    expect(rows[2].investmentReturn).toBeCloseTo(588_000 / 1.0775 - 600_000 / 1.05 + 40_000, 6)
    // The fallback and the engine's own real ledger agree on all of it.
    const perPath = ledgerRows(handResults(), 'real')!
    rows.forEach((row, index) => {
      expect(row.closingAssets).toBeCloseTo(perPath[index].closingAssets, 6)
      expect(row.investmentReturn).toBeCloseTo(perPath[index].investmentReturn, 6)
    })
  })
})

describe('closingPriceLevels', () => {
  it('is the next year’s opening level, and one more year of inflation at the end', () => {
    expect(closingPriceLevels([1, 1.02, 1.05], 0.03)).toEqual([1.02, 1.05, 1.05 * 1.03])
  })

  it('extrapolates with the last observed step when the plan’s rate is unknown', () => {
    // 1.1 → 1.21 is +10 %, so the last year closes at 1.21 × 1.1.
    const levels = closingPriceLevels([1, 1.1, 1.21])
    expect(levels[2]).toBeCloseTo(1.331, 12)
    // A single year with nothing to go on stays where it is.
    expect(closingPriceLevels([1])).toEqual([1])
  })

  it('has no real rows without a real ledger or an index, and none at all without a ledger', () => {
    expect(ledgerRows(handResults({ ledger: 'nominalOnly' }), 'real')).toBeNull()
    expect(ledgerRows(handResults({ ledger: 'nominalOnly' }), 'nominal')).not.toBeNull()
    expect(ledgerRows(handResults({ ledger: 'none' }), 'nominal')).toBeNull()
    expect(ledgerRows(handResults({ ledger: 'none' }), 'real')).toBeNull()
  })

  it('refuses a ledger that does not line up with the ages', () => {
    const results = handResults()
    expect(
      ledgerRows({ ...results, cashFlowMeans: results.cashFlowMeans!.slice(1) }, 'nominal')
    ).toBeNull()
  })
})

describe('firstYearWithdrawalRate — the one definition', () => {
  it('is the first retirement year’s withdrawal over that year’s opening portfolio', () => {
    // 42,000 / 600,000
    expect(firstYearWithdrawalRate(HAND_PARAMS, handResults())).toBeCloseTo(0.07, 12)
    expect(firstRetirementYear(HAND_PARAMS, handResults(), 'nominal')).toEqual({
      age: 60,
      openingAssets: 600_000,
      portfolioWithdrawal: 42_000,
      expenses: 40_000,
    })
  })

  it('does not depend on which euro the ledger is read in', () => {
    // Read from the booked rows whatever else the results carry.
    for (const ledger of ['perPath', 'index', 'nominalOnly'] as const) {
      expect(firstYearWithdrawalRate(HAND_PARAMS, handResults({ ledger }))).toBeCloseTo(0.07, 12)
    }
  })

  it('reads the plan’s first year for someone already retired', () => {
    const retired = { ...HAND_PARAMS, retirementAge: 50 }
    // Age 58 is then the first retirement year: nothing is withdrawn in the hand ledger.
    expect(firstRetirementYear(retired, handResults(), 'nominal')?.age).toBe(58)
    expect(firstYearWithdrawalRate(retired, handResults())).toBe(0)
  })

  it('is null when it cannot be stated', () => {
    expect(firstYearWithdrawalRate(HAND_PARAMS, handResults({ ledger: 'none' }))).toBeNull()
    // Retirement beyond the horizon.
    expect(firstYearWithdrawalRate({ ...HAND_PARAMS, retirementAge: 70 }, handResults())).toBeNull()
    // Nothing in the portfolio at that point.
    const empty = handResults()
    const broke = {
      ...empty,
      cashFlowMeans: empty.cashFlowMeans!.map((row) => ({ ...row, openingAssets: 0 })),
    }
    expect(firstYearWithdrawalRate(HAND_PARAMS, broke)).toBeNull()
  })
})

describe('mainPension', () => {
  const company = (patch: Partial<CashFlow>): CashFlow => ({
    id: 'company',
    kind: 'pension',
    name: 'Company pension',
    amount: 200,
    frequency: 'monthly',
    startAge: 60,
    ...patch,
  })

  it('is the statutory pension when the plan counts it, however small another one starts earlier', () => {
    const params = { ...HAND_PARAMS, cashFlows: [...HAND_PARAMS.cashFlows, company({})] }
    expect(mainPension(params)).toEqual({
      id: 'pension-statutory',
      statutory: true,
      startAge: 63,
      annualAmount: 24_000,
    })
    // …even when the other pension is the larger one.
    const large = { ...HAND_PARAMS, cashFlows: [...HAND_PARAMS.cashFlows, company({ amount: 9000 })] }
    expect(mainPension(large)?.id).toBe('pension-statutory')
  })

  it('is the largest pension by annual amount when there is no statutory one', () => {
    const expense = HAND_PARAMS.cashFlows.filter((flow) => flow.kind !== 'pension')
    const params = {
      ...HAND_PARAMS,
      cashFlows: [
        ...expense,
        company({ id: 'small', amount: 300, startAge: 60 }),
        // 5,000 a year < 300 × 12
        company({ id: 'annual', amount: 5000, frequency: 'annual', startAge: 61 }),
        company({ id: 'large', amount: 1500, startAge: 62 }),
      ],
    }
    expect(mainPension(params)).toEqual({
      id: 'large',
      statutory: false,
      startAge: 62,
      annualAmount: 18_000,
    })
  })

  it('ignores switched-off pensions and is null when none counts', () => {
    const off = HAND_PARAMS.cashFlows.map((flow) =>
      flow.kind === 'pension' ? { ...flow, enabled: false } : flow
    )
    expect(mainPension({ ...HAND_PARAMS, cashFlows: off })).toBeNull()
    expect(mainPension({ ...HAND_PARAMS, cashFlows: [...off, company({})] })?.id).toBe('company')
    expect(
      mainPension({
        ...HAND_PARAMS,
        cashFlows: HAND_PARAMS.cashFlows.filter((flow) => flow.kind !== 'pension'),
      })
    ).toBeNull()
  })
})

describe('computeBridgeAnalysis', () => {
  it('runs from retirement to the year before the main pension', () => {
    const bridge = computeBridgeAnalysis(HAND_PARAMS, { unit: 'nominal', results: handResults() })
    expect(bridge).toMatchObject({
      startAge: 60,
      endAge: 62,
      yearsInBridge: 3,
      pensionAge: 63,
      mainPension: 'statutory',
      unit: 'nominal',
    })
  })

  it('states the need as the ledger’s portfolio withdrawals over exactly those years', () => {
    // 42,000 + 43,100 + 44,200
    const nominal = computeBridgeAnalysis(HAND_PARAMS, { unit: 'nominal', results: handResults() })
    expect(nominal.cashNeedEUR).toBe(129_300)
    // (42,000 + 43,100) / 129,300 = 65.8 %
    expect(nominal.cashBucketYears).toBe(2)
    expect(nominal.cashBucketSharePct).toBe(66)
    expect(nominal.portfolioSharePct).toBe(34)
  })

  it('keeps the unit handling: real reads the real ledger, or the index-deflated one', () => {
    // 40,000 in each of the three years, by construction of the price levels.
    for (const ledger of ['perPath', 'index'] as const) {
      const real = computeBridgeAnalysis(HAND_PARAMS, {
        unit: 'real',
        results: handResults({ ledger }),
      })
      expect(real.unit).toBe('real')
      expect(real.cashNeedEUR).toBeCloseTo(120_000, 6)
      expect(real.cashBucketSharePct).toBe(67)
    }
  })

  it('has no figure — and no formula to fall back on — without a ledger', () => {
    for (const results of [undefined, handResults({ ledger: 'none' })]) {
      const bridge = computeBridgeAnalysis(HAND_PARAMS, { unit: 'nominal', results })
      expect(bridge.yearsInBridge).toBe(3)
      expect(bridge.cashNeedEUR).toBeNull()
      expect(bridge.cashBucketSharePct).toBe(0)
    }
    // A real need cannot be read from a nominal-only ledger either.
    expect(
      computeBridgeAnalysis(HAND_PARAMS, {
        unit: 'real',
        results: handResults({ ledger: 'nominalOnly' }),
      }).cashNeedEUR
    ).toBeNull()
  })

  it('is not ended by a small pension that starts earlier (it is income in the bridge)', () => {
    const early: CashFlow = {
      id: 'bav',
      kind: 'pension',
      name: 'bAV',
      amount: 200,
      frequency: 'monthly',
      startAge: 60,
    }
    const params = { ...HAND_PARAMS, cashFlows: [...HAND_PARAMS.cashFlows, early] }
    const bridge = computeBridgeAnalysis(params, { unit: 'nominal', results: handResults() })
    // Still 60–62; the amount is whatever the ledger withdrew, never 0.
    expect(bridge.yearsInBridge).toBe(3)
    expect(bridge.endAge).toBe(62)
    expect(bridge.cashNeedEUR).toBe(129_300)
  })

  it('starts today for someone already retired', () => {
    const retired = { ...HAND_PARAMS, currentAge: 61 }
    const results = handResults({ params: retired })
    const bridge = computeBridgeAnalysis(retired, { unit: 'nominal', results })
    expect(bridge.startAge).toBe(61)
    expect(bridge.yearsInBridge).toBe(2)
    // 43,100 + 44,200
    expect(bridge.cashNeedEUR).toBe(87_300)
  })

  it('reports no bridge when retiring at pension age, or when no pension counts', () => {
    for (const unit of ['nominal', 'real'] as const) {
      const atPension = computeBridgeAnalysis(
        { ...HAND_PARAMS, retirementAge: 63 },
        { unit, results: handResults() }
      )
      expect(atPension.yearsInBridge).toBe(0)
      expect(atPension.cashNeedEUR).toBe(0)
    }
    const noPension = {
      ...HAND_PARAMS,
      cashFlows: HAND_PARAMS.cashFlows.filter((flow) => flow.kind !== 'pension'),
    }
    const none = computeBridgeAnalysis(noPension, { unit: 'nominal', results: handResults() })
    expect(none.mainPension).toBe('none')
    expect(none.yearsInBridge).toBe(0)
  })
})

describe('retirementSpending', () => {
  it('sums the ledger’s spending over the retirement years only', () => {
    // 40 + 41 + 42 + 43 + 44 + 45 thousand — the two working years are not in it.
    expect(retirementSpending(HAND_PARAMS, handResults(), 'nominal')).toEqual({
      total: 255_000,
      scheduled: 0,
      shortfall: 0,
      firstAge: 60,
      lastAge: 65,
      years: 6,
    })
  })

  it('follows the unit', () => {
    const expected = [40_000, 41_000, 42_000, 43_000, 44_000, 45_000].reduce(
      (sum, amount, i) => sum + amount / HAND_PRICE_LEVELS[i + 2],
      0
    )
    expect(retirementSpending(HAND_PARAMS, handResults(), 'real')!.total).toBeCloseTo(expected, 6)
    expect(expected).toBeLessThan(255_000)
  })

  it('is null without a ledger or without a retirement inside the horizon', () => {
    expect(retirementSpending(HAND_PARAMS, handResults({ ledger: 'none' }), 'nominal')).toBeNull()
    expect(
      retirementSpending({ ...HAND_PARAMS, retirementAge: 70 }, handResults(), 'nominal')
    ).toBeNull()
  })
})

describe('pensionYear — what the pension really covers', () => {
  it('reads net pension, spending and the residual withdrawal at the pension’s first year', () => {
    const year = pensionYear(HAND_PARAMS, handResults(), 'nominal')!
    expect(year).toMatchObject({
      age: 63,
      firstPensionYear: true,
      expenses: 43_000,
      pensionGross: 24_000,
      pensionNet: 21_000,
      portfolioWithdrawal: 23_000,
    })
    // 21,000 / 43,000 — not 24,000 / 40,000 = 60 %, the gross-over-budget figure.
    expect(year.coverage).toBeCloseTo(21_000 / 43_000, 12)
  })

  it('states the amounts in the requested unit and the same coverage', () => {
    const real = pensionYear(HAND_PARAMS, handResults(), 'real')!
    expect(real.portfolioWithdrawal).toBeCloseTo(20_000, 6)
    expect(real.pensionNet).toBeCloseTo(21_000 / 1.15, 6)
    expect(real.coverage).toBeCloseTo(21_000 / 43_000, 12)
  })

  it('uses the first retirement year for a pension that started before retirement', () => {
    const late = { ...HAND_PARAMS, retirementAge: 64 }
    const year = pensionYear(late, handResults(), 'nominal')!
    expect(year.age).toBe(64)
    expect(year.firstPensionYear).toBe(false)
  })

  it('is null without a pension, a ledger or pension detail in the ledger', () => {
    const noPension = {
      ...HAND_PARAMS,
      cashFlows: HAND_PARAMS.cashFlows.filter((flow) => flow.kind !== 'pension'),
    }
    expect(pensionYear(noPension, handResults(), 'nominal')).toBeNull()
    expect(pensionYear(HAND_PARAMS, handResults({ ledger: 'none' }), 'nominal')).toBeNull()
    const results = handResults()
    const bare = {
      ...results,
      cashFlowMeans: HAND_LEDGER.map(({ pensionGross: _gross, pensionTax: _tax, ...row }) => row),
    }
    expect(pensionYear(HAND_PARAMS, bare, 'nominal')).toBeNull()
  })
})

describe('phaseFlow', () => {
  it('averages the yearly bookings of a phase', () => {
    expect(phaseFlow(handResults(), 'nominal', 58, 59)).toMatchObject({
      firstAge: 58,
      lastAge: 59,
      years: 2,
      netPortfolioFlow: 20_000,
      expenses: 0,
    })
    // −(42,000 + 43,100 + 44,200) / 3
    expect(phaseFlow(handResults(), 'nominal', 60, 62)!.netPortfolioFlow).toBeCloseTo(-43_100, 9)
    // −(23,000 + 24,100 + 25,200) / 3, with 24,000 of pension income a year.
    const pension = phaseFlow(handResults(), 'nominal', 63, 65)!
    expect(pension.netPortfolioFlow).toBeCloseTo(-24_100, 9)
    expect(pension.incomeGross).toBe(24_000)
  })

  it('is null for a span outside the simulated ages', () => {
    expect(phaseFlow(handResults(), 'nominal', 70, 75)).toBeNull()
    expect(phaseFlow(handResults({ ledger: 'none' }), 'nominal', 60, 62)).toBeNull()
  })
})

describe('computePlanHealthScore', () => {
  it('scores the withdrawal rate: full marks to 4 %, −25 points per point above', () => {
    expect(withdrawalSubScore(0.03)).toBe(100)
    expect(withdrawalSubScore(0.04)).toBe(100)
    expect(withdrawalSubScore(0.05)).toBeCloseTo(75, 9)
    expect(withdrawalSubScore(0.07)).toBeCloseTo(25, 9)
    expect(withdrawalSubScore(0.08)).toBeCloseTo(0, 9)
    expect(withdrawalSubScore(0.2)).toBe(0)
  })

  it('is the weighted mean of two measured parts — no placeholder component', () => {
    const health = computePlanHealthScore(HAND_PARAMS, handResults({ successRate: 92 }))
    expect(health.withdrawalRate).toBeCloseTo(0.07, 12)
    expect(health.components.map((part) => part.id)).toEqual(['success', 'withdrawal'])
    expect(health.components[0]).toEqual({ id: 'success', value: 92, weight: 0.7 })
    expect(health.components[1].weight).toBe(0.3)
    expect(health.components[1].value).toBeCloseTo(25, 9)
    expect(health.components.reduce((sum, part) => sum + part.weight, 0)).toBeCloseTo(1, 12)
    // 0.7 × 92 + 0.3 × 25 = 71.9
    expect(health.score).toBe(72)
  })

  it('takes its band from getPlanHealth(successRate) and never from the score', () => {
    // The reviewer's case: 78.4 % used to score 87 "Strong" next to a "watch" dashboard.
    const watch = computePlanHealthScore(HAND_PARAMS, handResults({ successRate: 78.4 }))
    expect(watch.band).toBe('watch')
    expect(watch.band).toBe(getPlanHealth(78.4))
    // 0.7 × 78.4 + 0.3 × 25 = 62.38
    expect(watch.score).toBe(62)

    for (const successRate of [0, 40, 74.9, 75, 89.9, 90, 95.2, 100]) {
      for (const params of [HAND_PARAMS, { ...HAND_PARAMS, retirementAge: 50 }]) {
        expect(computePlanHealthScore(params, handResults({ successRate })).band).toBe(
          getPlanHealth(successRate)
        )
      }
    }
  })

  it('is the success rate alone when no withdrawal rate can be read', () => {
    const health = computePlanHealthScore(
      HAND_PARAMS,
      handResults({ successRate: 81.4, ledger: 'none' })
    )
    expect(health.withdrawalRate).toBeNull()
    expect(health.components).toEqual([{ id: 'success', value: 81.4, weight: 1 }])
    expect(health.score).toBe(81)
  })
})

describe('generateRecommendations', () => {
  const lowSuccess = (successRate: number, params: SimulationParams = HAND_PARAMS) =>
    handResults({ successRate, params })

  it('tags every recommendation with a stable id and derives it from the plan', () => {
    const recs = generateRecommendations(HAND_PARAMS, lowSuccess(60))
    expect(recs.length).toBeGreaterThan(0)
    recs.forEach((rec) => expect(typeof rec.id).toBe('string'))
    const ids = recs.map((rec) => rec.id)
    expect(ids).toContain('increaseSavings')
    expect(ids).toContain('delayRetirement')
    expect(ids).toContain('bridgeLiquidity')
  })

  it('drops the US retail-planning boilerplate entirely', () => {
    const ids = generateRecommendations(HAND_PARAMS, lowSuccess(60)).map((rec) => rec.id)
    expect(ids).not.toContain('maximizeTaxDeferred')
    expect(ids).not.toContain('reviewInsurance')
  })

  it('suggests optimizing the mix in the 70-90 band', () => {
    const ids = generateRecommendations(HAND_PARAMS, lowSuccess(80)).map((rec) => rec.id)
    expect(ids).toContain('optimizeMix')
    expect(ids).not.toContain('increaseSavings')
  })

  it('offers no bridge advice when there is no bridge', () => {
    const params = { ...HAND_PARAMS, retirementAge: 63 }
    const ids = generateRecommendations(params, lowSuccess(95, params)).map((rec) => rec.id)
    expect(ids).not.toContain('bridgeLiquidity')
    expect(ids).not.toContain('delayRetirement')
  })

  it('quotes the ledger’s withdrawal rate — the same figure as the plan score', () => {
    const results = lowSuccess(95)
    const rec = generateRecommendations(HAND_PARAMS, results).find(
      (entry) => entry.id === 'reviewSpending'
    )!
    // 7.0 % > 6 %: high impact.
    expect(rec.impact).toBe('High')
    expect(rec.body).toContain('7.0% of the portfolio is withdrawn')
    expect(computePlanHealthScore(HAND_PARAMS, results).withdrawalRate).toBeCloseTo(0.07, 12)

    // No ledger, no rate, no recommendation built on a guess.
    expect(
      generateRecommendations(HAND_PARAMS, handResults({ ledger: 'none' })).map((entry) => entry.id)
    ).not.toContain('reviewSpending')
  })

  it('raises the Sparerpauschbetrag only against a measured tax drag', () => {
    const withoutDrag = generateRecommendations(HAND_PARAMS, lowSuccess(95)).map((r) => r.id)
    expect(withoutDrag).not.toContain('taxAllowance')

    const withDrag = generateRecommendations(HAND_PARAMS, {
      ...lowSuccess(95),
      withdrawalTaxDrag: 0.14,
    })
    const drag = withDrag.find((rec) => rec.id === 'taxAllowance')!
    expect(drag.impact).toBe('High')
    expect(drag.body).toMatch(/Freistellungsauftrag/)
  })

  it('flags a missing allowance instead of the drag when none is modelled', () => {
    const params = { ...HAND_PARAMS, taxAllowanceAnnual: 0 }
    const rec = generateRecommendations(params, lowSuccess(95, params)).find(
      (entry) => entry.id === 'taxAllowance'
    )!
    expect(rec.body).toMatch(/Sparerpauschbetrag/)
  })

  it('states the Teilfreistellung threshold the statute sets: more than 50 %', () => {
    const params = { ...HAND_PARAMS, equityFundExemption: 0 }
    for (const locale of ['de', 'en'] as const) {
      const rec = generateRecommendations(params, lowSuccess(95, params), locale).find(
        (entry) => entry.id === 'equityFundExemption'
      )!
      expect(spaces(rec.body)).toMatch(locale === 'de' ? /mehr als 50 %/ : /more than 50%/)
      expect(rec.body).not.toMatch(/51/)
    }
  })

  it('writes German bodies with German figures when asked for de', () => {
    const recs = generateRecommendations(HAND_PARAMS, lowSuccess(60), 'de')
    const savings = recs.find((rec) => rec.id === 'increaseSavings')!
    expect(savings.title).toBe('Sparrate erhöhen')
    expect(savings.category).toBe('Sparstrategie')
    // German grouping, German percent spacing — not an English sentence.
    expect(savings.body).toMatch(/20\.000/)
    expect(savings.body).not.toMatch(/saving years left/)
    // Shared with the report (formal) and the app (informal): no direct address.
    for (const rec of recs) expect(rec.body).not.toMatch(/\b(du|dein|deine|Sie|Ihr|Ihre)\b/)
  })

  it('quotes the bridge need from the ledger in the requested unit and says which one', () => {
    const results = lowSuccess(60)
    const body = (unit: 'nominal' | 'real' | undefined, locale: 'de' | 'en') =>
      spaces(
        generateRecommendations(HAND_PARAMS, results, locale, unit ? { unit } : {}).find(
          (rec) => rec.id === 'bridgeLiquidity'
        )!.body
      )

    // 42,000 + 43,100 + 44,200 booked; 3 × 40,000 in today's euros.
    expect(body('nominal', 'de')).toContain('zahlt das Depot 129.300 € in nominalen Euro aus')
    expect(body('real', 'de')).toContain('zahlt das Depot 120.000 € in heutiger Kaufkraft aus')
    expect(body('nominal', 'en')).toContain('pays out €129,300 in nominal euros')
    expect(body('real', 'en')).toContain("pays out €120,000 in today's euros")
    expect(body('nominal', 'en')).toContain('From age 60 to 62, before the statutory pension starts')
    // Nominal is the default, like the switch.
    expect(body(undefined, 'de')).toBe(body('nominal', 'de'))

    const delay = (unit: 'nominal' | 'real') =>
      spaces(
        generateRecommendations(HAND_PARAMS, results, 'de', { unit }).find(
          (rec) => rec.id === 'delayRetirement'
        )!.body
      )
    expect(delay('nominal')).toContain('3 Jahre bis zum Beginn der gesetzlichen Rente mit 63')
    expect(delay('nominal')).toContain('129.300 € in nominalen Euro')
    expect(delay('real')).toContain('120.000 € in heutiger Kaufkraft')
  })

  it('gives the bridge advice without an amount rather than with an estimated one', () => {
    const body = spaces(
      generateRecommendations(HAND_PARAMS, handResults({ successRate: 60, ledger: 'none' })).find(
        (rec) => rec.id === 'bridgeLiquidity'
      )!.body
    )
    expect(body).toContain('From age 60 to 62, before the statutory pension starts')
    expect(body).not.toMatch(/€/)
  })

  it('ranks high-impact items first so the report top actions are the strongest', () => {
    const recs = generateRecommendations(HAND_PARAMS, lowSuccess(55))
    const rank = { High: 0, Medium: 1, Low: 2 } as const
    const ranks = recs.map((rec) => rank[rec.impact])
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b))
  })

  it('no longer exports a formula for success-rate uplift', () => {
    expect(Object.keys(recommendationsModule)).not.toContain('estimateRecommendationUplift')
  })
})

describe('against the engine: the functions return what its ledger says', () => {
  const params = applyCashFlows({ ...DEFAULT_PARAMS, simulationRuns: 200 })
  const results = runMonteCarloSimulation(params)
  const nominal = results.cashFlowMeans!
  const real = results.cashFlowMeansReal!
  const indexOf = (age: number) => results.ages.indexOf(age)

  it('carries a ledger aligned with the ages', () => {
    expect(nominal).toHaveLength(results.ages.length)
    expect(real).toHaveLength(results.ages.length)
  })

  it('withdrawal rate = ledger withdrawal / opening portfolio at the retirement age', () => {
    const row = nominal[indexOf(params.retirementAge)]
    expect(firstYearWithdrawalRate(params, results)).toBe(
      row.portfolioWithdrawal / row.openingAssets
    )
  })

  it('bridge need = the ledger’s withdrawals from retirement to the statutory age', () => {
    const sum = (rows: typeof nominal) => {
      let total = 0
      for (let age = params.retirementAge; age < params.legalRetirementAge; age++) {
        total += rows[indexOf(age)].portfolioWithdrawal
      }
      return total
    }
    const bridge = computeBridgeAnalysis(params, { unit: 'nominal', results })
    expect(bridge.yearsInBridge).toBe(params.legalRetirementAge - params.retirementAge)
    expect(bridge.cashNeedEUR).toBeCloseTo(sum(nominal), 6)
    expect(computeBridgeAnalysis(params, { unit: 'real', results }).cashNeedEUR).toBeCloseTo(
      sum(real),
      6
    )
  })

  it('a 200 € company pension from 60 does not void the bridge (reviewer probe O)', () => {
    const flows: CashFlow[] = [
      ...DEFAULT_PARAMS.cashFlows,
      {
        id: 'bav',
        kind: 'pension',
        name: 'bAV',
        amount: 200,
        frequency: 'monthly',
        startAge: 60,
        inflationLinked: false,
      },
    ]
    const plan = applyCashFlows({
      ...DEFAULT_PARAMS,
      simulationRuns: 200,
      cashFlows: flows,
      withdrawalStrategy: 'fixedReal',
    })
    const run = runMonteCarloSimulation(plan)
    const bridge = computeBridgeAnalysis(plan, { unit: 'real', results: run })
    expect(bridge.startAge).toBe(60)
    expect(bridge.endAge).toBe(66)
    expect(bridge.yearsInBridge).toBe(7)
    let expected = 0
    for (let age = 60; age <= 66; age++) {
      expected += run.cashFlowMeansReal![run.ages.indexOf(age)].portfolioWithdrawal
    }
    expect(bridge.cashNeedEUR).toBeCloseTo(expected, 6)
    // The report used to print "€0 has to come from the portfolio" here.
    expect(bridge.cashNeedEUR!).toBeGreaterThan(7 * 50_000)
  })

  it('pension coverage = net pension over spending at 67, residual = that year’s withdrawal', () => {
    const row = real[indexOf(params.legalRetirementAge)]
    const year = pensionYear(params, results, 'real')!
    expect(year.age).toBe(67)
    expect(year.portfolioWithdrawal).toBe(row.portfolioWithdrawal)
    expect(year.coverage).toBeCloseTo((row.pensionGross! - row.pensionTax!) / row.expenses, 12)
    // The gross nominal pension over today's budget read "95 %" for this plan.
    expect(year.coverage!).toBeLessThan(0.9)
  })

  it('retirement spending = the ledger’s spending from 60 to 90, not budget × 36 years', () => {
    const spending = retirementSpending(params, results, 'real')!
    const expected = real
      .slice(indexOf(params.retirementAge))
      .reduce((sum, row) => sum + row.expenses, 0)
    expect(spending.total).toBeCloseTo(expected, 6)
    expect(spending.years).toBe(31)
    expect(spending.total).toBeLessThan(62_900 * 36)
  })

  it('fixed real spending: 31 retirement years of the 62,900 € budget = 1,949,900 €', () => {
    const fixed = applyCashFlows({
      ...DEFAULT_PARAMS,
      simulationRuns: 200,
      withdrawalStrategy: 'fixedReal',
    })
    const run = runMonteCarloSimulation(fixed)
    // 31 × 62,900 — the report printed 36 × 62,900 = 2,264,400.
    expect(retirementSpending(fixed, run, 'real')!.total).toBeCloseTo(1_949_900, 0)
  })
})
