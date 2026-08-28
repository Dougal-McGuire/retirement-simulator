import type { SimulationParams, SimulationResults } from '@/types'
import { pensionMonthlyAtAge } from '@/lib/simulation/cashFlows'
import type { ReportData } from '@/lib/pdf-generator/schema/reportData'
import { isLifetimeExpenseFlow } from '@/lib/simulation/cashFlows'
import { buildSimulationContext } from '@/lib/simulation/context'
import { computeBridgeAnalysis } from '@/lib/insights/bridge'
import { computePlanHealthScore } from '@/lib/insights/planHealth'
import {
  estimateRecommendationUplift,
  generateRecommendations,
  type RecommendationLocale,
} from '@/lib/insights/recommendations'

export function transformToReportData(
  params: SimulationParams,
  results: SimulationResults,
  /** Name of the plan the figures come from; printed on the report cover. */
  planName?: string,
  /**
   * Language of the generated recommendations. Their bodies interpolate this
   * plan's own figures, so they are written here rather than translated
   * downstream by sentence lookup.
   */
  locale: RecommendationLocale = 'en'
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

  // Plan-derived, already in the report's language.
  const recommendations = generateRecommendations(params, results, locale)

  // Derived figures
  const monthlyExpenses = params.customExpenses.filter((e) => e.interval === 'monthly')
  const annualExpenses = params.customExpenses.filter((e) => e.interval === 'annual')

  const bridge = computeBridgeAnalysis(params)
  const health = computePlanHealthScore(params, results)
  // One description of the run, built by the same function the dashboard uses.
  // Everything the report says about run counts, the market model or what
  // "success" means is read off this object — nothing is re-derived downstream.
  const context = buildSimulationContext(params, results)

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
      // Every pension paying out at the statutory age, not just the statutory one.
      expectedMonthlyPensionEUR: pensionMonthlyAtAge(
        params.cashFlows ?? [],
        params.legalRetirementAge,
        params.legalRetirementAge
      ).total,
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
        // Carried through so the PDF can print the seeded flows in the
        // report's own language (see `localizeCashFlowName`).
        ...(expense.nameKey !== undefined ? { nameKey: expense.nameKey } : {}),
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
          ...(flow.nameKey !== undefined ? { nameKey: flow.nameKey } : {}),
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
      spendingFloorReal: params.spendingFloorReal,
      capGainsTaxRatePct: params.capitalGainsTax,
      taxAllowanceAnnual: params.taxAllowanceAnnual,
      householdType: params.householdType,
      equityFundExemption: params.equityFundExemption,
      pensionTaxablePortion: params.pensionTaxablePortion,
      pensionTaxRate: params.pensionTaxRate,
      legacyTargetReal: params.legacyTargetReal,
      mcRuns: params.simulationRuns,
    },
    simulation: {
      marketModel: context.marketModel,
      effectiveRuns: context.effectiveRuns,
      successDefinition: context.successDefinition,
      successRatePct: context.successRate,
      depletionSuccessRatePct: context.depletionSuccessRate,
      depletionRiskPct: context.depletionRisk,
      successCount: context.successCount,
      horizonYears: context.horizonYears,
      legacyTargetReal: context.legacyTargetReal,
      seedLabel: context.seedLabel,
      paramsFingerprint: context.paramsFingerprint,
      historicalPathCount: context.historical.pathCount,
      historicalFirstYear: context.historical.firstYear,
      historicalLastYear: context.historical.lastYear,
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
