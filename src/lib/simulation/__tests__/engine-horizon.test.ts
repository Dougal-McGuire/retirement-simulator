import { DEFAULT_PARAMS, type CashFlow, type SimulationParams } from '@/types'
import {
  MAX_SIMULATION_RUNS,
  MIN_CURRENT_AGE,
  normalizeSimulationParams,
  runMonteCarloSimulation,
} from '@/lib/simulation/engine'
import {
  applyCashFlows,
  budgetAnnualAt,
  buildCashFlowSeries,
  isLifetimeExpenseFlow,
  projectCustomExpenses,
} from '@/lib/simulation/cashFlows'
import { besteuerungsanteil } from '@/lib/simulation/germanTax'
import { breakdownLedger, buildFlowTracks } from '@/lib/simulation/flowBreakdown'
import { areSimulationParamsEqual } from '@/lib/simulation/planInsights'
import {
  baselineMonthlySpending,
  buildPlannedSpendingPaths,
} from '@/lib/simulation/spendingCorridor'
import { flowPlanTotal } from '@/lib/simulation/uncertainFlows'

/**
 * The horizon, what counts as budget, and when results are stale.
 *
 * The engine used to *repair* a plan by pulling everything into
 * `currentAge..endAge`: a flow that ended last year was charged this year, a
 * pension running for a decade was taxed as if it started today, and because
 * the repaired copy is what results carry, the dashboard then called those
 * results stale forever. Nothing is moved any more.
 */

const det = (overrides: Partial<SimulationParams>): SimulationParams =>
  applyCashFlows({
    ...DEFAULT_PARAMS,
    roiVolatility: 0,
    inflationVolatility: 0,
    simulationRuns: 1,
    ...overrides,
  })

const rowAt = (results: ReturnType<typeof runMonteCarloSimulation>, age: number) =>
  results.cashFlowMeans![results.ages.indexOf(age)]

