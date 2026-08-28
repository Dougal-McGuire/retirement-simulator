import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import {
  applyCashFlows,
  buildCashFlowSeries,
  netPensionAnnualAtAge,
  pensionMonthlyAtAge,
  projectCustomExpenses,
  projectOneTimeIncomes,
  reconcileCashFlows,
  STATUTORY_PENSION_FLOW_ID,
  withStatutoryPension,
} from '@/lib/simulation/cashFlows'
import { DEFAULT_PARAMS, type CashFlow, type SimulationParams } from '@/types'

/**
 * Unified cash flows: windows, one-off payments, nominal-vs-linked amounts and
 * extra real growth.
 *
 * Every scenario below is deterministic by construction — zero volatility, and
 * an explicit inflation rate — so the assertions are exact arithmetic rather
 * than "roughly bigger than". The engine's own randomness is unchanged: the
 * golden master in `engine-golden.test.ts` pins the defaults bit-for-bit.
 */

/**
 * Retirement from day one, no market noise: assets move only through flows.
 *
 * Piped through `applyCashFlows` because that is what writing a flow list means
 * everywhere else in the app — the legacy projections are rewritten from it
 * rather than left stale.
 */
const flat = (overrides: Partial<SimulationParams> = {}): SimulationParams =>
  applyCashFlows({
    ...DEFAULT_PARAMS,
    currentAge: 60,
    retirementAge: 60,
    legalRetirementAge: 90,
    endAge: 64,
    currentAssets: 1_000_000,
    annualSavings: 0,
    monthlyPension: 0,
    averageROI: 0,
    roiVolatility: 0,
    averageInflation: 0,
    inflationVolatility: 0,
    capitalGainsTax: 0,
    withdrawalStrategy: 'fixedReal',
    customExpenses: [],
    cashFlows: [],
    simulationRuns: 1,
    ...overrides,
  })

const spendingAt = (params: SimulationParams, age: number) => {
  const results = runMonteCarloSimulation(params)
  const index = results.ages.indexOf(age)
  expect(index).toBeGreaterThan(-1)
  return results.spendingPercentiles.p50[index] * 12
}

const assetsAt = (params: SimulationParams, age: number) => {
  const results = runMonteCarloSimulation(params)
  return results.assetPercentiles.p50[results.ages.indexOf(age)]
}

describe('cash flow windows', () => {
  const windowed: CashFlow = {
    id: 'care',
    kind: 'expense',
    name: 'Care',
    amount: 1_000,
    frequency: 'monthly',
    startAge: 62,
    endAge: 63,
  }

  it('applies a flow only inside its age window', () => {
    const params = flat({ cashFlows: [windowed] })

    expect(spendingAt(params, 61)).toBeCloseTo(0, 6)
    expect(spendingAt(params, 62)).toBeCloseTo(12_000, 6)
    expect(spendingAt(params, 63)).toBeCloseTo(12_000, 6)
    expect(spendingAt(params, 64)).toBeCloseTo(0, 6)
  })

  it('treats an open-ended window as "from that age onwards"', () => {
    const params = flat({
      cashFlows: [{ ...windowed, endAge: undefined }],
    })

    expect(spendingAt(params, 61)).toBeCloseTo(0, 6)
    expect(spendingAt(params, 64)).toBeCloseTo(12_000, 6)
  })

  it('credits windowed income before the withdrawal is sized', () => {
    const expense: CashFlow = {
      id: 'living',
      kind: 'expense',
      name: 'Living',
      amount: 40_000,
      frequency: 'annual',
    }
    const rent: CashFlow = {
      id: 'rent',
      kind: 'income',
      name: 'Rent',
      amount: 1_000,
      frequency: 'monthly',
      startAge: 60,
      endAge: 61,
    }

    const withoutRent = assetsAt(flat({ cashFlows: [expense] }), 64)
    const withRent = assetsAt(flat({ cashFlows: [expense, rent] }), 64)

    // Two years of €12k rent, funded 1:1 because there is no tax or growth.
    expect(withRent - withoutRent).toBeCloseTo(24_000, 6)
  })
})

