import { DEFAULT_PARAMS, type SimulationParams } from '@/types'
import { runMonteCarloSimulation } from '../engine'
import { applyCashFlows } from '../cashFlows'

const scenario = (overrides: Partial<SimulationParams> = {}) =>
  applyCashFlows({
    ...DEFAULT_PARAMS,
    currentAge: 60,
    retirementAge: 60,
    legalRetirementAge: 60,
    endAge: 62,
    currentAssets: 1000,
    annualSavings: 0,
    averageROI: 0.1,
    roiVolatility: 0,
    averageInflation: 0,
    inflationVolatility: 0,
    capitalGainsTax: 25,
    taxAllowanceAnnual: 0,
    equityFundExemption: 0,
    simulationRuns: 1,
    withdrawalStrategy: 'fixedReal',
    cashFlows: [
      { id: 'living', kind: 'expense', name: 'Living', amount: 100, frequency: 'annual' },
    ],
    ...overrides,
  })

describe('booked annual cash flows', () => {
  it('reports the actual sale and its tax, not just the spending budget', () => {
    const result = runMonteCarloSimulation(scenario())
    const row = result.cashFlowMeans?.[0]
    expect(row).toBeDefined()
    // 1,100 assets, 1,000 basis: sale W must net 100 after tax on W/11.
    expect(row?.portfolioWithdrawal).toBeCloseTo(100 / (1 - 0.25 / 11), 8)
    expect(row?.capitalGainsTax).toBeCloseTo(100 / (1 - 0.25 / 11) - 100, 8)
    expect(row?.expenses).toBe(100)
    expect(row?.closingAssets).toBeCloseTo(result.assetPercentiles.p50[0], 8)
  })

  it('separates pension gross, pension tax and the remaining portfolio need', () => {
    const result = runMonteCarloSimulation(
      scenario({
        averageROI: 0,
        pensionTaxablePortion: 0.8,
        pensionTaxRate: 0.25,
        cashFlows: [
          { id: 'pension', kind: 'pension', name: 'Pension', amount: 100, frequency: 'annual' },
          { id: 'living', kind: 'expense', name: 'Living', amount: 100, frequency: 'annual' },
        ],
      })
    )
    expect(result.cashFlowMeans?.[0]).toMatchObject({
      incomeGross: 100,
      incomeTax: 20,
      portfolioWithdrawal: 20,
      expenses: 100,
      shortfall: 0,
    })
  })

  it('shows an unfunded budget after depletion instead of inventing available cash', () => {
    const result = runMonteCarloSimulation(scenario({ currentAssets: 50, averageROI: 0 }))
    expect(result.cashFlowMeans?.[0]).toMatchObject({
      portfolioWithdrawal: 50,
      expenses: 100,
      shortfall: 50,
      closingAssets: 0,
    })
    expect(result.cashFlowMeans?.[1]).toMatchObject({
      portfolioWithdrawal: 0,
      expenses: 100,
      shortfall: 100,
      closingAssets: 0,
    })
  })

  it('balances both ledgers across accumulation, retirement, one-offs, taxes and stochastic paths', () => {
    const result = runMonteCarloSimulation(
      scenario({
        retirementAge: 61,
        endAge: 67,
        currentAssets: 300,
        annualSavings: 200,
        roiVolatility: 0.2,
        averageInflation: 0.03,
        inflationVolatility: 0.02,
        simulationRuns: 100,
        pensionTaxablePortion: 1,
        pensionTaxRate: 0.2,
        cashFlows: [
          {
            id: 'pension',
            kind: 'pension',
            name: 'Pension',
            amount: 100,
            frequency: 'annual',
            inflationLinked: true,
          },
          { id: 'living', kind: 'expense', name: 'Living', amount: 300, frequency: 'annual' },
          {
            id: 'gift',
            kind: 'income',
            name: 'Gift',
            amount: 1000,
            frequency: 'once',
            startAge: 62,
          },
          {
            id: 'repair',
            kind: 'expense',
            name: 'Repair',
            amount: 200,
            frequency: 'once',
            startAge: 60,
          },
        ],
      })
    )
    expect(result.cashFlowMeans).toHaveLength(result.ages.length)
    expect(result.cashFlowMeansReal).toHaveLength(result.ages.length)
    for (const series of [result.cashFlowMeans!, result.cashFlowMeansReal!]) {
      for (const row of series) {
        expect(row.incomeGross + row.savings + row.portfolioWithdrawal + row.shortfall).toBeCloseTo(
          row.expenses + row.incomeTax + row.capitalGainsTax + row.portfolioContribution,
          7
        )
        expect(
          row.openingAssets +
            row.investmentReturn +
            row.portfolioContribution -
            row.portfolioWithdrawal
        ).toBeCloseTo(row.closingAssets, 7)
        expect(row.shortfall).toBeGreaterThanOrEqual(0)
      }
    }
    // Nominally indexed pension has a constant base-year gross amount.
    expect(result.cashFlowMeansReal?.[5].incomeGross).toBeCloseTo(100, 7)
  })

  it('books which income source and which expenses make up the totals', () => {
    const result = runMonteCarloSimulation(
      scenario({
        retirementAge: 61,
        endAge: 66,
        averageROI: 0,
        pensionTaxablePortion: 1,
        pensionTaxRate: 0.2,
        cashFlows: [
          { id: 'pension', kind: 'pension', name: 'Pension', amount: 100, frequency: 'annual' },
          {
            id: 'rent',
            kind: 'income',
            name: 'Rent',
            amount: 50,
            frequency: 'annual',
            taxTreatment: 'none',
          },
          {
            id: 'gift',
            kind: 'income',
            name: 'Gift',
            amount: 1000,
            frequency: 'once',
            startAge: 62,
            taxTreatment: 'oneFifth',
          },
          { id: 'living', kind: 'expense', name: 'Living', amount: 300, frequency: 'annual' },
          {
            id: 'care',
            kind: 'expense',
            name: 'Care',
            amount: 40,
            frequency: 'annual',
            startAge: 64,
          },
        ],
      })
    )
    for (const series of [result.cashFlowMeans!, result.cashFlowMeansReal!]) {
      for (const row of series) {
        expect(row.pensionGross).toBeGreaterThanOrEqual(0)
        expect(row.pensionGross! + row.oneOffIncomeGross!).toBeLessThanOrEqual(
          row.incomeGross + 1e-9
        )
        expect(row.pensionTax! + row.oneOffIncomeTax!).toBeLessThanOrEqual(row.incomeTax + 1e-9)
        expect(row.scheduledExpenses!).toBeLessThanOrEqual(row.expenses + 1e-9)
      }
    }
    const byAge = (age: number) => result.cashFlowMeans![result.ages.indexOf(age)]
    // Pension taxed at 20 % of its full amount; rent untaxed on top.
    expect(byAge(61)).toMatchObject({ pensionGross: 100, pensionTax: 20, incomeGross: 150 })
    // The gift is credited the year after its booking age, with its own tax.
    expect(byAge(63).oneOffIncomeGross).toBeCloseTo(1000, 7)
    expect(byAge(63).oneOffIncomeTax).toBeCloseTo(byAge(63).incomeTax - 20, 7)
    expect(byAge(62).oneOffIncomeGross).toBe(0)
    // Care is a scheduled expense riding on top of the baseline budget.
    expect(byAge(64).scheduledExpenses).toBe(40)
    expect(byAge(63).scheduledExpenses).toBe(0)
    expect(byAge(64).expenses).toBe(340)
  })
})
