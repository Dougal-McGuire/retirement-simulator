import {
  DEFAULT_CAPITAL_GAINS_TAX,
  DEFAULT_PARAMS,
  DEFAULT_PENSION_TAXABLE_PORTION,
  DEFAULT_PLAN_BASE_YEAR,
  type CashFlow,
  type SimulationParams,
} from '@/types'
import { runMonteCarloSimulation, taxContext } from '@/lib/simulation/engine'
import {
  applyCashFlows,
  buildCashFlowSeries,
  type PensionContext,
} from '@/lib/simulation/cashFlows'
import { besteuerungsanteil, oneFifthRuleTax, ordinaryIncomeTax } from '@/lib/simulation/germanTax'

/**
 * How taxed income flows are assessed: one assessment per year, in the year a
 * flow is booked for, on one scale of euros.
 */

const context: PensionContext = {
  currentAge: 60,
  legalRetirementAge: 67,
  pensionTaxablePortion: 0.83,
  pensionTaxRate: 0.18,
  baseYear: 2026,
}

const pension: CashFlow = {
  id: 'pension-statutory',
  kind: 'pension',
  name: 'Pension',
  amount: 5000,
  frequency: 'monthly',
  inflationLinked: false,
}

const lumpSum = (overrides: Partial<CashFlow>): CashFlow => ({
  id: 'lump',
  kind: 'income',
  name: 'Lump sum',
  amount: 100_000,
  frequency: 'once',
  startAge: 66,
  inflationLinked: false,
  ...overrides,
})

describe('a one-off is taxed in the year it is booked for', () => {
  // €100,000 at 66, the last year before a €5,000 pension starts. Its taxable
  // base (49,800) belongs to 67.
  it('as ordinary income: on top of nothing, not on top of next year’s pension', () => {
    const series = buildCashFlowSeries(
      [pension, lumpSum({ taxTreatment: 'ordinary' })],
      60,
      90,
      context
    )
    expect(ordinaryIncomeTax(100_000, 0)).toBe(30_864)
    // The year it is credited (67) used to set the rate: 41,302.
    expect(ordinaryIncomeTax(100_000, 49_800)).toBe(41_302)
    expect(series.taxByFlow.get('lump')).toEqual({
      age: 66,
      gross: 100_000,
      tax: 30_864,
      net: 69_136,
    })
  })

  it('under the one-fifth rule: the same year', () => {
    const series = buildCashFlowSeries(
      [pension, lumpSum({ taxTreatment: 'oneFifth' })],
      60,
      90,
      context
    )
    expect(series.taxByFlow.get('lump')).toMatchObject({
      age: 66,
      tax: oneFifthRuleTax(100_000, 0),
    })
    expect(oneFifthRuleTax(100_000, 0)).toBe(7_850)
  })

  it('is still credited, with its tax, in the following year’s row', () => {
    const series = buildCashFlowSeries(
      [pension, lumpSum({ taxTreatment: 'ordinary' })],
      60,
      90,
      context
    )
    expect(series.oneTimeIncomeFixedByAge.get(67)).toBe(69_136)
    expect(series.oneTimeIncomeFixedByAge.get(66)).toBeUndefined()
    expect(series.oneTimeIncomeTaxFixed[67 - 60]).toBe(30_864)
    expect(series.oneTimeIncomeTaxFixed[66 - 60]).toBe(0)
  })

  it('shares the year with recurring ordinary income of that year', () => {
    // €20,000 of wages at 66 and the lump sum: one joint assessment of 120,000,
    // split by gross.
    const wages: CashFlow = {
      id: 'wages',
      kind: 'income',
      name: 'Wages',
      amount: 20_000,
      frequency: 'annual',
      startAge: 66,
      endAge: 66,
      taxTreatment: 'ordinary',
      inflationLinked: false,
    }
    const series = buildCashFlowSeries(
      [pension, wages, lumpSum({ taxTreatment: 'ordinary' })],
      60,
      90,
      context
    )
    const joint = ordinaryIncomeTax(120_000, 0)
    expect(series.taxByFlow.get('lump')!.tax).toBeCloseTo((joint * 100_000) / 120_000, 6)
    expect(series.taxByFlow.get('wages')!.tax).toBeCloseTo((joint * 20_000) / 120_000, 6)
    expect(series.incomeTaxFixed[66 - 60]).toBeCloseTo((joint * 20_000) / 120_000, 6)
  })

  it('counts a same-year ordinary one-off in the rest a one-fifth sum sits on', () => {
    const bonus = lumpSum({ id: 'bonus', amount: 40_000, taxTreatment: 'ordinary' })
    const series = buildCashFlowSeries(
      [pension, bonus, lumpSum({ taxTreatment: 'oneFifth' })],
      60,
      90,
      context
    )
    expect(series.taxByFlow.get('bonus')!.tax).toBe(ordinaryIncomeTax(40_000, 0))
    // On top of the 40,000, not on top of nothing (7,850).
    expect(series.taxByFlow.get('lump')!.tax).toBe(oneFifthRuleTax(100_000, 40_000))
    expect(oneFifthRuleTax(100_000, 40_000)).toBe(35_120)
  })
})