describe('flows outside the horizon are not part of the plan', () => {
  // The default plan is 55 → 90.
  const expired: CashFlow[] = [
    {
      id: 'tuition',
      kind: 'expense',
      name: 'Tuition',
      amount: 30000,
      frequency: 'annual',
      startAge: 50,
      endAge: 54,
    },
    { id: 'roof', kind: 'expense', name: 'Roof', amount: 80000, frequency: 'once', startAge: 53 },
    {
      id: 'inheritance',
      kind: 'income',
      name: 'Inheritance',
      amount: 200000,
      frequency: 'once',
      startAge: 52,
      taxTreatment: 'oneFifth',
    },
    {
      id: 'care',
      kind: 'expense',
      name: 'Care',
      amount: 4000,
      frequency: 'monthly',
      startAge: 92,
    },
  ]

  it('expands none of them into the series', () => {
    const series = buildCashFlowSeries(expired, 55, 90, { legalRetirementAge: 67 })
    expect(series.expenseLinked.every((value) => value === 0)).toBe(true)
    expect(series.expenseFixed.every((value) => value === 0)).toBe(true)
    expect(series.oneTimeIncomeLinkedByAge.size).toBe(0)
    expect(series.oneTimeIncomeAtEnd).toEqual({
      netLinked: 0,
      netFixed: 0,
      taxLinked: 0,
      taxFixed: 0,
    })
    expect(series.taxByFlow.size).toBe(0)
  })

  it('runs the plan exactly as if they were not there', () => {
    // Expired tuition, a roof repaired two years ago, an inheritance already
    // received and care costs after the last simulated year. Each of them used
    // to be clamped to 55 (or 90) and charged or credited there.
    const without = runMonteCarloSimulation({ ...DEFAULT_PARAMS, simulationRuns: 120 })
    const withExpired = runMonteCarloSimulation(
      applyCashFlows({
        ...DEFAULT_PARAMS,
        simulationRuns: 120,
        cashFlows: [...DEFAULT_PARAMS.cashFlows, ...expired],
      })
    )

    expect(withExpired.successRate).toBe(without.successRate)
    expect(withExpired.assetPercentiles).toEqual(without.assetPercentiles)
    expect(withExpired.spendingPercentiles).toEqual(without.spendingPercentiles)
    expect(rowAt(withExpired, 55).expenses).toBe(0)
    expect(rowAt(withExpired, 56).oneOffIncomeGross).toBe(0)
    expect(rowAt(withExpired, 90).scheduledExpenses).toBe(0)
  })

  it('keeps the flows in the plan as the user wrote them', () => {
    const params = det({ cashFlows: [...DEFAULT_PARAMS.cashFlows, ...expired] })
    const results = runMonteCarloSimulation(params)
    const byId = new Map(results.params.cashFlows.map((flow) => [flow.id, flow]))

    expect(byId.get('tuition')).toMatchObject({ startAge: 50, endAge: 54 })
    expect(byId.get('roof')).toMatchObject({ startAge: 53 })
    // Not replaced by a value-matched `income-0` copy: id and tax treatment survive.
    expect(byId.get('inheritance')).toMatchObject({ startAge: 52, taxTreatment: 'oneFifth' })
    expect(byId.get('care')).toMatchObject({ startAge: 92 })
    expect(results.params.cashFlows).toHaveLength(params.cashFlows.length)
    expect(results.params.oneTimeIncomes).toEqual([
      { name: 'Inheritance', age: 52, amount: 200000 },
    ])
  })

  it('cuts a flow that is partly inside to the overlap', () => {
    const results = runMonteCarloSimulation(
      det({
        averageInflation: 0,
        cashFlows: [
          ...DEFAULT_PARAMS.cashFlows,
          {
            id: 'tuition',
            kind: 'expense',
            name: 'Tuition',
            amount: 10000,
            frequency: 'annual',
            startAge: 52,
            endAge: 57,
          },
          {
            id: 'care',
            kind: 'expense',
            name: 'Care',
            amount: 1000,
            frequency: 'monthly',
            startAge: 89,
            endAge: 95,
          },
        ],
      })
    )
    expect([55, 56, 57, 58].map((age) => rowAt(results, age).scheduledExpenses)).toEqual([
      10000, 10000, 10000, 0,
    ])
    expect([88, 89, 90].map((age) => rowAt(results, age).scheduledExpenses)).toEqual([
      0, 12000, 12000,
    ])
    expect(results.ages[results.ages.length - 1]).toBe(90)
  })

  it('still books a one-off at the plan’s first age', () => {
    const series = buildCashFlowSeries(
      [
        {
          id: 'roof',
          kind: 'expense',
          name: 'Roof',
          amount: 5000,
          frequency: 'once',
          startAge: 55,
        },
        { id: 'gift', kind: 'income', name: 'Gift', amount: 7000, frequency: 'once', startAge: 55 },
      ],
      55,
      60
    )
    expect(series.expenseLinked[0]).toBe(5000)
    // Booked for 55, credited at 56 — the convention every plan relies on.
    expect([...series.oneTimeIncomeLinkedByAge.entries()]).toEqual([[56, 7000]])
  })

  it('sizes an uncertain item by what the engine will count of it', () => {
    const params = det({})
    const past: CashFlow = {
      id: 'past',
      kind: 'income',
      name: 'Past',
      amount: 50000,
      frequency: 'once',
      startAge: 50,
    }
    expect(flowPlanTotal(past, params)).toBe(0)
    expect(flowPlanTotal({ ...past, startAge: 70 }, params)).toBe(50000)
    expect(flowPlanTotal({ ...past, startAge: 95 }, params)).toBe(0)
  })
})

