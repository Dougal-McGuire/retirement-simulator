import type {
  Milestone,
  Recommendation,
  ReportData,
  ReportLocale,
  Summary,
} from '@/lib/pdf-generator/schema/reportData'

import type { WithdrawalStrategy } from '@/types'
import { localizeCashFlowName } from '@/lib/plans/cashFlowName'

export type { ReportLocale } from '@/lib/pdf-generator/schema/reportData'

type SummaryBridge = NonNullable<Summary>['bridge']

const PLAN_HEALTH_LABELS_DE: Record<string, string> = {
  Strong: 'Stark',
  Moderate: 'Ausgewogen',
  'Needs Attention': 'Überarbeiten',
}

const PLAN_HEALTH_REASONS_DE: Record<string, string> = {
  'solid savings rate': 'Solide Sparquote hält Entnahmen stabil',
  'moderate bridge drawdown': 'Überbrückungsphase benötigt moderaten Kapitalverzehr',
  'high success probability': 'Hohe Erfolgswahrscheinlichkeit im Simulationsergebnis',
  'balanced assumptions': 'Ausgewogene Markt- und Ausgabenannahmen',
}

const RECOMMENDATION_IMPACT_DE: Record<string, string> = {
  High: 'hoch',
  Medium: 'mittel',
  Low: 'niedrig',
}

const MONTHLY_CATEGORY_LABELS: Record<ReportLocale, string[]> = {
  de: [
    'Gesundheit & Pflege',
    'Lebensmittel & Haushalt',
    'Freizeit & Kultur',
    'Einkauf & Sonstiges',
    'Wohnen & Energie',
  ],
  en: [
    'Health & care',
    'Food & household',
    'Leisure & culture',
    'Shopping & misc.',
    'Housing & utilities',
  ],
}

const ANNUAL_CATEGORY_LABELS: Record<ReportLocale, string[]> = {
  de: ['Urlaub & Reisen', 'Instandhaltung', 'Mobilität'],
  en: ['Travel & vacations', 'Home maintenance', 'Mobility & vehicle'],
}

function fallbackExpenseCategories(
  locale: ReportLocale,
  monthlyTotals: ReportData['spending']['monthly'],
  annualTotals: ReportData['spending']['annual'],
  yearlyTotal: number
): { monthlyCategories: ReportExpensesCategory[]; annualCategories: ReportExpensesCategory[] } {
  const expensesShare = (value: number, total: number) => (total > 0 ? value / total : 0)
  const monthlyTotal =
    monthlyTotals.health +
    monthlyTotals.food +
    monthlyTotals.entertainment +
    monthlyTotals.shopping +
    monthlyTotals.utilities
  const annualTotal = annualTotals.vacations + annualTotals.homeRepairs + annualTotals.car
  const monthlyLabels = MONTHLY_CATEGORY_LABELS[locale]
  const annualLabels = ANNUAL_CATEGORY_LABELS[locale]

  const monthlyCategories: ReportExpensesCategory[] = [
    {
      label: monthlyLabels[0],
      annualAmount: monthlyTotals.health * 12,
      share: expensesShare(monthlyTotals.health * 12, yearlyTotal),
    },
    {
      label: monthlyLabels[1],
      annualAmount: monthlyTotals.food * 12,
      share: expensesShare(monthlyTotals.food * 12, yearlyTotal),
    },
    {
      label: monthlyLabels[2],
      annualAmount: monthlyTotals.entertainment * 12,
      share: expensesShare(monthlyTotals.entertainment * 12, yearlyTotal),
    },
    {
      label: monthlyLabels[3],
      annualAmount: monthlyTotals.shopping * 12,
      share: expensesShare(monthlyTotals.shopping * 12, yearlyTotal),
    },
    {
      label: monthlyLabels[4],
      annualAmount: monthlyTotals.utilities * 12,
      share: expensesShare(monthlyTotals.utilities * 12, yearlyTotal),
    },
  ].filter((item) => item.annualAmount > 0 || monthlyTotal === 0)

  const annualCategories: ReportExpensesCategory[] = [
    {
      label: annualLabels[0],
      annualAmount: annualTotals.vacations,
      share: expensesShare(annualTotals.vacations, yearlyTotal),
    },
    {
      label: annualLabels[1],
      annualAmount: annualTotals.homeRepairs,
      share: expensesShare(annualTotals.homeRepairs, yearlyTotal),
    },
    {
      label: annualLabels[2],
      annualAmount: annualTotals.car,
      share: expensesShare(annualTotals.car, yearlyTotal),
    },
  ].filter((item) => item.annualAmount > 0 || annualTotal === 0)

  return { monthlyCategories, annualCategories }
}

