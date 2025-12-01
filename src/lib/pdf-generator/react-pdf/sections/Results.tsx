import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { H2, H4, Body, Caption, Table, TableRow, TableCell } from '../primitives'
import { ProjectionChart } from '../charts'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { fmtCurrency, fmtNumber } from '@/lib/pdf-generator/formatters'

interface ResultsProps {
  content: ReportContent
}

export function Results({ content }: ResultsProps) {
  const { projections, profile } = content
  const locale = content.locale ?? 'de'
  const intlLocale = locale === 'de' ? 'de-DE' : 'en-US'
  const isGerman = locale === 'de'

  const milestones = projections.milestones
  const lastPoint = milestones[milestones.length - 1]
  const exhaustion = projections.exhaustionAge

  // Select key milestones
  const keyAges = [...new Set([profile.person.retireAge, profile.person.pensionAge, 75, 85, profile.person.horizonAge])].sort((a, b) => a - b)
  const keyMilestones = keyAges
    .map((age) => milestones.find((m) => m.age === age))
    .filter((m): m is NonNullable<typeof m> => m !== undefined)

  return (
    <View>
      {/* Section Header */}
      <View style={{ marginBottom: tokens.spacing[4] }}>
        <H2>{isGerman ? 'Simulationsergebnisse' : 'Simulation Results'}</H2>
        <Text style={styles.sectionLead}>
          {isGerman
            ? 'Vermögensentwicklung über den Planungshorizont.'
            : 'Asset development across the planning horizon.'}
        </Text>
      </View>

      {/* Projection Chart */}
      <View style={{ marginBottom: tokens.spacing[4], borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[3] }}>
        <H4 style={{ marginBottom: tokens.spacing[2] }}>
          {isGerman ? 'Vermögensverlauf' : 'Asset Trajectory'}
        </H4>
        <ProjectionChart
          data={milestones}
          width={490}
          height={180}
          locale={locale}
          retireAge={profile.person.retireAge}
          pensionAge={profile.person.pensionAge}
        />
        <Caption style={{ marginTop: tokens.spacing[2], textAlign: 'center' }}>
          {isGerman
            ? 'Grauer Bereich: P10–P90 Band | Linie: Median (P50)'
            : 'Gray area: P10–P90 band | Line: Median (P50)'}
        </Caption>

        {/* Exhaustion warning */}
        {exhaustion && (
          <View style={{ borderLeftWidth: 3, borderLeftColor: tokens.colors.danger[600], paddingLeft: tokens.spacing[3], marginTop: tokens.spacing[3] }}>
            <Text style={{ fontSize: 9, color: tokens.colors.danger[600] }}>
              {isGerman
                ? `Warnung: Im Stressfall (P10) Vermögen erschöpft ab Alter ${fmtNumber(exhaustion, { locale: intlLocale })}.`
                : `Warning: In stress scenario (P10), assets exhausted at age ${fmtNumber(exhaustion, { locale: intlLocale })}.`}
            </Text>
          </View>
        )}
      </View>

      {/* Milestone Table */}
      <View style={{ borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[3] }}>
        <H4 style={{ marginBottom: tokens.spacing[3] }}>
          {isGerman ? 'Vermögensmeilensteine' : 'Asset Milestones'}
        </H4>
        <Table>
          <TableRow header>
            <TableCell header width="22%">{isGerman ? 'Alter' : 'Age'}</TableCell>
            <TableCell header width="26%" align="right">P10</TableCell>
            <TableCell header width="26%" align="right">P50</TableCell>
            <TableCell header width="26%" align="right">P90</TableCell>
          </TableRow>
          {keyMilestones.map((milestone, index) => {
            const isRetirement = milestone.age === profile.person.retireAge
            const isHorizon = milestone.age === profile.person.horizonAge
            const label = isRetirement ? (isGerman ? ' (R)' : ' (R)') : isHorizon ? (isGerman ? ' (H)' : ' (H)') : ''

            return (
              <TableRow key={`milestone-${milestone.age}-${index}`}>
                <TableCell width="22%">
                  <Text style={{ fontFamily: isRetirement || isHorizon ? 'Helvetica-Bold' : 'Helvetica' }}>
                    {milestone.age}{label}
                  </Text>
                </TableCell>
                <TableCell width="26%" align="right">
                  <Text style={{ color: milestone.p10 <= 0 ? tokens.colors.danger[600] : undefined }}>
                    {fmtCurrency(milestone.p10, intlLocale)}
                  </Text>
                </TableCell>
                <TableCell width="26%" align="right">
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fmtCurrency(milestone.p50, intlLocale)}</Text>
                </TableCell>
                <TableCell width="26%" align="right">
                  {fmtCurrency(milestone.p90, intlLocale)}
                </TableCell>
              </TableRow>
            )
          })}
        </Table>

        <Caption style={{ marginTop: tokens.spacing[2] }}>
          {isGerman ? 'R = Ruhestand, H = Horizont' : 'R = Retirement, H = Horizon'}
        </Caption>
      </View>

      {/* Final value */}
      {lastPoint && (
        <View style={{ marginTop: tokens.spacing[3] }}>
          <Body>
            {isGerman
              ? `Median am Horizont (${lastPoint.age}): `
              : `Median at horizon (${lastPoint.age}): `}
            <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fmtCurrency(lastPoint.p50, intlLocale)}</Text>
          </Body>
        </View>
      )}
    </View>
  )
}
