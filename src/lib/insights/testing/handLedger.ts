import {
  DEFAULT_PARAMS,
  type AnnualCashFlow,
  type CashFlow,
  type SimulationParams,
  type SimulationResults,
} from '@/types'

/**
 * A plan and a ledger small enough to check every expectation by hand.
 *
 * Test support only (not under `__tests__`, where Jest would run it as a
 * suite). The ledger is written out, not simulated: the insight and report
 * code under test reads the engine's *public result fields*, so its tests
 * must not move when the engine's internals do.
 *
 * The plan: age 58 today, retire at 60, statutory pension (2,000 €/month,
 * i.e. 24,000 € a year) from 63, horizon 65. Budget 40,000 € a year.
 *
 *   age   opening   spending   pension gross/tax   cap.gains tax   withdrawal
 *   58    500,000        –            –                  –              –      (+20,000 saved)
 *   59    550,000        –            –                  –              –      (+20,000 saved)
 *   60    600,000    40,000           –               2,000         42,000     ← first retirement year
 *   61    588,000    41,000           –               2,100         43,100
 *   62    574,900    42,000           –               2,200         44,200
 *   63    560,700    43,000     24,000 / 3,000        1,000         23,000     ← pension starts
 *   64    567,700    44,000     24,000 / 3,000        1,100         24,100
 *   65    573,600    45,000     24,000 / 3,000        1,200         25,200
 *
 * Hand-derived from it:
 *  - first-year withdrawal rate  42,000 / 600,000                 = 7.0 %
 *  - bridge (60–62, nominal)     42,000 + 43,100 + 44,200         = 129,300
 *  - first two bridge years      85,100 / 129,300                 = 65.8 % → 66 %
 *  - retirement spending         40+41+42+43+44+45 thousand       = 255,000
 *  - pension coverage at 63      (24,000 − 3,000) / 43,000        = 48.8 %
 *  - residual withdrawal at 63                                    = 23,000
 *
 * `HAND_PRICE_LEVELS` is the price level each year *opens* with — what its
 * flows and its opening balance are priced at. It is chosen so that every
 * withdrawal deflates to a round number: 40,000 in each bridge year (real
 * bridge need 120,000) and 20,000 in each pension year.
 *
 * A year-end balance belongs to the level the year *closes* with
 * (`HAND_CLOSING_LEVELS`): the next year's opening level, and for the last
 * year one more year of the plan's 2.5 % inflation, 1.26 × 1.025 = 1.2915.
 * So the 578,400 € at the end of age 65 are 578,400 / 1.2915 = 447,851 € in
 * today's euros, and the 550,000 € at the end of age 58 are
 * 550,000 / 1.025 = 536,585 €.
 */

export const HAND_AGES = [58, 59, 60, 61, 62, 63, 64, 65] as const

export const HAND_PRICE_LEVELS = [1, 1.025, 1.05, 1.0775, 1.105, 1.15, 1.205, 1.26] as const

export const HAND_CLOSING_LEVELS = [
  1.025,
  1.05,
  1.0775,
  1.105,
  1.15,
  1.205,
  1.26,
  1.26 * 1.025,
] as const

const statutoryPension: CashFlow = {
  id: 'pension-statutory',
  kind: 'pension',
  name: 'Statutory pension',
  nameKey: 'statutoryPension',
  amount: 2000,
  frequency: 'monthly',
  inflationLinked: false,
}

const livingCosts: CashFlow = {
  id: 'living',
  kind: 'expense',
  name: 'Living costs',
  amount: 40000,
  frequency: 'annual',
}

export const HAND_PARAMS: SimulationParams = {
  ...DEFAULT_PARAMS,
  currentAge: 58,
  retirementAge: 60,
  legalRetirementAge: 63,
  endAge: 65,
  currentAssets: 500_000,
  annualSavings: 20_000,
  monthlyPension: 2000,
  withdrawalStrategy: 'fixedReal',
  customExpenses: [{ id: 'living', name: 'Living costs', amount: 40000, interval: 'annual' }],
  cashFlows: [statutoryPension, livingCosts],
  simulationRuns: 500,
}

const row = (values: Partial<AnnualCashFlow>): AnnualCashFlow => ({
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
  pensionGross: 0,
  pensionTax: 0,
  oneOffIncomeGross: 0,
  oneOffIncomeTax: 0,
  scheduledExpenses: 0,
  ...values,
})

const pensionYear = (values: Partial<AnnualCashFlow>) =>
  row({ incomeGross: 24_000, incomeTax: 3_000, pensionGross: 24_000, pensionTax: 3_000, ...values })

