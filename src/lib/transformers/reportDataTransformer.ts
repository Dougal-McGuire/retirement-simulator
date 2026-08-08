import type { SimulationParams, SimulationResults } from '@/types'
import type { ReportData } from '@/lib/pdf-generator/schema/reportData'
import { isLifetimeExpenseFlow } from '@/lib/simulation/cashFlows'
import { computeBridgeAnalysis } from '@/lib/insights/bridge'
import { computePlanHealthScore } from '@/lib/insights/planHealth'
import {
  estimateRecommendationUplift,
  generateRecommendations,
} from '@/lib/insights/recommendations'

export function transformToReportData(
  params: SimulationParams,
  results: SimulationResults,
  /** Name of the plan the figures come from; printed on the report cover. */
  planName?: string
): ReportData {
  // Generate milestones from simulation results
  const milestones = results.ages.map((age, index) => ({
    age,
    p10: results.assetPercentiles.p10[index] || 0,
    p20: results.assetPercentiles.p20[index] || 0,
    p50: results.assetPercentiles.p50[index] || 0,
    p80: results.assetPercentiles.p80[index] || 0,
    p90: results.assetPercentiles.p90[index] || 0,
  }))

  // Generate recommendations based on success rate
  const recommendations = generateRecommendations(params, results)

  // Derived figures
  const monthlyExpenses = params.customExpenses.filter((e) => e.interval === 'monthly')
  const annualExpenses = params.customExpenses.filter((e) => e.interval === 'annual')

  const bridge = computeBridgeAnalysis(params)
  const health = computePlanHealthScore(params, results)

  const topRecs = recommendations
  const topActions = topRecs.slice(0, 2).map((r) => r.title)
  const uplifts = topRecs
    .slice(0, 2)
    .map((rec) => estimateRecommendationUplift(rec, params, results))
    .filter(
      (uplift): uplift is { title: string; upliftMin: number; upliftMax: number } => uplift !== null
    )

  // Transform the data to match PDF generator schema
  return {
    person: {
      currentAge: params.currentAge,
      retireAge: params.retirementAge,
      pensionAge: params.legalRetirementAge,
      horizonAge: params.endAge,
    },
    finances: {
      currentAssetsEUR: params.currentAssets,
      annualSavingsEUR: params.annualSavings,
      expectedMonthlyPensionEUR: params.monthlyPension,
    },
    spending: {
      monthly: {
        health:
          monthlyExpenses.find(
            (e) => e.id.toLowerCase().includes('health') || e.name.toLowerCase().includes('health')
          )?.amount ?? 0,
        food:
          monthlyExpenses.find(
            (e) =>
              e.id.toLowerCase().includes('food') ||
              e.name.toLowerCase().includes('food') ||
              e.name.toLowerCase().includes('grocer')
          )?.amount ?? 0,
        entertainment:
          monthlyExpenses.find(
            (e) =>
              e.id.toLowerCase().includes('entertain') || e.name.toLowerCase().includes('entertain')
          )?.amount ?? 0,
        shopping:
          monthlyExpenses.find(
            (e) => e.id.toLowerCase().includes('shop') || e.name.toLowerCase().includes('shop')
          )?.amount ?? 0,
        utilities:
          monthlyExpenses.find(
            (e) => e.id.toLowerCase().includes('utilit') || e.name.toLowerCase().includes('utilit')
          )?.amount ?? 0,
      },
      annual: {
        vacations:
          annualExpenses.find(
            (e) =>
              e.id.toLowerCase().includes('vacation') || e.name.toLowerCase().includes('vacation')
          )?.amount ?? 0,
        homeRepairs:
          annualExpenses.find(
            (e) => e.id.toLowerCase().includes('repair') || e.name.toLowerCase().includes('repair')
          )?.amount ?? 0,
        car:
          annualExpenses.find(
            (e) =>
              e.id.toLowerCase().includes('car') ||
              e.name.toLowerCase().includes('car') ||
              e.name.toLowerCase().includes('vehicle')
          )?.amount ?? 0,
      },
      custom: params.customExpenses.map((expense) => ({
        id: expense.id,
        name: expense.name,
        amount: expense.amount,
        interval: expense.interval,
      })),
      // Only the flows `custom` above cannot represent, so the report never
      // counts the same euro twice: windows, one-off payments and income.
      cashFlows: (params.cashFlows ?? [])
        .filter((flow) => !isLifetimeExpenseFlow(flow))
        .map((flow) => ({
          id: flow.id,
          kind: flow.kind,
          name: flow.name,
          amount: flow.amount,
          frequency: flow.frequency,
          ...(flow.startAge !== undefined ? { startAge: flow.startAge } : {}),
          ...(flow.endAge !== undefined ? { endAge: flow.endAge } : {}),
          ...(flow.inflationLinked !== undefined ? { inflationLinked: flow.inflationLinked } : {}),
          ...(flow.growthRate !== undefined ? { growthRate: flow.growthRate } : {}),
        })),
    },
    assumptions: {
      roiMean: params.averageROI,
      roiStdev: params.roiVolatility,
      inflationMean: params.averageInflation,
      inflationStdev: params.inflationVolatility,
      withdrawalStrategy: params.withdrawalStrategy,
      marketModel: params.marketModel,
      glidePathEnabled: params.glidePathEnabled,
      equityAllocationStart: params.equityAllocationStart,
      equityAllocationEnd: params.equityAllocationEnd,
      bondReturn: params.bondReturn,
      bondVolatility: params.bondVolatility,
      dsWithdrawalRate: params.dsWithdrawalRate,
      dsCeilingRate: params.dsCeilingRate,
      dsFloorRate: params.dsFloorRate,
      capGainsTaxRatePct: params.capitalGainsTax,
      taxAllowanceAnnual: params.taxAllowanceAnnual,
      householdType: params.householdType,
      equityFundExemption: params.equityFundExemption,
      pensionTaxablePortion: params.pensionTaxablePortion,
      pensionTaxRate: params.pensionTaxRate,
      legacyTargetReal: params.legacyTargetReal,
      mcRuns: params.simulationRuns,
    },
    projections: {
      milestones,
      successRatePct: results.successRate,
    },
    summary: {
      planHealthScore: health.score,
      planHealthLabel: health.label,
      planHealthWhy: health.why,
      planHealthWhyBits: health.whyBits,
      planHealthComponents: health.components,
      successProbabilityPct: results.successRate,
      bridge: {
        startAge: bridge.startAge,
        endAge: bridge.endAge,
        cashNeedEUR: Math.round(bridge.cashNeedEUR),
        cashBucketYears: bridge.cashBucketYears,
        cashBucketSharePct: bridge.cashBucketSharePct,
        portfolioSharePct: bridge.portfolioSharePct,
      },
      topActions,
      topActionsDetailed: uplifts,
    },
    recommendations,
    metadata: {
      reportId: `RPT-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      version: '1.0.0',
      ...(planName?.trim() ? { planName: planName.trim().slice(0, 80) } : {}),
    },
  }
}
