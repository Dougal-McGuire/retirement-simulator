import type { SimulationParams, SimulationResults } from '@/types'
import { pensionMonthlyAtAge } from '@/lib/simulation/cashFlows'
import type { Recommendation } from '@/lib/pdf-generator/schema/reportData'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import { computeBridgeAnalysis } from '@/lib/insights/bridge'

/**
 * Plan-derived recommendations for a **German** retirement plan.
 *
 * Every item here has to clear two bars:
 *
 *  1. It is derived from this plan's own numbers — a condition on the params or
 *     on the simulated outcome decides whether it appears at all, and its body
 *     quotes the figure that triggered it.
 *  2. It names something the reader can act on *in this market*:
 *     Sparerpauschbetrag and Freistellungsauftrag, Teilfreistellung on an
 *     equity fund, bAV/Rürup/Riester, the bridge to the statutory pension.
 *
 * Advice that could not clear both bars was removed rather than reworded.
 * "Maximise your tax-advantaged accounts" and "Review your insurance coverage"
 * were US retail-planning boilerplate: they appeared for every plan whatever it
 * said, carried an impact rank nothing computed, and flowed into the PDF as the
 * reader's top two actions.
 *
 * Text is produced in the caller's language rather than translated downstream,
 * because each body interpolates this plan's own figures — a lookup table keyed
 * on the English sentence could never have carried them.
 */

export type RecommendationId =
  | 'increaseSavings'
  | 'delayRetirement'
  | 'optimizeMix'
  | 'reviewSpending'
  | 'reduceVolatility'
  | 'taxAllowance'
  | 'equityFundExemption'
  | 'deferredCompensation'
  | 'bridgeLiquidity'

export type RecommendationLocale = 'en' | 'de'

export type PlanRecommendation = Recommendation & { id: RecommendationId }

export type RecommendationUplift = { title: string; upliftMin: number; upliftMax: number }

const HEADINGS: Record<RecommendationId, Record<RecommendationLocale, [string, string]>> = {
  increaseSavings: {
    en: ['Raise the savings rate', 'Savings Strategy'],
    de: ['Sparrate erhöhen', 'Sparstrategie'],
  },
  delayRetirement: {
    en: ['Retire later', 'Timing'],
    de: ['Später in den Ruhestand', 'Zeitplanung'],
  },
  optimizeMix: {
    en: ['Recalibrate the portfolio mix', 'Investment Strategy'],
    de: ['Portfolio-Mix nachjustieren', 'Investmentstrategie'],
  },
  reviewSpending: {
    en: ['Trim the spending plan', 'Expense Management'],
    de: ['Ausgabenplan straffen', 'Ausgabenmanagement'],
  },
  reduceVolatility: {
    en: ['Reduce late-stage volatility', 'Risk Management'],
    de: ['Schwankung vor Rentenbeginn senken', 'Risikomanagement'],
  },
  taxAllowance: {
    en: ['Use the Sparerpauschbetrag in full', 'Tax Planning'],
    de: ['Sparerpauschbetrag voll ausschöpfen', 'Steuerplanung'],
  },
  equityFundExemption: {
    en: ['Claim the equity-fund Teilfreistellung', 'Tax Planning'],
    de: ['Teilfreistellung für Aktienfonds nutzen', 'Steuerplanung'],
  },
  deferredCompensation: {
    en: ['Check bAV, Rürup and Riester while still earning', 'Tax Planning'],
    de: ['bAV, Rürup und Riester prüfen, solange Einkommen fließt', 'Steuerplanung'],
  },
  bridgeLiquidity: {
    en: ['Fund the pension bridge in cash', 'Liquidity'],
    de: ['Überbrückung liquide vorhalten', 'Liquidität'],
  },
}

const localeTag = (locale: RecommendationLocale) => (locale === 'de' ? 'de-DE' : 'en-US')

