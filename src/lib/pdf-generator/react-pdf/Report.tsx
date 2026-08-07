import React from 'react'
import { View, Text, Link } from '@react-pdf/renderer'
import { ReportDocument, ReportPage, CoverPage } from './Document'
import { ExecutiveSummary, Inputs, Results, Spending, Recommendations } from './sections'
import { SectionHeader, Table, TableRow, TableCell } from './primitives'
import { CoverSparkline } from './charts'
import { styles, tokens } from './styles'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import {
  fmtCompactCurrency,
  fmtCurrency,
  fmtDateLong,
  fmtNumber,
  fmtPercent,
} from '@/lib/pdf-generator/formatters'
import './fonts'

interface RetirementReportProps {
  content: ReportContent
}

interface ReportSection {
  id: string
  number: string
  title: string
  description: string
  render: () => React.ReactNode
}

function AppendixSection({
  content,
  isGerman,
  intlLocale,
  sectionNumber,
}: {
  content: ReportContent
  isGerman: boolean
  intlLocale: string
  sectionNumber: string
}) {
  const { assumptions } = content

  const percentileRows = [
    {
      key: 'P10',
      text: isGerman
        ? 'Konservatives Stressszenario — 10 % der Simulationsläufe verlaufen schlechter.'
        : 'Conservative stress scenario — 10% of simulation runs perform worse.',
    },
    {
      key: 'P20',
      text: isGerman
        ? 'Vorsichtiges Szenario — 20 % der Läufe verlaufen schlechter.'
        : 'Cautious scenario — 20% of runs perform worse.',
    },
    {
      key: 'P50',
      text: isGerman
        ? 'Medianpfad — der typische Verlauf über alle Läufe.'
        : 'Median path — the typical trajectory across all runs.',
    },
    {
      key: 'P80',
      text: isGerman
        ? 'Günstiges Szenario — 20 % der Läufe verlaufen besser.'
        : 'Favourable scenario — 20% of runs perform better.',
    },
    {
      key: 'P90',
      text: isGerman
        ? 'Positives Szenario — 10 % der Läufe verlaufen besser.'
        : 'Upside scenario — 10% of runs perform better.',
    },
  ]

  return (
    <View id="section-appendix">
      <SectionHeader
        number={sectionNumber}
        overline={isGerman ? 'Anhang' : 'Appendix'}
        title={isGerman ? 'Methodik & Hinweise' : 'Methodology & Notes'}
        lead={
          isGerman
            ? 'Grundlagen der Simulation, Lesehilfe für Perzentile und rechtliche Hinweise.'
            : 'Simulation fundamentals, a guide to reading percentiles, and legal notes.'
        }
      />

      <View style={[styles.card, { marginBottom: 12 }]}>
        <Text style={styles.cardTitle}>{isGerman ? 'Methodik' : 'Methodology'}</Text>
        <Text style={{ fontSize: 8.5, color: tokens.colors.ink[700], lineHeight: 1.6 }}>
          {isGerman
            ? `Die Analyse basiert auf einer Monte-Carlo-Simulation mit ${fmtNumber(assumptions.simulationRuns, { locale: intlLocale })} unabhängigen Läufen. Marktrenditen werden als lognormalverteilte Zufallsgrößen mit einem Erwartungswert von ${fmtPercent(assumptions.expectedReturn, 1, intlLocale)} p.a. und einer Volatilität von ${fmtPercent(assumptions.returnVolatility, 1, intlLocale)} modelliert; die Inflation folgt einem Erwartungswert von ${fmtPercent(assumptions.inflation, 1, intlLocale)} bei ${fmtPercent(assumptions.inflationVolatility, 1, intlLocale)} Volatilität. In der Entnahmephase kommt die Strategie „${assumptions.withdrawalStrategy === 'vanguardDynamic' ? 'Vanguard Dynamic Spending' : 'Real konstante Ausgaben'}“ zur Anwendung; Kapitalerträge werden mit ${fmtPercent(assumptions.capitalGainsTax / 100, 1, intlLocale)} besteuert.`
            : `The analysis is based on a Monte Carlo simulation with ${fmtNumber(assumptions.simulationRuns, { locale: intlLocale })} independent runs. Market returns are modelled as lognormally distributed random variables with an expected value of ${fmtPercent(assumptions.expectedReturn, 1, intlLocale)} p.a. and a volatility of ${fmtPercent(assumptions.returnVolatility, 1, intlLocale)}; inflation follows an expected value of ${fmtPercent(assumptions.inflation, 1, intlLocale)} with ${fmtPercent(assumptions.inflationVolatility, 1, intlLocale)} volatility. The drawdown phase applies the "${assumptions.withdrawalStrategy === 'vanguardDynamic' ? 'Vanguard Dynamic Spending' : 'Fixed real spending'}" strategy; capital gains are taxed at ${fmtPercent(assumptions.capitalGainsTax / 100, 1, intlLocale)}.`}
        </Text>
      </View>

      <View style={[styles.card, { marginBottom: 12 }]}>
        <Text style={styles.cardTitle}>
          {isGerman ? 'Perzentile richtig lesen' : 'How to Read Percentiles'}
        </Text>
        <Table>
          {percentileRows.map((row, index) => (
            <TableRow key={row.key} alt={index % 2 === 1}>
              <TableCell width="12%">
                <Text style={{ fontWeight: 600, color: tokens.colors.accent[700] }}>{row.key}</Text>
              </TableCell>
              <TableCell width="88%">{row.text}</TableCell>
            </TableRow>
          ))}
        </Table>
      </View>

      <View style={[styles.callout, { borderLeftColor: tokens.colors.ink[400] }]}>
        <Text
          style={{ fontSize: 8.5, fontWeight: 600, color: tokens.colors.ink[900], marginBottom: 3 }}
        >
          {isGerman ? 'Wichtiger Hinweis' : 'Important Note'}
        </Text>
        <Text style={{ fontSize: 8, color: tokens.colors.ink[600], lineHeight: 1.55 }}>
          {isGerman
            ? 'Dieser Bericht dient ausschließlich der Information und stellt keine Anlage-, Steuer- oder Rechtsberatung dar. Alle Projektionen sind modellbasierte Schätzungen; tatsächliche Ergebnisse können erheblich abweichen. Vergangene Wertentwicklungen sind kein verlässlicher Indikator für zukünftige Ergebnisse.'
            : 'This report is provided for information purposes only and does not constitute investment, tax, or legal advice. All projections are model-based estimates; actual outcomes may differ materially. Past performance is not a reliable indicator of future results.'}
        </Text>
      </View>
    </View>
  )
}

