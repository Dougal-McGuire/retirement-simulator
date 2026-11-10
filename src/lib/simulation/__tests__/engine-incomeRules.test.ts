import type { CashFlow, SimulationParams, WithdrawalStrategy } from '@/types'
import {
  applyWithdrawalStrategy,
  calculateGuytonKlingerAnnualSpending,
  calculatePercentOfPortfolioAnnualSpending,
  calculateVanguardDynamicAnnualSpending,
  runMonteCarloSimulation,
  UNFUNDED_SPENDING_TOLERANCE,
} from '@/lib/simulation/engine'
import { applyCashFlows } from '@/lib/simulation/cashFlows'
import { buildSpendingCorridor } from '@/lib/simulation/spendingCorridor'
import master from './fixtures/preIncomeRulesMaster.json'

/**
 * Withdrawal rules and non-portfolio income
 * (docs/specs/2026-11-09-withdrawal-rules-with-income.md).
 *
 * The three market-responsive rules used to apply their rate to the *whole*
 * household budget and net pensions off afterwards, so a plan with a pension
 * was told to live on a fraction of its own pension while the surplus piled
 * up in the portfolio. They now govern the part of spending the portfolio
 * pays. This suite pins the four invariants of that change:
 *
 *   (i)   with no non-portfolio income every rule is the engine it was,
 *   (ii)  no rule sets spending below min(budget, income),
 *   (iii) the withdrawal rate the corridor shows is the rate the rule used,
 *   (iv)  `fixedReal` is untouched,
 *
 * plus what "spending" and "success" mean since the same change set.
 */

const STRATEGIES: readonly WithdrawalStrategy[] = [
  'fixedReal',
  'vanguardDynamic',
  'guytonKlinger',
  'percentOfPortfolio',
]
const DYNAMIC: readonly WithdrawalStrategy[] = [
  'vanguardDynamic',
  'guytonKlinger',
  'percentOfPortfolio',
]

/**
 * Every parameter spelled out, so a later change to `DEFAULT_PARAMS` cannot
 * move the masters below. These are the inputs `preIncomeRulesMaster.json`
 * was captured from.
 */
const BASE: SimulationParams = {
  currentAge: 55,
  retirementAge: 60,
  legalRetirementAge: 67,
  endAge: 90,
  currentAssets: 1_500_000,
  annualSavings: 48000,
  annualSavingsGrowthRate: 0.02,
  monthlyPension: 0,
  oneTimeIncomes: [],
  averageROI: 0.07,
  roiVolatility: 0.15,
  averageInflation: 0.025,
  inflationVolatility: 0.01,
  capitalGainsTax: 26.25,
  taxAllowanceAnnual: 1000,
  householdType: 'single',
  equityFundExemption: 0.3,
  pensionTaxablePortion: 0.83,
  pensionTaxRate: 0.18,
  legacyTargetReal: 0,
  marketModel: 'monteCarlo',
  glidePathEnabled: false,
  equityAllocationStart: 0.8,
  equityAllocationEnd: 0.4,
  bondReturn: 0.03,
  bondVolatility: 0.06,
  customExpenses: [],
  cashFlows: [],
  withdrawalStrategy: 'fixedReal',
  dsWithdrawalRate: 0.05,
  dsCeilingRate: 0.05,
  dsFloorRate: -0.025,
  spendingFloorReal: 0,
  simulationRuns: 300,
}

const LIVING: CashFlow[] = [
  { id: 'health', kind: 'expense', name: 'Health Insurance', amount: 1300, frequency: 'monthly' },
  { id: 'food', kind: 'expense', name: 'Groceries', amount: 1200, frequency: 'monthly' },
  { id: 'fun', kind: 'expense', name: 'Entertainment', amount: 800, frequency: 'monthly' },
  { id: 'utilities', kind: 'expense', name: 'Utilities', amount: 400, frequency: 'monthly' },
  { id: 'vacations', kind: 'expense', name: 'Vacations', amount: 12000, frequency: 'annual' },
  { id: 'repairs', kind: 'expense', name: 'Home Repairs', amount: 6500, frequency: 'annual' },
]
/** €5,242 a month, the same budget as the shipped default plan. */
const LIVING_MONTHLY = 1300 + 1200 + 800 + 400 + (12000 + 6500) / 12