describe('everything under the one-fifth rule in a year is one sum', () => {
  it('taxes two lump sums of 100,000 like one of 200,000', () => {
    const two = buildCashFlowSeries(
      [
        lumpSum({ id: 'a', taxTreatment: 'oneFifth' }),
        lumpSum({ id: 'b', taxTreatment: 'oneFifth' }),
      ],
      60,
      90,
      context
    )
    const one = buildCashFlowSeries(
      [lumpSum({ amount: 200_000, taxTreatment: 'oneFifth' })],
      60,
      90,
      context
    )

    expect(oneFifthRuleTax(200_000, 0)).toBe(36_045)
    expect(one.taxByFlow.get('lump')!.tax).toBe(36_045)
    // Separately they paid 2 × 7,850 = 15,700.
    expect(two.taxByFlow.get('a')!.tax + two.taxByFlow.get('b')!.tax).toBeCloseTo(36_045, 6)
    expect(two.taxByFlow.get('a')!.tax).toBeCloseTo(18_022.5, 6)
  })

  it('splits pro rata, and leaves sums of different years alone', () => {
    const series = buildCashFlowSeries(
      [
        lumpSum({ id: 'a', amount: 150_000, taxTreatment: 'oneFifth' }),
        lumpSum({ id: 'b', amount: 50_000, taxTreatment: 'oneFifth' }),
        lumpSum({ id: 'c', amount: 100_000, startAge: 70, taxTreatment: 'oneFifth' }),
      ],
      60,
      90,
      { ...context, legalRetirementAge: 99 }
    )
    expect(series.taxByFlow.get('a')!.tax).toBeCloseTo(36_045 * 0.75, 6)
    expect(series.taxByFlow.get('b')!.tax).toBeCloseTo(36_045 * 0.25, 6)
    expect(series.taxByFlow.get('c')!.tax).toBe(7_850)
  })
})

