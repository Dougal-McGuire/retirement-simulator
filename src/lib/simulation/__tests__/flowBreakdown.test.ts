import { DEFAULT_PARAMS, type AnnualCashFlow, type CashFlow, type SimulationParams } from '@/types'
import { runMonteCarloSimulation } from '../engine'
import { applyCashFlows } from '../cashFlows'
import { buildDemoPlanParams } from '@/lib/plans/demoPlan'
import { sumLedgerRows } from '@/components/charts/cashflowSankeyModel'
import {
  allocate,
  allocateCapped,
  breakdownLedger,
  buildFlowTracks,
  categoryTotals,
  roundToTotal,
  type FlowBreakdown,
  type FlowCategory,
} from '../flowBreakdown'

type Results = ReturnType<typeof runMonteCarloSimulation>

/** The breakdown of one age (or a span) of a result, nominal or real. */
function breakdownAt(results: Results, fromAge: number, toAge = fromAge, real = false) {
  const series = (real ? results.cashFlowMeansReal : results.cashFlowMeans)!
  const from = results.ages.indexOf(fromAge)
  const to = results.ages.indexOf(toAge)
  const row = from === to ? series[from] : sumLedgerRows(series.slice(from, to + 1))!
  return breakdownLedger(buildFlowTracks(results.params), {
    series,
    ages: results.ages,
    priceLevel: results.inflationIndexP50,
    real,
    fromAge,
    toAge,
    row,
  })
}

const itemIds = (breakdown: FlowBreakdown, category: FlowCategory) =>
  breakdown.categories[category]?.items.map((item) => item.key) ?? []

/** Items add up to the booked category, amount and tax; rounded, to the euro. */
function expectExact(breakdown: FlowBreakdown, row: AnnualCashFlow) {
  const totals = categoryTotals(row)
  for (const [category, entry] of Object.entries(breakdown.categories)) {
    const booked = totals[category as FlowCategory]!
    expect(entry.total).toBe(booked.total)
    const items = entry.items
    const amount = items.reduce((sum, item) => sum + item.amount, 0)
    const tax = items.reduce((sum, item) => sum + item.tax, 0)
    expect(Math.abs(amount - booked.total)).toBeLessThan(1e-6 * Math.max(1, booked.total))
    expect(Math.abs(tax - booked.tax)).toBeLessThan(1e-6 * Math.max(1, booked.tax))
    expect(items.reduce((sum, item) => sum + item.rounded, 0)).toBe(Math.round(booked.total))
    expect(items.reduce((sum, item) => sum + item.roundedTax, 0)).toBe(Math.round(booked.tax))
    for (const item of items) {
      expect(item.amount).toBeGreaterThan(0)
      expect(item.tax).toBeLessThanOrEqual(item.amount + 1e-9)
      expect(item.share).toBeCloseTo(item.amount / booked.total, 12)
    }
    // Largest first.
    const amounts = items.filter((item) => item.flow).map((item) => item.amount)
    expect(amounts).toEqual([...amounts].sort((a, b) => b - a))
  }
}

/** A deterministic plan: no volatility, one path — expected values are exact. */
const flat = (overrides: Partial<SimulationParams> = {}) =>
  applyCashFlows({
    ...DEFAULT_PARAMS,
    currentAge: 60,
    retirementAge: 60,
    legalRetirementAge: 63,
    endAge: 70,
    currentAssets: 2_000_000,
    annualSavings: 0,
    averageROI: 0.03,
    roiVolatility: 0,
    averageInflation: 0.02,
    inflationVolatility: 0,
    simulationRuns: 1,
    withdrawalStrategy: 'fixedReal',
    pensionTaxablePortion: 0.8,
    pensionTaxRate: 0.2,
    ...overrides,
  })

describe('allocation helpers', () => {
  it('splits a total by weight and keeps the sum exact', () => {
    const parts = allocate(100, [1, 1, 1])
    expect(parts.reduce((a, b) => a + b, 0)).toBe(100)
    expect(parts[0]).toBeCloseTo(33.333333, 5)
    expect(allocate(10, [0, 0])).toEqual([0, 0])
    expect(allocate(0, [1, 2])).toEqual([0, 0])
  })

  it('never gives a part more than its cap', () => {
    const parts = allocateCapped(60, [10, 1, 1], [20, 50, 50])
    expect(parts[0]).toBe(20)
    expect(parts[1]).toBeCloseTo(20, 9)
    expect(parts[2]).toBeCloseTo(20, 9)
    // No usable weights: spread by the room left.
    expect(allocateCapped(30, [0, 0], [10, 20])).toEqual([10, 20])
  })

  it('rounds to whole euros that add up to the rounded total', () => {
    expect(roundToTotal([33.4, 33.3, 33.3], 100)).toEqual([34, 33, 33])
    expect(roundToTotal([0.4, 0.4, 0.4])).toEqual([1, 0, 0])
    expect(roundToTotal([10.6, 0.2], 10.8)).toEqual([11, 0])
  })
})