/** No pension, no recurring income: a one-off windfall and a care window only. */
const NO_INCOME_FLOWS: CashFlow[] = [
  ...LIVING,
  {
    id: 'windfall',
    kind: 'income',
    name: 'Windfall',
    amount: 80000,
    frequency: 'once',
    startAge: 70,
  },
  {
    id: 'care',
    kind: 'expense',
    name: 'Care',
    amount: 2200,
    frequency: 'monthly',
    startAge: 82,
    endAge: 90,
  },
]

const PENSION_FLOWS: CashFlow[] = [
  {
    id: 'pension-statutory',
    kind: 'pension',
    name: 'Statutory pension',
    amount: 5000,
    frequency: 'monthly',
    inflationLinked: false,
  },
  ...LIVING,
]

const plan = (overrides: Partial<SimulationParams>): SimulationParams =>
  applyCashFlows({ ...BASE, ...overrides })

type Master = {
  successRate: number
  assetP10: number[]
  assetP50: number[]
  assetP90: number[]
  meanRequestedExpenses: number[]
  meanWithdrawal: number[]
}
const masters = master as Record<string, Master>

/** Equal up to re-association noise of a sum over runs (a few ULP). */
const expectSeriesClose = (actual: number[], expected: number[]) => {
  expect(actual).toHaveLength(expected.length)
  actual.forEach((value, index) => {
    const scale = Math.max(1, Math.abs(expected[index]))
    expect(Math.abs(value - expected[index]) / scale).toBeLessThan(1e-12)
  })
}

describe('(i) without non-portfolio income every rule is the engine it was', () => {
  // The masters were captured at commit f1beaf3, before the rules learned
  // about income. With N_t = 0 the new formulas reduce to the old ones term by
  // term (x + 0, (x − 0) / p, max(x, 0)), so the portfolio paths are not
  // merely close: they are the same bits.
  //
  // The success rate is the one number allowed to differ, and only by the new
  // definition of success (a year is unfunded above 1% shortfall; a balance of
  // zero alone is not failure). `rescued` is how many of the 300 paths that
  // re-labels: in the floored plan path #92 sells its last euro in the final
  // year and leaves €1,305 of €201,732 (0.65%) unpaid — failed before, funded
  // now. Everywhere else the two definitions name the same paths.
  const cases: Array<[string, Partial<SimulationParams>, number]> = [
    ...STRATEGIES.map((withdrawalStrategy): [string, Partial<SimulationParams>, number] => [
      `noIncome:${withdrawalStrategy}`,
      { withdrawalStrategy, cashFlows: NO_INCOME_FLOWS },
      0,
    ]),
    [
      'noIncome:percentOfPortfolio:floor',
      {
        withdrawalStrategy: 'percentOfPortfolio',
        spendingFloorReal: 48000,
        cashFlows: NO_INCOME_FLOWS,
      },
      1,
    ],
  ]

  it.each(cases)('%s', (key, overrides, rescued) => {
    const expected = masters[key]
    const results = runMonteCarloSimulation(plan(overrides))

    expect(results.assetPercentiles.p10).toEqual(expected.assetP10)
    expect(results.assetPercentiles.p50).toEqual(expected.assetP50)
    expect(results.assetPercentiles.p90).toEqual(expected.assetP90)
    // What each rule asked for, and what it sold: the ledger keeps the
    // request even though the spending percentiles now show what was paid.
    expectSeriesClose(
      results.cashFlowMeans!.map((row) => row.expenses),
      expected.meanRequestedExpenses
    )
    expectSeriesClose(
      results.cashFlowMeans!.map((row) => row.portfolioWithdrawal),
      expected.meanWithdrawal
    )
    expect(results.successRate).toBeCloseTo(
      expected.successRate + (rescued * 100) / BASE.simulationRuns,
      9
    )
  })
})

