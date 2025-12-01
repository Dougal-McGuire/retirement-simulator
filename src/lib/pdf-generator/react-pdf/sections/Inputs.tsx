import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { H2, H4, Table, TableRow, TableCell } from '../primitives'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { fmtNumber, fmtPercent } from '@/lib/pdf-generator/formatters'

interface InputsProps {
  content: ReportContent
}

export function Inputs({ content }: InputsProps) {
  const { profile, assumptions } = content
  const locale = content.locale ?? 'de'
  const intlLocale = locale === 'de' ? 'de-DE' : 'en-US'
  const isGerman = locale === 'de'

  const personData = [
    { label: isGerman ? 'Aktuelles Alter' : 'Current Age', value: `${profile.person.currentAge} ${isGerman ? 'Jahre' : 'years'}` },
    { label: isGerman ? 'Ruhestand' : 'Retirement', value: `${profile.person.retireAge} ${isGerman ? 'Jahre' : 'years'}` },
    { label: isGerman ? 'Rentenbeginn' : 'Pension Start', value: `${profile.person.pensionAge} ${isGerman ? 'Jahre' : 'years'}` },
    { label: isGerman ? 'Horizont' : 'Horizon', value: `${profile.person.horizonAge} ${isGerman ? 'Jahre' : 'years'}` },
  ]

  const marketData = [
    { label: isGerman ? 'Rendite' : 'Return', value: fmtPercent(assumptions.expectedReturn, 1, intlLocale), sub: `σ ${fmtPercent(assumptions.returnVolatility, 1, intlLocale)}` },
    { label: isGerman ? 'Inflation' : 'Inflation', value: fmtPercent(assumptions.inflation, 1, intlLocale), sub: `σ ${fmtPercent(assumptions.inflationVolatility, 1, intlLocale)}` },
    { label: isGerman ? 'Kapitalertragssteuer' : 'Capital Gains Tax', value: fmtPercent(assumptions.capitalGainsTax / 100, 1, intlLocale), sub: '' },
    { label: isGerman ? 'Simulationen' : 'Simulations', value: fmtNumber(assumptions.simulationRuns, { locale: intlLocale }), sub: '' },
  ]

  // Timeline percentages
  const totalYears = profile.person.horizonAge - profile.person.currentAge
  const workingYears = profile.person.retireAge - profile.person.currentAge
  const bridgeYears = profile.person.pensionAge - profile.person.retireAge
  const retirementYears = profile.person.horizonAge - profile.person.pensionAge

  return (
    <View>
      {/* Section Header */}
      <View style={{ marginBottom: tokens.spacing[6] }}>
        <H2>{isGerman ? 'Eingaben und Annahmen' : 'Inputs and Assumptions'}</H2>
        <Text style={styles.sectionLead}>
          {isGerman
            ? 'Übersicht der Planungsparameter und Marktannahmen.'
            : 'Overview of planning parameters and market assumptions.'}
        </Text>
      </View>

      {/* Two-column layout using percentage widths */}
      <View style={{ flexDirection: 'row', marginBottom: tokens.spacing[6] }}>
        {/* Timeline */}
        <View style={{ width: '50%', paddingRight: tokens.spacing[2] }}>
          <View style={{ borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[4] }}>
            <H4 style={{ marginBottom: tokens.spacing[4] }}>{isGerman ? 'Zeitplanung' : 'Timeline'}</H4>
            <Table>
              {personData.map((item) => (
                <TableRow key={item.label}>
                  <TableCell width="60%">{item.label}</TableCell>
                  <TableCell width="40%" align="right">
                    <Text style={{ fontFamily: 'Helvetica-Bold' }}>{item.value}</Text>
                  </TableCell>
                </TableRow>
              ))}
            </Table>

            {/* Timeline bar */}
            <View style={{ marginTop: tokens.spacing[4] }}>
              <View style={{ flexDirection: 'row', height: 16 }}>
                <View style={{ 
                  width: `${(workingYears / totalYears) * 100}%`, 
                  backgroundColor: tokens.colors.accent[600],
                  justifyContent: 'center',
                  paddingLeft: 2,
                }}>
                  <Text style={{ fontSize: 6, color: tokens.colors.white }}>{isGerman ? 'Arbeit' : 'Work'}</Text>
                </View>
                {bridgeYears > 0 && (
                  <View style={{ 
                    width: `${(bridgeYears / totalYears) * 100}%`, 
                    backgroundColor: tokens.colors.warning[600],
                    justifyContent: 'center',
                    paddingLeft: 2,
                  }}>
                    <Text style={{ fontSize: 6, color: tokens.colors.white }}>{isGerman ? 'Brücke' : 'Bridge'}</Text>
                  </View>
                )}
                <View style={{ 
                  width: `${(retirementYears / totalYears) * 100}%`, 
                  backgroundColor: tokens.colors.success[600],
                  justifyContent: 'center',
                  paddingLeft: 2,
                }}>
                  <Text style={{ fontSize: 6, color: tokens.colors.white }}>{isGerman ? 'Ruhestand' : 'Retire'}</Text>
                </View>
              </View>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 2 }}>
                <Text style={{ fontSize: 7, color: tokens.colors.ink[500] }}>{profile.person.currentAge}</Text>
                <Text style={{ fontSize: 7, color: tokens.colors.ink[500] }}>{profile.person.retireAge}</Text>
                <Text style={{ fontSize: 7, color: tokens.colors.ink[500] }}>{profile.person.horizonAge}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Market Assumptions */}
        <View style={{ width: '50%', paddingLeft: tokens.spacing[2] }}>
          <View style={{ borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[4] }}>
            <H4 style={{ marginBottom: tokens.spacing[4] }}>{isGerman ? 'Marktannahmen' : 'Market Assumptions'}</H4>
            <Table>
              {marketData.map((item) => (
                <TableRow key={item.label}>
                  <TableCell width="45%">{item.label}</TableCell>
                  <TableCell width="30%" align="right">
                    <Text style={{ fontFamily: 'Helvetica-Bold' }}>{item.value}</Text>
                  </TableCell>
                  <TableCell width="25%" align="right">
                    <Text style={{ fontSize: 8, color: tokens.colors.ink[500] }}>{item.sub}</Text>
                  </TableCell>
                </TableRow>
              ))}
            </Table>

            {/* Note */}
            <View style={{ marginTop: tokens.spacing[4], padding: tokens.spacing[2], borderWidth: 1, borderColor: tokens.colors.ink[200] }}>
              <Text style={{ fontSize: 7, color: tokens.colors.ink[600], lineHeight: 1.4 }}>
                {isGerman
                  ? 'Box-Muller-Transformation für Zufallszahlen.'
                  : 'Box-Muller transformation for random numbers.'}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </View>
  )
}
