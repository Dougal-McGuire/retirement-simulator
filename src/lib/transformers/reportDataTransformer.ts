import type { SimulationParams, SimulationResults } from '@/types'
import {
  enabledCashFlows,
  isCashFlowEnabled,
  isLifetimeExpenseFlow,
  pensionMonthlyAtAge,
} from '@/lib/simulation/cashFlows'
import type { ReportData } from '@/lib/pdf-generator/schema/reportData'
import { buildSimulationContext } from '@/lib/simulation/context'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import { computeBridgeAnalysis } from '@/lib/insights/bridge'
import { computePlanHealthScore } from '@/lib/insights/planHealth'
import {
  estimateRecommendationUplift,
  generateRecommendations,
  type RecommendationLocale,
} from '@/lib/insights/recommendations'
import { assetPercentilesIn, resolveEuroUnit } from '@/lib/pdf-generator/euroUnit'

export type ReportDataOptions = {
  /**
   * The dashboard's Nominal / Heutige € switch at the time of export. A view
   * preference, not a model input: it only picks which pre-computed series the
   * report prints, so nothing here re-runs the simulation.
   */
  displayReal?: boolean
}

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
  locale: RecommendationLocale = 'en',
  options: ReportDataOptions = {}
): ReportData {
  // Which euro the projected figures are printed in. Real only when the
  // results can really be expressed that way; otherwise the report stays
  // nominal and says so — it never mixes the two.
  const units = resolveEuroUnit(results, options.displayReal === true)
  const assets = assetPercentilesIn(results, units)

  // Generate milestones from simulation results
  const milestones = results.ages.map((age, index) => ({
    age,
    p10: assets.p10[index] || 0,
    p20: assets.p20[index] || 0,
    p50: assets.p50[index] || 0,
    p80: assets.p80[index] || 0,
    p90: assets.p90[index] || 0,
  }))

  // Plan-derived, already in the report's language.
  const recommendations = generateRecommendations(params, results, locale, { unit: units.applied })

  // Derived figures
  const monthlyExpenses = params.customExpenses.filter((e) => e.interval === 'monthly')
  const annualExpenses = params.customExpenses.filter((e) => e.interval === 'annual')

  // Nominal: each bridge year priced at the run's median price level, like the
  // nominal charts. Real: today's budget per year.
  const bridge = computeBridgeAnalysis(params, { unit: units.applied, results })

  // Ratios have no unit, so the € switch must not move them. The budget is in
  // today's euros, so they are taken against today's-euro assets whenever the
  // results allow it — in both modes — and nominal ones only when nothing else
  // exists (the same basis in both modes then too).
  const ratioUnit = resolveEuroUnit(results, true)
  const retirementIndex = results.ages.indexOf(params.retirementAge)
  const retirementMedian =
    retirementIndex === -1 ? undefined : assetPercentilesIn(results, ratioUnit).p50[retirementIndex]
  const ratioOf = (amount: number) =>
    retirementMedian !== undefined && retirementMedian > 0 ? amount / retirementMedian : null
  const ratios = {
    firstYearWithdrawalRate: ratioOf(
      calculateCombinedExpenses(params.customExpenses).combinedAnnual
    ),
    bridgeShareOfRetirementAssets: ratioOf(
      Math.round(computeBridgeAnalysis(params, { unit: ratioUnit.applied, results }).cashNeedEUR)
    ),
  }
  // Unit-free: the score reads the success rate and today's-euro inputs only.
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
      // A switched-off flow is in no figure of the report.
      cashFlows: enabledCashFlows(params.cashFlows)
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
          ...(flow.taxablePortion !== undefined ? { taxablePortion: flow.taxablePortion } : {}),
          ...(flow.taxTreatment !== undefined ? { taxTreatment: flow.taxTreatment } : {}),
          ...(flow.pensionTaxMode !== undefined ? { pensionTaxMode: flow.pensionTaxMode } : {}),
        })),
      // Kept in the plan but out of the calculation; the report names them
      // once so a reader knows what the figures leave out.
      switchedOffFlows: (params.cashFlows ?? [])
        .filter((flow) => !isCashFlowEnabled(flow))
        .map((flow) => ({
          id: flow.id,
          kind: flow.kind,
          name: flow.name,
          ...(flow.nameKey !== undefined ? { nameKey: flow.nameKey } : {}),
          amount: flow.amount,
          frequency: flow.frequency,
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
      ratios,
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
    units,
    metadata: {
      reportId: `RPT-${Date.now()}`,
      generatedAt: new Date().toISOString(),
      version: '1.0.0',
      ...(planName?.trim() ? { planName: planName.trim().slice(0, 80) } : {}),
    },
  }
}