describe('(iv) fixed real spending is untouched, pension or not', () => {
  it('reproduces the pre-change master with a €5,000 pension', () => {
    const expected = masters['pension:fixedReal']
    const results = runMonteCarloSimulation(
      plan({ currentAssets: 630000, withdrawalStrategy: 'fixedReal', cashFlows: PENSION_FLOWS })
    )

    expect(results.assetPercentiles.p10).toEqual(expected.assetP10)
    expect(results.assetPercentiles.p50).toEqual(expected.assetP50)
    expect(results.assetPercentiles.p90).toEqual(expected.assetP90)
    expectSeriesClose(
      results.cashFlowMeans!.map((row) => row.expenses),
      expected.meanRequestedExpenses
    )
    expect(results.successRate).toBe(expected.successRate)
  })

  it('never reads the income it is handed', () => {
    const call = (nonPortfolioIncome: number) =>
      applyWithdrawalStrategy({
        strategy: 'fixedReal',
        baselineAnnualSpending: 60_000,
        priorYearPortfolioValue: 500_000,
        previousAnnualSpending: 58_000,
        inflationFactor: 1.02,
        inflationIndex: 1.2,
        nonPortfolioIncome,
        params: BASE,
      })
    expect(call(0)).toBe(60_000)
    expect(call(90_000)).toBe(60_000)
  })
})

describe('the rules govern the portfolio-funded part of spending', () => {
  it('percent of portfolio: spending = income + rate × portfolio', () => {
    expect(
      calculatePercentOfPortfolioAnnualSpending({
        priorYearPortfolioValue: 300_000,
        withdrawalRate: 0.04,
        floorAnnualReal: 0,
        inflationIndex: 1,
        nonPortfolioIncome: 48_000,
      })
    ).toBeCloseTo(60_000, 9)
  })

  it('Vanguard: affordable = income + rate × portfolio, then the guardrails', () => {
    const base = {
      priorYearPortfolioValue: 300_000,
      previousAnnualSpending: 54_000,
      inflationFactor: 1,
      withdrawalRate: 0.04,
      ceilingRate: 0.05,
      floorRate: -0.025,
    }
    // 48,000 + 12,000 = 60,000 is affordable; the ceiling allows 56,700.
    expect(
      calculateVanguardDynamicAnnualSpending({ ...base, nonPortfolioIncome: 48_000 })
    ).toBeCloseTo(54_000 * 1.05, 9)
    // The old reading (12,000 for the whole household) hit the floor instead.
    expect(calculateVanguardDynamicAnnualSpending(base)).toBeCloseTo(54_000 * 0.975, 9)
    // Inside the guardrails the affordable amount is spent as it is.
    expect(
      calculateVanguardDynamicAnnualSpending({ ...base, nonPortfolioIncome: 43_000 })
    ).toBeCloseTo(55_000, 9)
  })

  it('Guyton-Klinger: the guardrails watch (spending − income) ÷ portfolio', () => {
    const base = {
      previousAnnualSpending: 60_000,
      inflationFactor: 1,
      initialWithdrawalRate: 0.05,
      priorYearPortfolioValue: 300_000,
    }
    // Whole budget over the portfolio: 20% — the old rule cut here.
    expect(calculateGuytonKlingerAnnualSpending(base)).toBeCloseTo(54_000, 9)
    // (60,000 − 45,000) / 300,000 = 5.0%: inside the band, no change.
    expect(
      calculateGuytonKlingerAnnualSpending({ ...base, nonPortfolioIncome: 45_000 })
    ).toBeCloseTo(60_000, 9)
    // (60,000 − 40,000) / 300,000 = 6.67% > 6%: capital preservation.
    expect(
      calculateGuytonKlingerAnnualSpending({ ...base, nonPortfolioIncome: 40_000 })
    ).toBeCloseTo(54_000, 9)
    // (60,000 − 50,000) / 300,000 = 3.3% < 4%: prosperity.
    expect(
      calculateGuytonKlingerAnnualSpending({ ...base, nonPortfolioIncome: 50_000 })
    ).toBeCloseTo(66_000, 9)
    // Income above the budget is prosperity too, never a division artefact.
    expect(
      calculateGuytonKlingerAnnualSpending({ ...base, nonPortfolioIncome: 90_000 })
    ).toBeCloseTo(66_000, 9)
  })

  it('a pension starting later can only look like prosperity, never like a reason to cut', () => {
    // Bridge year: 60,000 from a 1,000,000 portfolio = 6.0%, on the guardrail.
    // The year the 30,000 pension starts the portfolio pays 3.0%.
    const afterPensionStart = calculateGuytonKlingerAnnualSpending({
      previousAnnualSpending: 60_000,
      inflationFactor: 1,
      initialWithdrawalRate: 0.05,
      priorYearPortfolioValue: 1_000_000,
      nonPortfolioIncome: 30_000,
    })
    expect(afterPensionStart).toBeCloseTo(66_000, 9)
  })
})

