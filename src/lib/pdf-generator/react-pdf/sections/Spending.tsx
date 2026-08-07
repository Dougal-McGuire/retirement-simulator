import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { SectionHeader, Table, TableRow, TableCell } from '../primitives'
import { SpendingChart } from '../charts'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { fmtCurrency, fmtNumber, fmtPercent } from '@/lib/pdf-generator/formatters'

interface SpendingProps {
  content: ReportContent
  sectionNumber?: string
}

export function Spending({ content, sectionNumber = '04' }: SpendingProps) {
  const { expenses } = content
  const locale = content.locale === 'en' ? 'en-US' : 'de-DE'
  const isGerman = content.locale !== 'en'

  const annualTotal = expenses.monthlyTotal * 12 + expenses.annualTotal
  const topCategories = expenses.allCategories.slice(0, 8)
  const topShare = topCategories.reduce((sum, category) => sum + category.share, 0)

  return (
    <View>
      <SectionHeader
        number={sectionNumber}
        overline={isGerman ? 'Ausgaben' : 'Spending'}
        title={isGerman ? 'Ausgabenanalyse' : 'Spending Analysis'}
        lead={
          isGerman
            ? 'Alle aktuell konfigurierten Ausgabenkategorien, konsolidiert auf Jahresbasis.'
            : 'All currently configured expense categories, consolidated to annual values.'
        }
      />

      {/* KPI row */}
      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        <View style={[styles.card, { flex: 1, marginRight: 10, marginBottom: 0 }]} wrap={false}>
          <Text style={styles.kpiLabel}>{isGerman ? 'Monatliches Budget' : 'Monthly Budget'}</Text>
          <Text style={styles.kpiValue}>{fmtCurrency(expenses.monthlyTotal, locale)}</Text>
          <Text style={styles.kpiDescription}>
            {isGerman ? 'Wiederkehrende Ausgaben' : 'Recurring expenses'}
          </Text>
        </View>
        <View style={[styles.card, { flex: 1, marginRight: 10, marginBottom: 0 }]} wrap={false}>
          <Text style={styles.kpiLabel}>{isGerman ? 'Jahresbudget' : 'Annual Budget'}</Text>
          <Text style={styles.kpiValue}>{fmtCurrency(annualTotal, locale)}</Text>
          <Text style={styles.kpiDescription}>
            {isGerman ? 'Monatlich × 12 + jährliche Posten' : 'Monthly × 12 + annual items'}
          </Text>
        </View>
        <View style={[styles.card, { flex: 1, marginBottom: 0 }]} wrap={false}>
          <Text style={styles.kpiLabel}>{isGerman ? 'Gesamtbedarf' : 'Total Horizon Need'}</Text>
          <Text style={styles.kpiValue}>{fmtCurrency(expenses.totalHorizonAmount, locale)}</Text>
          <Text style={styles.kpiDescription}>
            {isGerman
              ? `Über ${fmtNumber(expenses.horizonYears, { locale })} Jahre, ohne Inflation`
              : `Over ${fmtNumber(expenses.horizonYears, { locale })} years, before inflation`}
          </Text>
        </View>
      </View>

      {/* Bar chart */}
      <View style={[styles.figure, { marginTop: 0, marginBottom: 12 }]}>
        <Text style={[styles.cardTitle, { marginBottom: 8 }]}>
          {isGerman ? 'Kostentreiber (Jahreswerte)' : 'Cost Drivers (Annualized)'}
        </Text>
        <SpendingChart
          monthlyCategories={expenses.monthlyCategories}
          annualCategories={expenses.annualCategories}
          width={481}
          locale={content.locale}
        />
      </View>

      {/* Detail table */}
      <View style={[styles.card, { marginBottom: 0 }]}>
        <Text style={styles.cardTitle}>{isGerman ? 'Ausgabendetails' : 'Expense Details'}</Text>
        <Table>
          <TableRow header>
            <TableCell header width="40%">
              {isGerman ? 'Kategorie' : 'Category'}
            </TableCell>
            <TableCell header width="14%">
              {isGerman ? 'Intervall' : 'Interval'}
            </TableCell>
            <TableCell header width="16%" align="right">
              {isGerman ? 'Betrag' : 'Amount'}
            </TableCell>
            <TableCell header width="15%" align="right">
              {isGerman ? 'Jahreswert' : 'Annualized'}
            </TableCell>
            <TableCell header width="15%" align="right">
              {isGerman ? 'Anteil' : 'Share'}
            </TableCell>
          </TableRow>
          {topCategories.map((category, index) => (
            <TableRow key={`${category.id ?? category.label}-${index}`} alt={index % 2 === 1}>
              <TableCell width="40%">{category.label}</TableCell>
              <TableCell width="14%">
                <Text style={{ fontSize: 7, color: tokens.colors.ink[500] }}>
                  {category.interval === 'annual'
                    ? isGerman
                      ? 'jährlich'
                      : 'annual'
                    : isGerman
                      ? 'monatlich'
                      : 'monthly'}
                </Text>
              </TableCell>
              <TableCell width="16%" align="right">
                {category.originalAmount !== undefined
                  ? fmtCurrency(category.originalAmount, locale)
                  : '–'}
              </TableCell>
              <TableCell width="15%" align="right">
                <Text style={{ fontWeight: 600, color: tokens.colors.ink[900] }}>
                  {fmtCurrency(category.annualAmount, locale)}
                </Text>
              </TableCell>
              <TableCell width="15%" align="right">
                {fmtPercent(category.share, 1, locale)}
              </TableCell>
            </TableRow>
          ))}
          <TableRow total>
            <TableCell width="54%">
              <Text style={{ fontWeight: 600, color: tokens.colors.ink[900] }}>
                {isGerman ? 'Summe (Top-Kategorien)' : 'Total (top categories)'}
              </Text>
            </TableCell>
            <TableCell width="16%" align="right">
              <Text> </Text>
            </TableCell>
            <TableCell width="15%" align="right">
              <Text style={{ fontWeight: 700, color: tokens.colors.ink[900] }}>
                {fmtCurrency(
                  topCategories.reduce((sum, category) => sum + category.annualAmount, 0),
                  locale
                )}
              </Text>
            </TableCell>
            <TableCell width="15%" align="right">
              <Text style={{ fontWeight: 600, color: tokens.colors.ink[900] }}>
                {fmtPercent(topShare, 1, locale)}
              </Text>
            </TableCell>
          </TableRow>
        </Table>

        <Text style={{ marginTop: 5, fontSize: 7, color: tokens.colors.ink[400], lineHeight: 1.4 }}>
          {isGerman
            ? 'Die Tabelle zeigt die größten Kostenblöcke; sämtliche Kategorien fließen in die Simulation ein.'
            : 'The table shows the largest cost drivers; all categories are included in the simulation.'}
        </Text>
      </View>
    </View>
  )
}
