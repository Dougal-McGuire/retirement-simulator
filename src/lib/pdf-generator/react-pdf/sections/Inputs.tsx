import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { H2, H4, Table, TableRow, TableCell } from '../primitives'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { fmtCurrency, fmtNumber, fmtPercent } from '@/lib/pdf-generator/formatters'

interface InputsProps {
  content: ReportContent
}

export function Inputs({ content }: InputsProps) {
  const { profile, assumptions, expenses, finances } = content
  const locale = content.locale === 'en' ? 'en-US' : 'de-DE'
  const isGerman = content.locale !== 'en'

  const baseSpend = expenses.monthlyTotal * 12 + expenses.annualTotal

  const timelineRows = [
    { label: isGerman ? 'Aktuelles Alter' : 'Current Age', value: profile.person.currentAge },
    { label: isGerman ? 'Ruhestand geplant' : 'Retirement Age', value: profile.person.retireAge },
    { label: isGerman ? 'Gesetzliche Rente' : 'Pension Age', value: profile.person.pensionAge },
    { label: isGerman ? 'Planungsende' : 'Horizon Age', value: profile.person.horizonAge },
  ]

  return (
    <View>
      <View style={{ marginBottom: 14 }}>
        <H2>{isGerman ? 'Planungsannahmen' : 'Planning Assumptions'}</H2>
        <Text style={styles.sectionLead}>
          {isGerman
            ? 'Parameter des aktuellen Szenarios, die direkt aus der App-Konfiguration übernommen wurden.'
            : 'Scenario parameters directly derived from the current app configuration.'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        <View style={{ width: '52%', marginRight: '2%' }}>
          <View style={styles.card}>
            <H4 style={{ marginBottom: 8 }}>{isGerman ? 'Zeithorizont' : 'Timeline'}</H4>
            <Table>
              {timelineRows.map((row) => (
                <TableRow key={row.label}>
                  <TableCell width="64%">{row.label}</TableCell>
                  <TableCell width="36%" align="right">
                    <Text style={{ fontFamily: 'Helvetica-Bold' }}>{fmtNumber(row.value, { locale })}</Text>
                  </TableCell>
                </TableRow>
              ))}
            </Table>

            <View style={{ marginTop: 8 }}>
              <Text style={styles.label}>{isGerman ? 'Planungsdauer' : 'Planning Duration'}</Text>
              <Text style={{ fontSize: 12, fontFamily: 'Helvetica-Bold', color: tokens.colors.ink[800] }}>
                {fmtNumber(expenses.horizonYears, { locale })} {isGerman ? 'Jahre' : 'years'}
              </Text>
            </View>
          </View>
        </View>

        <View style={{ width: '46%' }}>
          <View style={styles.card}>
            <H4 style={{ marginBottom: 8 }}>{isGerman ? 'Marktannahmen' : 'Market Inputs'}</H4>
            <Table>
              <TableRow>
                <TableCell width="55%">{isGerman ? 'Ø Rendite' : 'Expected Return'}</TableCell>
                <TableCell width="45%" align="right">{fmtPercent(assumptions.expectedReturn, 1, locale)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell width="55%">{isGerman ? 'Volatilität' : 'Volatility'}</TableCell>
                <TableCell width="45%" align="right">{fmtPercent(assumptions.returnVolatility, 1, locale)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell width="55%">{isGerman ? 'Inflation' : 'Inflation'}</TableCell>
                <TableCell width="45%" align="right">{fmtPercent(assumptions.inflation, 1, locale)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell width="55%">{isGerman ? 'Inflationsvolatilität' : 'Inflation Volatility'}</TableCell>
                <TableCell width="45%" align="right">{fmtPercent(assumptions.inflationVolatility, 1, locale)}</TableCell>
              </TableRow>
              <TableRow>
                <TableCell width="55%">{isGerman ? 'Kapitalertragssteuer' : 'Capital Gains Tax'}</TableCell>
                <TableCell width="45%" align="right">{fmtPercent(assumptions.capitalGainsTax / 100, 1, locale)}</TableCell>
              </TableRow>
            </Table>
          </View>
        </View>
      </View>

      <View style={{ flexDirection: 'row' }}>
        <View style={{ width: '32%', marginRight: '2%' }}>
          <View style={styles.card} wrap={false}>
            <Text style={styles.kpiLabel}>{isGerman ? 'Jährliche Sparleistung' : 'Annual Savings'}</Text>
            <Text style={styles.kpiValue}>{fmtCurrency(finances.annualSavings, locale)}</Text>
            <Text style={styles.kpiDescription}>{isGerman ? 'Direkt aus Setup übernommen' : 'Derived from setup'}</Text>
          </View>
        </View>
        <View style={{ width: '32%', marginRight: '2%' }}>
          <View style={styles.card} wrap={false}>
            <Text style={styles.kpiLabel}>{isGerman ? 'Aktuelles Vermögen' : 'Current Assets'}</Text>
            <Text style={styles.kpiValue}>{fmtCurrency(finances.currentAssets, locale)}</Text>
            <Text style={styles.kpiDescription}>{isGerman ? 'Wert laut aktueller Eingabe' : 'Value from current input'}</Text>
          </View>
        </View>
        <View style={{ width: '34%' }}>
          <View style={styles.card} wrap={false}>
            <Text style={styles.kpiLabel}>{isGerman ? 'Jährlicher Bedarf' : 'Annual Spending Need'}</Text>
            <Text style={styles.kpiValue}>{fmtCurrency(baseSpend, locale)}</Text>
            <Text style={styles.kpiDescription}>{isGerman ? 'Monatlich + jährlich' : 'Monthly + annual expenses'}</Text>
          </View>
        </View>
      </View>

      <View style={[styles.card, { marginTop: 10, borderLeftWidth: 3, borderLeftColor: tokens.colors.accent[600] }]}>
        <Text style={{ fontSize: 9, color: tokens.colors.ink[600], lineHeight: 1.5 }}>
          {isGerman
            ? `Simulation basiert auf ${fmtNumber(assumptions.simulationRuns, { locale })} Monte-Carlo-Läufen und verwendet die aktuell in der App hinterlegten Ausgabenkategorien.`
            : `Simulation is based on ${fmtNumber(assumptions.simulationRuns, { locale })} Monte Carlo runs and uses the current app expense categories.`}
        </Text>
      </View>
    </View>
  )
}
