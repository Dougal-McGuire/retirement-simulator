import React from 'react'
import { View, Text, Link } from '@react-pdf/renderer'
import { ReportDocument, ReportPage, CoverPage } from './Document'
import { ExecutiveSummary, Inputs, Results, Spending, Recommendations } from './sections'
import { H2, Table, TableRow, TableCell } from './primitives'
import { styles, tokens } from './styles'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { fmtCurrency, fmtDate, fmtNumber, fmtPercent } from '@/lib/pdf-generator/formatters'
import './fonts'

interface RetirementReportProps {
  content: ReportContent
}

interface ReportSection {
  id: string
  title: string
  render: () => React.ReactNode
}

function AppendixSection({
  content,
  isGerman,
  intlLocale,
}: {
  content: ReportContent
  isGerman: boolean
  intlLocale: string
}) {
  const { assumptions } = content

  return (
    <View id="section-appendix">
      <H2>{isGerman ? 'Anhang' : 'Appendix'}</H2>

      <View style={styles.card}>
        <Text style={styles.label}>{isGerman ? 'Methodik' : 'Methodology'}</Text>
        <Text
          style={{ marginTop: 5, fontSize: 9.5, color: tokens.colors.ink[700], lineHeight: 1.5 }}
        >
          {isGerman
            ? `Monte-Carlo-Simulation mit ${fmtNumber(assumptions.simulationRuns, { locale: intlLocale })} Läufen. Zufallsrenditen basieren auf Erwartungswert ${fmtPercent(assumptions.expectedReturn, 1, intlLocale)} und Volatilität ${fmtPercent(assumptions.returnVolatility, 1, intlLocale)}. Entnahmestrategie: ${assumptions.withdrawalStrategy === 'vanguardDynamic' ? 'Vanguard Dynamic Spending' : 'real konstante Ausgaben'}.`
            : `Monte Carlo simulation with ${fmtNumber(assumptions.simulationRuns, { locale: intlLocale })} runs. Random returns use an expected value of ${fmtPercent(assumptions.expectedReturn, 1, intlLocale)} and volatility of ${fmtPercent(assumptions.returnVolatility, 1, intlLocale)}. Withdrawal strategy: ${assumptions.withdrawalStrategy === 'vanguardDynamic' ? 'Vanguard Dynamic Spending' : 'fixed real spending'}.`}
        </Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>
          {isGerman ? 'Interpretationshilfe' : 'Interpretation Guide'}
        </Text>
        <Table>
          <TableRow>
            <TableCell width="20%">P10</TableCell>
            <TableCell width="80%">
              {isGerman
                ? 'Konservatives Stressszenario (10 % der Läufe schlechter).'
                : 'Conservative stress scenario (10% of runs are worse).'}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell width="20%">P50</TableCell>
            <TableCell width="80%">
              {isGerman ? 'Medianpfad (typischer Verlauf).' : 'Median path (typical trajectory).'}
            </TableCell>
          </TableRow>
          <TableRow>
            <TableCell width="20%">P90</TableCell>
            <TableCell width="80%">
              {isGerman
                ? 'Positives Szenario (10 % der Läufe besser).'
                : 'Upside scenario (10% of runs are better).'}
            </TableCell>
          </TableRow>
        </Table>
      </View>

      <View style={[styles.card, { borderLeftWidth: 3, borderLeftColor: tokens.colors.ink[400] }]}>
        <Text style={{ fontSize: 8.5, color: tokens.colors.ink[600], lineHeight: 1.5 }}>
          {isGerman
            ? 'Hinweis: Dieser Bericht stellt keine Anlageberatung dar und ersetzt keine individuelle steuerliche oder rechtliche Beratung.'
            : 'Note: This report is not investment advice and does not replace personalized tax or legal advice.'}
        </Text>
      </View>
    </View>
  )
}

