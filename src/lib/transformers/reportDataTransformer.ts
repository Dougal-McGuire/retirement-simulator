import type { SimulationParams, SimulationResults } from '@/types'
import {
  enabledCashFlows,
  isCashFlowEnabled,
  isLifetimeExpenseFlow,
  pensionMonthlyAtAge,
} from '@/lib/simulation/cashFlows'
import type { ReportData } from '@/lib/pdf-generator/schema/reportData'
import { buildSimulationContext } from '@/lib/simulation/context'
import { computeBridgeAnalysis } from '@/lib/insights/bridge'
import { computePlanHealthScore } from '@/lib/insights/planHealth'
import {
  firstRetirementYear,
  firstYearWithdrawalRate,
  ledgerRows,
  pensionYear,
  phaseFlow,
  retirementSpending,
} from '@/lib/insights/ledger'
import type { LeverEffects } from '@/lib/insights/leverEffects'
import {
  generateRecommendations,
  type RecommendationLocale,
} from '@/lib/insights/recommendations'
import {
  assetPercentilesIn,
  resolveEuroUnit,
  type ReportEuroUnit,
} from '@/lib/pdf-generator/euroUnit'

export type ReportDataOptions = {
  /**
   * The dashboard's Nominal / Heutige € switch at the time of export. A view
   * preference, not a model input: it only picks which pre-computed series the
   * report prints, so nothing here re-runs the simulation.
   */
  displayReal?: boolean
  /**
   * The stress levers measured against `results` (see `measureLeverEffects`).
   * The caller measures — this function never runs a simulation. Omitted or
   * `null`, the report carries no lever table.
   */
  leverEffects?: LeverEffects | null
}

/** A tenth of the runs: the share the report's stress case ("P10") stands for. */
const STRESS_SHARE = 0.1

/**
 * The age by which a tenth of the runs has had a year whose spending could not
 * be paid — read from the engine's own depletion data, which counts exactly
 * the runs the success rate counts as failed.
 *
 * `null`: fewer than a tenth ever get there. `undefined`: the results carry no
 * depletion data. Not derived from the P10 balance touching zero: with a
 * pension that pays the budget, an empty portfolio is not a failed plan.
 */
export function stressShortfallAge(
  results: Pick<SimulationResults, 'ages' | 'depletionByAge'>
): number | null | undefined {
  const shares = results.depletionByAge
  if (!shares || shares.length !== results.ages.length) return undefined
  const index = shares.findIndex((share) => share >= STRESS_SHARE - 1e-9)
  return index === -1 ? null : results.ages[index]
}