describe('the tax base is in one unit', () => {
  // A fixed €5,000 pension (nominal euros) and €1,000 a month of rent quoted in
  // today's euros, both from 67. Thirteen years in, the pension's 49,800 of
  // taxable base are worth 37,000 of today's euros: that, not 49,800, is what
  // the rent sits on top of in today's tariff.
  const rent: CashFlow = {
    id: 'rent',
    kind: 'income',
    name: 'Rent',
    amount: 1000,
    frequency: 'monthly',
    startAge: 67,
    taxTreatment: 'ordinary',
  }
  const inflating: PensionContext = { ...context, currentAge: 55, expectedInflation: 0.025 }
  const level = (age: number) => Math.pow(1.025, age - 55)

  it('deflates the fixed pension before the linked rent is taxed on top of it', () => {
    const series = buildCashFlowSeries([pension, rent], 55, 90, inflating)

    for (const age of [67, 80, 90]) {
      const offset = age - 55
      const taxOnRent = series.incomeTaxLinked[offset]
      expect(taxOnRent).toBe(ordinaryIncomeTax(12_000, 49_800 / level(age)))
      // Mixing the units taxed it on top of 49,800 "today's" euros every year.
      expect(taxOnRent).toBeLessThan(ordinaryIncomeTax(12_000, 49_800))
    }
    // 14% too much at 67, 37% by 90 — the gap grew with every year of inflation.
    expect(ordinaryIncomeTax(12_000, 49_800) / series.incomeTaxLinked[12]).toBeCloseTo(1.14, 2)
    expect(ordinaryIncomeTax(12_000, 49_800) / series.incomeTaxLinked[35]).toBeCloseTo(1.37, 2)
    // The pension's own tax is a flat rate on its taxable part: unit-free.
    expect(series.pensionTaxFixed[12]).toBeCloseTo(49_800 * 0.18, 6)
  })

  it('hands a fixed-euro flow its share back in the euros of its year', () => {
    const fixedRent = { ...rent, inflationLinked: false }
    const series = buildCashFlowSeries([pension, fixedRent], 55, 90, inflating)
    const age = 80
    const d = level(age)
    // Both amounts deflated, taxed in today's euros, re-inflated.
    expect(series.incomeTaxFixed[age - 55] - series.pensionTaxFixed[age - 55]).toBeCloseTo(
      ordinaryIncomeTax(12_000 / d, 49_800 / d) * d,
      6
    )
  })

  it('splits a joint tax between a linked and a fixed flow by today’s-euro share', () => {
    const fixedJob: CashFlow = {
      id: 'job',
      kind: 'income',
      name: 'Job',
      amount: 12_000,
      frequency: 'annual',
      startAge: 67,
      taxTreatment: 'ordinary',
      inflationLinked: false,
    }
    const series = buildCashFlowSeries([rent, fixedJob], 55, 90, {
      ...inflating,
      legalRetirementAge: 99,
    })
    const offset = 75 - 55
    const d = level(75)
    const joint = ordinaryIncomeTax(12_000 + 12_000 / d, 0)
    const linkedTax = series.incomeTaxLinked[offset]
    const fixedTax = series.incomeTaxFixed[offset]

    // In today's euros the two parts add up to the one assessment…
    expect(linkedTax + fixedTax / d).toBeCloseTo(joint, 6)
    // …and are split by what each contributes in today's euros.
    expect(linkedTax / (fixedTax / d)).toBeCloseTo(d, 6)
  })

  it('assumes no price change when the caller gives none', () => {
    // No `expectedInflation`: a euro is a euro, as before.
    const series = buildCashFlowSeries([pension, rent], 55, 90, { ...context, currentAge: 55 })
    expect(series.incomeTaxLinked[35]).toBe(ordinaryIncomeTax(12_000, 49_800))
  })

  it('is what the engine books, path price level and all', () => {
    const params = applyCashFlows({
      ...DEFAULT_PARAMS,
      roiVolatility: 0,
      inflationVolatility: 0,
      simulationRuns: 1,
      withdrawalStrategy: 'fixedReal',
      pensionTaxablePortion: 0.83,
      cashFlows: [...DEFAULT_PARAMS.cashFlows, { ...rent, endAge: 90 }],
    } as SimulationParams)
    expect(taxContext(params).expectedInflation).toBe(params.averageInflation)

    const results = runMonteCarloSimulation(params)
    for (const age of [67, 80, 90]) {
      const row = results.cashFlowMeansReal![age - 55]
      const taxOnRentReal = row.incomeTax - row.pensionTax!
      expect(taxOnRentReal).toBeCloseTo(ordinaryIncomeTax(12_000, 49_800 / level(age)), 6)
    }
  })
})

describe('shipped tax defaults', () => {
  it('uses the statutory Abgeltungsteuer incl. Soli: 25% × 1.055', () => {
    expect(DEFAULT_CAPITAL_GAINS_TAX).toBe(26.375)
    expect(DEFAULT_CAPITAL_GAINS_TAX).toBeCloseTo(25 * 1.055, 12)
    expect(DEFAULT_PARAMS.capitalGainsTax).toBe(26.375)
  })

  it('reads the pension’s taxable share from the default plan’s own cohort', () => {
    const startYear =
      DEFAULT_PLAN_BASE_YEAR + (DEFAULT_PARAMS.legalRetirementAge - DEFAULT_PARAMS.currentAge)
    expect(startYear).toBe(2038)
    expect(DEFAULT_PENSION_TAXABLE_PORTION).toBe(besteuerungsanteil(2038))
    expect(DEFAULT_PARAMS.pensionTaxablePortion).toBe(0.9)
    // 0.83 was the share of a pension that started in 2024.
    expect(besteuerungsanteil(2024)).toBe(0.83)
  })

  it('falls back to the same rate for a parameter set without one', () => {
    const results = runMonteCarloSimulation({
      ...DEFAULT_PARAMS,
      simulationRuns: 1,
      capitalGainsTax: Number.NaN,
    })
    expect(results.params.capitalGainsTax).toBe(26.375)
  })
})
