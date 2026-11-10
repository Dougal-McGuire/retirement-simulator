import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { allPensionsSwitchedOff } from '@/lib/pdf-generator/pensionSwitch'
import { fmtCurrency, fmtNumber, fmtPercent } from '@/lib/pdf-generator/formatters'
import {
  withdrawalStrategyLabel,
  withdrawalStrategySummary,
} from '@/lib/pdf-generator/withdrawalStrategy'
import { buildEuroUnitCopy } from '@/lib/pdf-generator/euroUnitCopy'
import { planScoreGlossary } from '@/lib/pdf-generator/planScoreCopy'

/**
 * A year counts as funded while its shortfall stays within this share of the
 * spending the plan asked for — the engine's `UNFUNDED_SPENDING_TOLERANCE`
 * (`src/lib/simulation/engine.ts`), which the success rate and the depletion
 * data are counted with. Mirrored rather than imported: the report's glossary
 * quotes it, and importing it would pull the whole engine into the report
 * worker's bundle. `methodologyCopy.test.ts` fails if the two ever differ.
 */
export const UNFUNDED_SPENDING_TOLERANCE = 0.01

/**
 * Every sentence in the report that describes *how the number was produced*.
 *
 * Pulled out of the appendix component so it can be asserted on directly: this
 * is the copy that used to call a 125-path historical backtest "a Monte Carlo
 * simulation with 500 independent runs" and claim allowances were not modelled
 * while the assumptions table listed them.
 */
export interface MethodologyCopy {
  /**
   * The "Methodology" paragraph, describing the model that actually ran and
   * which euro its figures are printed in.
   */
  methodology: string
  /** The euro-unit part of `methodology` on its own (nominal vs. deflated). */
  units: string
  /** Glossary entry for the success rate, matching the success definition. */
  successRate: string
  /** Glossary entry for the plan score, with the weights actually applied. */
  planScore: string
  /**
   * Glossary entry for the withdrawal rate — the wording of
   * `firstYearWithdrawalRate`, the one definition every surface uses.
   */
  withdrawalRate: string
  /** Glossary entry for the bridge phase — the wording of `computeBridgeAnalysis`. */
  bridge: string
  /** "Limits of the model" bullets, in print order. */
  limitations: string[]
}

