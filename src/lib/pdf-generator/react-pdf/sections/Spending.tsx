import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { SectionHeader, Table, TableRow, TableCell } from '../primitives'
import { SpendingChart } from '../charts'
import type { ReportCashFlow, ReportContent } from '@/lib/pdf-generator/reportTypes'
import { fmtCurrency, fmtNumber, fmtPercent } from '@/lib/pdf-generator/formatters'

interface SpendingProps {
  content: ReportContent
  sectionNumber?: string
}

export function Spending({ content, sectionNumber = '04' }: SpendingProps) {
  const { expenses, simulation } = content
  const locale = content.locale === 'en' ? 'en-US' : 'de-DE'
  const isGerman = content.locale !== 'en'

  const annualTotal = expenses.monthlyTotal * 12 + expenses.annualTotal
  // The section has to hold the chart, the category table AND the scheduled
  // flows on one page; every flow row costs one category row. Shrinking the
  // list is preferable to spilling a two-line table onto a blank page.
  const scheduledCount = (expenses.scheduledFlows ?? []).length
  const categoryLimit = scheduledCount > 0 ? Math.max(4, 7 - scheduledCount) : 8
  const topCategories = expenses.allCategories.slice(0, categoryLimit)
  const shownLabels = new Set(topCategories.map((category) => category.id ?? category.label))
  const shown = (list: typeof expenses.monthlyCategories) =>
    list.filter((category) => shownLabels.has(category.id ?? category.label))
  const topShare = topCategories.reduce((sum, category) => sum + category.share, 0)

  // Scheduled flows live here rather than with the planning assumptions: they
  // are spending (or income that offsets it), and the "total horizon need" KPI
  // above now counts them, so the reader can see what went into the figure.
  const scheduledFlows = expenses.scheduledFlows ?? []
  const incomeWord = isGerman ? 'Einnahme' : 'Income'
  const expenseWord = isGerman ? 'Ausgabe' : 'Expense'
  const frequencyLabel = (frequency: ReportCashFlow['frequency']) => {
    if (frequency === 'once') return isGerman ? 'einmalig' : 'one-off'
    if (frequency === 'annual') return isGerman ? 'jährlich' : 'annual'
    return isGerman ? 'monatlich' : 'monthly'
  }
  /** Ages the flow is active for — open ends read as "from"/"until". */
  const periodLabel = (flow: ReportCashFlow) => {
    const from = flow.startAge
    const to = flow.frequency === 'once' ? from : flow.endAge
    if (flow.frequency === 'once') {
      return from === undefined ? '–' : `${isGerman ? 'Alter' : 'age'} ${from}`
    }
    if (from === undefined && to === undefined) return isGerman ? 'gesamter Plan' : 'whole plan'
    if (from !== undefined && to !== undefined) return `${from}–${to}`
    if (from !== undefined) return `${isGerman ? 'ab' : 'from'} ${from}`
    return `${isGerman ? 'bis' : 'until'} ${to}`
  }

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
            {expenses.scheduledExpenseTotal > 0
              ? isGerman
                ? `Über ${fmtNumber(simulation.horizonYears, { locale })} Jahre, ohne Inflation · inkl. ${fmtCurrency(expenses.scheduledExpenseTotal, locale)} geplanter Zahlungen`
                : `Over ${fmtNumber(simulation.horizonYears, { locale })} years, before inflation · incl. ${fmtCurrency(expenses.scheduledExpenseTotal, locale)} of scheduled flows`
              : isGerman
                ? `Über ${fmtNumber(simulation.horizonYears, { locale })} Jahre, ohne Inflation`
                : `Over ${fmtNumber(simulation.horizonYears, { locale })} years, before inflation`}
          </Text>
        </View>
      </View>

      {/* Bar chart */}
      <View style={[styles.figure, { marginTop: 0, marginBottom: 12 }]}>
        <Text style={[styles.cardTitle, { marginBottom: 8 }]}>
          {isGerman ? 'Kostentreiber (Jahreswerte)' : 'Cost Drivers (Annualized)'}
        </Text>
        <SpendingChart
          monthlyCategories={shown(expenses.monthlyCategories)}
          annualCategories={shown(expenses.annualCategories)}
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

      {scheduledFlows.length > 0 && (
        <View style={[styles.card, { marginTop: 12, marginBottom: 0 }]}>
          <Text style={[styles.cardTitle, { marginBottom: 3 }]}>
            {isGerman ? 'Geplante Zahlungsströme' : 'Scheduled Cash Flows'}
          </Text>
          <Text style={{ fontSize: 7, color: tokens.colors.ink[500], marginBottom: 3 }}>
            {isGerman
              ? 'Zusätzlich zu den laufenden Ausgaben oben, in heutigen Beträgen — im Gesamtbedarf enthalten.'
              : 'On top of the recurring spending above, in today’s amounts — included in the total horizon need.'}
          </Text>
          <Table>
            <TableRow header>
              <TableCell header width="34%">
                {isGerman ? 'Position' : 'Item'}
              </TableCell>
              <TableCell header width="20%">
                {isGerman ? 'Rhythmus' : 'Frequency'}
              </TableCell>
              <TableCell header width="20%">
                {isGerman ? 'Zeitraum' : 'Period'}
              </TableCell>
              <TableCell header width="26%" align="right">
                {isGerman ? 'Betrag' : 'Amount'}
              </TableCell>
            </TableRow>
            {scheduledFlows.map((flow, index) => (
              <TableRow key={flow.id} alt={index % 2 === 1}>
                <TableCell width="34%">
                  <Text style={{ fontWeight: 600, color: tokens.colors.ink[900] }}>
                    {flow.name || (flow.kind !== 'expense' ? incomeWord : expenseWord)}
                  </Text>
                </TableCell>
                <TableCell width="20%">{frequencyLabel(flow.frequency)}</TableCell>
                <TableCell width="20%">{periodLabel(flow)}</TableCell>
                <TableCell width="26%" align="right">
                  <Text
                    style={{
                      fontWeight: 600,
                      color:
                        flow.kind !== 'expense'
                          ? tokens.colors.success[600]
                          : tokens.colors.ink[900],
                    }}
                  >
                    {`${flow.kind !== 'expense' ? '+' : '−'}${fmtCurrency(flow.amount, locale)}`}
                    {flow.inflationLinked === false ? ' (nominal)' : ''}
                  </Text>
                </TableCell>
              </TableRow>
            ))}
          </Table>
        </View>
      )}
    </View>
  )
}
