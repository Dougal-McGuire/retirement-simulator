import type { Milestone, Recommendation, ReportData, Summary } from '@/lib/pdf-generator/schema/reportData'

export type ReportLocale = 'de' | 'en'

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

const ACTION_TRANSLATIONS_DE: Record<string, string> = {
  'Increase Savings Rate': 'Sparquote erhöhen',
  'Delay Retirement': 'Ruhestand verschieben',
  'Optimize Investment Mix': 'Anlagestruktur optimieren',
  'Review Spending Plan': 'Ausgabenplan überprüfen',
  'Maximize Tax-Deferred Contributions': 'Steuerbegünstigte Beiträge maximieren',
  'Consider Volatility Reduction': 'Volatilität schrittweise reduzieren',
  'Review Insurance Coverage': 'Versicherungsschutz überprüfen',
}

const RECOMMENDATION_TITLES_DE: Record<string, string> = {
  'Increase Savings Rate': 'Sparquote erhöhen',
  'Delay Retirement': 'Ruhestand um 2–3 Jahre verschieben',
  'Optimize Investment Mix': 'Portfolioausrichtung neu kalibrieren',
  'Review Spending Plan': 'Ausgabenplan straffen',
  'Maximize Tax-Deferred Contributions': 'Steuerlich geförderte Beiträge ausschöpfen',
  'Consider Volatility Reduction': 'Volatilität reduzieren',
  'Review Insurance Coverage': 'Versorgungsschutz aktualisieren',
}

const RECOMMENDATION_CATEGORIES_DE: Record<string, string> = {
  'Savings Strategy': 'Sparstrategie',
  Timing: 'Zeitplanung',
  'Investment Strategy': 'Investmentstrategie',
  'Expense Management': 'Ausgabenmanagement',
  'Tax Planning': 'Steuerplanung',
  'Risk Management': 'Risikomanagement',
  Protection: 'Absicherung',
}

const RECOMMENDATION_BODIES_DE: Record<string, string> = {
  'Your current success rate indicates potential challenges. Consider increasing your annual savings by 10-20% to improve retirement security.':
    'Die Erfolgswahrscheinlichkeit profitiert von einer höheren Sparquote. Zusätzliche 10–20\u202f% p.a. stabilisieren den Kapitalpuffer.',
  'Working an additional 2-3 years could significantly improve your success rate by allowing more time for asset accumulation.':
    'Ein längerer Erwerbszeitraum von 2–3 Jahren erhöht Vermögensaufbau und Erfolgschance deutlich.',
  'Review your asset allocation to ensure appropriate balance between growth and stability for your risk tolerance.':
    'Überprüfen Sie die Asset Allocation, um Rendite- und Risikobeiträge besser auszubalancieren.',
  'Your expenses are high relative to savings. Consider reviewing discretionary spending to improve financial flexibility.':
    'Variable Ausgaben belasten die Liquidität. Priorisieren Sie Budgetdisziplin bei Freizeit- und Konsumpositionen.',
  'Ensure you are taking full advantage of tax-advantaged retirement accounts to reduce current tax liability and enhance long-term growth.':
    'Nutzen Sie steuerbegünstigte Konten vollständig, um Nettorendite und Vermögenswachstum zu steigern.',
  'Your portfolio has high volatility. As you approach retirement, consider gradually shifting to more stable investments.':
    'Verringern Sie die Portfoliovolatilität schrittweise, um Sequenzrisiken beim Übergang in den Ruhestand zu begrenzen.',
  'Evaluate current insurance policies including health, long-term care, and life insurance to ensure adequate protection.':
    'Prüfen Sie Kranken-, Pflege- und Lebensversicherung auf aktuelle Deckungslücken.',
}

const RECOMMENDATION_IMPACT_DE: Record<string, string> = {
  High: 'hoch',
  Medium: 'mittel',
  Low: 'niedrig',
}

const MONTHLY_CATEGORY_LABELS: Record<ReportLocale, string[]> = {
  de: ['Gesundheit & Pflege', 'Lebensmittel & Haushalt', 'Freizeit & Kultur', 'Einkauf & Sonstiges', 'Wohnen & Energie'],
  en: ['Health & care', 'Food & household', 'Leisure & culture', 'Shopping & misc.', 'Housing & utilities'],
}

const ANNUAL_CATEGORY_LABELS: Record<ReportLocale, string[]> = {
  de: ['Urlaub & Reisen', 'Instandhaltung', 'Mobilität'],
  en: ['Travel & vacations', 'Home maintenance', 'Mobility & vehicle'],
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
  }
  bridge?: Summary['bridge']
  highlights: string[]
}

export interface ReportAssumptions {
  expectedReturn: number
  returnVolatility: number
  inflation: number
  inflationVolatility: number
  capitalGainsTax: number
  simulationRuns: number
}

export interface ReportProjections {
  milestones: Array<Pick<Milestone, 'age' | 'p10' | 'p50' | 'p90'>>
  exhaustionAge?: number
}

export interface ReportExpensesCategory {
  label: string
  annualAmount: number
  share: number
}

export interface ReportExpenses {
  horizonYears: number
  totalHorizonAmount: number
  annualTotal: number
  monthlyTotal: number
  monthlyCategories: ReportExpensesCategory[]
  annualCategories: ReportExpensesCategory[]
}