describe('(ii) the income floor: never below min(budget, income)', () => {
  const call = (
    strategy: WithdrawalStrategy,
    overrides: {
      baseline?: number
      portfolio?: number
      previous?: number | null
      income?: number
    }
  ) =>
    applyWithdrawalStrategy({
      strategy,
      baselineAnnualSpending: overrides.baseline ?? 60_000,
      priorYearPortfolioValue: overrides.portfolio ?? 100_000,
      previousAnnualSpending: overrides.previous === undefined ? 30_000 : overrides.previous,
      inflationFactor: 1,
      inflationIndex: 1,
      nonPortfolioIncome: overrides.income ?? 0,
      params: { ...BASE, dsWithdrawalRate: 0.05, dsCeilingRate: 0.05, dsFloorRate: -0.025 },
    })

  it('lifts a Vanguard ceiling that would hold spending under the pension', () => {
    // Last year 30,000; the ceiling allows 31,500. The pension alone is 40,000
    // and the budget is 60,000: spending 31,500 would bank 8,500 of pension
    // while the household lives under its own budget.
    expect(call('vanguardDynamic', { income: 40_000 })).toBe(40_000)
  })

  it('stops at the budget when the income exceeds it', () => {
    // Income 80,000, budget 60,000: the floor is the budget, not the income.
    expect(call('vanguardDynamic', { income: 80_000, portfolio: 0 })).toBe(60_000)
  })

  it('does not let a Guyton-Klinger cut reach into the pension', () => {
    // (50,000 − 49,000) / 10,000 = 10% > 6%: the rule cuts to 45,000, which is
    // 4,000 less than the pension pays. The floor puts it back to 49,000.
    expect(call('guytonKlinger', { previous: 50_000, portfolio: 10_000, income: 49_000 })).toBe(
      49_000
    )
  })

  it('holds by construction for percent of portfolio', () => {
    expect(call('percentOfPortfolio', { income: 40_000, portfolio: 0 })).toBe(40_000)
  })

  it('is no floor at all without income', () => {
    for (const strategy of DYNAMIC) {
      expect(call(strategy, { portfolio: 0, previous: 0 })).toBe(0)
    }
  })

  it.each(DYNAMIC)('%s: holds in every year of every sampled path', (withdrawalStrategy) => {
    // A thin portfolio, seven bridge years and then a pension well above what
    // the guardrails have left of the budget by then: the plan in which the
    // old rules cut deepest.
    const params = plan({
      currentAssets: 250_000,
      annualSavings: 0,
      simulationRuns: 1,
      withdrawalStrategy,
      roiVolatility: 0.2,
      inflationVolatility: 0.02,
      cashFlows: [
        {
          id: 'pension-statutory',
          kind: 'pension',
          name: 'Pension',
          amount: 5500,
          frequency: 'monthly',
          inflationLinked: true,
        },
        {
          id: 'job',
          kind: 'income',
          name: 'Part time',
          amount: 1500,
          frequency: 'monthly',
          startAge: 60,
          endAge: 64,
        },
        ...LIVING,
      ],
    })
    const retirementIndex = params.retirementAge - params.currentAge
    let checked = 0
    let binding = 0

    for (let seed = 1; seed <= 25; seed++) {
      // One run = one path: the "means" are that path's own ledger.
      const results = runMonteCarloSimulation(params, { seed })
      results.cashFlowMeans!.forEach((row, index) => {
        if (index < retirementIndex) return
        const income = row.incomeGross - row.incomeTax
        const budget = LIVING_MONTHLY * 12 * results.inflationIndexP50![index]
        const baseline = row.expenses - (row.scheduledExpenses ?? 0)
        const floor = Math.min(budget, income)
        expect(baseline).toBeGreaterThanOrEqual(floor * (1 - 1e-12))
        checked += 1
        if (floor > 0 && Math.abs(baseline - floor) <= floor * 1e-9) binding += 1
      })
    }
    expect(checked).toBe(25 * (params.endAge - params.retirementAge + 1))
    // Not vacuous: for the two guardrail rules the floor is what sets spending
    // in some of these years. Percent of portfolio is income + rate × portfolio
    // and therefore above it by construction.
    if (withdrawalStrategy !== 'percentOfPortfolio') expect(binding).toBeGreaterThan(0)
  })
})

