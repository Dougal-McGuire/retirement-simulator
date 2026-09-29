import type { ReportEuroUnit } from '@/lib/pdf-generator/euroUnit'
import type { ReportLocale } from '@/lib/pdf-generator/schema/reportData'

/**
 * Every sentence and caption that names the report's euro unit, from one place
 * so the cover, the charts, the tables and the methodology can never disagree.
 * German copy is formal ("Sie"), like the rest of the report.
 */
export interface EuroUnitCopy {
  /** Short tag for captions and table titles: "heutige Kaufkraft" / "nominal". */
  tag: string
  /** Shortest form, for narrow captions (cover tiles). */
  short: string
  /** Unit caption printed on charts. */
  chart: string
  /** One-paragraph statement for the cover and the summary. */
  statement: string
  /** Methodology sentence(s) explaining how the figures were expressed. */
  methodology: string
  /** Qualifier for growth percentages: "nominal" / "real". */
  growth: string
  /** Suffix for a derived amount like the bridge need; empty when nominal. */
  amountQualifier: string
}

export function buildEuroUnitCopy(unit: ReportEuroUnit, locale: ReportLocale): EuroUnitCopy {
  const de = locale !== 'en'
  const real = unit.applied === 'real'
  const approximated = real && unit.realMethod === 'medianIndex'
  const unavailable = unit.requested === 'real' && !real

  const tag = real ? (de ? 'heutige Kaufkraft' : "today's purchasing power") : 'nominal'
  const inputsNote = de
    ? 'Eingaben wie Sparleistung, Ausgaben und Rente sind in heutigen Beträgen angegeben.'
    : "Inputs such as savings, spending and pension are stated in today's euros."

  let statement: string
  let methodology: string

  if (real && !approximated) {
    statement = de
      ? `Alle Beträge in heutiger Kaufkraft (inflationsbereinigt). Projizierte Vermögenswerte sind je Simulationspfad um die dort simulierte Inflation bereinigt. ${inputsNote}`
      : `All amounts in today's purchasing power (inflation-adjusted). Projected assets are deflated by the inflation simulated on each path. ${inputsNote}`
    methodology = de
      ? 'Beträge in heutiger Kaufkraft: Jeder Pfad wird mit seiner eigenen realisierten Inflation auf das Preisniveau des ersten Planjahres abgezinst, bevor die Perzentile gebildet werden — dieselbe Rechnung wie in der App. P10, P50 und P90 sind damit echte Perzentile der realen Verteilung, nicht das nominale Band geteilt durch eine Durchschnittsinflation.'
      : "Amounts in today's purchasing power: each path is deflated by its own realised inflation to the price level of the plan's first year before percentiles are taken — the same calculation as in the app. P10, P50 and P90 are therefore true percentiles of the real distribution, not the nominal band divided by an average inflation rate."
  } else if (approximated) {
    statement = de
      ? `Alle Beträge in heutiger Kaufkraft (inflationsbereinigt, näherungsweise über die mittlere Preisentwicklung umgerechnet). ${inputsNote}`
      : `All amounts in today's purchasing power (inflation-adjusted, approximated via the median price level). ${inputsNote}`
    methodology = de
      ? 'Beträge in heutiger Kaufkraft: Für diese gespeicherten Ergebnisse liegen keine pfadweise bereinigten Reihen vor. Die nominalen Perzentile wurden daher je Alter durch den mittleren realisierten Preisindex geteilt — eine Näherung, die Pfade mit besonders hoher oder niedriger Inflation nicht einzeln bereinigt. Eine erneute Simulation liefert die exakten Werte.'
      : "Amounts in today's purchasing power: these stored results carry no per-path real series, so the nominal percentiles were divided by the median realised price index at each age — an approximation that does not adjust paths with unusually high or low inflation individually. Re-running the simulation gives the exact figures."
  } else if (unavailable) {
    statement = de
      ? `Projizierte Beträge nominal: Für diese Ergebnisse liegen keine inflationsbereinigten Werte vor. Bitte führen Sie die Simulation erneut aus, um den Bericht in heutiger Kaufkraft zu erhalten. ${inputsNote}`
      : `Projected amounts are nominal: these results carry no inflation-adjusted values. Re-run the simulation to get the report in today's purchasing power. ${inputsNote}`
    methodology = de
      ? 'Beträge nominal: Vermögenswerte sind in Euro des jeweiligen Jahres angegeben und enthalten die simulierte Inflation. Die Darstellung in heutiger Kaufkraft war gewählt, ist für diese gespeicherten Ergebnisse aber nicht verfügbar.'
      : "Amounts are nominal: assets are stated in euros of each year and include the simulated inflation. Today's purchasing power was selected but is not available for these stored results."
  } else {
    statement = de
      ? `Projizierte Beträge nominal, also in Euro des jeweiligen Jahres ohne Inflationsbereinigung. ${inputsNote}`
      : `Projected amounts are nominal, i.e. in euros of each year without inflation adjustment. ${inputsNote}`
    methodology = de
      ? 'Beträge nominal: Vermögenswerte sind in Euro des jeweiligen Jahres angegeben und enthalten die simulierte Inflation.'
      : 'Amounts are nominal: assets are stated in euros of each year and include the simulated inflation.'
  }

  return {
    tag,
    short: real ? (de ? 'heutige Kaufkraft' : "today's €") : 'nominal',
    chart: `€ · ${tag}`,
    statement,
    methodology,
    growth: real ? 'real' : 'nominal',
    amountQualifier: real ? (de ? ' in heutiger Kaufkraft' : " in today's euros") : '',
  }
}
