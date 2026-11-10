import type { SimulationParams, SimulationResults } from '@/types'
import type { Recommendation } from '@/lib/pdf-generator/schema/reportData'
import { computeBridgeAnalysis, type BridgeUnit } from '@/lib/insights/bridge'
import { firstYearWithdrawalRate } from '@/lib/insights/ledger'

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

export type RecommendationOptions = {
  /**
   * Which euro derived amounts (the bridge need) are quoted in: the
   * dashboard's / report's Nominal / Heutige € choice. Ratios and plan inputs
   * are unit-free or already in today's euros and read the same either way.
   * Defaults to nominal, like the switch.
   */
  unit?: BridgeUnit
}

export function generateRecommendations(
  params: SimulationParams,
  results: SimulationResults,
  locale: RecommendationLocale = 'en',
  options: RecommendationOptions = {}
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
  const unit: BridgeUnit = options.unit ?? 'nominal'
  // Ages and amount from one definition: the retirement years before the main
  // pension pays, and what the ledger withdrew from the portfolio in them.
  const bridge = computeBridgeAnalysis(params, { unit, results })
  // The bridge need is the one derived amount quoted next to today's-euro
  // inputs, so it always says which euro it is in — the same words as the
  // unit captions on the dashboard.
  const bridgeUnit =
    unit === 'real'
      ? { en: " in today's euros", de: ' in heutiger Kaufkraft' }
      : { en: ' in nominal euros', de: ' in nominalen Euro' }
  // Results without a ledger cannot state the need; the advice then stands
  // without an amount rather than with an estimated one.
  const bridgeNeed = bridge.cashNeedEUR
  const pensionName =
    bridge.mainPension === 'statutory'
      ? { en: 'the statutory pension', de: 'der gesetzlichen Rente' }
      : { en: 'the main pension', de: 'der größten Rente' }
  const accumulationYears = Math.max(0, params.retirementAge - params.currentAge)

  // The first-year withdrawal rate as the engine booked it — the same figure
  // the report and the plan score print (see `firstYearWithdrawalRate`).
  const withdrawalRate = firstYearWithdrawalRate(params, results)

  // --- Outcome-driven levers -------------------------------------------------

  if (successRate < 75 && accumulationYears > 0) {
    const years = accumulationYears
    push('increaseSavings', successRate < 60 ? 'High' : 'Medium', {
      en: `${pct(successRate / 100, 1)} of runs stay funded. With ${years} saving ${years === 1 ? 'year' : 'years'} left, another 10–20% on top of the current ${eur(params.annualSavings)} a year is the lever with the shortest lead time.`,
      de: `${pct(successRate / 100, 1)} der Läufe bleiben finanziert. Bei ${years} verbleibenden Sparjahren wirken 10–20 % zusätzlich zu den derzeit ${eur(params.annualSavings)} pro Jahr am schnellsten.`,
    })
  }

  if (successRate < 85 && bridge.yearsInBridge > 0) {
    const years = bridge.yearsInBridge
    const need = {
      en:
        bridgeNeed === null
          ? ''
          : ` In those years the portfolio pays out ${eur(bridgeNeed)}${bridgeUnit.en}.`,
      de:
        bridgeNeed === null
          ? ''
          : ` In diesen Jahren zahlt das Depot ${eur(bridgeNeed)}${bridgeUnit.de} aus.`,
    }
    push('delayRetirement', successRate < 70 ? 'High' : 'Medium', {
      en: `Retiring at ${params.retirementAge} leaves ${years} ${years === 1 ? 'year' : 'years'} until ${pensionName.en} starts at ${bridge.pensionAge}.${need.en} Each extra working year shortens that stretch and adds a year of contributions.`,
      de: `Ein Ruhestand mit ${params.retirementAge} lässt ${years} ${years === 1 ? 'Jahr' : 'Jahre'} bis zum Beginn ${pensionName.de} mit ${bridge.pensionAge}.${need.de} Jedes zusätzliche Arbeitsjahr verkürzt diese Strecke und bringt ein weiteres Beitragsjahr.`,
    })
  }

  if (successRate >= 70 && successRate < 90) {
    push('optimizeMix', 'Medium', {
      en: `At ${pct(successRate / 100, 1)} the outcome turns on sequence risk, not on the average return. Review the balance between the ${pct(params.averageROI, 1)} growth assumption and stability — the allocation glide path models exactly that trade.`,
      de: `Bei ${pct(successRate / 100, 1)} entscheidet die Reihenfolge der Renditen, nicht der Durchschnitt. Es lohnt ein Blick auf die Balance zwischen der Renditeannahme von ${pct(params.averageROI, 1)} und Stabilität — genau das bildet der Gleitpfad ab.`,
    })
  }

  if (withdrawalRate !== null && withdrawalRate > 0.045) {
    push('reviewSpending', withdrawalRate > 0.06 ? 'High' : 'Medium', {
      en: `In the first retirement year ${pct(withdrawalRate, 1)} of the portfolio is withdrawn, tax on realised gains included. Above roughly 4.5% a plan is depending on a friendly first decade; the largest discretionary lines in the cash-flow list are where that rate falls fastest.`,
      de: `Im ersten Ruhestandsjahr werden ${pct(withdrawalRate, 1)} des Depots entnommen, Steuern auf realisierte Gewinne eingerechnet. Oberhalb von rund 4,5 % hängt der Plan an einem freundlichen ersten Jahrzehnt; die größten frei wählbaren Posten der Zahlungsliste senken die Quote am schnellsten.`,
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
      de: 'Der Plan rechnet ohne Sparerpauschbetrag. Er beträgt 1.000 € je Person (2.000 € bei Zusammenveranlagung) und wirkt nur mit einem Freistellungsauftrag bei der Bank — mit dem Betrag in der Steuerkarte zeigt die Projektion das tatsächliche Netto.',
    })
  } else if (typeof taxDrag === 'number' && taxDrag > 0.05) {
    push('taxAllowance', taxDrag > 0.12 ? 'High' : 'Medium', {
      en: `The median run loses ${pct(taxDrag, 1)} of every withdrawal to Abgeltungsteuer. Spread the Freistellungsauftrag across the accounts that actually realise gains, and realise them across calendar years so the ${eur(allowance)} allowance is used every year rather than once.`,
      de: `Im mittleren Lauf gehen ${pct(taxDrag, 1)} jeder Entnahme an die Abgeltungsteuer. Wird der Freistellungsauftrag auf die Depots verteilt, die tatsächlich Gewinne realisieren, und werden Gewinne über Kalenderjahre gestreckt, greifen die ${eur(allowance)} jedes Jahr statt nur einmal.`,
    })
  }

  if (params.equityFundExemption < 0.3) {
    push('equityFundExemption', params.equityFundExemption <= 0 ? 'Medium' : 'Low', {
      // § 2 Abs. 6 InvStG: an Aktienfonds holds *more than 50 %* in equities on
      // a continuous basis; § 20 Abs. 1 exempts 30 % of its gains.
      en: `The plan assumes a ${pct(params.equityFundExemption, 0)} Teilfreistellung. A fund that continuously holds more than 50% in equities (an Aktienfonds under the InvStG) carries 30%, which raises the after-tax return of the same gross return without changing the risk — worth checking what the current holdings qualify for.`,
      de: `Der Plan unterstellt ${pct(params.equityFundExemption, 0)} Teilfreistellung. Ein Fonds, der fortlaufend zu mehr als 50 % in Aktien investiert (Aktienfonds im Sinne des InvStG), trägt 30 % und hebt die Nachsteuerrendite bei gleicher Bruttorendite und gleichem Risiko — prüfenswert, was die aktuellen Positionen erfüllen.`,
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
    // "Entirely on the portfolio" would be false as soon as anything else
    // pays in those years; the amount is what the portfolio pays, no more.
    const span =
      bridge.startAge === bridge.endAge
        ? { en: `At age ${bridge.startAge}`, de: `Im Alter ${bridge.startAge}` }
        : {
            en: `From age ${bridge.startAge} to ${bridge.endAge}`,
            de: `Im Alter ${bridge.startAge}–${bridge.endAge}`,
          }
    const need = {
      en:
        bridgeNeed === null
          ? `${span.en}, before ${pensionName.en} starts, the portfolio carries the plan.`
          : `${span.en}, before ${pensionName.en} starts, the portfolio pays out ${eur(bridgeNeed)}${bridgeUnit.en}.`,
      de:
        bridgeNeed === null
          ? `${span.de}, vor Beginn ${pensionName.de}, trägt das Depot den Plan.`
          : `${span.de}, vor Beginn ${pensionName.de}, zahlt das Depot ${eur(bridgeNeed)}${bridgeUnit.de} aus.`,
    }
    push('bridgeLiquidity', bridge.yearsInBridge >= 5 ? 'Medium' : 'Low', {
      en: `${need.en} Holding the first of those years in something that cannot fall — call money, short-dated Bundesanleihen — removes the one scenario where a crash forces a sale at the worst moment.`,
      de: `${need.de} Die ersten dieser Jahre schwankungsfrei zu halten — Tagesgeld, kurz laufende Bundesanleihen — nimmt genau das Szenario heraus, in dem ein Crash den Verkauf zum schlechtesten Zeitpunkt erzwingt.`,
    })
  }

  // Ranked, so the PDF's "top actions" really are the strongest ones.
  const rank = { High: 0, Medium: 1, Low: 2 } as const
  return out.sort((a, b) => rank[a.impact] - rank[b.impact]).slice(0, 6)
}