describe('flow breakdown of booked rows', () => {
  const demo = runMonteCarloSimulation({ ...buildDemoPlanParams(), simulationRuns: 200 })
  const plain = runMonteCarloSimulation(applyCashFlows({ ...DEFAULT_PARAMS, simulationRuns: 200 }))

  it.each([
    ['example plan', demo],
    ['default plan', plain],
  ])('items add up exactly to every booked category, every year (%s)', (_name, results) => {
    for (const real of [false, true]) {
      const series = (real ? results.cashFlowMeansReal : results.cashFlowMeans)!
      results.ages.forEach((age, index) => {
        expectExact(breakdownAt(results, age, age, real), series[index])
      })
    }
  })

  it('names the members of each category', () => {
    // Part-time work bridges 62–66; the pension starts at 67.
    expect(itemIds(breakdownAt(demo, 63), 'otherIncome')).toEqual(['demo-parttime'])
    expect(breakdownAt(demo, 63).categories.pension).toBeUndefined()
    expect(itemIds(breakdownAt(demo, 68), 'pension')).toEqual(['pension-statutory'])
    // Booked at 70, credited at 71 — with its tax, like the ledger.
    expect(itemIds(breakdownAt(demo, 70), 'oneOffIncome')).toEqual([])
    expect(itemIds(breakdownAt(demo, 71), 'oneOffIncome')).toEqual(['demo-inheritance'])
    expect(itemIds(breakdownAt(demo, 64), 'scheduledExpenses')).toEqual(['demo-roof'])
    expect(itemIds(breakdownAt(demo, 85), 'scheduledExpenses')).toEqual(['demo-care'])
    // The eight living-cost items, largest first.
    const baseline = itemIds(breakdownAt(demo, 62), 'baselineSpending')
    expect(baseline).toHaveLength(8)
    expect(baseline[0]).toBe('health')
    expect(baseline.at(-1)).toBe('carMaintenance')
  })

  it('splits the baseline budget in proportion to the items and marks it pooled', () => {
    const breakdown = breakdownAt(demo, 70)
    const baseline = breakdown.categories.baselineSpending!
    const health = baseline.items.find((item) => item.key === 'health')!
    const food = baseline.items.find((item) => item.key === 'food')!
    expect(health.amount / food.amount).toBeCloseTo(1300 / 1200, 9)
    // The demo plan runs Vanguard's rule, which scales the pool as a whole.
    expect(health.estimated).toBe(true)
    // A working year spends no baseline at all.
    expect(breakdownAt(demo, 55).categories.baselineSpending).toBeUndefined()
  })

  it('sums a span year by year and still adds up to the summed row', () => {
    const series = demo.cashFlowMeans!
    const from = demo.ages.indexOf(62)
    const row = sumLedgerRows(series.slice(from))!
    const breakdown = breakdownAt(demo, 62, 92)
    expectExact(breakdown, row)
    // Every income member over the whole retirement shows up once.
    expect(itemIds(breakdown, 'otherIncome')).toEqual(['demo-parttime'])
    expect(itemIds(breakdown, 'oneOffIncome')).toEqual(['demo-inheritance'])
    expect(itemIds(breakdown, 'scheduledExpenses').sort()).toEqual(['demo-care', 'demo-roof'])
    // Part-time work: five years of 12 × 1 800 in today's euros, re-priced.
    const partTime = breakdown.categories.otherIncome!.items[0]
    expect(partTime.amount).toBeGreaterThan(5 * 21_600)
  })
})

