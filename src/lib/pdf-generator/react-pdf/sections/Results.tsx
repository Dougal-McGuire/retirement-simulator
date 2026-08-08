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

  // Build outcome table: interval ages plus life milestones. The interval is
  // widened for long horizons so the section always fits on a single page.
  const horizonYears = person.horizonAge - person.currentAge
  const ageStep = horizonYears > 30 ? 10 : 5
  const keyAges = new Set([person.currentAge, person.retireAge, person.pensionAge, person.horizonAge])
  const tableAges = new Set<number>(keyAges)
  for (let age = person.currentAge; age <= person.horizonAge; age += ageStep) {
    tableAges.add(age)
  }
  const outcomeRows = milestones
    .filter((m) => tableAges.has(m.age))
    .sort((a, b) => a.age - b.age)
    .slice(0, 10)

  const milestoneLabel = (age: number): string | null => {
    if (age === person.currentAge) return isGerman ? 'Heute' : 'Today'
    if (age === person.retireAge) return isGerman ? 'Ruhestand' : 'Retirement'
    if (age === person.pensionAge) return isGerman ? 'Rentenbeginn' : 'State pension'
    if (age === person.horizonAge) return isGerman ? 'Planungsende' : 'Horizon'
    return null
  }

  const finalMedian = milestones[milestones.length - 1]?.p50 ?? 0
  const retireMilestone = milestones.find((m) => m.age === person.retireAge)
  const startAssets = milestones[0]?.p50 ?? 0
  const medianGrowth =
    retireMilestone && startAssets > 0 ? retireMilestone.p50 / startAssets - 1 : null

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
  const retireMedian = milestones.find((m) => m.age === person.retireAge)?.p50
  const firstYearWithdrawalRate = retireMedian && retireMedian > 0 ? baseSpend / retireMedian : null
  const bridgeYears = Math.max(0, person.pensionAge - person.retireAge)
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
      note: isGerman ? 'erstes Ruhestandsjahr' : 'first year of retirement',
    },
    {
      label: isGerman ? 'Überbrückungsjahre' : 'Bridge years',
      value: fmtNumber(bridgeYears, { locale }),
      note: isGerman
        ? `Alter ${person.retireAge}–${person.pensionAge}`
        : `age ${person.retireAge}–${person.pensionAge}`,
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
          {isGerman ? 'Vermögensentwicklung nach Perzentilen' : 'Asset Projection by Percentile'}
        </Text>
        <ProjectionChart
          data={milestones}
          width={481}
          height={210}
          locale={content.locale}
          retireAge={person.retireAge}
          pensionAge={person.pensionAge}
          depletionAge={projections.exhaustionAge}
        />
      </View>

      {/* Percentile outcomes table */}
      <View style={[styles.card, { marginBottom: 12 }]}>
        <Text style={styles.cardTitle}>
          {isGerman ? 'Vermögensstände im Zeitverlauf' : 'Projected Assets Over Time'}
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
          {outcomeRows.map((row, index) => {
            const label = milestoneLabel(row.age)
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
      </View>

      {/* Interpretation */}
      <View style={{ flexDirection: 'row' }}>
        <View style={[styles.card, { flex: 1, marginRight: 10, marginBottom: 0 }]} wrap={false}>
          <Text style={styles.kpiLabel}>{isGerman ? 'Median am Horizont' : 'Median at Horizon'}</Text>
          <Text style={styles.kpiValue}>{fmtCurrency(finalMedian, locale)}</Text>
          <Text style={styles.kpiDescription}>
            {medianGrowth !== null
              ? isGerman
                ? `Median bis Ruhestand: ${growthLabel(medianGrowth, locale, isGerman)}`
                : `Median growth to retirement: ${growthLabel(medianGrowth, locale, isGerman)}`
              : isGerman
                ? `Alter ${person.horizonAge}`
                : `Age ${person.horizonAge}`}
          </Text>
        </View>

        <View style={{ flex: 2 }}>
          {projections.exhaustionAge ? (
            <View style={[styles.callout, styles.calloutDanger, { flex: 1 }]}>
              <Text
                style={{ fontSize: 8.5, fontWeight: 600, color: tokens.colors.ink[900], marginBottom: 3 }}
              >
                {isGerman ? 'Erschöpfungsrisiko im Stressszenario' : 'Depletion Risk in the Stress Scenario'}
              </Text>
              <Text style={{ fontSize: 8.5, color: tokens.colors.ink[700], lineHeight: 1.5 }}>
                {isGerman
                  ? `Im P10-Szenario kann das Vermögen ab Alter ${fmtNumber(projections.exhaustionAge, { locale })} erschöpft sein. Die Handlungsempfehlungen in Abschnitt 05 adressieren dieses Risiko.`
                  : `In the P10 scenario, assets may be exhausted from age ${fmtNumber(projections.exhaustionAge, { locale })}. The recommended actions in section 05 address this risk.`}
              </Text>
            </View>
          ) : (
            <View
              style={[
                styles.callout,
                // Red is reserved for depletion in this report; a residual risk
                // that the P10 line hides is a warning, not a failure.
                simulation.depletionRisk > 0.0005 ? styles.calloutWarning : styles.calloutSuccess,
                { flex: 1 },
              ]}
            >
              <Text
                style={{ fontSize: 8.5, fontWeight: 600, color: tokens.colors.ink[900], marginBottom: 3 }}
              >
                {isGerman ? 'P10-Pfad bleibt finanziert' : 'P10 Path Stays Funded'}
              </Text>
              {/* The P10 *band line* staying positive is not the same claim as
                  "no run ever depletes": the worst decile of a plan with a 5%
                  depletion risk is full of failed runs. State the band fact,
                  then the actual risk. */}
              <Text style={{ fontSize: 8.5, color: tokens.colors.ink[700], lineHeight: 1.5 }}>
                {isGerman
                  ? `Der P10-Pfad bleibt bis Alter ${fmtNumber(person.horizonAge, { locale })} durchgehend positiv. ${
                      simulation.depletionRisk > 0.0005
                        ? `Das heißt nicht, dass kein Lauf scheitert: in ${fmtPercent(simulation.depletionRisk, 1, locale)} der Läufe ist das Kapital vor dem Planungsende aufgebraucht.`
                        : 'Kein einziger Lauf erschöpft das Kapital vor dem Planungsende.'
                    }`
                  : `The P10 path stays positive all the way to age ${fmtNumber(person.horizonAge, { locale })}. ${
                      simulation.depletionRisk > 0.0005
                        ? `That is not the same as no run failing: capital is exhausted before the horizon in ${fmtPercent(simulation.depletionRisk, 1, locale)} of runs.`
                        : 'Not a single run exhausts capital before the horizon.'
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
