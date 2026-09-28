import { DEFAULT_PARAMS, type AnnualCashFlow } from '@/types'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import { applyCashFlows } from '@/lib/simulation/cashFlows'
import { buildDemoPlanParams } from '@/lib/plans/demoPlan'
import {
  buildCashflowSankey,
  resolveLedgerSelection,
  sumLedgerRows,
  type CashflowSankeyModel,
  type SankeyNodeId,
} from '../cashflowSankeyModel'

const row = (overrides: Partial<AnnualCashFlow> = {}): AnnualCashFlow => ({
  openingAssets: 0,
  investmentReturn: 0,
  savings: 0,
  incomeGross: 0,
  incomeTax: 0,
  capitalGainsTax: 0,
  expenses: 0,
  portfolioWithdrawal: 0,
  portfolioContribution: 0,
  shortfall: 0,
  closingAssets: 0,
  ...overrides,
})

const ids = (model: CashflowSankeyModel) => model.nodes.map((node) => node.id)
const node = (model: CashflowSankeyModel, id: SankeyNodeId) =>
  model.nodes.find((entry) => entry.id === id)
const link = (model: CashflowSankeyModel, source: SankeyNodeId, target: SankeyNodeId) =>
  model.links.find((entry) => entry.source === source && entry.target === target)?.value

/** Every node that is not a pure source or sink passes on what it receives. */
function expectBalanced(model: CashflowSankeyModel, precision = 6) {
  expect(model.totalOut).toBeCloseTo(model.totalIn, precision)
  for (const { id } of model.nodes) {
    const inflow = model.links.filter((l) => l.target === id).reduce((s, l) => s + l.value, 0)
    const outflow = model.links.filter((l) => l.source === id).reduce((s, l) => s + l.value, 0)
    if (inflow > 0 && outflow > 0) expect(outflow).toBeCloseTo(inflow, precision)
  }
}

/** The ledger's own identity, which the diagram has to reproduce. */
const ledgerIn = (r: AnnualCashFlow) =>
  r.incomeGross + r.savings + r.portfolioWithdrawal + r.shortfall

describe('buildCashflowSankey', () => {
  it('splits a retirement year into taxed sources, the after-tax hub and spending', () => {
    const model = buildCashflowSankey(
      row({
        incomeGross: 50_000,
        incomeTax: 8_000,
        pensionGross: 38_400,
        pensionTax: 6_000,
        oneOffIncomeGross: 0,
        oneOffIncomeTax: 0,
        portfolioWithdrawal: 36_000,
        capitalGainsTax: 2_000,
        expenses: 76_000,
        scheduledExpenses: 16_000,
      })
    )
    expect(ids(model)).toEqual([
      'pension',
      'otherIncome',
      'withdrawal',
      'incomeTax',
      'available',
      'capitalGainsTax',
      'baselineSpending',
      'scheduledExpenses',
    ])
    expect(link(model, 'pension', 'incomeTax')).toBe(6_000)
    expect(link(model, 'pension', 'available')).toBe(32_400)
    expect(link(model, 'otherIncome', 'incomeTax')).toBe(2_000)
    expect(link(model, 'otherIncome', 'available')).toBe(9_600)
    expect(link(model, 'withdrawal', 'capitalGainsTax')).toBe(2_000)
    expect(node(model, 'baselineSpending')?.value).toBe(60_000)
    expect(node(model, 'scheduledExpenses')?.value).toBe(16_000)
    expect(model.totalIn).toBe(86_000)
    expect(model.taxes).toBe(10_000)
    expectBalanced(model)
  })

  it('omits zero-value nodes and links', () => {
    const model = buildCashflowSankey(
      row({
        incomeGross: 10_000,
        pensionGross: 10_000,
        pensionTax: 0,
        oneOffIncomeGross: 0,
        oneOffIncomeTax: 0,
        expenses: 10_000,
        scheduledExpenses: 0,
        shortfall: 0.2,
      })
    )
    expect(ids(model)).toEqual(['pension', 'available', 'baselineSpending'])
    expect(model.links.every((entry) => entry.value > 0)).toBe(true)
  })

  it('shows savings flowing into the portfolio in a working year', () => {
    const model = buildCashflowSankey(
      row({ savings: 30_000, portfolioContribution: 30_000, pensionGross: 0 })
    )
    expect(ids(model)).toEqual(['savings', 'available', 'reinvested'])
    expect(link(model, 'savings', 'available')).toBe(30_000)
    expect(link(model, 'available', 'reinvested')).toBe(30_000)
    expect(node(model, 'reinvested')?.column).toBe(2)
    expectBalanced(model)
  })

  it('feeds an unfunded gap straight into spending, never through the hub', () => {
    const model = buildCashflowSankey(
      row({
        portfolioWithdrawal: 40,
        expenses: 100,
        scheduledExpenses: 25,
        shortfall: 60,
      })
    )
    expect(link(model, 'shortfall', 'baselineSpending')).toBeCloseTo(45, 9)
    expect(link(model, 'shortfall', 'scheduledExpenses')).toBeCloseTo(15, 9)
    expect(model.links.some((l) => l.source === 'shortfall' && l.target === 'available')).toBe(
      false
    )
    expect(node(model, 'available')?.value).toBe(40)
    expect(node(model, 'baselineSpending')?.unfunded).toBeCloseTo(45, 9)
    expectBalanced(model)
  })

  it('falls back to the ledger totals for rows booked without a breakdown', () => {
    const model = buildCashflowSankey(
      row({ incomeGross: 100, incomeTax: 20, portfolioWithdrawal: 20, expenses: 100 })
    )
    expect(ids(model)).toEqual(['income', 'withdrawal', 'incomeTax', 'available', 'spending'])
    expectBalanced(model)
  })
})