export interface ReportScenario {
  label: string
  description: string
  probability?: number
  bridge?: Summary['bridge']
}

export interface ReportRecommendations {
  primary: Recommendation[]
}

export interface ReportContent {
  metadata: ReportMetadata
  profile: ReportProfile
  assumptions: ReportAssumptions
  projections: ReportProjections
  expenses: ReportExpenses
  scenarios: ReportScenario[]
  recommendations: ReportRecommendations
  locale: ReportLocale
}

function normaliseLocale(value?: string): ReportLocale {
  if (typeof value === 'string' && value.toLowerCase().startsWith('en')) {
    return 'en'
  }
  return 'de'
}

export function mapReportDataToContent(data: ReportData): ReportContent {
  const locale = normaliseLocale((data as Record<string, unknown>).locale as string | undefined)

  const summary = data.summary
  const trials = data.assumptions.mcRuns
  const successRate = data.projections.successRatePct / 100
  const successCount = Math.round(successRate * trials)

  const monthlyTotals = data.spending.monthly
  const annualTotals = data.spending.annual
  const monthlyTotal =
    monthlyTotals.health +
    monthlyTotals.food +
    monthlyTotals.entertainment +
    monthlyTotals.shopping +
    monthlyTotals.utilities
  const annualTotal = annualTotals.vacations + annualTotals.homeRepairs + annualTotals.car
  const yearlyTotal = monthlyTotal * 12 + annualTotal
  const horizonYears = Math.max(0, data.person.horizonAge - data.person.currentAge)
  const totalHorizonAmount = yearlyTotal * horizonYears

  const pickMilestones = data.projections.milestones.map((m) => ({
    age: m.age,
    p10: m.p10,
    p50: m.p50,
    p90: m.p90,
  }))

  const reasonSource = summary?.planHealthWhyBits ?? (summary?.planHealthWhy ? [summary.planHealthWhy] : [])
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

  const highlightsRaw = summary?.topActions ?? []
  const highlights = highlightsRaw.length
    ? locale === 'de'
      ? highlightsRaw.map((action) => ACTION_TRANSLATIONS_DE[action] ?? DEFAULT_HIGHLIGHT.de)
      : highlightsRaw
    : []

  const expensesShare = (value: number, total: number) => (total > 0 ? value / total : 0)
  const monthlyLabels = MONTHLY_CATEGORY_LABELS[locale]
  const annualLabels = ANNUAL_CATEGORY_LABELS[locale]

  const monthlyCategories: ReportExpensesCategory[] = [
    { label: monthlyLabels[0], annualAmount: monthlyTotals.health * 12, share: expensesShare(monthlyTotals.health, monthlyTotal) },
    { label: monthlyLabels[1], annualAmount: monthlyTotals.food * 12, share: expensesShare(monthlyTotals.food, monthlyTotal) },
    { label: monthlyLabels[2], annualAmount: monthlyTotals.entertainment * 12, share: expensesShare(monthlyTotals.entertainment, monthlyTotal) },
    { label: monthlyLabels[3], annualAmount: monthlyTotals.shopping * 12, share: expensesShare(monthlyTotals.shopping, monthlyTotal) },
    { label: monthlyLabels[4], annualAmount: monthlyTotals.utilities * 12, share: expensesShare(monthlyTotals.utilities, monthlyTotal) },
  ]

  const annualCategories: ReportExpensesCategory[] = [
    { label: annualLabels[0], annualAmount: annualTotals.vacations, share: expensesShare(annualTotals.vacations, annualTotal) },
    { label: annualLabels[1], annualAmount: annualTotals.homeRepairs, share: expensesShare(annualTotals.homeRepairs, annualTotal) },
    { label: annualLabels[2], annualAmount: annualTotals.car, share: expensesShare(annualTotals.car, annualTotal) },
  ]

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
      },
      bridge: summary?.bridge,
      highlights,
    },
    assumptions: {
      expectedReturn: data.assumptions.roiMean,
      returnVolatility: data.assumptions.roiStdev,
      inflation: data.assumptions.inflationMean,
      inflationVolatility: data.assumptions.inflationStdev,
      capitalGainsTax: data.assumptions.capGainsTaxRatePct,
      simulationRuns: data.assumptions.mcRuns,
    },
    projections: {
      milestones: pickMilestones,
      exhaustionAge: pickMilestones.find((m) => m.p10 <= 0)?.age,
    },
    expenses: {
      horizonYears,
      totalHorizonAmount,
      annualTotal,
      monthlyTotal,
      monthlyCategories,
      annualCategories,
    },
    scenarios,
    recommendations: {
      primary:
        locale === 'de'
          ? data.recommendations.map((rec) => ({
              ...rec,
              title: RECOMMENDATION_TITLES_DE[rec.title] ?? DEFAULT_HIGHLIGHT.de,
              category: RECOMMENDATION_CATEGORIES_DE[rec.category] ?? 'Allgemeine Strategie',
              body:
                RECOMMENDATION_BODIES_DE[rec.body] ?? 'Vertiefte Analyse empfohlen, um konkrete Handlungsschritte zu definieren.',
              impact: RECOMMENDATION_IMPACT_DE[rec.impact] ?? 'unbekannt',
            }))
          : data.recommendations,
    },
    locale,
  }
}