describe('a one-off booked for the last year is not lost', () => {
  const plan = (startAge: number) =>
    det({
      currentAge: 60,
      retirementAge: 60,
      legalRetirementAge: 67,
      endAge: 62,
      currentAssets: 100_000,
      annualSavings: 0,
      averageROI: 0,
      averageInflation: 0,
      capitalGainsTax: 0,
      withdrawalStrategy: 'fixedReal',
      cashFlows: [
        { id: 'living', kind: 'expense', name: 'Living', amount: 10_000, frequency: 'annual' },
        { id: 'gift', kind: 'income', name: 'Gift', amount: 50_000, frequency: 'once', startAge },
      ],
    })

  it('arrives at the end of the final year: in what is left, too late to be spent', () => {
    const results = runMonteCarloSimulation(plan(62))
    // 100k − 3 × 10k, plus the gift. It used to be dropped: 70,000.
    expect(results.assetPercentiles.p50).toEqual([90_000, 80_000, 120_000])
    const last = results.cashFlowMeans![2]
    expect(last.oneOffIncomeGross).toBe(50_000)
    expect(last.portfolioContribution).toBe(50_000)
    expect(last.portfolioWithdrawal).toBe(10_000)
    // Both ledger identities still hold in that row.
    expect(last.incomeGross + last.savings + last.portfolioWithdrawal + last.shortfall).toBeCloseTo(
      last.expenses + last.incomeTax + last.capitalGainsTax + last.portfolioContribution,
      9
    )
    expect(
      last.openingAssets +
        last.investmentReturn +
        last.portfolioContribution -
        last.portfolioWithdrawal
    ).toBeCloseTo(last.closingAssets, 9)
  })

  it('does not rescue a final year the portfolio could not pay for', () => {
    const results = runMonteCarloSimulation({ ...plan(62), currentAssets: 25_000 })
    expect(results.cashFlowMeans![2].shortfall).toBe(5_000)
    expect(results.successRate).toBe(0)
    expect(results.assetPercentiles.p50[2]).toBe(50_000)
  })

  it('keeps the year-after convention for every earlier age', () => {
    const results = runMonteCarloSimulation(plan(61))
    expect(results.assetPercentiles.p50).toEqual([90_000, 80_000, 120_000])
    expect(results.cashFlowMeans!.map((row) => row.oneOffIncomeGross)).toEqual([0, 0, 50_000])
    // Credited at the start of 62, so it is booked in that year's row; the
    // year still opens with last year's close.
    expect(results.cashFlowMeans![2].openingAssets).toBe(80_000)
  })

  it('carries its tax, and the breakdown names the flow in the last row', () => {
    // 200,000 under the one-fifth rule: 5 × tax(40,000) = 36,045.
    const params = applyCashFlows({
      ...plan(62),
      cashFlows: plan(62).cashFlows.map((flow) =>
        flow.id === 'gift' ? { ...flow, amount: 200_000, taxTreatment: 'oneFifth' as const } : flow
      ),
    })
    const results = runMonteCarloSimulation(params)
    const last = results.cashFlowMeans![2]
    expect(last.oneOffIncomeTax).toBe(36_045)
    expect(last.incomeTax).toBe(36_045)
    expect(last.oneOffIncomeGross).toBeCloseTo(200_000, 6)
    expect(last.closingAssets).toBeCloseTo(70_000 + 200_000 - 36_045, 6)

    const breakdown = breakdownLedger(buildFlowTracks(results.params), {
      series: results.cashFlowMeans!,
      ages: results.ages,
      priceLevel: results.inflationIndexP50,
      real: false,
      fromAge: 62,
      toAge: 62,
      row: last,
    })
    const item = breakdown.categories.oneOffIncome!.items[0]
    expect(item.flow?.id).toBe('gift')
    expect(item.amount).toBeCloseTo(200_000, 6)
    expect(item.tax).toBeCloseTo(36_045, 6)
  })
})

describe('a pension already in payment keeps its own start', () => {
  beforeAll(() => {
    // The cohort tables are keyed by calendar year, and the plan's first year
    // is "now": pin it so the expected cohorts below stay the expected ones.
    jest.useFakeTimers().setSystemTime(new Date('2026-06-01T00:00:00Z'))
  })
  afterAll(() => {
    jest.useRealTimers()
  })

  const retired = (flows: CashFlow[], overrides: Partial<SimulationParams> = {}) =>
    det({
      currentAge: 75,
      retirementAge: 75,
      legalRetirementAge: 67,
      endAge: 90,
      pensionTaxRate: 0.2,
      cashFlows: flows,
      ...overrides,
    })

  it('taxes it with the cohort of the year it started, not of today', () => {
    // 75 in 2026, pension since 65: started 2016, 72% taxable for life.
    const results = runMonteCarloSimulation(
      retired([
        {
          id: 'pension-statutory',
          kind: 'pension',
          name: 'Pension',
          amount: 2000,
          frequency: 'monthly',
          startAge: 65,
          pensionTaxMode: 'statutory',
        },
      ])
    )
    expect(besteuerungsanteil(2016)).toBe(0.72)
    expect(besteuerungsanteil(2026)).toBe(0.84)
    expect(results.cashFlowMeans![0].pensionGross).toBeCloseTo(24_000, 6)
    expect(results.cashFlowMeans![0].pensionTax).toBeCloseTo(24_000 * 0.72 * 0.2, 6)
    // The flow is handed back as written.
    expect(results.params.cashFlows[0].startAge).toBe(65)
  })

  it('does the same when the start is the statutory age and that lies in the past', () => {
    // No start of its own: it follows `legalRetirementAge` = 67, i.e. 2018 (76%).
    const params = retired([
      {
        id: 'pension-statutory',
        kind: 'pension',
        name: 'Pension',
        amount: 2000,
        frequency: 'monthly',
        pensionTaxMode: 'statutory',
      },
    ])
    const results = runMonteCarloSimulation(params)
    expect(results.params.legalRetirementAge).toBe(67)
    expect(results.cashFlowMeans![0].pensionTax).toBeCloseTo(24_000 * 0.76 * 0.2, 6)
  })

  it('counts its extra growth and its frozen allowance from the original start', () => {
    // Versorgungsbezug since 63 (2014): 25.6% up to €1,920 plus €576, frozen on
    // the first year's amount. 1% a year since then, twelve years by 75.
    const results = runMonteCarloSimulation(
      retired([
        {
          id: 'company',
          kind: 'pension',
          name: 'Company pension',
          amount: 1000,
          frequency: 'monthly',
          startAge: 63,
          growthRate: 0.01,
          pensionTaxMode: 'versorgungsbezuege',
        },
      ])
    )
    const gross = 12_000 * Math.pow(1.01, 12)
    const allowance = Math.min(12_000 * 0.256, 1920) + 576
    expect(results.cashFlowMeans![0].pensionGross).toBeCloseTo(gross, 6)
    expect(results.cashFlowMeans![0].pensionTax).toBeCloseTo((gross - allowance) * 0.2, 6)
  })

  it('pays it from the first simulated year, not from its start', () => {
    const results = runMonteCarloSimulation(
      retired([
        {
          id: 'pension-statutory',
          kind: 'pension',
          name: 'Pension',
          amount: 2000,
          frequency: 'monthly',
          startAge: 65,
        },
      ])
    )
    expect(results.ages[0]).toBe(75)
    results.cashFlowMeans!.forEach((row) => expect(row.pensionGross).toBeCloseTo(24_000, 6))
  })
})