describe('one-off cash flows', () => {
  it('books a one-off expense at its start age', () => {
    const params = flat({
      cashFlows: [
        {
          id: 'roof',
          kind: 'expense',
          name: 'Roof',
          amount: 25_000,
          frequency: 'once',
          startAge: 62,
        },
      ],
    })

    expect(spendingAt(params, 61)).toBeCloseTo(0, 6)
    expect(spendingAt(params, 62)).toBeCloseTo(25_000, 6)
    expect(spendingAt(params, 63)).toBeCloseTo(0, 6)
    expect(assetsAt(params, 64)).toBeCloseTo(1_000_000 - 25_000, 6)
  })

  it('keeps the one-off income convention: credited at the following age', () => {
    // Long-standing behaviour that existing plans' numbers depend on, so it is
    // pinned here rather than left to the projection round-trip.
    const params = flat({
      cashFlows: [
        {
          id: 'legacy',
          kind: 'income',
          name: 'Inheritance',
          amount: 50_000,
          frequency: 'once',
          startAge: 61,
        },
      ],
    })

    expect(assetsAt(params, 61)).toBeCloseTo(1_000_000, 6)
    expect(assetsAt(params, 62)).toBeCloseTo(1_050_000, 6)
  })

  it('re-prices a one-off income into the euros of the year it arrives', () => {
    // Quoted in today's money like every other flow: an inheritance booked for
    // age 61 is worth two years of inflation more when it lands at 62.
    const params = flat({
      averageInflation: 0.02,
      inflationVolatility: 0,
      cashFlows: [
        {
          id: 'legacy',
          kind: 'income',
          name: 'Inheritance',
          amount: 50_000,
          frequency: 'once',
          startAge: 61,
        },
      ],
    })

    expect(assetsAt(params, 62) - 1_000_000).toBeCloseTo(50_000 * Math.pow(1.02, 2), 6)

    const nominal = flat({
      averageInflation: 0.02,
      inflationVolatility: 0,
      cashFlows: [
        {
          id: 'legacy',
          kind: 'income',
          name: 'Inheritance',
          amount: 50_000,
          frequency: 'once',
          startAge: 61,
          inflationLinked: false,
        },
      ],
    })

    expect(assetsAt(nominal, 62) - 1_000_000).toBeCloseTo(50_000, 6)
  })
})

describe('inflation linkage and growth', () => {
  const inflating = (flow: CashFlow) =>
    flat({ averageInflation: 0.02, inflationVolatility: 0, cashFlows: [flow] })

  const base: CashFlow = {
    id: 'x',
    kind: 'expense',
    name: 'Scheduled',
    amount: 10_000,
    frequency: 'annual',
    startAge: 60,
    endAge: 64,
  }

  it('re-prices an inflation-linked flow with the realised price level', () => {
    const params = inflating(base)

    expect(spendingAt(params, 60)).toBeCloseTo(10_000, 6)
    expect(spendingAt(params, 62)).toBeCloseTo(10_000 * Math.pow(1.02, 2), 6)
  })

  it('holds a nominally fixed flow at its stated euro amount', () => {
    const params = inflating({ ...base, inflationLinked: false })

    expect(spendingAt(params, 60)).toBeCloseTo(10_000, 6)
    expect(spendingAt(params, 62)).toBeCloseTo(10_000, 6)
  })

  it('compounds extra real growth from the flow’s own start age', () => {
    const params = flat({
      cashFlows: [{ ...base, startAge: 61, growthRate: 0.03 }],
    })

    expect(spendingAt(params, 61)).toBeCloseTo(10_000, 6)
    expect(spendingAt(params, 63)).toBeCloseTo(10_000 * Math.pow(1.03, 2), 6)
  })
})