/** The measured levers in the report's unit; `undefined` when they do not fit `results`. */
function leverEffectsFor(
  effects: LeverEffects | null | undefined,
  results: SimulationResults,
  units: ReportEuroUnit,
  baseWorstDecileEnd: number
): NonNullable<ReportData['summary']>['leverEffects'] {
  if (!effects || effects.levers.length === 0) return undefined
  // Measured against another result (the plan changed while the report was
  // being prepared): not this report's numbers.
  if (Math.abs(effects.baseSuccessRate - results.successRate) > 1e-9) return undefined
  const real = units.applied === 'real'
  const levers = effects.levers.map((lever) => ({
    id: lever.id,
    successRatePct: lever.successRate,
    deltaPoints: lever.delta,
    worstDecileEndEUR: real ? lever.worstDecileEndReal : lever.worstDecileEnd,
  }))
  if (levers.some((lever) => lever.worstDecileEndEUR === null)) return undefined
  return {
    baseSuccessRatePct: effects.baseSuccessRate,
    baseWorstDecileEndEUR: baseWorstDecileEnd,
    levers: levers.map((lever) => ({ ...lever, worstDecileEndEUR: lever.worstDecileEndEUR ?? 0 })),
  }
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
  const unit = units.applied
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
  const recommendations = generateRecommendations(params, results, locale, { unit })

  // Derived figures
  const monthlyExpenses = params.customExpenses.filter((e) => e.interval === 'monthly')
  const annualExpenses = params.customExpenses.filter((e) => e.interval === 'annual')

  // The retirement years before the main pension pays, and what the ledger
  // withdrew from the portfolio in them — in the report's unit.
  const bridge = computeBridgeAnalysis(params, { unit, results })

  // Everything below is read from the engine's ledger. Without one (results
  // stored before it existed) the block is absent and the report prints
  // dashes, not estimates.
  const hasLedger = ledgerRows(results, unit) !== null
  const bridgePhase =
    bridge.yearsInBridge > 0 ? phaseFlow(results, unit, bridge.startAge, bridge.endAge) : null
  // The pension phase starts once the main pension pays and the plan is in
  // retirement; without a pension it is simply the retirement.
  const drawdownStart = Math.max(
    bridge.mainPension === 'none' ? params.retirementAge : bridge.pensionAge,
    params.retirementAge,
    params.currentAge
  )
  const ledger: ReportData['ledger'] = hasLedger
    ? {
        firstRetirementYear: firstRetirementYear(params, results, unit),
        pensionYear: pensionYear(params, results, unit),
        retirementSpending: retirementSpending(params, results, unit),
        phases: {
          accumulation:
            params.retirementAge > params.currentAge
              ? phaseFlow(results, unit, params.currentAge, params.retirementAge - 1)
              : null,
          bridge: bridgePhase,
          pension: phaseFlow(results, unit, drawdownStart, params.endAge),
        },
      }
    : undefined

  // Ratios have no unit, so the € switch must not move them: the withdrawal
  // rate is the ledger's one definition, and the bridge share is taken on
  // today's euros whenever the results allow it — in both modes.
  const ratioUnit = ledgerRows(results, 'real') ? 'real' : 'nominal'
  const ratioBridge = computeBridgeAnalysis(params, { unit: ratioUnit, results })
  const ratioRetirement = firstRetirementYear(params, results, ratioUnit)
  const ratios = {
    firstYearWithdrawalRate: firstYearWithdrawalRate(params, results),
    bridgeShareOfRetirementAssets:
      ratioBridge.yearsInBridge > 0 &&
      ratioBridge.cashNeedEUR !== null &&
      ratioRetirement !== null &&
      ratioRetirement.openingAssets > 0
        ? ratioBridge.cashNeedEUR / ratioRetirement.openingAssets
        : null,
  }

  // Unit-free: the score reads the success rate and the ledger's withdrawal rate.
  const health = computePlanHealthScore(params, results)
  // One description of the run, built by the same function the dashboard uses.
  // Everything the report says about run counts, the market model or what
  // "success" means is read off this object — nothing is re-derived downstream.
  const context = buildSimulationContext(params, results)

  const shortfallAge = stressShortfallAge(results)

  const topActions = recommendations.slice(0, 2).map((r) => r.title)
  const leverEffects = leverEffectsFor(
    options.leverEffects,
    results,
    units,
    assets.p10[assets.p10.length - 1] ?? 0
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
      // Every pension paying out at the statutory age, not just the statutory
      // one — the amounts as entered (gross, in the euros each is quoted in).
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
      ...(shortfallAge !== undefined ? { stressShortfallAge: shortfallAge } : {}),
      ratios,
    },
    ...(ledger ? { ledger } : {}),
    summary: {
      planHealthScore: health.score,
      planHealthBand: health.band,
      planHealthComponents: health.components,
      planHealthWithdrawalRate: health.withdrawalRate,
      successProbabilityPct: results.successRate,
      // Only a bridge the report can put a figure on: years to bridge, a
      // pension to bridge to, and a ledger to read the amount from.
      ...(bridge.yearsInBridge > 0 && bridge.mainPension !== 'none' && bridge.cashNeedEUR !== null
        ? {
            bridge: {
              startAge: bridge.startAge,
              endAge: bridge.endAge,
              pensionAge: bridge.pensionAge,
              mainPension: bridge.mainPension,
              cashNeedEUR: Math.round(bridge.cashNeedEUR),
              cashBucketYears: bridge.cashBucketYears,
              cashBucketSharePct: bridge.cashBucketSharePct,
              portfolioSharePct: bridge.portfolioSharePct,
            },
          }
        : {}),
      topActions,
      ...(leverEffects ? { leverEffects } : {}),
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