describe('a plan with a pension is no longer told to live below it', () => {
  // Retired at 67 with a €4,000 indexed pension, a €4,500 budget and €300,000.
  // 4% of the portfolio is €1,000 a month: under the old reading that was the
  // *whole* budget the three rules steered towards.
  const flows: CashFlow[] = [
    {
      id: 'pension-statutory',
      kind: 'pension',
      name: 'Pension',
      amount: 4000,
      frequency: 'monthly',
      inflationLinked: true,
    },
    { id: 'living', kind: 'expense', name: 'Living', amount: 4500, frequency: 'monthly' },
  ]
  const retiree = (withdrawalStrategy: WithdrawalStrategy) =>
    plan({
      currentAge: 67,
      retirementAge: 67,
      legalRetirementAge: 67,
      endAge: 90,
      currentAssets: 300_000,
      annualSavings: 0,
      averageROI: 0.05,
      roiVolatility: 0,
      averageInflation: 0.02,
      inflationVolatility: 0,
      pensionTaxablePortion: 0,
      pensionTaxRate: 0,
      capitalGainsTax: 0,
      taxAllowanceAnnual: 0,
      simulationRuns: 1,
      dsWithdrawalRate: 0.04,
      withdrawalStrategy,
      cashFlows: flows,
    })

  it.each(DYNAMIC)('%s: real spending never drops below the pension', (strategy) => {
    const results = runMonteCarloSimulation(retiree(strategy))
    results.spendingPercentilesReal!.p50.forEach((monthly) => {
      expect(monthly).toBeGreaterThanOrEqual(4000 - 1e-6)
    })
    // …and the plan never runs out: the pension alone carries 89% of the budget.
    expect(results.successRate).toBe(100)
  })

  it('percent of portfolio pays the pension plus 4% of the portfolio, year by year', () => {
    const results = runMonteCarloSimulation(retiree('percentOfPortfolio'))
    results.cashFlowMeansReal!.forEach((row, index) => {
      const expected = 4000 + (0.04 * row.openingAssets) / 12
      expect(results.spendingPercentilesReal!.p50[index]).toBeCloseTo(expected, 6)
    })
  })

  it('Vanguard raises spending towards what is affordable instead of cutting it', () => {
    const results = runMonteCarloSimulation(retiree('vanguardDynamic'))
    const real = results.spendingPercentilesReal!.p50
    // Year one is the budget; 4,000 + 4% × 300,000 / 12 = 5,000 is affordable.
    expect(real[0]).toBeCloseTo(4500, 6)
    expect(real[1]).toBeGreaterThan(4500)
    expect(real[1]).toBeLessThanOrEqual(4500 * 1.05 + 1e-6)
  })
})