/** The nominal ledger of the table above. */
export const HAND_LEDGER: AnnualCashFlow[] = [
  row({
    openingAssets: 500_000,
    investmentReturn: 30_000,
    savings: 20_000,
    portfolioContribution: 20_000,
    closingAssets: 550_000,
  }),
  row({
    openingAssets: 550_000,
    investmentReturn: 30_000,
    savings: 20_000,
    portfolioContribution: 20_000,
    closingAssets: 600_000,
  }),
  row({
    openingAssets: 600_000,
    investmentReturn: 30_000,
    capitalGainsTax: 2_000,
    expenses: 40_000,
    portfolioWithdrawal: 42_000,
    closingAssets: 588_000,
  }),
  row({
    openingAssets: 588_000,
    investmentReturn: 30_000,
    capitalGainsTax: 2_100,
    expenses: 41_000,
    portfolioWithdrawal: 43_100,
    closingAssets: 574_900,
  }),
  row({
    openingAssets: 574_900,
    investmentReturn: 30_000,
    capitalGainsTax: 2_200,
    expenses: 42_000,
    portfolioWithdrawal: 44_200,
    closingAssets: 560_700,
  }),
  pensionYear({
    openingAssets: 560_700,
    investmentReturn: 30_000,
    capitalGainsTax: 1_000,
    expenses: 43_000,
    portfolioWithdrawal: 23_000,
    closingAssets: 567_700,
  }),
  pensionYear({
    openingAssets: 567_700,
    investmentReturn: 30_000,
    capitalGainsTax: 1_100,
    expenses: 44_000,
    portfolioWithdrawal: 24_100,
    closingAssets: 573_600,
  }),
  pensionYear({
    openingAssets: 573_600,
    investmentReturn: 30_000,
    capitalGainsTax: 1_200,
    expenses: 45_000,
    portfolioWithdrawal: 25_200,
    closingAssets: 578_400,
  }),
]

/**
 * The ledger in today's euros, as the engine publishes it: flows and the
 * opening balance at the year's opening level, the closing balance at its
 * closing level, and the investment return as the real return that keeps
 * closing = opening + return + net flows.
 */
const deflated = (ledger: readonly AnnualCashFlow[]): AnnualCashFlow[] =>
  ledger.map((entry, index) => {
    const opening = HAND_PRICE_LEVELS[index]
    const out: Record<string, number> = {}
    for (const [key, value] of Object.entries(entry)) {
      if (typeof value === 'number') out[key] = value / opening
    }
    const netFlows = entry.closingAssets - entry.openingAssets - entry.investmentReturn
    out.closingAssets = entry.closingAssets / HAND_CLOSING_LEVELS[index]
    out.investmentReturn = out.closingAssets - out.openingAssets - netFlows / opening
    return out as unknown as AnnualCashFlow
  })

/** End-of-year asset bands around the ledger's closing assets (nominal). */
const bands = (ledger: readonly AnnualCashFlow[]) => {
  const closing = ledger.map((entry) => entry.closingAssets)
  return {
    p10: closing.map((value) => value * 0.6),
    p20: closing.map((value) => value * 0.8),
    p50: closing,
    p80: closing.map((value) => value * 1.2),
    p90: closing.map((value) => value * 1.4),
  }
}

export interface HandResultsOptions {
  params?: SimulationParams
  successRate?: number
  /** `'perPath'`: nominal + real ledger. `'index'`: nominal + price index only. `'none'`: no ledger. */
  ledger?: 'perPath' | 'index' | 'nominalOnly' | 'none'
}

/** Results carrying the hand ledger (or deliberately less of it). */
export function handResults(options: HandResultsOptions = {}): SimulationResults {
  const params = options.params ?? HAND_PARAMS
  const mode = options.ledger ?? 'perPath'
  const real = deflated(HAND_LEDGER)
  const spending = HAND_AGES.map((_, index) => HAND_LEDGER[index].expenses)
  const flat = { p10: spending, p20: spending, p50: spending, p80: spending, p90: spending }
  return {
    ages: [...HAND_AGES],
    assetPercentiles: bands(HAND_LEDGER),
    spendingPercentiles: flat,
    successRate: options.successRate ?? 92,
    depletionSuccessRate: options.successRate ?? 92,
    depletionByAge: HAND_AGES.map(() => 0),
    ...(mode === 'perPath'
      ? {
          assetPercentilesReal: bands(real),
          spendingPercentilesReal: flat,
          cashFlowMeansReal: real,
        }
      : {}),
    ...(mode === 'perPath' || mode === 'index'
      ? { inflationIndexP50: [...HAND_PRICE_LEVELS] }
      : {}),
    ...(mode === 'none' ? {} : { cashFlowMeans: HAND_LEDGER }),
    params,
  }
}
