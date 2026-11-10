import type { AnnualCashFlow, CashFlow, SimulationParams, SimulationResults } from '@/types'
import {
  STATUTORY_PENSION_FLOW_ID,
  isCashFlowEnabled,
  isPensionFlow,
  pensionStartAge,
} from '@/lib/simulation/cashFlows'
import { closingPriceLevels, usablePriceIndex } from '@/lib/insights/priceLevels'

/**
 * The one reader of the engine's ledger for every insight and for the report.
 *
 * The engine books each simulated year — opening assets, income, taxes,
 * spending, what the portfolio paid out — and publishes the per-age means
 * across paths (`cashFlowMeans`, and `cashFlowMeansReal`, deflated per path).
 * Any statement of the form "the pension covers …", "… has to come from the
 * portfolio" or "the first year withdraws … %" is a statement about those
 * bookings, so it is read from them here instead of being re-derived from the
 * inputs. Re-deriving is how one plan came to have three withdrawal rates
 * (3.7 %, 6.4 %, 7.0 %) and a pension that "covered 95 %" of a budget the
 * engine still drew 27,000 € a year from the portfolio for: the formulas mixed
 * gross with net and today's euros with future ones.
 *
 * Two things about the rows that every reader here relies on:
 * - `expenses` is the spending the plan **asked for** in that year (budget or
 *   withdrawal rule, plus scheduled items). What could not be paid is booked
 *   next to it as `shortfall`; paid spending is the difference.
 * - `portfolioWithdrawal` is what actually left the portfolio, tax on realised
 *   gains included.
 *
 * Pure. Reads only public result fields.
 */

/** The same two units as the dashboard's Nominal / Heutige € switch. */
export type LedgerUnit = 'nominal' | 'real'

export type LedgerSource = Pick<
  SimulationResults,
  'ages' | 'cashFlowMeans' | 'cashFlowMeansReal' | 'inflationIndexP50'
> & {
  /** Only read for the inflation assumption that extrapolates the last closing level. */
  params?: Pick<SimulationParams, 'averageInflation'>
}

const aligned = (
  rows: readonly AnnualCashFlow[] | undefined,
  length: number
): rows is AnnualCashFlow[] => Array.isArray(rows) && length > 0 && rows.length === length

/**
 * One nominal row in today's euros, the way the engine prices a year: its
 * flows and its opening balance at the level the year opens with, its closing
 * balance at the level it closes with. The investment return is then the
 * *real* return — whatever keeps the row's own balance identity (closing =
 * opening + return + net flows) true in real terms as well.
 */
const deflateRow = (row: AnnualCashFlow, opening: number, closing: number): AnnualCashFlow => {
  const out: Record<string, number> = {}
  for (const [key, value] of Object.entries(row)) {
    if (typeof value === 'number') out[key] = value / opening
  }
  const netFlows = row.closingAssets - row.openingAssets - row.investmentReturn
  out.closingAssets = row.closingAssets / closing
  out.investmentReturn = out.closingAssets - out.openingAssets - netFlows / opening
  return out as unknown as AnnualCashFlow
}

/**
 * The ledger in `unit`, one row per entry of `results.ages`, or `null` when
 * the results carry none (stored before the ledger existed).
 *
 * Real rows are the engine's per-path deflated means. Results that only have
 * the nominal ledger and the median price index are deflated by that index —
 * the same approximation, and the same order of preference, as
 * `assetPercentilesIn` uses for the asset bands.
 */
export function ledgerRows(
  results: LedgerSource,
  unit: LedgerUnit
): readonly AnnualCashFlow[] | null {
  const length = results.ages.length
  const nominal = aligned(results.cashFlowMeans, length) ? results.cashFlowMeans : null
  if (unit === 'nominal') return nominal
  if (aligned(results.cashFlowMeansReal, length)) return results.cashFlowMeansReal
  const index = results.inflationIndexP50
  if (nominal && usablePriceIndex(index, length)) {
    const closing = closingPriceLevels(index, results.params?.averageInflation)
    return nominal.map((row, i) => deflateRow(row, index[i], closing[i]))
  }
  return null
}

/**
 * Index of the first simulated year in retirement: the retirement age, or the
 * plan's first year for someone already retired. −1 when retirement lies
 * beyond the horizon.
 */
export function retirementStartIndex(
  params: Pick<SimulationParams, 'retirementAge'>,
  results: Pick<SimulationResults, 'ages'>
): number {
  return results.ages.findIndex((age) => age >= params.retirementAge)
}