describe('exact splits on a deterministic path', () => {
  const pensions = flat({
    cashFlows: [
      {
        id: 'statutory',
        kind: 'pension',
        name: 'Statutory',
        amount: 2000,
        frequency: 'monthly',
        inflationLinked: false,
      },
      {
        id: 'company',
        kind: 'pension',
        name: 'Company',
        amount: 1000,
        frequency: 'monthly',
        startAge: 61,
        inflationLinked: true,
        taxablePortion: 0.5,
      },
      { id: 'living', kind: 'expense', name: 'Living', amount: 3000, frequency: 'monthly' },
      {
        id: 'roof',
        kind: 'expense',
        name: 'Roof',
        amount: 20_000,
        frequency: 'once',
        startAge: 64,
      },
      {
        id: 'lump',
        kind: 'income',
        name: 'Lump sum',
        amount: 50_000,
        frequency: 'once',
        startAge: 64,
        taxTreatment: 'oneFifth',
      },
      {
        id: 'off',
        kind: 'income',
        name: 'Maybe inheritance',
        amount: 90_000,
        frequency: 'once',
        startAge: 62,
        enabled: false,
      },
    ],
  })
  const results = runMonteCarloSimulation(pensions)
  const priceAt = (age: number) => results.inflationIndexP50![results.ages.indexOf(age)]

  it('books each pension with its own amount and its own tax share', () => {
    const breakdown = breakdownAt(results, 65)
    const items = breakdown.categories.pension!.items
    const statutory = items.find((item) => item.key === 'statutory')!
    const company = items.find((item) => item.key === 'company')!
    // Fixed euros stay 24 000 nominal; the linked one grows with prices.
    expect(statutory.amount).toBeCloseTo(24_000, 6)
    expect(company.amount).toBeCloseTo(12_000 * priceAt(65), 6)
    expect(statutory.tax).toBeCloseTo(24_000 * 0.8 * 0.2, 6)
    expect(company.tax).toBeCloseTo(12_000 * priceAt(65) * 0.5 * 0.2, 6)
    expect(statutory.estimated || statutory.taxEstimated).toBe(false)
    expect(company.taxEstimated).toBe(false)
  })

  it('shows fixed euros shrinking in real terms and linked ones holding still', () => {
    const items = breakdownAt(results, 65, 65, true).categories.pension!.items
    expect(items.find((item) => item.key === 'statutory')!.amount).toBeCloseTo(
      24_000 / priceAt(65),
      6
    )
    expect(items.find((item) => item.key === 'company')!.amount).toBeCloseTo(12_000, 6)
  })

  it('credits a one-off the year after its booked age, with its tax', () => {
    expect(breakdownAt(results, 64).categories.oneOffIncome).toBeUndefined()
    const lump = breakdownAt(results, 65).categories.oneOffIncome!
    expect(lump.items.map((item) => item.key)).toEqual(['lump'])
    expect(lump.items[0].tax).toBeGreaterThan(0)
    expect(lump.items[0].taxEstimated).toBe(false)
    // A scheduled expense lands in its own year.
    expect(itemIds(breakdownAt(results, 64), 'scheduledExpenses')).toEqual(['roof'])
  })

  it('under fixedReal the baseline items are the budget itself, not shares', () => {
    const living = breakdownAt(results, 66).categories.baselineSpending!.items
    expect(living).toHaveLength(1)
    expect(living[0].estimated).toBe(false)
  })

  it('leaves switched-off flows out and lists them', () => {
    const breakdown = breakdownAt(results, 63, 70)
    expect(breakdown.disabled.map((flow) => flow.id)).toEqual(['off'])
    for (const entry of Object.values(breakdown.categories)) {
      expect(entry.items.some((item) => item.key === 'off')).toBe(false)
    }
  })

  const income = (overrides: Partial<CashFlow> = {}): CashFlow[] => [
    {
      id: 'rent',
      kind: 'income',
      name: 'Rent',
      amount: 1500,
      frequency: 'monthly',
      taxTreatment: 'ordinary',
      ...overrides,
    },
    {
      id: 'consulting',
      kind: 'income',
      name: 'Consulting',
      amount: 2500,
      frequency: 'monthly',
      taxTreatment: 'ordinary',
    },
    { id: 'gift', kind: 'income', name: 'Gift', amount: 500, frequency: 'monthly' },
    { id: 'living', kind: 'expense', name: 'Living', amount: 3000, frequency: 'monthly' },
  ]

  it('splits a joint tax on ordinary income by gross, like the engine', () => {
    const joint = runMonteCarloSimulation(flat({ cashFlows: income() }))
    const breakdown = breakdownAt(joint, 61)
    const items = breakdown.categories.otherIncome!.items
    expect(items.map((item) => item.key)).toEqual(['consulting', 'rent', 'gift'])
    const [consulting, rent, gift] = items
    // Untaxed income ("already net") carries none of it.
    expect(gift.tax).toBe(0)
    expect(consulting.tax / rent.tax).toBeCloseTo(2500 / 1500, 9)
    expect(consulting.taxEstimated || rent.taxEstimated).toBe(false)
    expectExact(breakdown, joint.cashFlowMeans![joint.ages.indexOf(61)])
  })

  it('marks the tax as a share where tax rules mix within a category', () => {
    const mixed = runMonteCarloSimulation(
      flat({ cashFlows: income({ taxTreatment: 'oneFifth', amount: 4000 }) })
    )
    const items = breakdownAt(mixed, 61).categories.otherIncome!.items
    expect(items.filter((item) => item.tax > 0).every((item) => item.taxEstimated)).toBe(true)
  })
})