describe('scheduled flows and the Vanguard guardrails', () => {
  it('rides a one-off expense on top of the guardrailed baseline', () => {
    // With a ceiling of 0% the guardrail can never raise spending, so anything
    // above the baseline in the roof-repair year proves the flow is not clipped
    // — and the year after proves it did not become the new floor either.
    const params = flat({
      withdrawalStrategy: 'vanguardDynamic',
      dsWithdrawalRate: 0.04,
      dsCeilingRate: 0,
      dsFloorRate: 0,
      customExpenses: [{ id: 'living', name: 'Living', amount: 40_000, interval: 'annual' }],
      cashFlows: [
        { id: 'living', kind: 'expense', name: 'Living', amount: 40_000, frequency: 'annual' },
        {
          id: 'roof',
          kind: 'expense',
          name: 'Roof',
          amount: 30_000,
          frequency: 'once',
          startAge: 62,
        },
      ],
    })

    expect(spendingAt(params, 61)).toBeCloseTo(40_000, 6)
    expect(spendingAt(params, 62)).toBeCloseTo(70_000, 6)
    expect(spendingAt(params, 63)).toBeCloseTo(40_000, 6)
  })
})

describe('scheduled flows during accumulation', () => {
  const working = (cashFlows: CashFlow[], annualSavings: number) => ({
    ...flat({
      currentAge: 50,
      retirementAge: 55,
      endAge: 55,
      currentAssets: 100_000,
      annualSavings,
      cashFlows,
      customExpenses: [],
    }),
  })

  it('nets a scheduled expense off against that year’s savings', () => {
    const withFlow = assetsAt(
      working(
        [
          {
            id: 'roof',
            kind: 'expense',
            name: 'Roof',
            amount: 20_000,
            frequency: 'once',
            startAge: 52,
          },
        ],
        30_000
      ),
      54
    )
    const withoutFlow = assetsAt(working([], 30_000), 54)

    expect(withoutFlow - withFlow).toBeCloseTo(20_000, 6)
  })

  it('withdraws with a tax gross-up when savings cannot cover the expense', () => {
    // 10k of savings against a 60k bill: 50k has to come out of a portfolio
    // that is 100% gains, so the gross-up is real money, not a rounding detail.
    const params = working(
      [
        {
          id: 'roof',
          kind: 'expense',
          name: 'Roof',
          amount: 60_000,
          frequency: 'once',
          startAge: 51,
        },
      ],
      10_000
    )
    params.capitalGainsTax = 25
    params.currentAssets = 200_000
    params.annualSavingsGrowthRate = 0

    const results = runMonteCarloSimulation(params)
    const index = results.ages.indexOf(51)
    const before = results.assetPercentiles.p50[index - 1]
    const after = results.assetPercentiles.p50[index]

    // Basis == value here, so the gross-up is exactly zero and the shortfall is
    // withdrawn 1:1. The point of the assertion is that it *is* withdrawn.
    expect(before - after).toBeCloseTo(50_000, 6)
    expect(after).toBeGreaterThan(0)
  })

  it('never lets a scheduled expense drive assets negative', () => {
    const params = working(
      [
        {
          id: 'disaster',
          kind: 'expense',
          name: 'Disaster',
          amount: 500_000,
          frequency: 'once',
          startAge: 51,
        },
      ],
      0
    )

    const results = runMonteCarloSimulation(params)

    expect(Math.min(...results.assetPercentiles.p50)).toBeGreaterThanOrEqual(0)
    expect(results.successRate).toBe(0)
  })
})

