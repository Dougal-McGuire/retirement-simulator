import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { styles, tokens } from '../styles'
import { SectionHeader, Table, TableRow, TableCell } from '../primitives'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { fmtCurrency, fmtNumber, fmtPercent } from '@/lib/pdf-generator/formatters'

interface InputsProps {
  content: ReportContent
  sectionNumber?: string
}

export function Inputs({ content, sectionNumber = '02' }: InputsProps) {
  const { profile, assumptions, expenses, finances, projections } = content
  const locale = content.locale === 'en' ? 'en-US' : 'de-DE'
  const isGerman = content.locale !== 'en'

  const baseSpend = expenses.monthlyTotal * 12 + expenses.annualTotal
  const pensionAnnual = finances.monthlyPension * 12
  const realReturn = (1 + assumptions.expectedReturn) / (1 + assumptions.inflation) - 1
  const retireMedian = projections.milestones.find(
    (milestone) => milestone.age === profile.person.retireAge
  )?.p50
  const firstYearWithdrawalRate =
    retireMedian && retireMedian > 0 ? baseSpend / retireMedian : null
  const withdrawalStrategyLabel =
    assumptions.withdrawalStrategy === 'vanguardDynamic'
      ? 'Vanguard Dynamic Spending'
      : isGerman
        ? 'Real konstante Ausgaben'
        : 'Fixed real spending'

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
        ? `${expenses.horizonYears} Jahre gesamt`
        : `${expenses.horizonYears} years total`,
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
      label: isGerman ? 'Kapitalertragssteuer' : 'Capital Gains Tax',
      value: fmtPercent(assumptions.capitalGainsTax / 100, 1, locale),
    },
    {
      label: isGerman ? 'Entnahmestrategie' : 'Withdrawal Strategy',
      value: withdrawalStrategyLabel,
    },
  ]

  if (assumptions.withdrawalStrategy === 'vanguardDynamic') {
    marketRows.push(
      {
        label: isGerman ? 'Entnahmerate' : 'Withdrawal Rate',
        value: fmtPercent(assumptions.dsWithdrawalRate, 2, locale),
      },
      {
        label: isGerman ? 'Obergrenze / Untergrenze' : 'Ceiling / Floor',
        value: `${fmtPercent(assumptions.dsCeilingRate, 1, locale)} / ${fmtPercent(assumptions.dsFloorRate, 1, locale)}`,
      }
    )
  }

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

  const derived: Array<{ label: string; value: string; note: string }> = [
    {
      label: isGerman ? 'Reale Rendite' : 'Real return',
      value: fmtPercent(realReturn, 1, locale),
      note: isGerman ? 'Rendite nach Inflation' : 'return after inflation',
    },
    {
      label: isGerman ? 'Entnahmerate' : 'Withdrawal rate',
      value: firstYearWithdrawalRate !== null ? fmtPercent(firstYearWithdrawalRate, 1, locale) : '–',
      note: isGerman ? 'erstes Ruhestandsjahr' : 'first year of retirement',
    },
    {
      label: isGerman ? 'Überbrückungsjahre' : 'Bridge years',
      value: fmtNumber(bridgeYears, { locale }),
      note: isGerman
        ? `Alter ${profile.person.retireAge}–${profile.person.pensionAge}`
        : `age ${profile.person.retireAge}–${profile.person.pensionAge}`,
    },
    {
      label: isGerman ? 'Sparquote zu Ausgaben' : 'Savings vs spending',
      value: baseSpend > 0 ? fmtPercent(finances.annualSavings / baseSpend, 0, locale) : '–',
      note: isGerman ? 'Sparleistung / Jahresbudget' : 'annual savings / annual budget',
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
            ? 'Parameter des aktuellen Szenarios, direkt aus der App-Konfiguration übernommen.'
            : 'Scenario parameters derived directly from the current app configuration.'
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
                  <Text style={{ fontWeight: 600, color: tokens.colors.ink[900] }}>{row.value}</Text>
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

      {/* Derived figures — the numbers the assumptions imply */}
      <View style={{ flexDirection: 'row', marginBottom: 12 }}>
        {derived.map((item, index) => (
          <View
            key={item.label}
            style={[
              styles.cardMuted,
              {
                flex: 1,
                marginRight: index < derived.length - 1 ? 10 : 0,
                marginBottom: 0,
                paddingVertical: 8,
              },
            ]}
            wrap={false}
          >
            <Text style={styles.kpiLabel}>{item.label}</Text>
            <Text style={[styles.kpiValue, { fontSize: 13, marginTop: 3 }]}>{item.value}</Text>
            <Text style={[styles.kpiDescription, { marginTop: 2 }]}>{item.note}</Text>
          </View>
        ))}
      </View>

      <View style={styles.callout}>
        <Text style={{ fontSize: 8, color: tokens.colors.ink[600], lineHeight: 1.5 }}>
          {isGerman
            ? `Die Simulation basiert auf ${fmtNumber(assumptions.simulationRuns, { locale })} Monte-Carlo-Läufen mit lognormalverteilten Renditen und verwendet die aktuell in der App hinterlegten Ausgabenkategorien.`
            : `The simulation is based on ${fmtNumber(assumptions.simulationRuns, { locale })} Monte Carlo runs with lognormally distributed returns and uses the expense categories currently configured in the app.`}
        </Text>
      </View>
    </View>
  )
}
