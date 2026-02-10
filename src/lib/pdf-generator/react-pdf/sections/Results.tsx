import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { H2, H4, Table, TableRow, TableCell } from '../primitives'
import { ProjectionChart } from '../charts'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { fmtCurrency, fmtNumber } from '@/lib/pdf-generator/formatters'

interface ResultsProps {
  content: ReportContent
}

export function Results({ content }: ResultsProps) {
  const { projections, profile } = content
  const locale = content.locale === 'en' ? 'en-US' : 'de-DE'
  const isGerman = content.locale !== 'en'

  const milestones = projections.milestones
  const checkpointAges = [
    profile.person.currentAge,
    profile.person.retireAge,
    profile.person.pensionAge,
    profile.person.horizonAge,
  ]

  const checkpoints = checkpointAges
    .map((age) => milestones.find((item) => item.age === age))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  const finalMedian = milestones[milestones.length - 1]?.p50 ?? 0

  return (
    <View>
      <View style={{ marginBottom: 12 }}>
        <H2>{isGerman ? 'Simulationsergebnis' : 'Simulation Outcome'}</H2>
        <Text style={styles.sectionLead}>
          {isGerman
            ? 'Entwicklung des Vermögens über den gesamten Planungshorizont mit Stress-, Median- und Best-Case-Band.'
            : 'Asset trajectory across the full planning horizon with stress, median, and best-case bands.'}
        </Text>
      </View>

      <View style={styles.figure}>
        <H4 style={{ marginBottom: 6 }}>{isGerman ? 'Vermögenspfad (P10/P50/P90)' : 'Asset Path (P10/P50/P90)'}</H4>
        <ProjectionChart
          data={milestones}
          width={495}
          height={230}
          locale={content.locale}
          retireAge={profile.person.retireAge}
          pensionAge={profile.person.pensionAge}
        />
        <Text style={styles.figcaption}>
          {isGerman
            ? 'P10: Stressszenario | P50: Median | P90: positives Szenario'
            : 'P10: stress case | P50: median | P90: upside case'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', marginTop: 8, marginBottom: 10 }}>
        <View style={{ width: '49%', marginRight: '2%' }}>
          <View style={styles.card}>
            <H4 style={{ marginBottom: 8 }}>{isGerman ? 'Wichtige Altersmarken' : 'Key Age Checkpoints'}</H4>
            <Table>
              <TableRow header>
                <TableCell header width="24%">{isGerman ? 'Alter' : 'Age'}</TableCell>
                <TableCell header width="26%" align="right">P10</TableCell>
                <TableCell header width="26%" align="right">P50</TableCell>
                <TableCell header width="24%" align="right">P90</TableCell>
              </TableRow>
              {checkpoints.map((point, index) => (
                <TableRow key={`${point.age}-${index}`}>
                  <TableCell width="24%">{fmtNumber(point.age, { locale })}</TableCell>
                  <TableCell width="26%" align="right">
                    <Text style={{ color: point.p10 < 0 ? tokens.colors.danger[600] : tokens.colors.ink[700] }}>
                      {fmtCurrency(point.p10, locale)}
                    </Text>
                  </TableCell>
                  <TableCell width="26%" align="right">
                    <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fmtCurrency(point.p50, locale)}</Text>
                  </TableCell>
                  <TableCell width="24%" align="right">{fmtCurrency(point.p90, locale)}</TableCell>
                </TableRow>
              ))}
            </Table>
          </View>
        </View>

        <View style={{ width: '49%' }}>
          <View style={styles.card}>
            <H4 style={{ marginBottom: 8 }}>{isGerman ? 'Interpretation' : 'Interpretation'}</H4>
            <View style={{ marginBottom: 8 }}>
              <Text style={styles.label}>{isGerman ? 'Median am Horizont' : 'Median at Horizon'}</Text>
              <Text style={{ fontSize: 16, fontFamily: 'Helvetica-Bold', color: tokens.colors.ink[900] }}>
                {fmtCurrency(finalMedian, locale)}
              </Text>
            </View>

            {projections.exhaustionAge ? (
              <View style={{ borderLeftWidth: 3, borderLeftColor: tokens.colors.danger[600], paddingLeft: 8 }}>
                <Text style={{ fontSize: 9.5, color: tokens.colors.ink[700], lineHeight: 1.5 }}>
                  {isGerman
                    ? `Im P10-Szenario kann das Vermögen ab Alter ${fmtNumber(projections.exhaustionAge, { locale })} erschöpft sein.`
                    : `In the P10 scenario, assets may be exhausted from age ${fmtNumber(projections.exhaustionAge, { locale })}.`}
                </Text>
              </View>
            ) : (
              <View style={{ borderLeftWidth: 3, borderLeftColor: tokens.colors.success[600], paddingLeft: 8 }}>
                <Text style={{ fontSize: 9.5, color: tokens.colors.ink[700], lineHeight: 1.5 }}>
                  {isGerman
                    ? 'Auch das P10-Szenario bleibt bis zum Planungshorizont positiv.'
                    : 'Even the P10 scenario remains positive through the planning horizon.'}
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>
    </View>
  )
}