const DEFAULT_REASON: Record<ReportLocale, string> = {
  de: 'Ausgewogene Annahmen',
  en: 'Balanced assumptions',
}

const DEFAULT_HIGHLIGHT: Record<ReportLocale, string> = {
  de: 'Zusätzliche Optimierung prüfen',
  en: 'Consider further optimisation',
}

const SCENARIO_LABEL: Record<ReportLocale, { label: string; description: string }> = {
  de: { label: 'Überbrückungsphase', description: 'Liquidität bis zum Rentenbeginn sichern' },
  en: { label: 'Bridge phase', description: 'Secure liquidity until state pension begins' },
}

export interface ReportMetadata {
  id: string
  generatedAt: string
  version?: string
  /** Name of the plan this report was generated from, when known. */
  planName?: string
}

/**
 * What the engine actually did, as printed. Mirrors `SimulationContext` from
 * the app; every mode-aware string in the report reads from this and nothing
 * else, which is what keeps a historical backtest from being described as a
 * Monte Carlo with 500 lognormal draws.
 */
export interface ReportSimulation {
  marketModel: 'monteCarlo' | 'historical'
  effectiveRuns: number
  successDefinition: 'legacyConditioned' | 'depletion'
  /** 0..1 — the headline rate under `successDefinition`. */
  successRate: number
  /** 0..1 — plain survival, ignoring any bequest goal. */
  depletionSuccessRate: number
  /** 0..1 — share of runs whose assets were exhausted. */
  depletionRisk: number
  successCount: number
  /** Simulated years, from the engine's age grid. */
  horizonYears: number
  legacyTargetReal: number
  seedLabel: string
  historicalPathCount: number
  historicalFirstYear: number
  historicalLastYear: number
  /** True when the payload carried a real context rather than a reconstruction. */
  fromContext: boolean
}

export interface ReportProfile {
  householdName?: string
  analyst?: string
  person: {
    currentAge: number
    retireAge: number
    pensionAge: number
    horizonAge: number
  }
  success: {
    trials: number
    successCount: number
    successRate: number
    score: number | null
    label: string | null
    reasons: string[]
    /** Weighted parts the score is composed of, when the payload carries them. */
    components: Array<{ id: 'success' | 'spending' | 'liquidity'; value: number; weight: number }>
  }
  bridge?: SummaryBridge
  highlights: string[]
}

export interface ReportAssumptions {
  expectedReturn: number
  returnVolatility: number
  inflation: number
  inflationVolatility: number
  withdrawalStrategy: WithdrawalStrategy
  dsWithdrawalRate: number
  dsCeilingRate: number
  dsFloorRate: number
  /** `percentOfPortfolio` spending floor, today's euros per year. */
  spendingFloorReal: number
  capitalGainsTax: number
  /** Sparerpauschbetrag per year, already doubled for a couple. */
  taxAllowance: number
  householdType: 'single' | 'couple'
  /** Teilfreistellung on realised fund gains. */
  equityFundExemption: number
  pensionTaxablePortion: number
  pensionTaxRate: number
  /** Bequest goal in today's euros; 0 when the plan has none. */
  legacyTargetReal: number
  simulationRuns: number
}

export interface ReportFinances {
  currentAssets: number
  annualSavings: number
  monthlyPension: number
}

export interface ReportProjections {
  milestones: Array<Pick<Milestone, 'age' | 'p10' | 'p20' | 'p50' | 'p80' | 'p90'>>
  exhaustionAge?: number
}

export interface ReportExpensesCategory {
  id?: string
  label: string
  interval?: 'monthly' | 'annual'
  originalAmount?: number
  annualAmount: number
  share: number
}

/** A scheduled cash flow as printed in the report's inputs table. */
export interface ReportCashFlow {
  id: string
  kind: 'income' | 'expense'
  name: string
  amount: number
  frequency: 'monthly' | 'annual' | 'once'
  startAge?: number
  endAge?: number
  inflationLinked?: boolean
  growthRate?: number
}

