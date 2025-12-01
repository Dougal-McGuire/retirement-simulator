import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { H2, H4, Body, Caption, Table, TableRow, TableCell } from '../primitives'
import { SpendingChart } from '../charts'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { fmtCurrency, fmtNumber, fmtPercent } from '@/lib/pdf-generator/formatters'

interface SpendingProps {
  content: ReportContent
}

export function Spending({ content }: SpendingProps) {
  const { expenses } = content
  const locale = content.locale ?? 'de'
  const intlLocale = locale === 'de' ? 'de-DE' : 'en-US'
  const isGerman = locale === 'de'

  // Calculate totals
  const annualExpenses = expenses.monthlyTotal * 12 + expenses.annualTotal
  const inflationRate = 0.025
  const inflation10y = annualExpenses * Math.pow(1 + inflationRate, 10)
  const inflation20y = annualExpenses * Math.pow(1 + inflationRate, 20)

  return (
    <View>
      {/* Section Header */}
      <View style={{ marginBottom: tokens.spacing[4] }}>
        <H2>{isGerman ? 'Ausgabenstruktur' : 'Spending Structure'}</H2>
        <Text style={styles.sectionLead}>
          {isGerman
            ? 'Aufschlüsselung der geplanten Ausgaben nach Kategorien.'
            : 'Breakdown of planned expenses by category.'}
        </Text>
      </View>

      {/* Summary KPIs */}
      <View style={{ flexDirection: 'row', marginBottom: tokens.spacing[4] }}>
        <View style={{ width: '33%', paddingRight: tokens.spacing[2] }}>
          <View style={{ borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[3] }}>
            <Text style={styles.label}>{isGerman ? 'Monatlich' : 'Monthly'}</Text>
            <Text style={styles.kpiValue}>{fmtCurrency(expenses.monthlyTotal, intlLocale)}</Text>
          </View>
        </View>
        <View style={{ width: '33%', paddingHorizontal: tokens.spacing[1] }}>
          <View style={{ borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[3] }}>
            <Text style={styles.label}>{isGerman ? 'Jährlich' : 'Annual'}</Text>
            <Text style={styles.kpiValue}>{fmtCurrency(annualExpenses, intlLocale)}</Text>
          </View>
        </View>
        <View style={{ width: '34%', paddingLeft: tokens.spacing[2] }}>
          <View style={{ borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[3] }}>
            <Text style={styles.label}>{isGerman ? 'Gesamt' : 'Total'}</Text>
            <Text style={styles.kpiValue}>{fmtCurrency(expenses.totalHorizonAmount, intlLocale)}</Text>
            <Caption>{fmtNumber(expenses.horizonYears, { locale: intlLocale })} {isGerman ? 'J.' : 'yrs'}</Caption>
          </View>
        </View>
      </View>

      {/* Spending Chart */}
      <View style={{ marginBottom: tokens.spacing[4], borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[3] }}>
        <H4 style={{ marginBottom: tokens.spacing[2] }}>
          {isGerman ? 'Ausgaben nach Kategorie' : 'Expenses by Category'}
        </H4>
        <SpendingChart
          monthlyCategories={expenses.monthlyCategories}
          annualCategories={expenses.annualCategories}
          width={490}
          height={160}
          locale={locale}
        />
      </View>

      {/* Category Tables - Side by side */}
      <View style={{ flexDirection: 'row', marginBottom: tokens.spacing[4] }}>
        {/* Monthly Categories */}
        <View style={{ width: '50%', paddingRight: tokens.spacing[2] }}>
          <View style={{ borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[3] }}>
            <H4 style={{ marginBottom: tokens.spacing[2] }}>
              {isGerman ? 'Monatlich' : 'Monthly'}
            </H4>
            <Table>
              <TableRow header>
                <TableCell header width="55%">{isGerman ? 'Kategorie' : 'Category'}</TableCell>
                <TableCell header width="45%" align="right">{isGerman ? 'Jährl.' : 'Annual'}</TableCell>
              </TableRow>
              {expenses.monthlyCategories.map((cat) => (
                <TableRow key={cat.label}>
                  <TableCell width="55%">{cat.label}</TableCell>
                  <TableCell width="45%" align="right">{fmtCurrency(cat.annualAmount, intlLocale)}</TableCell>
                </TableRow>
              ))}
            </Table>
          </View>
        </View>

        {/* Annual Categories */}
        <View style={{ width: '50%', paddingLeft: tokens.spacing[2] }}>
          <View style={{ borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[3] }}>
            <H4 style={{ marginBottom: tokens.spacing[2] }}>
              {isGerman ? 'Jährliche Sonder.' : 'Annual Special'}
            </H4>
            <Table>
              <TableRow header>
                <TableCell header width="55%">{isGerman ? 'Kategorie' : 'Category'}</TableCell>
                <TableCell header width="45%" align="right">{isGerman ? 'Betrag' : 'Amount'}</TableCell>
              </TableRow>
              {expenses.annualCategories.map((cat) => (
                <TableRow key={cat.label}>
                  <TableCell width="55%">{cat.label}</TableCell>
                  <TableCell width="45%" align="right">{fmtCurrency(cat.annualAmount, intlLocale)}</TableCell>
                </TableRow>
              ))}
            </Table>
          </View>
        </View>
      </View>

      {/* Inflation Impact */}
      <View style={{ borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[3] }}>
        <H4 style={{ marginBottom: tokens.spacing[2] }}>
          {isGerman ? 'Inflationsauswirkung (2,5% p.a.)' : 'Inflation Impact (2.5% p.a.)'}
        </H4>
        
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: '30%' }}>
            <Text style={styles.label}>{isGerman ? 'Heute' : 'Today'}</Text>
            <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold' }}>
              {fmtCurrency(annualExpenses, intlLocale)}
            </Text>
          </View>
          <View style={{ width: '5%', justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, color: tokens.colors.ink[400], textAlign: 'center' }}>→</Text>
          </View>
          <View style={{ width: '30%' }}>
            <Text style={styles.label}>{isGerman ? '+10 Jahre' : '+10 Years'}</Text>
            <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: tokens.colors.warning[600] }}>
              {fmtCurrency(inflation10y, intlLocale)}
            </Text>
            <Caption>+{fmtPercent(Math.pow(1 + inflationRate, 10) - 1, 0, intlLocale)}</Caption>
          </View>
          <View style={{ width: '5%', justifyContent: 'center' }}>
            <Text style={{ fontSize: 12, color: tokens.colors.ink[400], textAlign: 'center' }}>→</Text>
          </View>
          <View style={{ width: '30%' }}>
            <Text style={styles.label}>{isGerman ? '+20 Jahre' : '+20 Years'}</Text>
            <Text style={{ fontSize: 14, fontFamily: 'Helvetica-Bold', color: tokens.colors.danger[600] }}>
              {fmtCurrency(inflation20y, intlLocale)}
            </Text>
            <Caption>+{fmtPercent(Math.pow(1 + inflationRate, 20) - 1, 0, intlLocale)}</Caption>
          </View>
        </View>
      </View>
    </View>
  )
}