describe('(iii) the withdrawal rate on the corridor is the rate the rule used', () => {
  it('reads the configured rate at every age under percent of portfolio', () => {
    // Stochastic, with a pension, a windfall and care costs in the plan: none
    // of them is part of what the rule takes.
    const params = plan({
      withdrawalStrategy: 'percentOfPortfolio',
      dsWithdrawalRate: 0.043,
      simulationRuns: 80,
      cashFlows: [PENSION_FLOWS[0], ...NO_INCOME_FLOWS],
    })
    const results = runMonteCarloSimulation(params)
    const { points } = buildSpendingCorridor(params, results, true)

    expect(points.length).toBe(params.endAge - params.retirementAge + 1)
    points.forEach((point) => {
      expect(point.ruleWithdrawalRate).not.toBeNull()
      expect(point.ruleWithdrawalRate as number).toBeCloseTo(0.043, 12)
    })
  })

  it('measures against the portfolio including the year’s one-off deposit', () => {
    const params = plan({
      withdrawalStrategy: 'percentOfPortfolio',
      simulationRuns: 1,
      cashFlows: NO_INCOME_FLOWS,
    })
    const results = runMonteCarloSimulation(params)
    const row = results.cashFlowMeans![71 - params.currentAge]
    // Booked for 70, paid in at the start of 71 — before the rule looks.
    expect(row.oneOffIncomeGross).toBeGreaterThan(0)
    expect(row.rulePortfolio).toBeCloseTo(row.openingAssets + row.oneOffIncomeGross!, 6)
    expect(row.ruleWithdrawal).toBeCloseTo(0.05 * row.rulePortfolio!, 6)
  })

  it('reads the configured rate under Vanguard while neither guardrail binds', () => {
    // Return = rate and no inflation: the portfolio stands still, so what is
    // affordable (pension + 5%) is the same every year and equals the budget.
    const params = plan({
      currentAge: 67,
      retirementAge: 67,
      legalRetirementAge: 67,
      endAge: 85,
      currentAssets: 400_000,
      annualSavings: 0,
      averageROI: 0.05,
      roiVolatility: 0,
      averageInflation: 0,
      inflationVolatility: 0,
      pensionTaxablePortion: 0,
      pensionTaxRate: 0,
      capitalGainsTax: 0,
      taxAllowanceAnnual: 0,
      simulationRuns: 1,
      withdrawalStrategy: 'vanguardDynamic',
      cashFlows: [
        {
          id: 'pension-statutory',
          kind: 'pension',
          name: 'Pension',
          amount: 24_000,
          frequency: 'annual',
        },
        // 24,000 + 5% × 400,000
        { id: 'living', kind: 'expense', name: 'Living', amount: 44_000, frequency: 'annual' },
      ],
    })
    const results = runMonteCarloSimulation(params)
    const { points } = buildSpendingCorridor(params, results, true)
    points.forEach((point) => {
      expect(point.ruleWithdrawalRate as number).toBeCloseTo(0.05, 9)
      expect(point.spending_p50).toBeCloseTo(44_000 / 12, 6)
    })
    expect(results.assetPercentiles.p50[results.ages.length - 1]).toBeCloseTo(400_000, 4)
  })

  it('is the rule’s own draw over the rule’s own base, for any rule', () => {
    for (const withdrawalStrategy of STRATEGIES) {
      const params = plan({
        simulationRuns: 1,
        withdrawalStrategy,
        currentAssets: 630_000,
        cashFlows: PENSION_FLOWS,
      })
      const results = runMonteCarloSimulation(params)
      const { points } = buildSpendingCorridor(params, results, false)
      points.forEach((point) => {
        const row = results.cashFlowMeans![point.age - params.currentAge]
        const income = row.incomeGross - row.incomeTax
        const ruleDraw = Math.max(0, row.expenses - (row.scheduledExpenses ?? 0) - income)
        if (row.openingAssets > 0) {
          expect(point.ruleWithdrawalRate as number).toBeCloseTo(ruleDraw / row.openingAssets, 9)
        } else {
          expect(point.ruleWithdrawalRate).toBeNull()
        }
      })
    }
  })
})