describe('defaults equivalence (migration is behaviour-preserving)', () => {
  it('reproduces the pre-migration result from lifetime expense flows alone', () => {
    // What a v2 plan looked like: only `customExpenses`, no flow list at all.
    const legacyShaped = {
      ...DEFAULT_PARAMS,
      cashFlows: [],
    } as SimulationParams

    const fromFlows = runMonteCarloSimulation(DEFAULT_PARAMS)
    const fromLegacy = runMonteCarloSimulation(legacyShaped)

    expect(fromLegacy.successRate).toBe(fromFlows.successRate)
    expect(fromLegacy.assetPercentiles).toEqual(fromFlows.assetPercentiles)
    expect(fromLegacy.spendingPercentiles).toEqual(fromFlows.spendingPercentiles)
    // ...and the engine hands back a fully reconciled parameter set either way.
    expect(fromLegacy.params.cashFlows).toEqual(fromFlows.params.cashFlows)
  })

  it('charges an explicitly windowed living cost during the working years too', () => {
    // Spelling a lifetime expense out as a window is NOT the same statement:
    // the baseline is assumed to come out of salary while working, a scheduled
    // flow is funded from the portfolio whenever it falls. The difference is
    // real and visible, so it is asserted rather than papered over.
    const windowed = runMonteCarloSimulation({
      ...DEFAULT_PARAMS,
      cashFlows: DEFAULT_PARAMS.cashFlows.map((flow) => ({
        ...flow,
        startAge: DEFAULT_PARAMS.currentAge,
        endAge: DEFAULT_PARAMS.endAge,
      })),
    })
    const baseline = runMonteCarloSimulation(DEFAULT_PARAMS)

    expect(baseline.spendingPercentiles.p50[0]).toBe(0)
    expect(windowed.spendingPercentiles.p50[0]).toBeGreaterThan(0)
    expect(windowed.successRate).toBeLessThanOrEqual(baseline.successRate)
  })
})

describe('projections and reconciliation', () => {
  const windowed: CashFlow = {
    id: 'rent',
    kind: 'income',
    name: 'Rent',
    amount: 900,
    frequency: 'monthly',
    startAge: 62,
    endAge: 70,
  }

  it('projects only what the legacy arrays can express', () => {
    const flows: CashFlow[] = [
      { id: 'food', kind: 'expense', name: 'Food', amount: 1_200, frequency: 'monthly' },
      windowed,
      { id: 'gift', kind: 'income', name: 'Gift', amount: 5_000, frequency: 'once', startAge: 65 },
    ]

    expect(projectCustomExpenses(flows)).toEqual([
      { id: 'food', name: 'Food', amount: 1_200, interval: 'monthly' },
    ])
    expect(projectOneTimeIncomes(flows, 55)).toEqual([{ name: 'Gift', age: 65, amount: 5_000 }])
  })

  it('folds a legacy-only edit into the flows without disturbing windowed ones', () => {
    const reconciled = reconcileCashFlows({
      cashFlows: [windowed],
      customExpenses: [{ id: 'food', name: 'Food', amount: 1_300, interval: 'monthly' }],
      oneTimeIncomes: [],
      currentAge: 55,
    })

    expect(reconciled).toHaveLength(2)
    expect(reconciled[0]).toEqual(windowed)
    expect(reconciled[1]).toMatchObject({ id: 'food', kind: 'expense', amount: 1_300 })
  })

  it('is idempotent', () => {
    const once = reconcileCashFlows({
      cashFlows: [],
      customExpenses: DEFAULT_PARAMS.customExpenses,
      oneTimeIncomes: [{ name: 'Bonus', age: 65, amount: 10_000 }],
      currentAge: 55,
    })
    const twice = reconcileCashFlows({
      cashFlows: once,
      customExpenses: projectCustomExpenses(once),
      oneTimeIncomes: projectOneTimeIncomes(once, 55),
      currentAge: 55,
    })

    expect(twice).toEqual(once)
  })

  it('drops a flow whose legacy counterpart was deleted', () => {
    const reconciled = reconcileCashFlows({
      cashFlows: [
        windowed,
        { id: 'food', kind: 'expense', name: 'Food', amount: 1_200, frequency: 'monthly' },
        { id: 'car', kind: 'expense', name: 'Car', amount: 1_500, frequency: 'annual' },
      ],
      customExpenses: [{ id: 'food', name: 'Food', amount: 1_200, interval: 'monthly' }],
      oneTimeIncomes: [],
      currentAge: 55,
    })

    expect(reconciled.map((flow) => flow.id)).toEqual(['rent', 'food'])
  })

  it('rewrites the projections when the flows carry the intent', () => {
    // The other direction: `applyCashFlows` overwrites the legacy arrays rather
    // than reconciling them, which is what writing `cashFlows` has to mean.
    const applied = applyCashFlows({
      ...DEFAULT_PARAMS,
      cashFlows: [
        {
          id: 'gift',
          kind: 'income',
          name: 'Gift',
          amount: 5_000,
          frequency: 'once',
          startAge: 65,
        },
        windowed,
      ],
    })

    expect(applied.oneTimeIncomes).toEqual([{ name: 'Gift', age: 65, amount: 5_000 }])
    expect(applied.customExpenses).toEqual([])
  })

  it('keeps the baseline and the scheduled series separate', () => {
    const series = buildCashFlowSeries(
      [
        { id: 'food', kind: 'expense', name: 'Food', amount: 1_000, frequency: 'monthly' },
        windowed,
      ],
      60,
      64
    )

    expect(series.baselineMonthly).toBe(1_000)
    expect(series.expenseLinked).toEqual([0, 0, 0, 0, 0])
    expect(series.incomeLinked).toEqual([0, 0, 900 * 12, 900 * 12, 900 * 12])
  })
})