export interface FirstRetirementYear {
  age: number
  /** Portfolio at the start of that year. */
  openingAssets: number
  /** What the portfolio paid out that year, tax on realised gains included. */
  portfolioWithdrawal: number
  /** Spending the plan asked for in that year. */
  expenses: number
}

/** The ledger's first retirement year in `unit`; `null` without ledger or retirement. */
export function firstRetirementYear(
  params: Pick<SimulationParams, 'retirementAge'>,
  results: LedgerSource,
  unit: LedgerUnit
): FirstRetirementYear | null {
  const rows = ledgerRows(results, unit)
  const index = retirementStartIndex(params, results)
  if (!rows || index === -1) return null
  const row = rows[index]
  return {
    age: results.ages[index],
    openingAssets: row.openingAssets,
    portfolioWithdrawal: Math.max(0, row.portfolioWithdrawal),
    expenses: row.expenses,
  }
}

/**
 * **The** first-year withdrawal rate — every surface that prints one calls
 * this:
 *
 *     what the portfolio paid out in the first retirement year
 *     ─────────────────────────────────────────────────────────
 *           the portfolio at the start of that year
 *
 * Both from the ledger's booked (nominal) means, so the numerator is what the
 * engine actually withdrew — after pension and other income, including the
 * tax on realised gains — and both sides are euros of the same year. A ratio
 * has no unit, so the Nominal / Heutige € switch does not move it.
 *
 * `null` when it cannot be stated: no ledger, no retirement inside the
 * horizon, or nothing in the portfolio at that point.
 */
export function firstYearWithdrawalRate(
  params: Pick<SimulationParams, 'retirementAge'>,
  results: LedgerSource
): number | null {
  const year =
    firstRetirementYear(params, results, 'nominal') ?? firstRetirementYear(params, results, 'real')
  if (!year || !(year.openingAssets > 0)) return null
  return year.portfolioWithdrawal / year.openingAssets
}

export interface RetirementSpending {
  /** Sum of the spending the plan asked for in every retirement year. */
  total: number
  /**
   * Part of `total` that came from scheduled flows (age windows, one-offs)
   * rather than the baseline budget; `null` when the ledger does not itemise it.
   */
  scheduled: number | null
  /**
   * Part of `total` that could not be paid (mean across paths) — what was
   * actually spent is `total − shortfall`.
   */
  shortfall: number
  firstAge: number
  lastAge: number
  /** Number of years summed. */
  years: number
}

/**
 * Everything the plan sets out to spend in retirement, in `unit`: the
 * ledger's spending summed over the retirement years only, with the part that
 * could not be paid alongside. The working years are not part of
 * it — the old "budget × all simulated years" counted five years of salary-
 * funded living costs into a default plan's "total need".
 */
export function retirementSpending(
  params: Pick<SimulationParams, 'retirementAge'>,
  results: LedgerSource,
  unit: LedgerUnit
): RetirementSpending | null {
  const rows = ledgerRows(results, unit)
  const start = retirementStartIndex(params, results)
  if (!rows || start === -1) return null
  let total = 0
  let shortfall = 0
  let scheduled: number | null = 0
  for (let i = start; i < rows.length; i++) {
    total += rows[i].expenses
    shortfall += Math.max(0, rows[i].shortfall)
    const part = rows[i].scheduledExpenses
    scheduled = scheduled === null || typeof part !== 'number' ? null : scheduled + part
  }
  return {
    total,
    scheduled,
    shortfall,
    firstAge: results.ages[start],
    lastAge: results.ages[rows.length - 1],
    years: rows.length - start,
  }
}

/** Which pension the plan turns on. */
export interface MainPension {
  id: string
  /** The statutory pension (`pension-statutory`) rather than another scheme. */
  statutory: boolean
  /** First age it pays. */
  startAge: number
  /** Gross per year, in the euros it is quoted in. */
  annualAmount: number
}

const annualAmount = (flow: CashFlow) =>
  flow.frequency === 'annual' ? flow.amount : flow.amount * 12

/**
 * The plan's main pension: the statutory one when the plan counts it,
 * otherwise the largest pension by annual amount (the earlier one on a tie).
 * `null` when no pension counts — none entered, or every one switched off.
 *
 * "The bridge" and "what the pension covers" are both about this pension. A
 * 200 € company pension that starts at 60 is income in the bridge years, not
 * the end of the bridge.
 */