describe('spending is what was paid, not what was asked for', () => {
  it('shows a depleted path living on its income', () => {
    // €100,000 against a €60,000 budget and a €24,000 pension, no growth:
    // the portfolio covers two full years and €28,000 of the third.
    const params = plan({
      currentAge: 67,
      retirementAge: 67,
      legalRetirementAge: 67,
      endAge: 72,
      currentAssets: 100_000,
      annualSavings: 0,
      averageROI: 0,
      roiVolatility: 0,
      averageInflation: 0,
      inflationVolatility: 0,
      pensionTaxablePortion: 0,
      pensionTaxRate: 0,
      capitalGainsTax: 0,
      simulationRuns: 1,
      withdrawalStrategy: 'fixedReal',
      cashFlows: [
        {
          id: 'pension-statutory',
          kind: 'pension',
          name: 'Pension',
          amount: 24_000,
          frequency: 'annual',
        },
        { id: 'living', kind: 'expense', name: 'Living', amount: 60_000, frequency: 'annual' },
      ],
    })
    const results = runMonteCarloSimulation(params)

    expect(results.spendingPercentiles.p50.map((monthly) => Math.round(monthly * 12))).toEqual([
      60_000, 60_000, 52_000, 24_000, 24_000, 24_000,
    ])
    // The ledger still says what was asked for, and how much of it was missing.
    expect(results.cashFlowMeans!.map((row) => row.expenses)).toEqual([
      60_000, 60_000, 60_000, 60_000, 60_000, 60_000,
    ])
    expect(results.cashFlowMeans!.map((row) => Math.round(row.shortfall))).toEqual([
      0, 0, 8_000, 36_000, 36_000, 36_000,
    ])
    // First unfunded year is 69: the money lasts until then, not until 68.
    expect(results.depletionByAge).toEqual([0, 0, 1, 1, 1, 1])
    expect(results.successRate).toBe(0)
  })

  it('books paid = requested − shortfall in every year of a stochastic plan', () => {
    const params = plan({
      simulationRuns: 1,
      currentAssets: 400_000,
      withdrawalStrategy: 'vanguardDynamic',
      cashFlows: PENSION_FLOWS,
    })
    for (let seed = 1; seed <= 10; seed++) {
      const results = runMonteCarloSimulation(params, { seed })
      results.cashFlowMeans!.forEach((row, index) => {
        expect(results.spendingPercentiles.p50[index] * 12).toBeCloseTo(
          row.expenses - row.shortfall,
          6
        )
      })
    }
  })

  it('drops the unlucky decile of the default-style plan to its pension', () => {
    // Fixed real spending, 630k: four in ten paths run dry. What they spend
    // afterwards is the €5,000 pension net of tax, in today's euros — not the
    // €5,242 budget the old series kept reporting for them.
    const params = plan({
      currentAssets: 630_000,
      withdrawalStrategy: 'fixedReal',
      simulationRuns: 400,
      inflationVolatility: 0,
      cashFlows: PENSION_FLOWS,
    })
    const results = runMonteCarloSimulation(params)
    const last = results.ages.length - 1
    const netPensionReal = (5000 * (1 - 0.83 * 0.18)) / Math.pow(1.025, last)

    expect(results.depletionByAge![last]).toBeGreaterThan(0.1)
    expect(results.spendingPercentilesReal!.p10[last]).toBeCloseTo(netPensionReal, 6)
    expect(results.spendingPercentilesReal!.p90[last]).toBeCloseTo(LIVING_MONTHLY, 6)
  })
})

