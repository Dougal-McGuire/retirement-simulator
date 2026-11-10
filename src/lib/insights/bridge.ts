import type { SimulationParams } from '@/types'
import { ledgerRows, mainPension, type LedgerSource, type LedgerUnit } from './ledger'

/**
 * Which euro the bridge need is stated in — the same two units as the
 * dashboard's Nominal / Heutige € switch.
 */
export type BridgeUnit = LedgerUnit

/** Years of the bridge the "hold it in cash" advice refers to. */
export const BRIDGE_CASH_BUCKET_YEARS = 2

export type BridgeAnalysis = {
  /** First bridge age: the retirement age, or today for someone already retired. */
  startAge: number
  /** Last bridge age: the year before the main pension starts. */
  endAge: number
  yearsInBridge: number
  /** The age the main pension starts — what the bridge has to reach. */
  pensionAge: number
  /** Which pension that is; `'none'` when no pension counts (then there is no bridge). */
  mainPension: 'statutory' | 'other' | 'none'
  /** The unit `cashNeedEUR` is stated in. */
  unit: BridgeUnit
  /**
   * What the portfolio pays out across the bridge years, unrounded, in `unit`:
   * the sum of the ledger's portfolio withdrawals for those ages. That is the
   * engine's own figure — after any income that does flow in those years (a
   * small company pension, part-time work), with scheduled expenses and the
   * tax on realised gains included.
   *
   * `null` when it cannot be read: no results, or results without a ledger.
   * There is deliberately no formula to fall back on.
   */
  cashNeedEUR: number | null
  cashBucketYears: number
  /** Share of the need that falls into the first `cashBucketYears` bridge years. */
  cashBucketSharePct: number
  portfolioSharePct: number
}

export type BridgeAnalysisOptions = {
  unit: BridgeUnit
  /** The run the need is read from. Without it only the ages are known. */
  results?: LedgerSource
}

/**
 * The bridge: the retirement years before the **main** pension pays (see
 * `mainPension`). One definition for the dashboard's recommendations, the plan
 * score's reasons and the report — the ages and the amount always describe
 * the same years.
 */
export function computeBridgeAnalysis(
  params: SimulationParams,
  options: BridgeAnalysisOptions
): BridgeAnalysis {
  const { unit, results } = options
  const main = mainPension(params)
  const startAge = Math.max(params.retirementAge, params.currentAge)
  const pensionAge = main?.startAge ?? params.legalRetirementAge
  // Without a pension there is nothing to bridge to: the whole retirement runs
  // on the portfolio, and calling its first years a "bridge" would promise an
  // income that never starts.
  const lastAge = main ? Math.min(pensionAge - 1, params.endAge) : startAge - 1
  const endAge = Math.max(lastAge, startAge - 1)
  const yearsInBridge = Math.max(0, endAge - startAge + 1)

  const rows = results ? ledgerRows(results, unit) : null
  let yearNeeds: number[] | null = null
  if (yearsInBridge === 0) {
    yearNeeds = []
  } else if (results && rows) {
    const needs: number[] = []
    for (let age = startAge; age <= endAge; age++) {
      const index = results.ages.indexOf(age)
      if (index === -1) break
      needs.push(Math.max(0, rows[index].portfolioWithdrawal))
    }
    // Every bridge year or none: a partial sum would understate the need.
    yearNeeds = needs.length === yearsInBridge ? needs : null
  }

  const cashNeedEUR = yearNeeds ? yearNeeds.reduce((sum, need) => sum + need, 0) : null

  let cashBucketSharePct = 0
  if (yearNeeds && cashNeedEUR !== null && cashNeedEUR > 0) {
    const bucketSum = yearNeeds
      .slice(0, Math.min(BRIDGE_CASH_BUCKET_YEARS, yearsInBridge))
      .reduce((sum, need) => sum + need, 0)
    cashBucketSharePct = Math.round((bucketSum / cashNeedEUR) * 100)
  }
  const portfolioSharePct =
    cashNeedEUR !== null && cashNeedEUR > 0 ? Math.max(0, 100 - cashBucketSharePct) : 0

  return {
    startAge,
    endAge,
    yearsInBridge,
    pensionAge,
    mainPension: main ? (main.statutory ? 'statutory' : 'other') : 'none',
    unit,
    cashNeedEUR,
    cashBucketYears: BRIDGE_CASH_BUCKET_YEARS,
    cashBucketSharePct,
    portfolioSharePct,
  }
}