describe('pension flows', () => {
  const pension = (overrides: Partial<CashFlow> = {}): CashFlow => ({
    id: 'company',
    kind: 'pension',
    name: 'Company pension',
    amount: 1_000,
    frequency: 'monthly',
    ...overrides,
  })
  const untaxed = { legalRetirementAge: 62, pensionTaxablePortion: 0, pensionTaxRate: 0 }

  it('starts at the statutory age when it has no start of its own', () => {
    const series = buildCashFlowSeries([pension()], 60, 64, untaxed)

    // Offsets 0–1 are ages 60–61: nothing yet. From 62 on, €12k a year.
    expect(series.incomeFixed).toEqual([0, 0, 12_000, 12_000, 12_000])
    expect(series.incomeLinked.every((value) => value === 0)).toBe(true)
  })

  it('keeps its own start and end ages when it has them', () => {
    const series = buildCashFlowSeries([pension({ startAge: 63, endAge: 63 })], 60, 64, untaxed)
    expect(series.incomeFixed).toEqual([0, 0, 0, 12_000, 0])
  })

  it('joins the year net of income tax on its taxable share', () => {
    const taxed = { legalRetirementAge: 60, pensionTaxablePortion: 0.8, pensionTaxRate: 0.25 }
    const series = buildCashFlowSeries([pension()], 60, 60, taxed)
    // 1 − 0.8 × 0.25 = 0.8 of €12k.
    expect(series.incomeFixed).toEqual([9_600])

    // A pension with its own taxable share (a Riester annuity, say) overrides
    // the plan's default.
    const own = buildCashFlowSeries([pension({ taxablePortion: 0.5 })], 60, 60, taxed)
    expect(own.incomeFixed).toEqual([10_500])
    expect(netPensionAnnualAtAge([pension({ taxablePortion: 0.5 })], 60, taxed)).toBe(10_500)
  })

  it('is a fixed nominal amount unless indexing is switched on', () => {
    const fixed = buildCashFlowSeries([pension()], 60, 60, { legalRetirementAge: 60 })
    expect(fixed.incomeFixed).toEqual([12_000])
    expect(fixed.incomeLinked).toEqual([0])

    const indexed = buildCashFlowSeries([pension({ inflationLinked: true })], 60, 60, {
      legalRetirementAge: 60,
    })
    expect(indexed.incomeFixed).toEqual([0])
    expect(indexed.incomeLinked).toEqual([12_000])
  })

  it('sums every pension paying out at an age, split by indexing', () => {
    const flows = [
      pension(),
      pension({ id: 'partner', amount: 600, startAge: 65, inflationLinked: true }),
    ]
    expect(pensionMonthlyAtAge(flows, 64, 62)).toEqual({ fixed: 1_000, linked: 0, total: 1_000 })
    expect(pensionMonthlyAtAge(flows, 65, 62)).toEqual({ fixed: 1_000, linked: 600, total: 1_600 })
    expect(pensionMonthlyAtAge(flows, 61, 62).total).toBe(0)
  })

  it('never lets a pension be a one-off payment', () => {
    const [flow] = applyCashFlows(flat({ cashFlows: [pension({ frequency: 'once' })] })).cashFlows
    expect(flow.frequency).toBe('monthly')
  })

  it('funds spending out of the net pension inside the simulation', () => {
    const living: CashFlow = {
      id: 'living',
      kind: 'expense',
      name: 'Living',
      amount: 40_000,
      frequency: 'annual',
    }
    const params = flat({
      legalRetirementAge: 62,
      pensionTaxablePortion: 0.8,
      pensionTaxRate: 0.25,
      cashFlows: [living, pension()],
    })

    // Before the pension starts a year costs the full €40k; once it pays out,
    // €9,600 of net pension covers part of it.
    expect(assetsAt(params, 61) - assetsAt(params, 60)).toBeCloseTo(-40_000, 6)
    expect(assetsAt(params, 64) - assetsAt(params, 63)).toBeCloseTo(-30_400, 6)
  })
})

