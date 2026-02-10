import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { H2, H4, Table, TableRow, TableCell } from '../primitives'
import { SpendingChart } from '../charts'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { fmtCurrency, fmtNumber, fmtPercent } from '@/lib/pdf-generator/formatters'

interface SpendingProps {
  content: ReportContent
}

export function Spending({ content }: SpendingProps) {
  const { expenses } = content
  const locale = content.locale === 'en' ? 'en-US' : 'de-DE'
  const isGerman = content.locale !== 'en'

  const annualTotal = expenses.monthlyTotal * 12 + expenses.annualTotal
  const topCategories = expenses.allCategories.slice(0, 8)

  return (
    <View>
      <View style={{ marginBottom: 12 }}>
        <H2>{isGerman ? 'Ausgabenanalyse' : 'Spending Analysis'}</H2>
        <Text style={styles.sectionLead}>
          {isGerman
            ? 'Alle aktuell konfigurierten Ausgabenkategorien aus der App, konsolidiert auf Jahresbasis.'
            : 'All currently configured app expense categories, consolidated to annual values.'}
        </Text>
      </View>

      <View style={{ flexDirection: 'row', marginBottom: 10 }}>
        <View style={{ width: '32%', marginRight: '2%' }}>
          <View style={styles.card} wrap={false}>
            <Text style={styles.kpiLabel}>{isGerman ? 'Monatlich' : 'Monthly'}</Text>
            <Text style={styles.kpiValue}>{fmtCurrency(expenses.monthlyTotal, locale)}</Text>
          </View>
        </View>

        <View style={{ width: '32%', marginRight: '2%' }}>
          <View style={styles.card} wrap={false}>
            <Text style={styles.kpiLabel}>{isGerman ? 'Jährlich gesamt' : 'Annual Total'}</Text>
            <Text style={styles.kpiValue}>{fmtCurrency(annualTotal, locale)}</Text>
          </View>
        </View>

        <View style={{ width: '34%' }}>
          <View style={styles.card} wrap={false}>
            <Text style={styles.kpiLabel}>{isGerman ? 'Gesamtbedarf' : 'Total Horizon Need'}</Text>
            <Text style={styles.kpiValue}>{fmtCurrency(expenses.totalHorizonAmount, locale)}</Text>
            <Text style={styles.kpiDescription}>
              {fmtNumber(expenses.horizonYears, { locale })} {isGerman ? 'Jahre' : 'years'}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.figure}>
        <H4 style={{ marginBottom: 6 }}>{isGerman ? 'Top-Kategorien nach Betrag' : 'Top Categories by Amount'}</H4>
        <SpendingChart
          monthlyCategories={expenses.monthlyCategories}
          annualCategories={expenses.annualCategories}
          width={495}
          height={175}
          locale={content.locale}
        />
      </View>

      <View style={{ marginTop: 8 }}>
        <View style={styles.card}>
          <H4 style={{ marginBottom: 8 }}>{isGerman ? 'Ausgabendetails' : 'Expense Details'}</H4>
          <Table>
            <TableRow header>
              <TableCell header width="48%">{isGerman ? 'Kategorie' : 'Category'}</TableCell>
              <TableCell header width="16%">{isGerman ? 'Intervall' : 'Interval'}</TableCell>
              <TableCell header width="18%" align="right">{isGerman ? 'Anteil' : 'Share'}</TableCell>
              <TableCell header width="18%" align="right">{isGerman ? 'Jahreswert' : 'Annualized'}</TableCell>
            </TableRow>
            {topCategories.map((category, index) => (
              <TableRow key={`${category.id ?? category.label}-${index}`}>
                <TableCell width="48%">{category.label}</TableCell>
                <TableCell width="16%">
                  {category.interval === 'annual'
                    ? isGerman ? 'jährlich' : 'annual'
                    : isGerman ? 'monatlich' : 'monthly'}
                </TableCell>
                <TableCell width="18%" align="right">
                  {fmtPercent(category.share, 1, locale)}
                </TableCell>
                <TableCell width="18%" align="right">{fmtCurrency(category.annualAmount, locale)}</TableCell>
              </TableRow>
            ))}
          </Table>

          <Text style={{ marginTop: 6, fontSize: 8.5, color: tokens.colors.ink[500] }}>
            {isGerman
              ? 'Hinweis: Die Tabelle zeigt die größten Kostenblöcke. Alle Kategorien fließen in die Simulation ein.'
              : 'Note: The table shows the largest cost drivers. All categories are included in the simulation.'}
          </Text>
        </View>
      </View>
    </View>
  )
}
