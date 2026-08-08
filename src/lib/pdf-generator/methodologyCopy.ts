import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { fmtCurrency, fmtNumber, fmtPercent } from '@/lib/pdf-generator/formatters'
import {
  withdrawalStrategyLabel,
  withdrawalStrategySummary,
} from '@/lib/pdf-generator/withdrawalStrategy'

/**
 * Every sentence in the report that describes *how the number was produced*.
 *
 * Pulled out of the appendix component so it can be asserted on directly: this
 * is the copy that used to call a 125-path historical backtest "a Monte Carlo
 * simulation with 500 independent runs" and claim allowances were not modelled
 * while the assumptions table listed them.
 */
export interface MethodologyCopy {
  /** The "Methodology" paragraph, describing the model that actually ran. */
  methodology: string
  /** Glossary entry for the success rate, matching the success definition. */
  successRate: string
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
   */
  const successRate = isGerman
    ? legacyConditioned
      ? `Anteil der Läufe, in denen das Vermögen bis Alter ${profile.person.horizonAge} reicht UND am Ende mindestens ${money(simulation.legacyTargetReal)} in heutiger Kaufkraft übrig bleiben: ${pct(simulation.successRate)}. Ohne Nachlassziel, also reines Überleben des Kapitals: ${pct(simulation.depletionSuccessRate)}.`
      : `Anteil der Läufe, in denen das Vermögen bis Alter ${profile.person.horizonAge} nicht aufgebraucht ist (reines Überleben des Kapitals — dieser Plan hat kein Nachlassziel): ${pct(simulation.successRate)}.`
    : legacyConditioned
      ? `Share of runs in which capital lasts to age ${profile.person.horizonAge} AND at least ${money(simulation.legacyTargetReal)} in today's euros is left at the end: ${pct(simulation.successRate)}. Without the bequest goal — plain survival of the capital — the figure is ${pct(simulation.depletionSuccessRate)}.`
      : `Share of runs in which capital is not exhausted before age ${profile.person.horizonAge} (plain survival — this plan sets no bequest goal): ${pct(simulation.successRate)}.`

  const strategyClause = isGerman
    ? `In der Entnahmephase kommt die Strategie „${withdrawalStrategyLabel(assumptions.withdrawalStrategy, true)}“ zur Anwendung — ${withdrawalStrategySummary(assumptions.withdrawalStrategy, true)}`
    : `The drawdown phase applies the "${withdrawalStrategyLabel(assumptions.withdrawalStrategy, false)}" strategy — ${withdrawalStrategySummary(assumptions.withdrawalStrategy, false)}`

  /**
   * Under the historical model there is no lognormal draw and no Monte Carlo:
   * the engine replays a real series once per available start year, and the
   * ROI / volatility / inflation assumptions printed elsewhere are unused.
   */
  const methodology = isHistorical
    ? isGerman
      ? `Die Analyse ist ein historischer Backtest: keine Zufallsziehung, sondern ${runsLabel} Durchläufe der tatsächlichen Marktgeschichte ${simulation.historicalFirstYear}–${simulation.historicalLastYear} — einer je möglichem Startjahr. Jeder Pfad übernimmt Aktien-, Anleihe- und Inflationsentwicklung dieser Jahre in ihrer echten Reihenfolge; die oben genannten Rendite-, Volatilitäts- und Inflationsannahmen werden in diesem Modus nicht verwendet. Das Ergebnis ist deterministisch: dieselben Eingaben liefern denselben Wert. ${strategyClause} Kapitalerträge werden mit ${capGains} besteuert (Details unter „Grenzen des Modells“).`
      : `This analysis is a historical backtest: no random draws, but ${runsLabel} replays of real market history from ${simulation.historicalFirstYear} to ${simulation.historicalLastYear} — one per available start year. Each path takes the equity, bond and inflation outcomes of those years in their actual order; the return, volatility and inflation assumptions quoted elsewhere are not used in this mode. The result is deterministic: identical inputs give an identical figure. ${strategyClause} Capital gains are taxed at ${capGains} (details under "Limits of the Model").`
    : isGerman
      ? `Die Analyse basiert auf einer Monte-Carlo-Simulation mit ${runsLabel} Läufen. Marktrenditen werden als lognormalverteilte Zufallsgrößen mit einem Erwartungswert von ${fmtPercent(assumptions.expectedReturn, 1, intlLocale)} p.a. und einer Volatilität von ${fmtPercent(assumptions.returnVolatility, 1, intlLocale)} modelliert; die Inflation folgt einem Erwartungswert von ${fmtPercent(assumptions.inflation, 1, intlLocale)} bei ${fmtPercent(assumptions.inflationVolatility, 1, intlLocale)} Volatilität. Die Pfade stammen aus einem festen Zufallsstrom (${simulation.seedLabel || 'fester Startwert'}), damit Parameteränderungen vergleichbar bleiben. ${strategyClause} Kapitalerträge werden mit ${capGains} besteuert (Details unter „Grenzen des Modells“).`
      : `The analysis is based on a Monte Carlo simulation with ${runsLabel} runs. Market returns are modelled as lognormally distributed random variables with an expected value of ${fmtPercent(assumptions.expectedReturn, 1, intlLocale)} p.a. and a volatility of ${fmtPercent(assumptions.returnVolatility, 1, intlLocale)}; inflation follows an expected value of ${fmtPercent(assumptions.inflation, 1, intlLocale)} with ${fmtPercent(assumptions.inflationVolatility, 1, intlLocale)} volatility. Paths come from one fixed random stream (${simulation.seedLabel || 'fixed seed'}) so that parameter changes stay comparable. ${strategyClause} Capital gains are taxed at ${capGains} (details under "Limits of the Model").`

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
  const pensionTax =
    assumptions.pensionTaxablePortion > 0 && assumptions.pensionTaxRate > 0
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

  const limitations = isGerman
    ? [
        marketLimitation,
        taxLimitation,
        'Die Rentenhöhe wird nominal fortgeschrieben; abweichende Rentenanpassungen ändern die Ergebnisse.',
        'Ausgaben werden mit der Inflationsannahme fortgeschrieben; Pflegekosten oder einmalige Sonderausgaben sind nur enthalten, soweit sie erfasst wurden.',
      ]
    : [
        marketLimitation,
        taxLimitation,
        'The pension is carried forward in nominal terms; different indexation would change the outcome.',
        'Spending is indexed with the inflation assumption; care costs and one-off items are only included where they were entered.',
      ]

  return { methodology, successRate, limitations }
}