export function mainPension(
  params: Pick<SimulationParams, 'cashFlows' | 'legalRetirementAge'>
): MainPension | null {
  const pensions = (params.cashFlows ?? []).filter(
    (flow) => isPensionFlow(flow) && isCashFlowEnabled(flow) && flow.amount > 0
  )
  if (pensions.length === 0) return null
  const startOf = (flow: CashFlow) => pensionStartAge(flow, params.legalRetirementAge)
  const statutory = pensions.find((flow) => flow.id === STATUTORY_PENSION_FLOW_ID)
  const main =
    statutory ??
    pensions.reduce((best, flow) => {
      const difference = annualAmount(flow) - annualAmount(best)
      if (difference > 0) return flow
      if (difference === 0 && startOf(flow) < startOf(best)) return flow
      return best
    })
  return {
    id: main.id,
    statutory: main.id === STATUTORY_PENSION_FLOW_ID,
    startAge: startOf(main),
    annualAmount: annualAmount(main),
  }
}

export interface PensionYear {
  /** The age the figures are for. */
  age: number
  /** True when `age` is the main pension's first year (not a later one). */
  firstPensionYear: boolean
  /** Spending the plan asked for in that year. */
  expenses: number
  /** All pensions paying that year, before income tax. */
  pensionGross: number
  /** The same after the income tax booked on them. */
  pensionNet: number
  /** What the portfolio still paid out, tax on realised gains included. */
  portfolioWithdrawal: number
  /** `pensionNet / expenses`; may exceed 1. `null` when nothing was spent. */
  coverage: number | null
}

/**
 * What the pension really covers, read from the ledger for the first year in
 * which the main pension pays *and* the plan is in retirement.
 *
 * Net pension over that year's spending, both in `unit` — not the gross
 * nominal pension over today's budget, which made a 60,000 € pension "cover
 * 95 %" of 62,900 € while the engine withdrew 27,000 € from the portfolio.
 * `null` without a pension, a ledger with pension detail, or such a year.
 */
export function pensionYear(
  params: Pick<
    SimulationParams,
    'cashFlows' | 'legalRetirementAge' | 'retirementAge' | 'currentAge'
  >,
  results: LedgerSource,
  unit: LedgerUnit
): PensionYear | null {
  const main = mainPension(params)
  const rows = ledgerRows(results, unit)
  if (!main || !rows) return null
  const age = Math.max(main.startAge, params.retirementAge, results.ages[0] ?? params.currentAge)
  const index = results.ages.indexOf(age)
  if (index === -1) return null
  const row = rows[index]
  if (typeof row.pensionGross !== 'number' || typeof row.pensionTax !== 'number') return null
  const pensionNet = Math.max(0, row.pensionGross - row.pensionTax)
  return {
    age,
    firstPensionYear: age === main.startAge,
    expenses: row.expenses,
    pensionGross: row.pensionGross,
    pensionNet,
    portfolioWithdrawal: Math.max(0, row.portfolioWithdrawal),
    coverage: row.expenses > 0 ? pensionNet / row.expenses : null,
  }
}

export interface PhaseFlow {
  firstAge: number
  lastAge: number
  years: number
  /** Mean per year paid into (+) or out of (−) the portfolio, before returns. */
  netPortfolioFlow: number
  /** Mean per year of all income before tax (pensions, other income, one-offs). */
  incomeGross: number
  /** Mean per year of the spending the plan asked for. */
  expenses: number
}

/**
 * Average yearly bookings between two ages (inclusive), in `unit` — what the
 * report's "phases of the plan" table prints. `null` when the span is empty,
 * lies outside the simulated ages, or there is no ledger.
 */
export function phaseFlow(
  results: LedgerSource,
  unit: LedgerUnit,
  firstAge: number,
  lastAge: number
): PhaseFlow | null {
  const rows = ledgerRows(results, unit)
  if (!rows) return null
  const picked = rows.filter((_, i) => results.ages[i] >= firstAge && results.ages[i] <= lastAge)
  if (picked.length === 0) return null
  const mean = (read: (row: AnnualCashFlow) => number) =>
    picked.reduce((sum, row) => sum + read(row), 0) / picked.length
  const ages = results.ages.filter((age) => age >= firstAge && age <= lastAge)
  return {
    firstAge: ages[0],
    lastAge: ages[ages.length - 1],
    years: picked.length,
    netPortfolioFlow: mean((row) => row.portfolioContribution - row.portfolioWithdrawal),
    incomeGross: mean((row) => row.incomeGross),
    expenses: mean((row) => row.expenses),
  }
}