describe('ledger rows from the engine', () => {
  const demo = runMonteCarloSimulation({ ...buildDemoPlanParams(), simulationRuns: 200 })
  const plain = runMonteCarloSimulation(applyCashFlows({ ...DEFAULT_PARAMS, simulationRuns: 200 }))

  it.each([
    ['example plan', demo],
    ['default plan', plain],
  ])('balance in every year, nominal and real (%s)', (_name, results) => {
    for (const series of [results.cashFlowMeans!, results.cashFlowMeansReal!]) {
      for (const entry of series) {
        const model = buildCashflowSankey(entry, 0)
        expect(model.totalIn).toBeCloseTo(ledgerIn(entry), 6)
        expectBalanced(model)
        // With the display threshold the drawing may drop cents, never euros.
        const drawn = buildCashflowSankey(entry)
        expect(Math.abs(drawn.totalIn - ledgerIn(entry))).toBeLessThan(5)
      }
    }
  })

  it('names the example plan sources: pension, part-time work, the inheritance', () => {
    const at = (age: number) => buildCashflowSankey(demo.cashFlowMeans![demo.ages.indexOf(age)])
    expect(ids(at(55))).toEqual(['savings', 'available', 'reinvested'])
    expect(ids(at(63))).toContain('otherIncome')
    expect(ids(at(63))).not.toContain('pension')
    expect(ids(at(68))).toContain('pension')
    // Booked at 70, credited at 71 like every one-off.
    expect(ids(at(71))).toContain('oneOffIncome')
    expect(ids(at(85))).toContain('scheduledExpenses')
  })

  it('shows the same year smaller in real terms once inflation has run', () => {
    const index = demo.ages.indexOf(75)
    const nominal = buildCashflowSankey(demo.cashFlowMeans![index])
    const real = buildCashflowSankey(demo.cashFlowMeansReal![index])
    expect(real.totalIn).toBeLessThan(nominal.totalIn)
    expect(ids(real)).toEqual(ids(nominal))
  })

  it('sums the whole retirement into one balanced diagram', () => {
    const series = demo.cashFlowMeans!
    const selection = resolveLedgerSelection(series, demo.ages, 62, 'retirement')!
    expect(selection).toMatchObject({ sum: true, fromAge: 62, toAge: 92, index: -1 })
    const retirementRows = series.slice(demo.ages.indexOf(62))
    const expected = retirementRows.reduce((sum, entry) => sum + ledgerIn(entry), 0)
    const model = buildCashflowSankey(selection.row, 0)
    expect(model.totalIn).toBeCloseTo(expected, 4)
    expectBalanced(model, 4)
    // Working years stay out of the retirement sum.
    expect(node(model, 'savings')).toBeUndefined()
    const { row: total } = selection
    expect(
      total.openingAssets +
        total.investmentReturn +
        total.portfolioContribution -
        total.portfolioWithdrawal
    ).toBeCloseTo(total.closingAssets, 2)
  })
})

describe('resolveLedgerSelection', () => {
  const series = [row({ savings: 1 }), row({ savings: 2 }), row({ expenses: 3 })]
  const ages = [60, 61, 62]

  it('defaults to the first retirement year', () => {
    expect(resolveLedgerSelection(series, ages, 61, null)).toMatchObject({
      index: 1,
      fromAge: 61,
      phase: 'retirement',
    })
  })

  it('picks a working year and labels its phase', () => {
    expect(resolveLedgerSelection(series, ages, 61, 60)).toMatchObject({
      index: 0,
      phase: 'working',
      sum: false,
    })
  })

  it('falls back when the age is outside the plan', () => {
    expect(resolveLedgerSelection(series, ages, 61, 99)?.index).toBe(1)
    expect(resolveLedgerSelection(undefined, ages, 61, 60)).toBeNull()
  })

  it('drops a breakdown that older rows lack instead of misattributing it', () => {
    const total = sumLedgerRows([
      row({ incomeGross: 10, pensionGross: 10, oneOffIncomeGross: 0 }),
      row({ incomeGross: 5 }),
    ])!
    expect(total.incomeGross).toBe(15)
    expect(total.pensionGross).toBeUndefined()
  })
})
