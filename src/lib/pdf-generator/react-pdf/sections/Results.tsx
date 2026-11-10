import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { SectionHeader, Table, TableRow, TableCell } from '../primitives'
import { ProjectionChart } from '../charts'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import {
  fmtCurrency,
  fmtNumber,
  fmtPercent,
  fmtRatioPercent,
} from '@/lib/pdf-generator/formatters'
import { buildEuroUnitCopy } from '@/lib/pdf-generator/euroUnitCopy'

interface ResultsProps {
  content: ReportContent
  sectionNumber?: string
}

/**
 * Signed percent label for growth figures. Not fmtPercent: growth can exceed
 * 100%, which would trip fmtPercent's percentage-vs-fraction heuristic.
 */
function growthLabel(growth: number, locale: string, isGerman: boolean): string {
  const sign = growth >= 0 ? '+' : ''
  const pct = fmtNumber(growth * 100, { locale, maximumFractionDigits: 0 })
  return `${sign}${pct}${isGerman ? ' %' : '%'}`
}

export function Results({ content, sectionNumber = '03' }: ResultsProps) {
  const { projections, profile, simulation, assumptions, expenses, finances } = content
  const locale = content.locale === 'en' ? 'en-US' : 'de-DE'
  const isGerman = content.locale !== 'en'

  const milestones = projections.milestones
  const { person } = profile
  // Every euro in this section is a projected asset value: say which euro.
  const unitCopy = buildEuroUnitCopy(content.units, content.locale)

  // Build outcome table: interval ages plus life milestones. The interval is
  // widened for long horizons so the section always fits on a single page —
  // the life milestones are never the rows that get dropped.
  const MAX_SIMULATED_ROWS = 9
  const horizonYears = person.horizonAge - person.currentAge
  const keyAges = new Set([person.currentAge, person.retireAge, person.pensionAge, person.horizonAge])
  const rowsAtStep = (step: number) => {
    const ages = new Set<number>(keyAges)
    for (let age = person.currentAge; age <= person.horizonAge; age += step) ages.add(age)
    return milestones.filter((m) => ages.has(m.age)).sort((a, b) => a.age - b.age)
  }
  const outcomeRows =
    [5, 10, 15, 20, 25]
      .filter((step) => step > 5 || horizonYears <= 30)
      .map(rowsAtStep)
      .find((rows) => rows.length <= MAX_SIMULATED_ROWS) ??
    // Even 25-year steps do not fit: the life milestones alone.
    rowsAtStep(Number.POSITIVE_INFINITY)

  // Every simulated row is the state at the END of the year of that age. The
  // row for the current age therefore already contains a year of savings and
  // returns — it is not "today"; today is the capital that was entered.
  const milestoneLabel = (age: number): string | null => {
    if (age === person.currentAge) return isGerman ? 'Ende 1. Planjahr' : 'End of plan year 1'
    if (age === person.retireAge) return isGerman ? 'Ruhestand' : 'Retirement'
    if (age === person.pensionAge) return isGerman ? 'Gesetzl. Rentenalter' : 'Statutory pension age'
    if (age === person.horizonAge) return isGerman ? 'Planungsende' : 'Horizon'
    return null
  }

  const finalMedian = milestones[milestones.length - 1]?.p50 ?? 0
  // Capital at the start of retirement = the end of the last working year.
  const retireStartMilestone =
    person.retireAge > person.currentAge
      ? milestones.find((m) => m.age === person.retireAge - 1)
      : undefined
  const startAssets = finances.currentAssets
  const medianGrowth =
    retireStartMilestone && startAssets > 0 ? retireStartMilestone.p50 / startAssets - 1 : null

  const money = (value: number | undefined) =>
    value === undefined ? '–' : fmtCurrency(value, locale)

  const hasBands = outcomeRows.some((row) => row.p20 !== undefined || row.p80 !== undefined)

  /**
   * The figures the assumptions imply, read next to the outcome they produced.
   * They used to close the assumptions section, where a plan with scheduled
   * cash flows pushed them onto a page of their own that was 85% white.
   */
  const baseSpend = expenses.monthlyTotal * 12 + expenses.annualTotal
  const realReturn = (1 + assumptions.expectedReturn) / (1 + assumptions.inflation) - 1
  // The ledger's one definition (portfolio withdrawal ÷ opening portfolio in
  // the first retirement year). No ledger, no figure — never a second formula.
  const firstYearWithdrawalRate = projections.ratios?.firstYearWithdrawalRate ?? null
  // The same bridge as everywhere else in the report: the retirement years
  // before the main pension pays.
  const bridge = profile.bridge
  const bridgeYears = bridge ? Math.max(0, bridge.endAge - bridge.startAge + 1) : 0
  const derived: Array<{ label: string; value: string; note: string }> = [
    {
      label: isGerman ? 'Reale Rendite' : 'Real return',
      value: fmtPercent(realReturn, 1, locale),
      note: isGerman ? 'Rendite nach Inflation' : 'return after inflation',
    },
    {
      label: isGerman ? 'Entnahmerate' : 'Withdrawal rate',
      value:
        firstYearWithdrawalRate !== null
          ? fmtRatioPercent(firstYearWithdrawalRate, 1, locale)
          : '–',
      note: isGerman
        ? 'erstes Ruhestandsjahr, Entnahme / Depot'
        : 'first retirement year, withdrawal / portfolio',
    },
    {
      label: isGerman ? 'Überbrückungsjahre' : 'Bridge years',
      value: fmtNumber(bridgeYears, { locale }),
      note: bridge
        ? isGerman
          ? `Alter ${bridge.startAge}–${bridge.endAge}, vor der Rente`
          : `age ${bridge.startAge}–${bridge.endAge}, before the pension`
        : isGerman
          ? 'keine Jahre vor der Rente'
          : 'no years before the pension',
    },
    {
      label: isGerman ? 'Sparquote zu Ausgaben' : 'Savings vs spending',
      value: baseSpend > 0 ? fmtRatioPercent(finances.annualSavings / baseSpend, 0, locale) : '–',
      note: isGerman ? 'Sparleistung / Jahresbudget' : 'annual savings / annual budget',
    },
  ]

  return (
    <View>
      <SectionHeader
        number={sectionNumber}
        overline={isGerman ? 'Ergebnisse' : 'Results'}
        title={isGerman ? 'Simulationsergebnis' : 'Simulation Outcome'}
        lead={
          isGerman
            ? 'Entwicklung des Vermögens über den gesamten Planungshorizont mit Stress-, Median- und Best-Case-Band.'
            : 'Asset trajectory across the full planning horizon with stress, median, and upside bands.'
        }
      />

      <View style={[styles.figure, { marginTop: 0, marginBottom: 12 }]}>
        <Text style={[styles.cardTitle, { marginBottom: 2 }]}>
          {isGerman
            ? `Vermögensentwicklung nach Perzentilen (${unitCopy.tag}, Jahresendwerte)`
            : `Asset Projection by Percentile (${unitCopy.tag}, year-end values)`}
        </Text>
        <ProjectionChart
          data={milestones}
          width={481}
          // Sized so that chart, table (with its "today" row) and the two
          // KPI rows share one page even at ten table rows.
          height={176}
          locale={content.locale}
          retireAge={person.retireAge}
          pensionAge={person.pensionAge}
          depletionAge={projections.exhaustionAge}
          unitLabel={unitCopy.chart}
        />
      </View>

      {/* Percentile outcomes table */}
      <View style={[styles.card, { marginBottom: 12 }]}>
        <Text style={styles.cardTitle}>
          {isGerman
            ? `Vermögensstände im Zeitverlauf (${unitCopy.tag}, Jahresende)`
            : `Projected Assets Over Time (${unitCopy.tag}, year-end)`}
        </Text>
        <Table>
          <TableRow header>
            <TableCell header width={hasBands ? '10%' : '12%'}>
              {isGerman ? 'Alter' : 'Age'}
            </TableCell>
            <TableCell header width={hasBands ? '16%' : '22%'}>
              {isGerman ? 'Phase' : 'Milestone'}
            </TableCell>
            <TableCell header width={hasBands ? '15%' : '22%'} align="right">
              P10
            </TableCell>
            {hasBands && (
              <TableCell header width="15%" align="right">
                P20
              </TableCell>
            )}
            <TableCell header width={hasBands ? '15%' : '22%'} align="right">
              P50
            </TableCell>
            {hasBands && (
              <TableCell header width="14%" align="right">
                P80
              </TableCell>
            )}
            <TableCell header width={hasBands ? '15%' : '22%'} align="right">
              P90
            </TableCell>
          </TableRow>
          {/* Today: the capital entered — one certain value, the same in
              nominal and in today's euros, so every percentile shows it. */}
          <TableRow key="today">
            <TableCell width={hasBands ? '10%' : '12%'}>
              <Text style={{ fontWeight: 600, color: tokens.colors.ink[900] }}>
                {fmtNumber(person.currentAge, { locale })}
              </Text>
            </TableCell>
            <TableCell width={hasBands ? '16%' : '22%'}>
              <Text style={{ fontSize: 7, color: tokens.colors.accent[700] }}>
                {isGerman ? 'Heute (Eingabe)' : 'Today (as entered)'}
              </Text>
            </TableCell>
            <TableCell width={hasBands ? '15%' : '22%'} align="right">
              {money(startAssets)}
            </TableCell>
            {hasBands && (
              <TableCell width="15%" align="right">
                {money(startAssets)}
              </TableCell>
            )}
            <TableCell width={hasBands ? '15%' : '22%'} align="right">
              <Text style={{ fontWeight: 600, color: tokens.colors.ink[900] }}>
                {money(startAssets)}
              </Text>
            </TableCell>
            {hasBands && (
              <TableCell width="14%" align="right">
                {money(startAssets)}
              </TableCell>
            )}
            <TableCell width={hasBands ? '15%' : '22%'} align="right">
              {money(startAssets)}
            </TableCell>
          </TableRow>
          {outcomeRows.map((row, rowIndex) => {
            const label = milestoneLabel(row.age)
            const index = rowIndex + 1
            return (
              <TableRow key={row.age} alt={index % 2 === 1}>
                <TableCell width={hasBands ? '10%' : '12%'}>
                  <Text style={{ fontWeight: 600, color: tokens.colors.ink[900] }}>
                    {fmtNumber(row.age, { locale })}
                  </Text>
                </TableCell>
                <TableCell width={hasBands ? '16%' : '22%'}>
                  <Text
                    style={{
                      fontSize: 7,
                      color: label ? tokens.colors.accent[700] : tokens.colors.ink[400],
                    }}
                  >
                    {label ?? ''}
                  </Text>
                </TableCell>
                <TableCell width={hasBands ? '15%' : '22%'} align="right">
                  <Text
                    style={{
                      color: row.p10 < 0 ? tokens.colors.danger[600] : tokens.colors.ink[700],
                    }}
                  >
                    {money(row.p10)}
                  </Text>
                </TableCell>
                {hasBands && (
                  <TableCell width="15%" align="right">
                    {money(row.p20)}
                  </TableCell>
                )}
                <TableCell width={hasBands ? '15%' : '22%'} align="right">
                  <Text style={{ fontWeight: 600, color: tokens.colors.ink[900] }}>
                    {money(row.p50)}
                  </Text>
                </TableCell>
                {hasBands && (
                  <TableCell width="14%" align="right">
                    {money(row.p80)}
                  </TableCell>
                )}
                <TableCell width={hasBands ? '15%' : '22%'} align="right">
                  {money(row.p90)}
                </TableCell>
              </TableRow>
            )
          })}
        </Table>
        <Text style={{ marginTop: 4, fontSize: 6.8, color: tokens.colors.ink[500], lineHeight: 1.35 }}>
          {isGerman
            ? '„Heute“ ist das eingegebene Vermögen; alle übrigen Zeilen zeigen den simulierten Stand zum Ende des Jahres mit dem genannten Alter.'
            : '"Today" is the capital entered; every other row is the simulated state at the end of the year of that age.'}
        </Text>
      </View>

      {/* Interpretation */}
      <View style={{ flexDirection: 'row' }}>
        <View style={[styles.card, { flex: 1, marginRight: 10, marginBottom: 0 }]} wrap={false}>
          <Text style={styles.kpiLabel}>{isGerman ? 'Median am Horizont' : 'Median at Horizon'}</Text>
          <Text style={styles.kpiValue}>{fmtCurrency(finalMedian, locale)}</Text>
          <Text style={styles.kpiDescription}>
            {isGerman
              ? `Ende Alter ${person.horizonAge} · ${unitCopy.tag}`
              : `End of age ${person.horizonAge} · ${unitCopy.tag}`}
            {medianGrowth !== null
              ? isGerman
                ? ` · von heute bis Ruhestandsbeginn ${growthLabel(medianGrowth, locale, isGerman)} ${unitCopy.growth}`
                : ` · from today to the start of retirement ${growthLabel(medianGrowth, locale, isGerman)} ${unitCopy.growth}`
              : ''}
          </Text>
        </View>

        <View style={{ flex: 2 }}>
          {projections.exhaustionAge ? (
            <View style={[styles.callout, styles.calloutDanger, { flex: 1 }]}>
              <Text
                style={{ fontSize: 8.5, fontWeight: 600, color: tokens.colors.ink[900], marginBottom: 3 }}
              >
                {isGerman ? 'Deckungslücke im Stressszenario' : 'Shortfall in the Stress Scenario'}
              </Text>
              {/* The event the success rate counts — a year portfolio and
                  income together could not pay — at the age a tenth of the
                  runs has reached it. Not "the P10 balance is zero". */}
              <Text style={{ fontSize: 8.5, color: tokens.colors.ink[700], lineHeight: 1.5 }}>
                {isGerman
                  ? `Im schwächsten Zehntel der Läufe reichen Depot und Einnahmen spätestens im Alter ${fmtNumber(projections.exhaustionAge, { locale })} erstmals nicht mehr für die Ausgaben. Die Handlungsempfehlungen in Abschnitt 05 adressieren dieses Risiko.`
                  : `In the weakest tenth of runs, portfolio and income first fail to cover a year's spending by age ${fmtNumber(projections.exhaustionAge, { locale })}. The recommended actions in section 05 address this risk.`}
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.callout,
                // Red is reserved for a plan that cannot pay in this report; a
                // residual risk below the stress case is a warning, not that.
                simulation.depletionRisk > 0.0005 ? styles.calloutWarning : styles.calloutSuccess,
                { flex: 1 },
              ]}
            >
              <Text
                style={{ fontSize: 8.5, fontWeight: 600, color: tokens.colors.ink[900], marginBottom: 3 }}
              >
                {isGerman ? 'Stressszenario bleibt finanziert' : 'Stress Scenario Stays Funded'}
              </Text>
              {/* "The stress case is funded" is not "no run ever fails": the
                  worst decile of a plan with a 5% risk is half failed runs.
                  State the stress-case fact, then the actual risk — and, where
                  the P10 balance does reach zero, that this alone is not a
                  failure. */}
              <Text style={{ fontSize: 8.5, color: tokens.colors.ink[700], lineHeight: 1.5 }}>
                {isGerman
                  ? `In mehr als neun von zehn Läufen sind die Ausgaben bis Alter ${fmtNumber(person.horizonAge, { locale })} in jedem Jahr gedeckt. ${
                      simulation.depletionRisk > 0.0005
                        ? `Das heißt nicht, dass kein Lauf scheitert: In ${fmtPercent(simulation.depletionRisk, 1, locale)} der Läufe reichen Depot und Einnahmen in mindestens einem Jahr nicht.`
                        : 'In keinem einzigen Lauf entsteht eine Deckungslücke.'
                    }${
                      projections.portfolioEmptyAge !== undefined
                        ? ` Im P10-Pfad ist das Depot ab Alter ${fmtNumber(projections.portfolioEmptyAge, { locale })} aufgebraucht; die Ausgaben tragen dann Renten und Einnahmen.`
                        : ''
                    }`
                  : `In more than nine runs in ten, every year's spending to age ${fmtNumber(person.horizonAge, { locale })} is funded. ${
                      simulation.depletionRisk > 0.0005
                        ? `That is not the same as no run failing: in ${fmtPercent(simulation.depletionRisk, 1, locale)} of runs portfolio and income fall short in at least one year.`
                        : 'Not a single run has a year that goes short.'
                    }${
                      projections.portfolioEmptyAge !== undefined
                        ? ` On the P10 path the portfolio is used up from age ${fmtNumber(projections.portfolioEmptyAge, { locale })}; pensions and income then carry the spending.`
                        : ''
                    }`}
              </Text>
            </View>
          )}
        </View>
      </View>

      <View style={{ flexDirection: 'row', marginTop: 12 }}>
        {derived.map((item, index) => (
          <View
            key={item.label}
            style={[
              styles.cardMuted,
              {
                flex: 1,
                marginRight: index < derived.length - 1 ? 10 : 0,
                marginBottom: 0,
                paddingVertical: 8,
              },
            ]}
            wrap={false}
          >
            <Text style={styles.kpiLabel}>{item.label}</Text>
            <Text style={[styles.kpiValue, { fontSize: 13, marginTop: 3 }]}>{item.value}</Text>
            <Text style={[styles.kpiDescription, { marginTop: 2 }]}>{item.note}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