export function buildMethodologyCopy(content: ReportContent): MethodologyCopy {
  const { assumptions, profile, simulation } = content
  const isGerman = content.locale !== 'en'
  const intlLocale = content.locale === 'en' ? 'en-US' : 'de-DE'
  const isHistorical = simulation.marketModel === 'historical'
  const legacyConditioned = simulation.successDefinition === 'legacyConditioned'
  const runsLabel = fmtNumber(simulation.effectiveRuns, { locale: intlLocale })
  const pct = (share: number) => fmtPercent(share, 1, intlLocale)
  const money = (value: number) => fmtCurrency(value, intlLocale)
  const capGains = fmtPercent(assumptions.capitalGainsTax / 100, 1, intlLocale)

  /**
   * The success-rate entry has to state which question the headline number
   * answers. With a bequest goal active it answers a strictly harder one, so
   * both numbers are printed with their own labels rather than one ambiguous
   * "share of successful runs".
   *
   * A run succeeds when every year's spending was paid — by income and
   * portfolio together. That is the engine's definition; a portfolio at zero
   * is not a failure while pensions and income pay the budget, so the entry
   * does not speak of capital "surviving".
   */
  const tolerance = fmtPercent(UNFUNDED_SPENDING_TOLERANCE, 0, intlLocale)
  const funded = isGerman
    ? `die Ausgaben bis Alter ${profile.person.horizonAge} in jedem Jahr gedeckt sind — aus Einnahmen und Depot zusammen; eine Lücke bis ${tolerance} der Jahresausgaben gilt noch als gedeckt`
    : `every year's spending to age ${profile.person.horizonAge} is funded — by income and portfolio together; a gap of up to ${tolerance} of a year's spending still counts as funded`
  const successRate = isGerman
    ? legacyConditioned
      ? `Anteil der Läufe, in denen ${funded} UND am Ende mindestens ${money(simulation.legacyTargetReal)} in heutiger Kaufkraft übrig bleiben: ${pct(simulation.successRate)}. Ohne Nachlassziel: ${pct(simulation.depletionSuccessRate)}.`
      : `Anteil der Läufe, in denen ${funded}: ${pct(simulation.successRate)}. Dieser Plan hat kein Nachlassziel.`
    : legacyConditioned
      ? `Share of runs in which ${funded} AND at least ${money(simulation.legacyTargetReal)} in today's euros is left at the end: ${pct(simulation.successRate)}. Without the bequest goal the figure is ${pct(simulation.depletionSuccessRate)}.`
      : `Share of runs in which ${funded}: ${pct(simulation.successRate)}. This plan sets no bequest goal.`

  const strategyClause = isGerman
    ? `In der Entnahmephase kommt die Strategie „${withdrawalStrategyLabel(assumptions.withdrawalStrategy, true)}“ zur Anwendung — ${withdrawalStrategySummary(assumptions.withdrawalStrategy, true)}`
    : `The drawdown phase applies the "${withdrawalStrategyLabel(assumptions.withdrawalStrategy, false)}" strategy — ${withdrawalStrategySummary(assumptions.withdrawalStrategy, false)}`

  /**
   * Under the historical model there is no lognormal draw and no Monte Carlo:
   * the engine replays a real series once per available start year, and the
   * ROI / volatility / inflation assumptions printed elsewhere are unused.
   */
  const modelText = isHistorical
    ? isGerman
      ? `Die Analyse ist ein historischer Backtest: keine Zufallsziehung, sondern ${runsLabel} Durchläufe der tatsächlichen Marktgeschichte ${simulation.historicalFirstYear}–${simulation.historicalLastYear} — einer je möglichem Startjahr. Jeder Pfad übernimmt Aktien-, Anleihe- und Inflationsentwicklung dieser Jahre in ihrer echten Reihenfolge; die oben genannten Rendite-, Volatilitäts- und Inflationsannahmen werden in diesem Modus nicht verwendet. Das Ergebnis ist deterministisch: dieselben Eingaben liefern denselben Wert. ${strategyClause} Zur Besteuerung siehe „Grenzen des Modells“.`
      : `This analysis is a historical backtest: no random draws, but ${runsLabel} replays of real market history from ${simulation.historicalFirstYear} to ${simulation.historicalLastYear} — one per available start year. Each path takes the equity, bond and inflation outcomes of those years in their actual order; the return, volatility and inflation assumptions quoted elsewhere are not used in this mode. The result is deterministic: identical inputs give an identical figure. ${strategyClause} For taxes see "Limits of the Model".`
    : isGerman
      ? `Die Analyse basiert auf einer Monte-Carlo-Simulation mit ${runsLabel} Läufen. Marktrenditen werden als lognormalverteilte Zufallsgrößen mit einem Erwartungswert von ${fmtPercent(assumptions.expectedReturn, 1, intlLocale)} p.a. und einer Volatilität von ${fmtPercent(assumptions.returnVolatility, 1, intlLocale)} modelliert; die Inflation folgt einem Erwartungswert von ${fmtPercent(assumptions.inflation, 1, intlLocale)} bei ${fmtPercent(assumptions.inflationVolatility, 1, intlLocale)} Volatilität. Die Pfade stammen aus einem festen Zufallsstrom (${simulation.seedLabel || 'fester Startwert'}), damit Parameteränderungen vergleichbar bleiben. ${strategyClause} Zur Besteuerung siehe „Grenzen des Modells“.`
      : `The analysis is based on a Monte Carlo simulation with ${runsLabel} runs. Market returns are modelled as lognormally distributed random variables with an expected value of ${fmtPercent(assumptions.expectedReturn, 1, intlLocale)} p.a. and a volatility of ${fmtPercent(assumptions.returnVolatility, 1, intlLocale)}; inflation follows an expected value of ${fmtPercent(assumptions.inflation, 1, intlLocale)} with ${fmtPercent(assumptions.inflationVolatility, 1, intlLocale)} volatility. Paths come from one fixed random stream (${simulation.seedLabel || 'fixed seed'}) so that parameter changes stay comparable. ${strategyClause} For taxes see "Limits of the Model".`

  // How the printed euros relate to the simulated ones — per-path deflation in
  // real mode, exactly as the app does it.
  const units = buildEuroUnitCopy(content.units, content.locale).methodology
  const methodology = `${modelText} ${units}`

  /**
   * What the tax model really does. The old wording ("taxes are applied as a
   * flat rate; allowances and partial exemptions are not modelled") contradicted
   * the assumptions table two pages earlier, which lists exactly those figures —
   * so it is assembled from the parameters that were actually in force.
   */
  const taxParts: string[] = [
    isGerman
      ? `Kapitalerträge werden bei Realisierung mit ${capGains} besteuert`
      : `Capital gains are taxed on realisation at ${capGains}`,
  ]
  if (assumptions.taxAllowance > 0) {
    taxParts.push(
      isGerman
        ? `nach Abzug des Sparerpauschbetrags von ${money(assumptions.taxAllowance)} p.a. (${assumptions.householdType === 'couple' ? 'zusammenveranlagt' : 'einzelveranlagt'})`
        : `after the ${money(assumptions.taxAllowance)} annual Sparerpauschbetrag (${assumptions.householdType === 'couple' ? 'jointly assessed' : 'single'})`
    )
  }
  if (assumptions.equityFundExemption > 0) {
    taxParts.push(
      isGerman
        ? `und einer Teilfreistellung von ${fmtPercent(assumptions.equityFundExemption, 0, intlLocale)}`
        : `and a ${fmtPercent(assumptions.equityFundExemption, 0, intlLocale)} Teilfreistellung`
    )
  }
  // A switched-off pension is in no figure: its taxation is not described.
  const pensionTax = allPensionsSwitchedOff(content.expenses)
    ? ''
    : assumptions.pensionTaxablePortion > 0 && assumptions.pensionTaxRate > 0
      ? isGerman
        ? ` Die gesetzliche Rente wird zu ${fmtPercent(assumptions.pensionTaxablePortion, 0, intlLocale)} als steuerpflichtig behandelt und mit ${fmtPercent(assumptions.pensionTaxRate, 0, intlLocale)} belastet.`
        : ` The state pension is treated as ${fmtPercent(assumptions.pensionTaxablePortion, 0, intlLocale)} taxable and charged at ${fmtPercent(assumptions.pensionTaxRate, 0, intlLocale)}.`
      : isGerman
        ? ' Die gesetzliche Rente wird in diesem Plan nicht besteuert.'
        : ' The state pension is left untaxed in this plan.'
  const taxMissing = isGerman
    ? ' Progression, Kirchensteuer und Vorabpauschale bleiben unberücksichtigt.'
    : ' Progressive rates, church tax and the Vorabpauschale are not modelled.'
  const taxLimitation = `${taxParts.join(', ')}.${pensionTax}${taxMissing}`

  const marketLimitation = isHistorical
    ? isGerman
      ? `Die ${runsLabel} Pfade sind überlappende Ausschnitte einer einzigen Geschichte (${simulation.historicalFirstYear}–${simulation.historicalLastYear}) und damit nicht unabhängig; reicht ein Pfad über das Ende der Reihe hinaus, wird sie zyklisch fortgesetzt.`
      : `The ${runsLabel} paths are overlapping windows on one single history (${simulation.historicalFirstYear}–${simulation.historicalLastYear}) and are therefore not independent; a path that outruns the record wraps back to its start.`
    : isGerman
      ? 'Renditen und Inflation werden als unabhängig gezogen; historische Autokorrelation und Sequenzrisiken im Übergangsjahr werden nicht nachgebildet.'
      : 'Returns and inflation are drawn independently; historical autocorrelation and sequence-of-returns effects around the transition year are not reproduced.'

  // The engine tracks gains only from the plan's first year: whatever is in
  // the portfolio today counts as cost basis. A long-held portfolio therefore
  // pays more tax on its first withdrawals than the simulation books.
  const costBasisLimitation = isGerman
    ? 'Für das heutige Depot werden keine unrealisierten Kursgewinne unterstellt (der eingegebene Bestand gilt als Anschaffungswert); enthält es bereits Gewinne, fällt die Steuer auf frühe Entnahmen höher aus als berechnet.'
    : "Today's portfolio is assumed to carry no unrealised gains (the capital entered counts as cost basis); where it already holds gains, the tax on early withdrawals is higher than calculated."

  const limitations = isGerman
    ? [
        marketLimitation,
        taxLimitation,
        costBasisLimitation,
        'Die Rentenhöhe wird nominal fortgeschrieben; abweichende Rentenanpassungen ändern die Ergebnisse.',
        'Ausgaben folgen der Inflationsannahme; Pflegekosten oder einmalige Sonderausgaben sind nur enthalten, soweit sie erfasst wurden.',
      ]
    : [
        marketLimitation,
        taxLimitation,
        costBasisLimitation,
        'The pension is carried forward in nominal terms; different indexation would change the outcome.',
        'Spending is indexed with the inflation assumption; care costs and one-off items are only included where they were entered.',
      ]

  const pathsWord = isHistorical
    ? isGerman
      ? 'Startjahre'
      : 'start years'
    : isGerman
      ? 'Läufe'
      : 'runs'
  // One definition, one wording — see `firstYearWithdrawalRate`.
  const withdrawalRate = isGerman
    ? `Was das Depot im ersten Ruhestandsjahr auszahlt (nach Renten und anderen Einnahmen, einschließlich der Steuern auf realisierte Kursgewinne), geteilt durch das Depot zu Beginn dieses Jahres; beides Mittelwerte über alle ${pathsWord}.`
    : `What the portfolio pays out in the first retirement year (after pensions and other income, including the tax on realised gains), divided by the portfolio at the start of that year; both means across all ${pathsWord}.`
  // One definition, one wording — see `computeBridgeAnalysis`.
  const bridge = isGerman
    ? `Die Ruhestandsjahre vor Beginn der Hauptrente (der gesetzlichen Rente, sofern der Plan sie berücksichtigt, sonst der größten Rente). Der Überbrückungsbedarf ist die Summe dessen, was das Depot in diesen Jahren auszahlt, im Mittel der ${pathsWord}; andere Einnahmen sind bereits abgezogen.`
    : `The retirement years before the main pension starts (the statutory pension where the plan counts it, otherwise the largest pension). The bridge need is the sum of what the portfolio pays out in those years, as the mean across ${pathsWord}; other income is already netted.`
  const planScore = planScoreGlossary(profile.success.components, isGerman ? 'de' : 'en')

  return { methodology, units, successRate, planScore, withdrawalRate, bridge, limitations }
}