export function generateRecommendations(
  params: SimulationParams,
  results: SimulationResults,
  locale: RecommendationLocale = 'en'
): PlanRecommendation[] {
  const tag = localeTag(locale)
  const de = locale === 'de'
  const pct = (value: number, digits = 0) =>
    new Intl.NumberFormat(tag, {
      style: 'percent',
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(value)
  const eur = (value: number) =>
    new Intl.NumberFormat(tag, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
    }).format(Math.round(value))

  const out: PlanRecommendation[] = []
  const push = (
    id: RecommendationId,
    impact: Recommendation['impact'],
    bodies: Record<RecommendationLocale, string>
  ) => {
    const [title, category] = HEADINGS[id][locale]
    out.push({ id, title, category, impact, body: bodies[locale] })
  }

  const successRate = results.successRate
  const bridge = computeBridgeAnalysis(params)
  const accumulationYears = Math.max(0, params.retirementAge - params.currentAge)

  // First retirement year: what the portfolio alone has to deliver, over what
  // the median run holds at that point.
  const annualSpend = calculateCombinedExpenses(params.customExpenses).combinedAnnual
  const pensionAtRetirement =
    pensionMonthlyAtAge(params.cashFlows ?? [], params.retirementAge, params.legalRetirementAge)
      .total * 12
  const retirementAssets =
    results.assetPercentiles.p50[Math.max(0, params.retirementAge - params.currentAge)] ?? 0
  const withdrawalRate =
    retirementAssets > 0 ? Math.max(0, annualSpend - pensionAtRetirement) / retirementAssets : 0

  // --- Outcome-driven levers -------------------------------------------------

  if (successRate < 75 && accumulationYears > 0) {
    const years = accumulationYears
    push('increaseSavings', successRate < 60 ? 'High' : 'Medium', {
      en: `${pct(successRate / 100, 1)} of runs stay funded. With ${years} saving ${years === 1 ? 'year' : 'years'} left, another 10–20% on top of the current ${eur(params.annualSavings)} a year is the lever with the shortest lead time.`,
      de: `${pct(successRate / 100, 1)} der Läufe bleiben finanziert. Bei ${years} verbleibenden Sparjahren wirken 10–20 % zusätzlich zu den derzeit ${eur(params.annualSavings)} pro Jahr am schnellsten.`,
    })
  }

  if (successRate < 85 && bridge.yearsInBridge > 0) {
    push('delayRetirement', successRate < 70 ? 'High' : 'Medium', {
      en: `Retiring at ${params.retirementAge} opens a ${bridge.yearsInBridge}-year gap to the first pension at ${bridge.pensionAge}, worth ${eur(bridge.cashNeedEUR)} of spending the portfolio carries alone. Each extra working year shortens that gap and adds a year of contributions.`,
      de: `Ein Ruhestand mit ${params.retirementAge} öffnet ${bridge.yearsInBridge} Jahre bis zur ersten Rente mit ${bridge.pensionAge} — ${eur(bridge.cashNeedEUR)} Ausgaben, die allein das Depot trägt. Jedes zusätzliche Arbeitsjahr verkürzt die Lücke und bringt ein weiteres Beitragsjahr.`,
    })
  }

  if (successRate >= 70 && successRate < 90) {
    push('optimizeMix', 'Medium', {
      en: `At ${pct(successRate / 100, 1)} the outcome turns on sequence risk, not on the average return. Review the balance between the ${pct(params.averageROI, 1)} growth assumption and stability — the allocation glide path models exactly that trade.`,
      de: `Bei ${pct(successRate / 100, 1)} entscheidet die Reihenfolge der Renditen, nicht der Durchschnitt. Prüfen Sie die Balance zwischen der Renditeannahme von ${pct(params.averageROI, 1)} und Stabilität — genau das bildet der Gleitpfad ab.`,
    })
  }

  if (withdrawalRate > 0.045) {
    push('reviewSpending', withdrawalRate > 0.06 ? 'High' : 'Medium', {
      en: `The first retirement year needs ${pct(withdrawalRate, 1)} of the portfolio. Above roughly 4.5% a plan is depending on a friendly first decade; the largest discretionary lines in the cash-flow list are where that rate falls fastest.`,
      de: `Das erste Ruhestandsjahr benötigt ${pct(withdrawalRate, 1)} des Depots. Oberhalb von rund 4,5 % hängt der Plan an einem freundlichen ersten Jahrzehnt; die größten frei wählbaren Posten der Zahlungsliste senken die Quote am schnellsten.`,
    })
  }

  if (params.roiVolatility > 0.18 && !params.glidePathEnabled) {
    push('reduceVolatility', 'Medium', {
      en: `The plan assumes ${pct(params.roiVolatility, 0)} volatility at a fixed allocation. Sliding towards bonds as retirement approaches limits what a bad first decade can cost — one click switches the glide path on.`,
      de: `Der Plan rechnet mit ${pct(params.roiVolatility, 0)} Schwankung bei fester Aufteilung. Ein Gleiten in Anleihen bis zum Ruhestand begrenzt, was ein schwaches erstes Jahrzehnt kostet — ein Klick schaltet den Gleitpfad ein.`,
    })
  }

  // --- German tax levers, each conditional on this plan's own settings --------

  const allowance = params.taxAllowanceAnnual * (params.householdType === 'couple' ? 2 : 1)
  const taxDrag = results.withdrawalTaxDrag

  if (allowance <= 0) {
    push('taxAllowance', 'Medium', {
      en: 'This plan is modelled with no Sparerpauschbetrag at all. The allowance is €1,000 per person (€2,000 jointly assessed) and only reaches you where a Freistellungsauftrag is on file with the bank — set it in the tax card so the projection reflects what you actually keep.',
      de: 'Der Plan rechnet ohne Sparerpauschbetrag. Er beträgt 1.000 € je Person (2.000 € bei Zusammenveranlagung) und wirkt nur mit einem Freistellungsauftrag bei der Bank — tragen Sie ihn in der Steuerkarte ein, damit die Projektion Ihr Netto zeigt.',
    })
  } else if (typeof taxDrag === 'number' && taxDrag > 0.05) {
    push('taxAllowance', taxDrag > 0.12 ? 'High' : 'Medium', {
      en: `The median run loses ${pct(taxDrag, 1)} of every withdrawal to Abgeltungsteuer. Spread the Freistellungsauftrag across the accounts that actually realise gains, and realise them across calendar years so the ${eur(allowance)} allowance is used every year rather than once.`,
      de: `Im mittleren Lauf gehen ${pct(taxDrag, 1)} jeder Entnahme an die Abgeltungsteuer. Verteilen Sie den Freistellungsauftrag auf die Depots, die tatsächlich Gewinne realisieren, und realisieren Sie über Kalenderjahre verteilt, damit die ${eur(allowance)} jedes Jahr genutzt werden.`,
    })
  }

  if (params.equityFundExemption < 0.3) {
    push('equityFundExemption', params.equityFundExemption <= 0 ? 'Medium' : 'Low', {
      en: `The plan assumes a ${pct(params.equityFundExemption, 0)} Teilfreistellung. A fund holding more than 51% equity carries 30%, which raises the after-tax return of the same gross return without changing the risk — worth checking what the current holdings qualify for.`,
      de: `Der Plan unterstellt ${pct(params.equityFundExemption, 0)} Teilfreistellung. Ein Fonds mit über 51 % Aktienquote trägt 30 % und hebt die Nachsteuerrendite bei gleicher Bruttorendite und gleichem Risiko — prüfenswert, was die aktuellen Positionen erfüllen.`,
    })
  }

  // Deferred compensation only makes sense while earned income is still being
  // set aside; after retirement the advice is inert.
  if (accumulationYears > 0 && params.annualSavings > 0) {
    const years = accumulationYears
    push('deferredCompensation', 'Low', {
      en: `${eur(params.annualSavings)} a year is saved out of taxed income for ${years} more ${years === 1 ? 'year' : 'years'}. Betriebliche Altersvorsorge and Rürup deduct contributions now and tax the payout later, and Riester adds the Zulagen where children or a modest income make it pay — the trade is today's marginal rate against tomorrow's, plus the loss of flexibility.`,
      de: `${eur(params.annualSavings)} pro Jahr werden noch ${years} ${years === 1 ? 'Jahr' : 'Jahre'} aus versteuertem Einkommen gespart. Betriebliche Altersvorsorge und Rürup mindern heute die Steuerlast und besteuern nachgelagert, Riester bringt Zulagen, wo Kinder oder ein kleineres Einkommen es lohnend machen — abzuwägen ist der heutige Grenzsteuersatz gegen den späteren, plus der Verlust an Flexibilität.`,
    })
  }

  // --- Liquidity -------------------------------------------------------------

  if (bridge.yearsInBridge > 0) {
    push('bridgeLiquidity', bridge.yearsInBridge >= 5 ? 'Medium' : 'Low', {
      en: `Ages ${bridge.startAge}–${bridge.endAge} run entirely on the portfolio: ${eur(bridge.cashNeedEUR)} before the statutory pension starts. Holding the first of those years in something that cannot fall — call money, short-dated Bundesanleihen — removes the one scenario where a crash forces a sale at the worst moment.`,
      de: `Die Jahre ${bridge.startAge}–${bridge.endAge} laufen allein über das Depot: ${eur(bridge.cashNeedEUR)} bis zum Beginn der gesetzlichen Rente. Die ersten dieser Jahre schwankungsfrei zu halten — Tagesgeld, kurz laufende Bundesanleihen — nimmt genau das Szenario heraus, in dem ein Crash den Verkauf zum schlechtesten Zeitpunkt erzwingt.`,
    })
  }

  // Ranked, so the PDF's "top actions" really are the strongest ones.
  const rank = { High: 0, Medium: 1, Low: 2 } as const
  return out.sort((a, b) => rank[a.impact] - rank[b.impact]).slice(0, 6)
}

/**
 * Rough uplift range, in success-rate points, for the levers the app can put a
 * defensible number on. Everything else returns `null` and is shown without a
 * figure rather than with an invented one.
 */
export function estimateRecommendationUplift(
  recommendation: Recommendation,
  params: SimulationParams,
  results: SimulationResults
): RecommendationUplift | null {
  const successGap = Math.max(0, 85 - results.successRate)
  const clampUplift = (value: number) => Math.max(1, Math.min(20, Math.round(value)))
  const id = recommendation.id as RecommendationId | undefined

  if (id === 'increaseSavings') {
    const yearlySavingsMonths = params.annualSavings / 12
    const min = clampUplift(successGap * 0.35 + Math.min(4, yearlySavingsMonths / 1000))
    return { title: recommendation.title, upliftMin: min, upliftMax: clampUplift(min + 4) }
  }

  if (id === 'optimizeMix') {
    const min = clampUplift(successGap * 0.2 + params.roiVolatility * 12)
    return { title: recommendation.title, upliftMin: min, upliftMax: clampUplift(min + 3) }
  }

  if (id === 'delayRetirement') {
    const bridgeYears = Math.max(0, params.legalRetirementAge - params.retirementAge)
    const min = clampUplift(successGap * 0.28 + bridgeYears * 1.5)
    return { title: recommendation.title, upliftMin: min, upliftMax: clampUplift(min + 5) }
  }

  if (id === 'reviewSpending') {
    const monthlyExpenseLoad = params.customExpenses.reduce((sum, expense) => {
      return sum + (expense.interval === 'monthly' ? expense.amount : expense.amount / 12)
    }, 0)
    const min = clampUplift(successGap * 0.18 + monthlyExpenseLoad / 3000)
    return { title: recommendation.title, upliftMin: min, upliftMax: clampUplift(min + 3) }
  }

  return null
}
