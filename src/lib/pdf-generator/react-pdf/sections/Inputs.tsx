import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { SectionHeader, Table, TableRow, TableCell } from '../primitives'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { fmtCurrency, fmtNumber, fmtPercent } from '@/lib/pdf-generator/formatters'
import {
  withdrawalStrategyLabel,
  withdrawalStrategyRows,
} from '@/lib/pdf-generator/withdrawalStrategy'

interface InputsProps {
  content: ReportContent
  sectionNumber?: string
}

export function Inputs({ content, sectionNumber = '02' }: InputsProps) {
  const { profile, assumptions, expenses, finances, simulation } = content
  const locale = content.locale === 'en' ? 'en-US' : 'de-DE'
  const isGerman = content.locale !== 'en'

  const baseSpend = expenses.monthlyTotal * 12 + expenses.annualTotal
  const pensionAnnual = finances.monthlyPension * 12
  const strategyLabel = withdrawalStrategyLabel(assumptions.withdrawalStrategy, isGerman)

  const { person } = profile
  const timelineRows = [
    {
      label: isGerman ? 'Aktuelles Alter' : 'Current Age',
      value: person.currentAge,
      note: isGerman ? 'Start der Simulation' : 'Simulation start',
    },
    {
      label: isGerman ? 'Ruhestand geplant' : 'Retirement Age',
      value: person.retireAge,
      note: isGerman
        ? `in ${person.retireAge - person.currentAge} Jahren`
        : `in ${person.retireAge - person.currentAge} years`,
    },
    {
      label: isGerman ? 'Gesetzliche Rente' : 'State Pension Age',
      value: person.pensionAge,
      note: isGerman ? 'Rentenzahlung beginnt' : 'Pension income starts',
    },
    {
      label: isGerman ? 'Planungsende' : 'Planning Horizon',
      value: person.horizonAge,
      note: isGerman
        ? `${simulation.horizonYears} Jahre gesamt`
        : `${simulation.horizonYears} years total`,
    },
  ]

  const marketRows: Array<{ label: string; value: string }> = [
    {
      label: isGerman ? 'Erwartete Rendite p.a.' : 'Expected Return p.a.',
      value: fmtPercent(assumptions.expectedReturn, 1, locale),
    },
    {
      label: isGerman ? 'Renditevolatilität' : 'Return Volatility',
      value: fmtPercent(assumptions.returnVolatility, 1, locale),
    },
    {
      label: isGerman ? 'Inflation p.a.' : 'Inflation p.a.',
      value: fmtPercent(assumptions.inflation, 1, locale),
    },
    {
      label: isGerman ? 'Inflationsvolatilität' : 'Inflation Volatility',
      value: fmtPercent(assumptions.inflationVolatility, 1, locale),
    },
    {
      label: isGerman ? 'Abgeltungsteuer' : 'Capital Gains Tax',
      value: fmtPercent(assumptions.capitalGainsTax / 100, 1, locale),
    },
    {
      label: isGerman ? 'Entnahmestrategie' : 'Withdrawal Strategy',
      value: strategyLabel,
    },
  ]

  // German tax detail, only when the plan actually uses it — a report for a
  // plan run on the neutral defaults should not sprout four zero rows.
  if (assumptions.taxAllowance > 0) {
    marketRows.push({
      label: isGerman ? 'Sparerpauschbetrag' : 'Tax-free allowance (Sparerpauschbetrag)',
      value: `${fmtCurrency(assumptions.taxAllowance, locale)} (${
        assumptions.householdType === 'couple'
          ? isGerman
            ? 'zusammenveranlagt'
            : 'jointly assessed'
          : isGerman
            ? 'einzelveranlagt'
            : 'single'
      })`,
    })
  }
  if (assumptions.equityFundExemption > 0) {
    marketRows.push({
      label: isGerman ? 'Teilfreistellung' : 'Partial exemption (Teilfreistellung)',
      value: fmtPercent(assumptions.equityFundExemption, 0, locale),
    })
  }
  if (assumptions.pensionTaxablePortion > 0 && assumptions.pensionTaxRate > 0) {
    marketRows.push({
      label: isGerman ? 'Rentenbesteuerung' : 'Pension taxation',
      value: `${fmtPercent(assumptions.pensionTaxablePortion, 0, locale)} ${
        isGerman ? 'Besteuerungsanteil' : 'taxable'
      } × ${fmtPercent(assumptions.pensionTaxRate, 0, locale)}`,
    })
  }
  if (assumptions.legacyTargetReal > 0) {
    marketRows.push({
      label: isGerman ? 'Nachlassziel (heutige Kaufkraft)' : "Legacy goal (today's euros)",
      value: fmtCurrency(assumptions.legacyTargetReal, locale),
    })
  }

  // Only the parameters this strategy actually reads — see `withdrawalStrategy`.
  marketRows.push(...withdrawalStrategyRows(assumptions, locale, isGerman))

  const bridgeYears = Math.max(0, profile.person.pensionAge - profile.person.retireAge)
  const phaseRows: Array<{ phase: string; ages: string; income: string; flow: string }> = [
    {
      phase: isGerman ? 'Ansparphase' : 'Accumulation',
      ages: `${profile.person.currentAge}–${profile.person.retireAge - 1}`,
      income: isGerman ? 'Erwerbseinkommen' : 'Employment income',
      flow: `+${fmtCurrency(finances.annualSavings, locale)}`,
    },
    ...(bridgeYears > 0
      ? [
          {
            phase: isGerman ? 'Überbrückung' : 'Bridge',
            ages: `${profile.person.retireAge}–${profile.person.pensionAge - 1}`,
            income: isGerman ? 'keine Rente' : 'no pension yet',
            flow: `−${fmtCurrency(baseSpend, locale)}`,
          },
        ]
      : []),
    {
      phase: isGerman ? 'Rentenphase' : 'Pension phase',
      ages: `${profile.person.pensionAge}–${profile.person.horizonAge}`,
      income: `${isGerman ? 'Rente' : 'Pension'} ${fmtCurrency(pensionAnnual, locale)}`,
      flow: `−${fmtCurrency(Math.max(0, baseSpend - pensionAnnual), locale)}`,
    },
  ]

  return (
    <View>
      <SectionHeader
        number={sectionNumber}
        overline={isGerman ? 'Eingaben' : 'Inputs'}
        title={isGerman ? 'Planungsannahmen' : 'Planning Assumptions'}
        lead={
          isGerman
            ? simulation.marketModel === 'historical'
              ? `Parameter des aktuellen Szenarios. Im historischen Modus liefert die Marktgeschichte ${simulation.historicalFirstYear}–${simulation.historicalLastYear} Rendite und Inflation — die folgenden Rendite- und Inflationsannahmen werden dabei nicht verwendet.`
              : `Parameter des aktuellen Szenarios, direkt aus der App-Konfiguration übernommen. Grundlage sind ${fmtNumber(simulation.effectiveRuns, { locale })} Monte-Carlo-Läufe.`
            : simulation.marketModel === 'historical'
              ? `Scenario parameters as configured. In historical mode the ${simulation.historicalFirstYear}–${simulation.historicalLastYear} market record supplies returns and inflation — the return and inflation assumptions below are not used.`
              : `Scenario parameters derived directly from the current app configuration, run over ${fmtNumber(simulation.effectiveRuns, { locale })} Monte Carlo paths.`
        }
      />

      {/* Financial position KPIs */}
      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        <View style={[styles.card, { flex: 1, marginRight: 10, marginBottom: 0 }]} wrap={false}>
          <Text style={styles.kpiLabel}>{isGerman ? 'Aktuelles Vermögen' : 'Current Assets'}</Text>
          <Text style={styles.kpiValue}>{fmtCurrency(finances.currentAssets, locale)}</Text>
          <Text style={styles.kpiDescription}>
            {isGerman ? 'Investierbares Kapital heute' : 'Investable capital today'}
          </Text>
        </View>
        <View style={[styles.card, { flex: 1, marginRight: 10, marginBottom: 0 }]} wrap={false}>
          <Text style={styles.kpiLabel}>
            {isGerman ? 'Jährliche Sparleistung' : 'Annual Savings'}
          </Text>
          <Text style={styles.kpiValue}>{fmtCurrency(finances.annualSavings, locale)}</Text>
          <Text style={styles.kpiDescription}>
            {isGerman ? 'Bis zum Ruhestand investiert' : 'Invested until retirement'}
          </Text>
        </View>
        <View style={[styles.card, { flex: 1, marginBottom: 0 }]} wrap={false}>
          <Text style={styles.kpiLabel}>
            {isGerman ? 'Jährlicher Bedarf' : 'Annual Spending Need'}
          </Text>
          <Text style={styles.kpiValue}>{fmtCurrency(baseSpend, locale)}</Text>
          <Text style={styles.kpiDescription}>
            {isGerman ? 'Monatliche + jährliche Ausgaben' : 'Monthly + annual expenses'}
          </Text>
        </View>
      </View>

      {/* Timeline / market assumptions */}
      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        <View style={[styles.card, { width: '48%', marginRight: 10, marginBottom: 0 }]}>
          <Text style={styles.cardTitle}>{isGerman ? 'Zeithorizont' : 'Timeline'}</Text>
          <Table>
            <TableRow header>
              <TableCell header width="40%">
                {isGerman ? 'Ereignis' : 'Milestone'}
              </TableCell>
              <TableCell header width="14%" align="right">
                {isGerman ? 'Alter' : 'Age'}
              </TableCell>
              <TableCell header width="46%" align="right">
                {isGerman ? 'Hinweis' : 'Note'}
              </TableCell>
            </TableRow>
            {timelineRows.map((row, index) => (
              <TableRow key={row.label} alt={index % 2 === 1}>
                <TableCell width="40%">{row.label}</TableCell>
                <TableCell width="14%" align="right">
                  <Text style={{ fontWeight: 600, color: tokens.colors.ink[900] }}>
                    {fmtNumber(row.value, { locale })}
                  </Text>
                </TableCell>
                <TableCell width="46%" align="right">
                  <Text style={{ fontSize: 7, color: tokens.colors.ink[500] }}>{row.note}</Text>
                </TableCell>
              </TableRow>
            ))}
          </Table>
        </View>

        <View style={[styles.card, { flex: 1, marginBottom: 0 }]}>
          <Text style={styles.cardTitle}>{isGerman ? 'Marktannahmen' : 'Market Assumptions'}</Text>
          <Table>
            {marketRows.map((row, index) => (
              <TableRow key={row.label} alt={index % 2 === 1}>
                <TableCell width="58%">{row.label}</TableCell>
                <TableCell width="42%" align="right">
                  <Text style={{ fontWeight: 600, color: tokens.colors.ink[900] }}>
                    {row.value}
                  </Text>
                </TableCell>
              </TableRow>
            ))}
          </Table>
        </View>
      </View>

      {/* Phases: what actually flows in and out of the portfolio, and when */}
      <View style={[styles.card, { marginBottom: 12 }]}>
        <Text style={[styles.cardTitle, { marginBottom: 3 }]}>
          {isGerman ? 'Phasen des Plans' : 'Phases of the Plan'}
        </Text>
        <Text style={{ fontSize: 7, color: tokens.colors.ink[500], marginBottom: 4 }}>
          {isGerman
            ? 'Netto-Fluss zum bzw. aus dem Depot pro Jahr, in heutigen Beträgen und vor Marktrendite.'
            : 'Net flow to or from the portfolio per year, in today’s amounts and before market returns.'}
        </Text>
        <Table>
          <TableRow header>
            <TableCell header width="26%">
              {isGerman ? 'Phase' : 'Phase'}
            </TableCell>
            <TableCell header width="18%">
              {isGerman ? 'Alter' : 'Ages'}
            </TableCell>
            <TableCell header width="34%">
              {isGerman ? 'Einkommensquelle' : 'Income source'}
            </TableCell>
            <TableCell header width="22%" align="right">
              {isGerman ? 'Depotfluss p.a.' : 'Portfolio flow p.a.'}
            </TableCell>
          </TableRow>
          {phaseRows.map((row, index) => (
            <TableRow key={row.phase} alt={index % 2 === 1}>
              <TableCell width="26%">
                <Text style={{ fontWeight: 600, color: tokens.colors.ink[900] }}>{row.phase}</Text>
              </TableCell>
              <TableCell width="18%">{row.ages}</TableCell>
              <TableCell width="34%">
                <Text style={{ fontSize: 7.5 }}>{row.income}</Text>
              </TableCell>
              <TableCell width="22%" align="right">
                <Text
                  style={{
                    fontWeight: 600,
                    color: row.flow.startsWith('+')
                      ? tokens.colors.success[600]
                      : tokens.colors.ink[900],
                  }}
                >
                  {row.flow}
                </Text>
              </TableCell>
            </TableRow>
          ))}
        </Table>
      </View>

    </View>
  )
}