export function RetirementReport({ content }: RetirementReportProps) {
  const { metadata, profile, expenses, assumptions, projections } = content
  const intlLocale = content.locale === 'en' ? 'en-US' : 'de-DE'
  const isGerman = content.locale !== 'en'

  const brandName = isGerman ? 'Ruhestandsplaner' : 'Retirement Simulator'
  const reportTitle = isGerman ? 'Ruhestandsbericht' : 'Retirement Plan Report'
  const generatedLong = fmtDateLong(metadata.generatedAt, intlLocale)

  const headerConfig = {
    brand: brandName,
    right: `${reportTitle}  ·  ${generatedLong}`,
  }
  const footerConfig = {
    left: metadata.id,
    center: isGerman
      ? 'Vertraulich · Keine Anlageberatung'
      : 'Confidential · Not investment advice',
    showPageNumber: true,
    pageLabel: isGerman ? 'Seite' : 'Page',
    pageOfLabel: isGerman ? 'von' : 'of',
  }

  const annualSpend = expenses.monthlyTotal * 12 + expenses.annualTotal
  const successRate = profile.success.successRate
  const badgeTone: 'success' | 'warning' | 'danger' =
    successRate >= 0.8 ? 'success' : successRate >= 0.6 ? 'warning' : 'danger'

  const milestones = projections.milestones
  const finalMedian = milestones[milestones.length - 1]?.p50 ?? 0

  const sections: ReportSection[] = [
    {
      id: 'section-summary',
      number: '01',
      title: isGerman ? 'Management Summary' : 'Management Summary',
      description: isGerman
        ? 'Erfolgsquote, Planungs-Score und Kernbefunde im Überblick'
        : 'Success rate, plan score, and key findings at a glance',
      render: () => <ExecutiveSummary content={content} sectionNumber="01" />,
    },
    {
      id: 'section-inputs',
      number: '02',
      title: isGerman ? 'Planungsannahmen' : 'Planning Assumptions',
      description: isGerman
        ? 'Zeithorizont, Vermögensdaten und Marktannahmen'
        : 'Timeline, financial position, and market assumptions',
      render: () => <Inputs content={content} sectionNumber="02" />,
    },
    {
      id: 'section-results',
      number: '03',
      title: isGerman ? 'Simulationsergebnis' : 'Simulation Outcome',
      description: isGerman
        ? 'Vermögensentwicklung nach Perzentilen über den Planungshorizont'
        : 'Asset projection by percentile across the planning horizon',
      render: () => <Results content={content} sectionNumber="03" />,
    },
    {
      id: 'section-spending',
      number: '04',
      title: isGerman ? 'Ausgabenanalyse' : 'Spending Analysis',
      description: isGerman
        ? 'Budgetstruktur und größte Kostentreiber'
        : 'Budget structure and largest cost drivers',
      render: () => <Spending content={content} sectionNumber="04" />,
    },
    {
      id: 'section-recommendations',
      number: '05',
      title: isGerman ? 'Handlungsempfehlungen' : 'Recommended Actions',
      description: isGerman
        ? 'Priorisierte Maßnahmen zur Stärkung des Plans'
        : 'Prioritised measures to strengthen the plan',
      render: () => <Recommendations content={content} sectionNumber="05" />,
    },
    {
      id: 'section-appendix',
      number: '06',
      title: isGerman ? 'Methodik & Hinweise' : 'Methodology & Notes',
      description: isGerman
        ? 'Simulationsgrundlagen, Lesehilfe und rechtliche Hinweise'
        : 'Simulation fundamentals, reading guide, and legal notes',
      render: () => (
        <AppendixSection
          content={content}
          isGerman={isGerman}
          intlLocale={intlLocale}
          sectionNumber="06"
        />
      ),
    },
  ]

  const frontMatterPages = 2 // cover + TOC page
  const toc = sections.map((section, index) => ({
    ...section,
    page: frontMatterPages + index + 1,
  }))

  return (
    <ReportDocument
      title={reportTitle}
      subject={
        isGerman
          ? 'Monte-Carlo Analyse Ruhestandsplanung'
          : 'Monte Carlo retirement planning analysis'
      }
    >
      <CoverPage
        brand={brandName}
        classification={isGerman ? 'Vertraulich' : 'Confidential'}
        overline={isGerman ? 'Monte-Carlo-Analyse · Ruhestandsplanung' : 'Monte Carlo Analysis · Retirement Planning'}
        title={reportTitle}
        subtitle={
          isGerman
            ? 'Professionelle Auswertung Ihrer aktuellen Simulationsdaten mit Fokus auf Tragfähigkeit, Risiken und konkreten Handlungsbedarf.'
            : 'A professional evaluation of your current simulation data, focused on sustainability, risk, and concrete actions.'
        }
        badge={`${isGerman ? 'Erfolgsquote' : 'Success Rate'} ${fmtPercent(successRate, 1, intlLocale)}`}
        badgeTone={badgeTone}
        stats={[
          {
            label: isGerman ? 'Erfolgsquote' : 'Success Rate',
            value: fmtPercent(successRate, 1, intlLocale),
            caption: isGerman
              ? `${fmtNumber(assumptions.simulationRuns, { locale: intlLocale })} Simulationen`
              : `${fmtNumber(assumptions.simulationRuns, { locale: intlLocale })} simulations`,
          },
          {
            label: isGerman ? 'Median am Horizont' : 'Median at Horizon',
            value: fmtCompactCurrency(finalMedian, intlLocale),
            caption: isGerman
              ? `Alter ${profile.person.horizonAge}`
              : `Age ${profile.person.horizonAge}`,
          },
          {
            label: isGerman ? 'Planungshorizont' : 'Planning Horizon',
            value: `${fmtNumber(expenses.horizonYears, { locale: intlLocale })} ${isGerman ? 'Jahre' : 'yrs'}`,
            caption: `${isGerman ? 'Alter' : 'Age'} ${profile.person.currentAge}–${profile.person.horizonAge}`,
          },
          {
            label: isGerman ? 'Jahresbudget' : 'Annual Budget',
            value: fmtCurrency(annualSpend, intlLocale),
            caption: isGerman ? 'Ausgaben p.a.' : 'Spending p.a.',
          },
        ]}
        hero={
          milestones.length >= 2 ? (
            <CoverSparkline data={milestones} locale={content.locale} />
          ) : undefined
        }
        heroCaption={
          isGerman
            ? 'Medianpfad des Vermögens mit P10–P90-Band über den Planungshorizont'
            : 'Median asset path with P10–P90 band across the planning horizon'
        }
        metadata={[
          { label: isGerman ? 'Berichts-ID' : 'Report ID', value: metadata.id },
          { label: isGerman ? 'Erstellt am' : 'Generated', value: generatedLong },
          {
            label: isGerman ? 'Entnahmestrategie' : 'Withdrawal Strategy',
            value:
              assumptions.withdrawalStrategy === 'vanguardDynamic'
                ? 'Vanguard Dynamic'
                : isGerman
                  ? 'Real konstant'
                  : 'Fixed real',
          },
          {
            label: 'Version',
            value: metadata.version ?? '1.0.0',
          },
        ]}
        disclaimer={
          isGerman
            ? 'Dieser Bericht wurde automatisch aus Ihren Simulationsdaten erstellt. Er dient ausschließlich der Information und stellt keine Anlage-, Steuer- oder Rechtsberatung dar.'
            : 'This report was generated automatically from your simulation data. It is provided for information purposes only and does not constitute investment, tax, or legal advice.'
        }
      />

      {/* Table of contents */}
      <ReportPage header={headerConfig} footer={footerConfig}>
        <View>
          <SectionHeader
            overline={isGerman ? 'Übersicht' : 'Overview'}
            title={isGerman ? 'Inhaltsverzeichnis' : 'Table of Contents'}
          />

          {toc.map((entry) => (
            <Link key={entry.id} src={`#${entry.id}`} style={{ textDecoration: 'none' }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 9,
                  borderBottomWidth: 0.5,
                  borderBottomColor: tokens.colors.ink[200],
                }}
              >
                <Text
                  style={{
                    width: 30,
                    fontSize: 11,
                    fontWeight: 700,
                    color: tokens.colors.accent[600],
                  }}
                >
                  {entry.number}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10.5, fontWeight: 600, color: tokens.colors.ink[900] }}>
                    {entry.title}
                  </Text>
                  <Text style={{ fontSize: 7.5, color: tokens.colors.ink[500], marginTop: 2 }}>
                    {entry.description}
                  </Text>
                </View>
                <Text style={{ fontSize: 9, fontWeight: 500, color: tokens.colors.ink[600] }}>
                  {entry.page}
                </Text>
              </View>
            </Link>
          ))}

          {/* At a glance strip */}
          <View style={{ marginTop: 24 }}>
            <Text style={[styles.label, { marginBottom: 8 }]}>
              {isGerman ? 'Kurzüberblick' : 'At a Glance'}
            </Text>
            <View style={{ flexDirection: 'row' }}>
              <View style={[styles.cardMuted, { flex: 1, marginRight: 10, marginBottom: 0 }]} wrap={false}>
                <Text style={styles.kpiLabel}>{isGerman ? 'Erfolgsquote' : 'Success Rate'}</Text>
                <Text style={styles.kpiValue}>{fmtPercent(successRate, 1, intlLocale)}</Text>
                <Text style={styles.kpiDescription}>
                  {isGerman ? 'Anteil erfolgreicher Läufe' : 'Share of successful runs'}
                </Text>
              </View>
              <View style={[styles.cardMuted, { flex: 1, marginRight: 10, marginBottom: 0 }]} wrap={false}>
                <Text style={styles.kpiLabel}>{isGerman ? 'Planungs-Score' : 'Plan Score'}</Text>
                <Text style={styles.kpiValue}>
                  {profile.success.score !== null
                    ? `${fmtNumber(profile.success.score, { locale: intlLocale })} / 100`
                    : '–'}
                </Text>
                <Text style={styles.kpiDescription}>
                  {profile.success.label ?? (isGerman ? 'Nicht verfügbar' : 'Not available')}
                </Text>
              </View>
              <View style={[styles.cardMuted, { flex: 1, marginBottom: 0 }]} wrap={false}>
                <Text style={styles.kpiLabel}>{isGerman ? 'Simulationen' : 'Simulations'}</Text>
                <Text style={styles.kpiValue}>
                  {fmtNumber(assumptions.simulationRuns, { locale: intlLocale })}
                </Text>
                <Text style={styles.kpiDescription}>
                  {isGerman ? 'Monte-Carlo-Läufe' : 'Monte Carlo runs'}
                </Text>
              </View>
            </View>
          </View>
        </View>
      </ReportPage>

      {sections.map((section) => (
        <ReportPage key={section.id} header={headerConfig} footer={footerConfig}>
          <View id={section.id}>{section.render()}</View>
        </ReportPage>
      ))}
    </ReportDocument>
  )
}

export default RetirementReport
