import type { SimulationParams } from '@/types'
import { defaultPdfConfig } from '@/lib/pdf-generator/utils/config'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import { firstPensionAge } from '@/lib/simulation/cashFlows'

export type BridgeAnalysis = {
  startAge: number
  endAge: number
  yearsInBridge: number
  /** The age the first pension starts — what the bridge has to reach. */
  pensionAge: number
  /** Inflation-adjusted cash need across the bridge years, unrounded. */
  cashNeedEUR: number
  cashBucketYears: number
  cashBucketSharePct: number
  portfolioSharePct: number
}

export function computeBridgeAnalysis(params: SimulationParams): BridgeAnalysis {
  const totalYearlyExpenses = calculateCombinedExpenses(params.customExpenses).combinedAnnual
  const startAge = Math.max(params.retirementAge, params.currentAge)
  // The bridge ends when the first pension pays, which may be years before
  // the statutory age (a Versorgungswerk at 63, say).
  const pensionAge = firstPensionAge(params.cashFlows ?? [], params.legalRetirementAge)
  const endAge = Math.max(pensionAge - 1, startAge - 1)
  const yearsInBridge = Math.max(0, endAge - startAge + 1)
  const inflation = params.averageInflation

  let cashNeedEUR = 0
  for (let i = 0; i < yearsInBridge; i++) {
    cashNeedEUR += Math.max(0, totalYearlyExpenses * Math.pow(1 + inflation, i))
  }

  const cashBucketYears = defaultPdfConfig.bridge_cash_bucket_years as number
  let cashBucketSharePct = 0
  if (yearsInBridge > 0 && cashNeedEUR > 0) {
    const years = Math.min(cashBucketYears, yearsInBridge)
    let bucketSum = 0
    for (let i = 0; i < years; i++) {
      bucketSum += totalYearlyExpenses * Math.pow(1 + inflation, i)
    }
    cashBucketSharePct = Math.round((bucketSum / cashNeedEUR) * 100)
  }
  const portfolioSharePct =
    yearsInBridge > 0 && cashNeedEUR > 0 ? Math.max(0, 100 - cashBucketSharePct) : 0

  return {
    startAge,
    endAge,
    yearsInBridge,
    pensionAge,
    cashNeedEUR,
    cashBucketYears,
    cashBucketSharePct,
    portfolioSharePct,
  }
}