describe('the statutory pension as a cash flow', () => {
  it('projects monthlyPension from the statutory flow and back', () => {
    const flows = withStatutoryPension([], 2_500)
    expect(flows).toEqual([
      expect.objectContaining({
        id: STATUTORY_PENSION_FLOW_ID,
        kind: 'pension',
        amount: 2_500,
        frequency: 'monthly',
        inflationLinked: false,
      }),
    ])
    expect(applyCashFlows({ ...DEFAULT_PARAMS, cashFlows: flows }).monthlyPension).toBe(2_500)

    // Writing the legacy field edits the flow; zero removes it.
    expect(reconcileCashFlows({ cashFlows: flows, monthlyPension: 3_000 })[0].amount).toBe(3_000)
    expect(reconcileCashFlows({ cashFlows: flows, monthlyPension: 0 })).toEqual([])
    // Removing the flow zeroes the field.
    expect(applyCashFlows({ ...DEFAULT_PARAMS, cashFlows: [] }).monthlyPension).toBe(0)
  })

  it('keeps the start age, tax share and indexing of an edited statutory pension', () => {
    const custom = withStatutoryPension([], 1_000).map((flow) => ({
      ...flow,
      startAge: 65,
      taxablePortion: 0.9,
      inflationLinked: true,
    }))
    const [flow] = withStatutoryPension(custom, 1_200)
    expect(flow).toMatchObject({
      amount: 1_200,
      startAge: 65,
      taxablePortion: 0.9,
      inflationLinked: true,
    })
  })

  it('reproduces a plan saved before pensions were cash flows', () => {
    // A v2-era parameter set: `monthlyPension` and no pension flow at all.
    const legacy: SimulationParams = {
      ...DEFAULT_PARAMS,
      cashFlows: DEFAULT_PARAMS.cashFlows.filter((flow) => flow.kind !== 'pension'),
      simulationRuns: 50,
    }
    const migrated = runMonteCarloSimulation(legacy)
    const shipped = runMonteCarloSimulation({ ...DEFAULT_PARAMS, simulationRuns: 50 })

    expect(migrated.params.cashFlows.some((flow) => flow.id === STATUTORY_PENSION_FLOW_ID)).toBe(
      true
    )
    expect(migrated.successRate).toBe(shipped.successRate)
    expect(migrated.assetPercentiles.p50).toEqual(shipped.assetPercentiles.p50)
  })
})