describe('every lifetime recurring expense is retirement budget', () => {
  const withHealth = (overrides: Partial<CashFlow>) =>
    DEFAULT_PARAMS.cashFlows.map((flow) =>
      flow.id === 'health' ? { ...flow, ...overrides } : flow
    )

  it('classifies by shape, with one predicate', () => {
    const grown = withHealth({ growthRate: 0.02 }).find((flow) => flow.id === 'health')!
    const fixed = withHealth({ inflationLinked: false }).find((flow) => flow.id === 'health')!

    for (const flow of [grown, fixed]) {
      expect(isLifetimeExpenseFlow(flow)).toBe(true)
      expect(projectCustomExpenses([flow])).toHaveLength(1)
      const series = buildCashFlowSeries([flow], 55, 90)
      // Budget, not scheduled: nothing in the per-year expense series.
      expect(series.expenseLinked.every((value) => value === 0)).toBe(true)
      expect(series.expenseFixed.every((value) => value === 0)).toBe(true)
      const params = det({ cashFlows: [flow] })
      expect(buildFlowTracks(params).tracks[0].category).toBe('baselineSpending')
    }
    // A window is what makes an expense scheduled.
    const windowed = { ...grown, startAge: 55 }
    expect(isLifetimeExpenseFlow(windowed)).toBe(false)
    expect(buildFlowTracks(det({ cashFlows: [windowed] })).tracks[0].category).toBe(
      'scheduledExpenses'
    )
  })

  it('a growth rate of 0.01% on one item does not turn it into a working-years expense', () => {
    // It used to be charged from 55 and netted against savings: the default
    // plan lost 16 points of success to a rounding-error growth rate.
    const run = (cashFlows: CashFlow[]) =>
      runMonteCarloSimulation(applyCashFlows({ ...DEFAULT_PARAMS, cashFlows }))
    const base = run(DEFAULT_PARAMS.cashFlows)
    const grown = run(withHealth({ growthRate: 0.0001 }))

    const working = DEFAULT_PARAMS.retirementAge - DEFAULT_PARAMS.currentAge
    for (let index = 0; index < working; index++) {
      expect(grown.cashFlowMeans![index].expenses).toBe(0)
      expect(grown.cashFlowMeans![index].portfolioContribution).toBe(
        base.cashFlowMeans![index].portfolioContribution
      )
      expect(grown.assetPercentiles.p50[index]).toBe(base.assetPercentiles.p50[index])
    }
    expect(Math.abs(grown.successRate - base.successRate)).toBeLessThanOrEqual(0.5)
  })

  it('lets the item grow from today, so the budget arrives at retirement grown', () => {
    const params = det({
      averageInflation: 0,
      withdrawalStrategy: 'fixedReal',
      cashFlows: withHealth({ growthRate: 0.02 }),
    })
    const results = runMonteCarloSimulation(params)
    const others = 3700 - 1300 + 18500 / 12
    const healthAt = (age: number) => 1300 * Math.pow(1.02, age - params.currentAge)

    expect(rowAt(results, 59).expenses).toBe(0)
    expect(rowAt(results, 60).expenses / 12).toBeCloseTo(others + healthAt(60), 6)
    expect(rowAt(results, 80).expenses / 12).toBeCloseTo(others + healthAt(80), 6)
    expect(rowAt(results, 80).scheduledExpenses).toBe(0)
    expect(baselineMonthlySpending(params)).toBeCloseTo(others + healthAt(60), 6)
    // Fixed real spending follows the budget year by year; so do its lines.
    const paths = buildPlannedSpendingPaths(params, results.ages)
    expect(paths.floor[80 - 55]).toBeCloseTo(others + healthAt(80), 6)
    expect(paths.ceiling[80 - 55]).toBeCloseTo(others + healthAt(80), 6)
  })

  it('holds a fixed-euro item at its euro amount while the rest follows prices', () => {
    const params = det({
      averageInflation: 0.02,
      withdrawalStrategy: 'fixedReal',
      cashFlows: withHealth({ inflationLinked: false }),
    })
    const results = runMonteCarloSimulation(params)
    const linked = (3700 - 1300) * 12 + 18500
    const level = Math.pow(1.02, 70 - 55)

    expect(rowAt(results, 59).expenses).toBe(0)
    expect(rowAt(results, 70).expenses).toBeCloseTo(linked * level + 1300 * 12, 6)
    const series = buildCashFlowSeries(params.cashFlows, 55, 90)
    expect(budgetAnnualAt(series, 15)).toEqual({ linked, fixed: 1300 * 12 })
    // In today's euros the fixed item has shrunk by retirement.
    expect(baselineMonthlySpending(params)).toBeCloseTo(
      (linked + (1300 * 12) / Math.pow(1.02, 5)) / 12,
      6
    )
  })

  it('hands the whole budget to the withdrawal rule in its first year', () => {
    const params = det({
      averageInflation: 0,
      withdrawalStrategy: 'vanguardDynamic',
      cashFlows: withHealth({ growthRate: 0.02 }),
    })
    const results = runMonteCarloSimulation(params)
    expect(rowAt(results, 60).expenses / 12).toBeCloseTo(baselineMonthlySpending(params), 6)
    expect(rowAt(results, 60).scheduledExpenses).toBe(0)
  })

  it('splits the booked budget between plain and grown items in the breakdown', () => {
    const params = det({
      averageInflation: 0,
      withdrawalStrategy: 'fixedReal',
      cashFlows: withHealth({ growthRate: 0.02 }),
    })
    const results = runMonteCarloSimulation(params)
    const row = rowAt(results, 80)
    const breakdown = breakdownLedger(buildFlowTracks(results.params), {
      series: results.cashFlowMeans!,
      ages: results.ages,
      priceLevel: results.inflationIndexP50,
      real: false,
      fromAge: 80,
      toAge: 80,
      row,
    })
    const items = breakdown.categories.baselineSpending!.items
    const health = items.find((item) => item.flow?.id === 'health')!
    const food = items.find((item) => item.flow?.id === 'food')!
    expect(health.amount).toBeCloseTo(1300 * 12 * Math.pow(1.02, 25), 4)
    expect(food.amount).toBeCloseTo(1200 * 12, 4)
    expect(breakdown.categories.scheduledExpenses).toBeUndefined()
  })
})