export interface ReportExpenses {
  /** Simulated years — the count of ages the engine ran, not the age span. */
  horizonYears: number
  /**
   * Every euro of planned spending across the horizon: recurring budget × years
   * **plus** the scheduled flows (care costs, one-off repairs), which used to be
   * silently excluded even though the report lists them a section earlier.
   */
  totalHorizonAmount: number
  /** The scheduled-flow part of `totalHorizonAmount`; 0 when there are none. */
  scheduledExpenseTotal: number
  annualTotal: number
  monthlyTotal: number
  monthlyCategories: ReportExpensesCategory[]
  annualCategories: ReportExpensesCategory[]
  allCategories: ReportExpensesCategory[]
  /**
   * Windowed / one-off / income flows. Deliberately kept out of the totals
   * above: those describe the plan's steady annual spending, and folding a
   * single roof repair into "per year" would misstate it.
   */
  scheduledFlows: ReportCashFlow[]
}

export interface ReportScenario {
  label: string
  description: string
  probability?: number
  bridge?: SummaryBridge
}

export interface ReportRecommendations {
  primary: Array<Recommendation & { impactLabel?: string }>
  /** Estimated success-rate uplift per headline action, when available. */
  uplifts: Array<{ title: string; upliftMin: number; upliftMax: number }>
}

export interface ReportContent {
  metadata: ReportMetadata
  profile: ReportProfile
  finances: ReportFinances
  assumptions: ReportAssumptions
  simulation: ReportSimulation
  projections: ReportProjections
  expenses: ReportExpenses
  scenarios: ReportScenario[]
  recommendations: ReportRecommendations
  locale: ReportLocale
}

function normaliseLocale(value?: ReportLocale): ReportLocale {
  return value ?? 'de'
}

