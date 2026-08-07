import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { SectionHeader, Table, TableRow, TableCell } from '../primitives'
import { ProjectionChart } from '../charts'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { fmtCurrency, fmtNumber } from '@/lib/pdf-generator/formatters'

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
  const { projections, profile } = content
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
            <View style={[styles.callout, styles.calloutSuccess, { flex: 1 }]}>
              <Text
                style={{ fontSize: 8.5, fontWeight: 600, color: tokens.colors.ink[900], marginBottom: 3 }}
              >
                {isGerman ? 'Robustes Ergebnis' : 'Robust Outcome'}
              </Text>
              <Text style={{ fontSize: 8.5, color: tokens.colors.ink[700], lineHeight: 1.5 }}>
                {isGerman
                  ? 'Auch das konservative P10-Szenario bleibt bis zum Planungshorizont positiv.'
                  : 'Even the conservative P10 scenario remains positive through the planning horizon.'}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  )
}