describe('results belong to their parameters, repaired or not', () => {
  const stale = (params: SimulationParams) =>
    !areSimulationParamsEqual(params, runMonteCarloSimulation(params).params)

  it('is not stale for a plan the engine did not have to touch', () => {
    expect(stale({ ...DEFAULT_PARAMS, simulationRuns: 5 })).toBe(false)
  })

  it('is not stale when a flow starts before the current age', () => {
    expect(
      stale(
        applyCashFlows({
          ...DEFAULT_PARAMS,
          simulationRuns: 5,
          cashFlows: [
            ...DEFAULT_PARAMS.cashFlows,
            {
              id: 'rent',
              kind: 'income',
              name: 'Rent',
              amount: 500,
              frequency: 'monthly',
              startAge: 50,
              endAge: 70,
            },
          ],
        })
      )
    ).toBe(false)
  })

  it('is not stale when the statutory age lies before the current age', () => {
    const params = applyCashFlows({
      ...DEFAULT_PARAMS,
      currentAge: 68,
      retirementAge: 70,
      legalRetirementAge: 67,
      simulationRuns: 5,
    })
    const results = runMonteCarloSimulation(params)
    expect(results.params.legalRetirementAge).toBe(67)
    expect(areSimulationParamsEqual(params, results.params)).toBe(true)
  })

  it('accepts the youngest age the editor and the wizard accept', () => {
    expect(MIN_CURRENT_AGE).toBe(16)
    const params = applyCashFlows({ ...DEFAULT_PARAMS, currentAge: 16, simulationRuns: 5 })
    const results = runMonteCarloSimulation(params)
    expect(results.ages[0]).toBe(16)
    expect(results.params.currentAge).toBe(16)
    expect(areSimulationParamsEqual(params, results.params)).toBe(true)
  })

  it.each<[string, Partial<SimulationParams>]>([
    ['an age below the minimum', { currentAge: 12 }],
    ['a retirement age below the current age', { currentAge: 65, retirementAge: 60 }],
    ['an end age below the retirement age', { endAge: 58 }],
    ['a withdrawal rate outside its range', { dsWithdrawalRate: 0.2 }],
    ['a run count above the cap', { simulationRuns: 50_000_000, marketModel: 'historical' }],
    ['a NaN that the engine replaces', { roiVolatility: Number.NaN }],
  ])('is not stale for %s: the engine repairs it, and says the same thing twice', (_, patch) => {
    const params = applyCashFlows({ ...DEFAULT_PARAMS, simulationRuns: 5, ...patch })
    const results = runMonteCarloSimulation(params)
    expect(areSimulationParamsEqual(params, results.params)).toBe(true)
    expect(areSimulationParamsEqual(results.params, params)).toBe(true)
  })

  it('still goes stale on a real change to a repaired plan', () => {
    const params = applyCashFlows({ ...DEFAULT_PARAMS, currentAge: 12, simulationRuns: 5 })
    const results = runMonteCarloSimulation(params)
    expect(areSimulationParamsEqual({ ...params, currentAssets: 1 }, results.params)).toBe(false)
    expect(areSimulationParamsEqual({ ...params, endAge: 91 }, results.params)).toBe(false)
    // 14 is repaired to the same 16 as 12: same simulation, not stale.
    expect(areSimulationParamsEqual({ ...params, currentAge: 14 }, results.params)).toBe(true)
    expect(areSimulationParamsEqual({ ...params, currentAge: 17 }, results.params)).toBe(false)
  })

  it('normalises idempotently', () => {
    const odd = applyCashFlows({
      ...DEFAULT_PARAMS,
      currentAge: 70,
      retirementAge: 60,
      legalRetirementAge: 65,
      endAge: 40,
      simulationRuns: 1e9,
      cashFlows: [
        ...DEFAULT_PARAMS.cashFlows,
        { id: 'past', kind: 'income', name: 'Past', amount: 1, frequency: 'once', startAge: 30 },
      ],
    })
    const once = normalizeSimulationParams(odd)
    expect(normalizeSimulationParams(once)).toEqual(once)
    expect(once).toMatchObject({
      currentAge: 70,
      retirementAge: 70,
      legalRetirementAge: 65,
      endAge: 70,
      simulationRuns: MAX_SIMULATION_RUNS,
    })
  })

  it('does not stretch the horizon to the statutory age', () => {
    // Plan to 65 with a statutory age of 67: the plan ends at 65 as written,
    // and simply has no pension in it.
    const results = runMonteCarloSimulation(
      det({ retirementAge: 60, legalRetirementAge: 67, endAge: 65 })
    )
    expect(results.ages[results.ages.length - 1]).toBe(65)
    expect(results.cashFlowMeans!.every((row) => row.pensionGross === 0)).toBe(true)
  })

  it('caps the run count', () => {
    expect(MAX_SIMULATION_RUNS).toBe(20_000)
    expect(
      normalizeSimulationParams({ ...DEFAULT_PARAMS, simulationRuns: 1e7 }).simulationRuns
    ).toBe(20_000)
    expect(normalizeSimulationParams({ ...DEFAULT_PARAMS, simulationRuns: 0 }).simulationRuns).toBe(
      1
    )
    expect(
      normalizeSimulationParams({ ...DEFAULT_PARAMS, simulationRuns: 7500 }).simulationRuns
    ).toBe(7500)
  })
})