export function mapReportDataToContent(data: ReportData): ReportContent {
  const locale = normaliseLocale(data.locale)

  const summary = data.summary

  // The simulation context, or the closest honest reconstruction of it for a
  // payload generated before the context existed. Note the fallback still
  // refuses to claim `mcRuns` paths under the historical model: that model has
  // exactly as many paths as the series has start years, whatever was asked for.
  const stored = data.simulation
  const historicalPathCount = stored?.historicalPathCount ?? 125
  const marketModel = stored?.marketModel ?? data.assumptions.marketModel
  const simulation: ReportSimulation = {
    marketModel,
    effectiveRuns:
      stored?.effectiveRuns ??
      (marketModel === 'historical' ? historicalPathCount : data.assumptions.mcRuns),
    successDefinition:
      stored?.successDefinition ??
      (data.assumptions.legacyTargetReal > 0 ? 'legacyConditioned' : 'depletion'),
    successRate: (stored?.successRatePct ?? data.projections.successRatePct) / 100,
    depletionSuccessRate:
      (stored?.depletionSuccessRatePct ?? data.projections.successRatePct) / 100,
    depletionRisk:
      (stored?.depletionRiskPct ?? 100 - data.projections.successRatePct) / 100,
    successCount: 0,
    horizonYears:
      stored?.horizonYears ??
      // The engine simulates every age from `currentAge` through `horizonAge`
      // inclusive, so the number of spending years is the count of milestones,
      // not the span between the two ages.
      (data.projections.milestones.length ||
        Math.max(1, data.person.horizonAge - data.person.currentAge + 1)),
    legacyTargetReal: stored?.legacyTargetReal ?? data.assumptions.legacyTargetReal,
    seedLabel: stored?.seedLabel ?? '',
    historicalPathCount,
    historicalFirstYear: stored?.historicalFirstYear ?? 1900,
    historicalLastYear: stored?.historicalLastYear ?? 2024,
    fromContext: stored !== undefined,
  }
  simulation.successCount =
    stored?.successCount ?? Math.round(simulation.successRate * simulation.effectiveRuns)

  const trials = simulation.effectiveRuns
  const successRate = simulation.successRate
  const successCount = simulation.successCount

  const monthlyTotals = data.spending.monthly
  const annualTotals = data.spending.annual
  const customExpenses = data.spending.custom ?? []
  const monthlyTotalFromCustom = customExpenses
    .filter((item) => item.interval === 'monthly')
    .reduce((sum, item) => sum + item.amount, 0)
  const annualTotalFromCustom = customExpenses
    .filter((item) => item.interval === 'annual')
    .reduce((sum, item) => sum + item.amount, 0)
  const monthlyTotalFallback =
    monthlyTotals.health +
    monthlyTotals.food +
    monthlyTotals.entertainment +
    monthlyTotals.shopping +
    monthlyTotals.utilities
  const annualTotalFallback = annualTotals.vacations + annualTotals.homeRepairs + annualTotals.car
  const monthlyTotal = customExpenses.length > 0 ? monthlyTotalFromCustom : monthlyTotalFallback
  const annualTotal = customExpenses.length > 0 ? annualTotalFromCustom : annualTotalFallback
  const yearlyTotal = monthlyTotal * 12 + annualTotal
  const horizonYears = simulation.horizonYears

  // "Total horizon need" has to mean every euro the plan expects to spend.
  // Leaving the scheduled flows out made the figure contradict the care-cost
  // table printed one section earlier, which the reader had just read.
  const scheduledFlows = data.spending.cashFlows ?? []
  const flowYears = (flow: (typeof scheduledFlows)[number]) => {
    const from = Math.max(flow.startAge ?? data.person.currentAge, data.person.currentAge)
    const to = Math.min(flow.endAge ?? data.person.horizonAge, data.person.horizonAge)
    return Math.max(0, to - from + 1)
  }
  const scheduledExpenseTotal = scheduledFlows
    .filter((flow) => flow.kind === 'expense')
    .reduce((sum, flow) => {
      if (flow.frequency === 'once') {
        const age = flow.startAge ?? data.person.currentAge
        const inHorizon = age >= data.person.currentAge && age <= data.person.horizonAge
        return sum + (inHorizon ? flow.amount : 0)
      }
      return sum + flow.amount * (flow.frequency === 'monthly' ? 12 : 1) * flowYears(flow)
    }, 0)
  const totalHorizonAmount = yearlyTotal * horizonYears + scheduledExpenseTotal

  const pickMilestones = data.projections.milestones.map((m) => ({
    age: m.age,
    p10: m.p10,
    p20: m.p20,
    p50: m.p50,
    p80: m.p80,
    p90: m.p90,
  }))

  const reasonSource =
    summary?.planHealthWhyBits ?? (summary?.planHealthWhy ? [summary.planHealthWhy] : [])
  let reasons: string[]
  if (!reasonSource.length) {
    reasons = [DEFAULT_REASON[locale]]
  } else if (locale === 'de') {
    reasons = reasonSource.map((item) => PLAN_HEALTH_REASONS_DE[item] ?? DEFAULT_REASON.de)
  } else {
    reasons = reasonSource
  }

  const label = (() => {
    if (!summary?.planHealthLabel) return null
    if (locale === 'de') {
      return PLAN_HEALTH_LABELS_DE[summary.planHealthLabel] ?? summary.planHealthLabel
    }
    return summary.planHealthLabel
  })()

  // Recommendation text now arrives already written in the report's language
  // (see `generateRecommendations`), because every body interpolates this
  // plan's own figures — a table keyed on the English sentence could not carry
  // them and silently replaced any unrecognised item with a generic line.
  const highlights = (summary?.topActions ?? []).filter((action) => action.trim() !== '')

  const expensesShare = (value: number, total: number) => (total > 0 ? value / total : 0)
  let monthlyCategories: ReportExpensesCategory[]
  let annualCategories: ReportExpensesCategory[]

  if (customExpenses.length > 0) {
    monthlyCategories = customExpenses
      .filter((item) => item.interval === 'monthly')
      .map((item) => ({
        id: item.id,
        label: localizeCashFlowName(item, locale),
        interval: 'monthly' as const,
        originalAmount: item.amount,
        annualAmount: item.amount * 12,
        share: expensesShare(item.amount * 12, yearlyTotal),
      }))
      .sort((a, b) => b.annualAmount - a.annualAmount)

    annualCategories = customExpenses
      .filter((item) => item.interval === 'annual')
      .map((item) => ({
        id: item.id,
        label: localizeCashFlowName(item, locale),
        interval: 'annual' as const,
        originalAmount: item.amount,
        annualAmount: item.amount,
        share: expensesShare(item.amount, yearlyTotal),
      }))
      .sort((a, b) => b.annualAmount - a.annualAmount)
  } else {
    const fallback = fallbackExpenseCategories(locale, monthlyTotals, annualTotals, yearlyTotal)
    monthlyCategories = fallback.monthlyCategories
    annualCategories = fallback.annualCategories
  }

  const allCategories = [...monthlyCategories, ...annualCategories].sort(
    (a, b) => b.annualAmount - a.annualAmount
  )

  const scenarios: ReportScenario[] = []
  if (summary?.bridge) {
    const copy = SCENARIO_LABEL[locale]
    scenarios.push({
      label: copy.label,
      description: copy.description,
      probability: 1,
      bridge: summary.bridge,
    })
  }

  return {
    metadata: {
      id: data.metadata?.reportId ?? `RPT-${Date.now()}`,
      generatedAt: data.metadata?.generatedAt ?? new Date().toISOString(),
      version: data.metadata?.version,
      planName: data.metadata?.planName,
    },
    profile: {
      person: {
        currentAge: data.person.currentAge,
        retireAge: data.person.retireAge,
        pensionAge: data.person.pensionAge,
        horizonAge: data.person.horizonAge,
      },
      success: {
        trials,
        successCount,
        successRate,
        score: summary?.planHealthScore ?? null,
        label,
        reasons,
        components: summary?.planHealthComponents ?? [],
      },
      bridge: summary?.bridge,
      highlights,
    },
    finances: {
      currentAssets: data.finances.currentAssetsEUR,
      annualSavings: data.finances.annualSavingsEUR,
      monthlyPension: data.finances.expectedMonthlyPensionEUR,
    },
    assumptions: {
      expectedReturn: data.assumptions.roiMean,
      returnVolatility: data.assumptions.roiStdev,
      inflation: data.assumptions.inflationMean,
      inflationVolatility: data.assumptions.inflationStdev,
      withdrawalStrategy: data.assumptions.withdrawalStrategy,
      dsWithdrawalRate: data.assumptions.dsWithdrawalRate,
      dsCeilingRate: data.assumptions.dsCeilingRate,
      dsFloorRate: data.assumptions.dsFloorRate,
      spendingFloorReal: data.assumptions.spendingFloorReal,
      capitalGainsTax: data.assumptions.capGainsTaxRatePct,
      taxAllowance:
        data.assumptions.householdType === 'couple'
          ? data.assumptions.taxAllowanceAnnual * 2
          : data.assumptions.taxAllowanceAnnual,
      householdType: data.assumptions.householdType,
      equityFundExemption: data.assumptions.equityFundExemption,
      pensionTaxablePortion: data.assumptions.pensionTaxablePortion,
      pensionTaxRate: data.assumptions.pensionTaxRate,
      legacyTargetReal: data.assumptions.legacyTargetReal,
      simulationRuns: data.assumptions.mcRuns,
    },
    projections: {
      milestones: pickMilestones,
      exhaustionAge: pickMilestones.find((m) => m.p10 <= 0)?.age,
    },
    simulation,
    expenses: {
      horizonYears,
      totalHorizonAmount,
      scheduledExpenseTotal,
      annualTotal,
      monthlyTotal,
      monthlyCategories,
      annualCategories,
      allCategories,
      // Seeded flows follow the report's language; user-named ones are verbatim.
      // `nameKey` is resolved here and dropped: downstream sections render a
      // label, never a key.
      scheduledFlows: (data.spending.cashFlows ?? []).map(({ nameKey: _key, ...flow }) => ({
        ...flow,
        name: localizeCashFlowName({ name: flow.name, nameKey: _key }, locale),
      })),
    },
    scenarios,
    recommendations: {
      uplifts: summary?.topActionsDetailed ?? [],
      // Only the impact tag is still a fixed vocabulary, so only it is mapped.
      primary:
        locale === 'de'
          ? data.recommendations.map((rec) => ({
              ...rec,
              impactLabel: RECOMMENDATION_IMPACT_DE[rec.impact] ?? rec.impact,
            }))
          : data.recommendations,
    },
    locale,
  }
}