export function RetirementReport({ content }: RetirementReportProps) {
  const { metadata, profile, expenses, assumptions } = content
  const intlLocale = content.locale === 'en' ? 'en-US' : 'de-DE'
  const isGerman = content.locale !== 'en'

  const reportTitle = isGerman ? 'Ruhestandsbericht' : 'Retirement Report'
  const headerConfig = {
    left: reportTitle,
    right: fmtDate(metadata.generatedAt, intlLocale),
  }
  const footerConfig = {
    left: metadata.id,
    showPageNumber: true,
    pageLabel: isGerman ? 'Seite' : 'Page',
  }

  const annualSpend = expenses.monthlyTotal * 12 + expenses.annualTotal

  const sections: ReportSection[] = [
    {
      id: 'section-summary',
      title: isGerman ? 'Management Summary' : 'Management Summary',
      render: () => <ExecutiveSummary content={content} />,
    },
    {
      id: 'section-inputs',
      title: isGerman ? 'Planungsannahmen' : 'Planning Assumptions',
      render: () => <Inputs content={content} />,
    },
    {
      id: 'section-results',
      title: isGerman ? 'Simulationsergebnis' : 'Simulation Outcome',
      render: () => <Results content={content} />,
    },
    {
      id: 'section-spending',
      title: isGerman ? 'Ausgabenanalyse' : 'Spending Analysis',
      render: () => <Spending content={content} />,
    },
    {
      id: 'section-recommendations',
      title: isGerman ? 'Handlungsempfehlungen' : 'Recommended Actions',
      render: () => <Recommendations content={content} />,
    },
    {
      id: 'section-appendix',
      title: isGerman ? 'Anhang' : 'Appendix',
      render: () => (
        <AppendixSection content={content} isGerman={isGerman} intlLocale={intlLocale} />
      ),
    },
  ]

  const frontMatterPages = 2 // cover + TOC page
  const toc = sections.map((section, index) => ({
    id: section.id,
    title: section.title,
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
        title={reportTitle}
        subtitle={
          isGerman
            ? 'Professionelle Auswertung Ihrer aktuellen Simulationsdaten mit Fokus auf Tragfähigkeit und Handlungsbedarf.'
            : 'Professional evaluation of your current simulation data focused on sustainability and concrete actions.'
        }
        badge={`${isGerman ? 'Erfolgsquote' : 'Success Rate'} ${fmtPercent(profile.success.successRate, 1, intlLocale)}`}
        metadata={[
          { label: isGerman ? 'Berichts-ID' : 'Report ID', value: metadata.id },
          {
            label: isGerman ? 'Erstellt am' : 'Generated on',
            value: fmtDate(metadata.generatedAt, intlLocale),
          },
          {
            label: isGerman ? 'Planungshorizont' : 'Planning Horizon',
            value: `${profile.person.currentAge}-${profile.person.horizonAge}`,
          },
          {
            label: isGerman ? 'Jahresbudget' : 'Annual Budget',
            value: fmtCurrency(annualSpend, intlLocale),
          },
        ]}
      />

      <ReportPage header={headerConfig} footer={footerConfig}>
        <View>
          <H2>{isGerman ? 'Inhaltsverzeichnis' : 'Table of Contents'}</H2>
          <Table>
            {toc.map((entry, index) => (
              <TableRow key={entry.id}>
                <TableCell width="8%">{index + 1}.</TableCell>
                <TableCell width="82%">
                  <Link
                    src={`#${entry.id}`}
                    style={{ color: tokens.colors.accent[700], textDecoration: 'none' }}
                  >
                    {entry.title}
                  </Link>
                </TableCell>
                <TableCell width="10%" align="right">
                  {entry.page}
                </TableCell>
              </TableRow>
            ))}
          </Table>

          <View style={{ marginTop: 16 }}>
            <Text style={styles.label}>{isGerman ? 'Kurzüberblick' : 'At a glance'}</Text>
            <View style={{ flexDirection: 'row', marginTop: 8 }}>
              <View style={{ width: '33%', paddingRight: 6 }}>
                <View style={styles.card} wrap={false}>
                  <Text style={styles.kpiLabel}>{isGerman ? 'Erfolgsquote' : 'Success Rate'}</Text>
                  <Text style={styles.kpiValue}>
                    {fmtPercent(profile.success.successRate, 1, intlLocale)}
                  </Text>
                </View>
              </View>
              <View style={{ width: '33%', paddingHorizontal: 3 }}>
                <View style={styles.card} wrap={false}>
                  <Text style={styles.kpiLabel}>{isGerman ? 'Planungs-Score' : 'Plan Score'}</Text>
                  <Text style={styles.kpiValue}>
                    {profile.success.score !== null
                      ? fmtNumber(profile.success.score, { locale: intlLocale })
                      : '-'}
                  </Text>
                </View>
              </View>
              <View style={{ width: '34%', paddingLeft: 6 }}>
                <View style={styles.card} wrap={false}>
                  <Text style={styles.kpiLabel}>{isGerman ? 'Simulationen' : 'Simulations'}</Text>
                  <Text style={styles.kpiValue}>
                    {fmtNumber(assumptions.simulationRuns, { locale: intlLocale })}
                  </Text>
                </View>
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