describe('success means every year was paid for', () => {
  const pensioner = (budgetMonthly: number, overrides: Partial<SimulationParams> = {}) =>
    plan({
      currentAge: 67,
      retirementAge: 67,
      legalRetirementAge: 67,
      endAge: 95,
      currentAssets: 0,
      annualSavings: 0,
      pensionTaxablePortion: 0,
      pensionTaxRate: 0,
      simulationRuns: 50,
      withdrawalStrategy: 'fixedReal',
      cashFlows: [
        {
          id: 'pension-statutory',
          kind: 'pension',
          name: 'Pension',
          amount: 3000,
          frequency: 'monthly',
          inflationLinked: true,
        },
        {
          id: 'living',
          kind: 'expense',
          name: 'Living',
          amount: budgetMonthly,
          frequency: 'monthly',
        },
      ],
      ...overrides,
    })

  it('documents its tolerance', () => {
    expect(UNFUNDED_SPENDING_TOLERANCE).toBe(0.01)
  })

  it('a pension that pays the whole budget succeeds without a portfolio', () => {
    // Used to be 0%: the balance is exactly zero in every year.
    const exact = runMonteCarloSimulation(pensioner(3000))
    expect(exact.successRate).toBe(100)
    expect(exact.depletionSuccessRate).toBe(100)
    expect(exact.depletionByAge!.every((share) => share === 0)).toBe(true)
    // …and one euro less of budget is not a different plan.
    expect(runMonteCarloSimulation(pensioner(2999)).successRate).toBe(100)
  })

  it('tolerates a gap of up to 1% of the year’s spending, and no more', () => {
    // 3,020: €20 of 3,020 = 0.66% unpaid every year.
    expect(runMonteCarloSimulation(pensioner(3020)).successRate).toBe(100)
    // 3,100: 3.2% unpaid — the plan does not work.
    const short = runMonteCarloSimulation(pensioner(3100))
    expect(short.successRate).toBe(0)
    expect(short.depletionByAge![0]).toBe(1)
  })

  it('still requires the bequest goal on top', () => {
    const results = runMonteCarloSimulation(pensioner(3000, { legacyTargetReal: 10_000 }))
    expect(results.depletionSuccessRate).toBe(100)
    expect(results.successRate).toBe(0)
  })

  it('does not fail a path for ending the last year at exactly zero', () => {
    // 3 years × 40,000 from 120,000, no growth: the last euro leaves in the
    // last year and nothing went unpaid.
    const results = runMonteCarloSimulation(
      plan({
        currentAge: 67,
        retirementAge: 67,
        legalRetirementAge: 67,
        endAge: 69,
        currentAssets: 120_000,
        annualSavings: 0,
        averageROI: 0,
        roiVolatility: 0,
        averageInflation: 0,
        inflationVolatility: 0,
        capitalGainsTax: 0,
        simulationRuns: 1,
        withdrawalStrategy: 'fixedReal',
        cashFlows: [
          { id: 'living', kind: 'expense', name: 'Living', amount: 40_000, frequency: 'annual' },
        ],
      })
    )
    expect(results.assetPercentiles.p50).toEqual([80_000, 40_000, 0])
    expect(results.successRate).toBe(100)
  })

  it('keeps depletionByAge and the two success rates on one definition', () => {
    for (const withdrawalStrategy of STRATEGIES) {
      const results = runMonteCarloSimulation(
        plan({
          currentAssets: 500_000,
          simulationRuns: 200,
          withdrawalStrategy,
          cashFlows: [PENSION_FLOWS[0], ...NO_INCOME_FLOWS],
        })
      )
      const depletion = results.depletionByAge!
      for (let index = 1; index < depletion.length; index++) {
        expect(depletion[index]).toBeGreaterThanOrEqual(depletion[index - 1])
      }
      expect(depletion[depletion.length - 1]).toBeCloseTo(
        1 - results.depletionSuccessRate! / 100,
        12
      )
      expect(results.successRate).toBe(results.depletionSuccessRate)
    }
  })

  it('percent of portfolio can fail on scheduled expenses, with no floor set', () => {
    // The copy used to promise it "can never run dry". Care costs are paid on
    // top of the rule; a portfolio that has been handing out 8% a year does
    // not always have them.
    const results = runMonteCarloSimulation(
      plan({
        currentAssets: 300_000,
        annualSavings: 0,
        withdrawalStrategy: 'percentOfPortfolio',
        dsWithdrawalRate: 0.08,
        spendingFloorReal: 0,
        simulationRuns: 200,
        cashFlows: NO_INCOME_FLOWS,
      })
    )
    expect(results.depletionSuccessRate).toBeLessThan(100)
  })
})
