import React from 'react'
import { View, Text } from '@react-pdf/renderer'
import { ReportDocument, ReportPage, CoverPage } from './Document'
import { ExecutiveSummary, Inputs, Results, Spending, Recommendations } from './sections'
import { styles, tokens } from './styles'
import { H2, H3, Body, Table, TableRow, TableCell } from './primitives'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { fmtDate, fmtCurrency, fmtNumber, nnbsp } from '@/lib/pdf-generator/formatters'
import './fonts'

interface RetirementReportProps {
  content: ReportContent
}

export function RetirementReport({ content }: RetirementReportProps) {
  const { metadata, profile, expenses } = content
  const locale = content.locale ?? 'de'
  const intlLocale = locale === 'de' ? 'de-DE' : 'en-US'
  const isGerman = locale === 'de'

  const horizonLabel = `${profile.person.currentAge}–${profile.person.horizonAge}`
  const averageAnnualSpend = expenses.monthlyTotal * 12 + expenses.annualTotal

  // Cover metadata
  const coverMetadata = [
    { label: isGerman ? 'Berichts-ID' : 'Report ID', value: metadata.id },
    { label: isGerman ? 'Erstellt am' : 'Generated on', value: fmtDate(metadata.generatedAt, intlLocale) },
    { label: isGerman ? 'Planungshorizont' : 'Planning Horizon', value: `${horizonLabel}${nnbsp}${isGerman ? 'Jahre' : 'years'}` },
    { label: isGerman ? 'Ø Jahresbudget' : 'Avg. Annual Budget', value: fmtCurrency(averageAnnualSpend, intlLocale) },
  ]

  // Badge text
  const badgeText = profile.success.score !== null
    ? `${isGerman ? 'Planungs-Score' : 'Planning Score'}: ${fmtNumber(profile.success.score, { locale: intlLocale })}`
    : undefined

  // Header/footer for content pages
  const headerConfig = {
    left: isGerman ? 'Rentenplan' : 'Retirement Plan',
    right: fmtDate(metadata.generatedAt, intlLocale),
  }
  const footerConfig = {
    left: metadata.id,
    showPageNumber: true,
  }

  // Table of Contents entries
  const tocEntries = [
    { num: '1', title: isGerman ? 'Zusammenfassung' : 'Executive Summary', page: '2' },
    { num: '2', title: isGerman ? 'Eingaben und Annahmen' : 'Inputs and Assumptions', page: '3' },
    { num: '3', title: isGerman ? 'Simulationsergebnisse' : 'Simulation Results', page: '4' },
    { num: '4', title: isGerman ? 'Ausgabenstruktur' : 'Spending Structure', page: '5' },
    { num: '5', title: isGerman ? 'Empfehlungen' : 'Recommended Actions', page: '6' },
    { num: '6', title: isGerman ? 'Anhang' : 'Appendix', page: '7' },
  ]

  return (
    <ReportDocument
      title={isGerman ? 'Rentenplan' : 'Retirement Plan'}
      subject={isGerman ? 'Monte-Carlo Ruhestandsanalyse' : 'Monte Carlo Retirement Analysis'}
    >
      {/* Cover Page */}
      <CoverPage
        title={isGerman ? 'Rentenplan' : 'Retirement Plan'}
        subtitle={
          isGerman
            ? `Individuelle Monte-Carlo-Analyse für ${profile.householdName ?? 'Ihre Haushaltsplanung'} mit Fokus auf nachhaltigem Ruhestandseinkommen.`
            : `Personalised Monte Carlo analysis for ${profile.householdName ?? 'your household plan'} with a focus on sustainable retirement income.`
        }
        metadata={coverMetadata}
        badge={badgeText}
      />

      {/* Table of Contents */}
      <ReportPage header={headerConfig} footer={footerConfig}>
        <View style={{ marginBottom: tokens.spacing[8] }}>
          <H2 style={{ marginBottom: tokens.spacing[6] }}>
            {isGerman ? 'Inhaltsverzeichnis' : 'Table of Contents'}
          </H2>
          
          {/* TOC entries using table for reliable alignment */}
          <Table>
            {tocEntries.map((entry) => (
              <TableRow key={entry.num}>
                <TableCell width="8%">
                  <Text style={{ fontSize: 11, color: tokens.colors.ink[500] }}>{entry.num}.</Text>
                </TableCell>
                <TableCell width="82%">
                  <Text style={{ fontSize: 11, color: tokens.colors.ink[800] }}>{entry.title}</Text>
                </TableCell>
                <TableCell width="10%" align="right">
                  <Text style={{ fontSize: 11, color: tokens.colors.ink[500] }}>{entry.page}</Text>
                </TableCell>
              </TableRow>
            ))}
          </Table>

          {/* At a Glance - Using fixed width columns */}
          <View style={{ marginTop: tokens.spacing[10] }}>
            <H3 style={{ marginBottom: tokens.spacing[4] }}>
              {isGerman ? 'Auf einen Blick' : 'At a Glance'}
            </H3>
            <View style={{ flexDirection: 'row' }}>
              <View style={{ width: '33%', paddingRight: tokens.spacing[2] }}>
                <View style={{ borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[4] }}>
                  <Text style={styles.label}>{isGerman ? 'Erfolgswahrscheinlichkeit' : 'Success Probability'}</Text>
                  <Text style={[styles.kpiValue, { color: profile.success.successRate >= 0.8 ? tokens.colors.success[600] : tokens.colors.warning[600] }]}>
                    {fmtNumber(profile.success.successRate * 100, { locale: intlLocale, decimals: 1 })}%
                  </Text>
                </View>
              </View>
              <View style={{ width: '33%', paddingHorizontal: tokens.spacing[1] }}>
                <View style={{ borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[4] }}>
                  <Text style={styles.label}>{isGerman ? 'Planungs-Score' : 'Planning Score'}</Text>
                  <Text style={styles.kpiValue}>
                    {profile.success.score !== null ? fmtNumber(profile.success.score, { locale: intlLocale }) : '-'} / 100
                  </Text>
                </View>
              </View>
              <View style={{ width: '34%', paddingLeft: tokens.spacing[2] }}>
                <View style={{ borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[4] }}>
                  <Text style={styles.label}>{isGerman ? 'Planungshorizont' : 'Horizon'}</Text>
                  <Text style={styles.kpiValue}>
                    {profile.person.horizonAge - profile.person.currentAge} {isGerman ? 'Jahre' : 'years'}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </ReportPage>

      {/* Executive Summary */}
      <ReportPage header={headerConfig} footer={footerConfig}>
        <ExecutiveSummary content={content} />
      </ReportPage>

      {/* Inputs & Assumptions */}
      <ReportPage header={headerConfig} footer={footerConfig}>
        <Inputs content={content} />
      </ReportPage>

      {/* Simulation Results */}
      <ReportPage header={headerConfig} footer={footerConfig}>
        <Results content={content} />
      </ReportPage>

      {/* Spending Structure */}
      <ReportPage header={headerConfig} footer={footerConfig}>
        <Spending content={content} />
      </ReportPage>

      {/* Recommendations */}
      <ReportPage header={headerConfig} footer={footerConfig}>
        <Recommendations content={content} />
      </ReportPage>

      {/* Appendix */}
      <ReportPage header={headerConfig} footer={footerConfig}>
        <View>
          <View style={{ marginBottom: tokens.spacing[6] }}>
            <H2>{isGerman ? 'Anhang' : 'Appendix'}</H2>
            <Text style={styles.sectionLead}>
              {isGerman
                ? 'Methodische Grundlagen und Definitionen.'
                : 'Methodological foundations and definitions.'}
            </Text>
          </View>

          {/* Methodology */}
          <View style={{ marginBottom: tokens.spacing[6], borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[4] }}>
            <Text style={[styles.h4, { marginBottom: tokens.spacing[3] }]}>
              {isGerman ? 'Methodologie' : 'Methodology'}
            </Text>
            <Body style={{ marginBottom: tokens.spacing[3] }}>
              {isGerman
                ? `Monte-Carlo-Simulation mit ${fmtNumber(content.assumptions.simulationRuns, { locale: intlLocale })} unabhängigen Läufen.`
                : `Monte Carlo simulation with ${fmtNumber(content.assumptions.simulationRuns, { locale: intlLocale })} independent runs.`}
            </Body>
            <Body>
              {isGerman
                ? 'Rendite- und Inflationsschwankungen werden durch normalverteilte Zufallszahlen (Box-Muller) modelliert.'
                : 'Return and inflation fluctuations are modeled using normally distributed random numbers (Box-Muller).'}
            </Body>
          </View>

          {/* Glossary */}
          <View style={{ marginBottom: tokens.spacing[6], borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[4] }}>
            <Text style={[styles.h4, { marginBottom: tokens.spacing[3] }]}>
              {isGerman ? 'Glossar' : 'Glossary'}
            </Text>
            <Table>
              <TableRow>
                <TableCell width="25%">
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>P10 / P50 / P90</Text>
                </TableCell>
                <TableCell width="75%">
                  {isGerman
                    ? 'Perzentile. P10 = 10% schlechter (Stress), P50 = Median, P90 = 10% besser (Optimal).'
                    : 'Percentiles. P10 = 10% worse (stress), P50 = median, P90 = 10% better (optimal).'}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell width="25%">
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{isGerman ? 'Brückenphase' : 'Bridge Phase'}</Text>
                </TableCell>
                <TableCell width="75%">
                  {isGerman
                    ? 'Zeitraum zwischen Ruhestandsbeginn und Rentenbeginn.'
                    : 'Period between retirement start and pension start.'}
                </TableCell>
              </TableRow>
              <TableRow>
                <TableCell width="25%">
                  <Text style={{ fontFamily: 'Helvetica-Bold' }}>{isGerman ? 'Score' : 'Score'}</Text>
                </TableCell>
                <TableCell width="75%">
                  {isGerman
                    ? '≥80 = Stark, 60-79 = Ausgewogen, <60 = Überarbeiten.'
                    : '≥80 = Strong, 60-79 = Moderate, <60 = Needs Attention.'}
                </TableCell>
              </TableRow>
            </Table>
          </View>

          {/* Disclaimer */}
          <View style={{ borderWidth: 1, borderColor: tokens.colors.ink[200], padding: tokens.spacing[4] }}>
            <Text style={{ fontSize: 8, color: tokens.colors.ink[500], lineHeight: 1.5 }}>
              {isGerman
                ? 'Haftungsausschluss: Diese Analyse dient ausschließlich Informationszwecken und stellt keine Anlageberatung dar. Konsultieren Sie einen qualifizierten Finanzberater.'
                : 'Disclaimer: This analysis is for informational purposes only and does not constitute investment advice. Consult a qualified financial advisor.'}
            </Text>
          </View>
        </View>
      </ReportPage>
    </ReportDocument>
  )
}

export default RetirementReport
