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
  const { assumptions, profile, expenses, finances } = content
  const annualSpend = expenses.monthlyTotal * 12 + expenses.annualTotal

  const glossary: Array<{ term: string; text: string }> = isGerman
    ? [
        {
          term: 'Erfolgsquote',
          text: `Anteil der Simulationsläufe, in denen das Vermögen bis Alter ${profile.person.horizonAge} nicht aufgebraucht ist.`,
        },
        {
          term: 'Planungs-Score',
          text: 'Gewichteter Mittelwert aus Erfolgsquote (60 %), Entnahmerate (25 %) und Liquidität (15 %), auf ganze Punkte gerundet — identisch zur Anzeige im Dashboard.',
        },
        {
          term: 'Perzentil (P10/P50/P90)',
          text: 'Rangwert über alle Läufe: P50 ist der Medianpfad, P10 der konservative Rand, P90 der günstige Rand.',
        },
        {
          term: 'Überbrückungsphase',
          text: 'Jahre zwischen dem gewählten Ruhestandsbeginn und dem Start der gesetzlichen Rente, in denen die Ausgaben vollständig aus dem Depot kommen.',
        },
        {
          term: 'Entnahmerate',
          text: 'Erstjahresentnahme aus dem Depot geteilt durch das Depotvermögen zu Ruhestandsbeginn.',
        },
        {
          term: 'Realrendite',
          text: 'Rendite nach Inflation: (1 + Rendite) / (1 + Inflation) − 1.',
        },
      ]
    : [
        {
          term: 'Success rate',
          text: `Share of simulation runs in which capital is not exhausted before age ${profile.person.horizonAge}.`,
        },
        {
          term: 'Plan score',
          text: 'Weighted mean of success rate (60%), withdrawal rate (25%) and liquidity (15%), rounded to whole points — the same figure the dashboard shows.',
        },
        {
          term: 'Percentile (P10/P50/P90)',
          text: 'Rank across all runs: P50 is the median path, P10 the conservative edge, P90 the favourable edge.',
        },
        {
          term: 'Bridge phase',
          text: 'The years between the chosen retirement age and the start of the state pension, when spending comes entirely from the portfolio.',
        },
        {
          term: 'Withdrawal rate',
          text: 'First-year portfolio withdrawal divided by portfolio value at retirement.',
        },
        {
          term: 'Real return',
          text: 'Return after inflation: (1 + return) / (1 + inflation) − 1.',
        },
      ]

  const limitations = isGerman
    ? [
        'Renditen und Inflation werden als unabhängig gezogen; historische Autokorrelation und Sequenzrisiken im Übergangsjahr werden nicht nachgebildet.',
        'Steuern werden pauschal mit einem Satz auf Kapitalerträge berücksichtigt; Freibeträge, Teilfreistellungen und Progressionseffekte bleiben unberücksichtigt.',
        'Die Rentenhöhe wird nominal fortgeschrieben; abweichende Rentenanpassungen ändern die Ergebnisse.',
        'Ausgaben werden mit der Inflationsannahme fortgeschrieben; Pflegekosten oder einmalige Sonderausgaben sind nur enthalten, soweit sie erfasst wurden.',
      ]
    : [
        'Returns and inflation are drawn independently; historical autocorrelation and sequence-of-returns effects around the transition year are not reproduced.',
        'Taxes are applied as a flat rate on capital gains; allowances, partial exemptions and progressive effects are not modelled.',
        'The pension is carried forward in nominal terms; different indexation would change the outcome.',
        'Spending is indexed with the inflation assumption; care costs and one-off items are only included where they were entered.',
      ]

  const parameterRecap: Array<{ label: string; value: string }> = [
    {
      label: isGerman ? 'Alter heute / Ruhestand / Rente / Ende' : 'Age today / retirement / pension / end',
      value: `${profile.person.currentAge} · ${profile.person.retireAge} · ${profile.person.pensionAge} · ${profile.person.horizonAge}`,
    },
    {
      label: isGerman ? 'Startvermögen' : 'Starting assets',
      value: fmtCurrency(finances.currentAssets, intlLocale),
    },
    {
      label: isGerman ? 'Sparleistung p.a.' : 'Annual savings',
      value: fmtCurrency(finances.annualSavings, intlLocale),
    },
    {
      label: isGerman ? 'Jahresbudget' : 'Annual budget',
      value: fmtCurrency(annualSpend, intlLocale),
    },
    {
      label: isGerman ? 'Rendite / Volatilität' : 'Return / volatility',
      value: `${fmtPercent(assumptions.expectedReturn, 1, intlLocale)} / ${fmtPercent(assumptions.returnVolatility, 1, intlLocale)}`,
    },
    {
      label: isGerman ? 'Inflation / Volatilität' : 'Inflation / volatility',
      value: `${fmtPercent(assumptions.inflation, 1, intlLocale)} / ${fmtPercent(assumptions.inflationVolatility, 1, intlLocale)}`,
    },
    {
      label: isGerman ? 'Simulationsläufe' : 'Simulation runs',
      value: fmtNumber(assumptions.simulationRuns, { locale: intlLocale }),
    },
  ]

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

      <View style={{ flexDirection: 'row', marginBottom: 10 }}>
        <View style={[styles.card, { width: '54%', marginRight: 10, marginBottom: 0 }]}>
          <Text style={styles.cardTitle}>
            {isGerman ? 'Perzentile richtig lesen' : 'How to Read Percentiles'}
          </Text>
          <Table>
            {percentileRows.map((row, index) => (
              <TableRow key={row.key} alt={index % 2 === 1}>
                <TableCell width="16%">
                  <Text style={{ fontWeight: 600, color: tokens.colors.accent[700] }}>
                    {row.key}
                  </Text>
                </TableCell>
                <TableCell width="84%">
                  <Text style={{ fontSize: 7.5, lineHeight: 1.45 }}>{row.text}</Text>
                </TableCell>
              </TableRow>
            ))}
          </Table>
        </View>

        <View style={[styles.card, { flex: 1, marginBottom: 0 }]}>
          <Text style={styles.cardTitle}>
            {isGerman ? 'Verwendete Parameter' : 'Parameters Used'}
          </Text>
          <Table>
            {parameterRecap.map((row, index) => (
              <TableRow key={row.label} alt={index % 2 === 1}>
                <TableCell width="60%">
                  <Text style={{ fontSize: 7.5, lineHeight: 1.4 }}>{row.label}</Text>
                </TableCell>
                <TableCell width="40%" align="right">
                  <Text style={{ fontSize: 7.5, fontWeight: 600, color: tokens.colors.ink[900] }}>
                    {row.value}
                  </Text>
                </TableCell>
              </TableRow>
            ))}
          </Table>
        </View>
      </View>

      <View style={[styles.card, { marginBottom: 10 }]}>
        <Text style={styles.cardTitle}>{isGerman ? 'Glossar' : 'Glossary'}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {glossary.map((entry, index) => (
            <View
              key={entry.term}
              style={{
                width: '50%',
                paddingRight: index % 2 === 0 ? 10 : 0,
                paddingLeft: index % 2 === 1 ? 10 : 0,
                marginBottom: 7,
              }}
            >
              <Text style={{ fontSize: 8, fontWeight: 600, color: tokens.colors.ink[900] }}>
                {entry.term}
              </Text>
              <Text
                style={{
                  fontSize: 7.5,
                  color: tokens.colors.ink[600],
                  lineHeight: 1.45,
                  marginTop: 1.5,
                }}
              >
                {entry.text}
              </Text>
            </View>
          ))}
        </View>
      </View>

      <View style={[styles.card, { marginBottom: 0 }]}>
        <Text style={[styles.cardTitle, { marginBottom: 5 }]}>
          {isGerman ? 'Grenzen des Modells' : 'Limits of the Model'}
        </Text>
        {limitations.map((limitation) => (
          <View key={limitation} style={{ flexDirection: 'row', marginBottom: 4 }}>
            <View
              style={{
                width: 4,
                height: 4,
                backgroundColor: tokens.colors.brand.yellow,
                marginTop: 3.5,
                marginRight: 6,
              }}
            />
            <Text style={{ flex: 1, fontSize: 7.5, color: tokens.colors.ink[600], lineHeight: 1.5 }}>
              {limitation}
            </Text>
          </View>
        ))}

        <View
          style={{
            marginTop: 6,
            paddingTop: 6,
            borderTopWidth: 0.5,
            borderTopColor: tokens.colors.ink[200],
          }}
        >
          <Text
            style={{ fontSize: 8, fontWeight: 600, color: tokens.colors.ink[900], marginBottom: 2 }}
          >
            {isGerman ? 'Wichtiger Hinweis' : 'Important Note'}
          </Text>
          <Text style={{ fontSize: 7.5, color: tokens.colors.ink[600], lineHeight: 1.5 }}>
            {isGerman
              ? 'Dieser Bericht dient ausschließlich der Information und stellt keine Anlage-, Steuer- oder Rechtsberatung dar. Alle Projektionen sind modellbasierte Schätzungen; tatsächliche Ergebnisse können erheblich abweichen. Vergangene Wertentwicklungen sind kein verlässlicher Indikator für zukünftige Ergebnisse.'
              : 'This report is provided for information purposes only and does not constitute investment, tax, or legal advice. All projections are model-based estimates; actual outcomes may differ materially. Past performance is not a reliable indicator of future results.'}
          </Text>
        </View>
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

  const readingGuide = isGerman
    ? [
        {
          step: 'Schritt 1',
          title: 'Erfolgsquote prüfen',
          text: 'Sie zeigt, in wie vielen der Simulationsläufe das Vermögen bis zum Planungsende reicht. Ab 85 % gilt ein Plan üblicherweise als tragfähig.',
        },
        {
          step: 'Schritt 2',
          title: 'Bandbreite lesen',
          text: 'Die Grafik in Abschnitt 03 zeigt nicht eine Zukunft, sondern eine Spanne. Entscheidend ist der untere Rand (P10), nicht der Median.',
        },
        {
          step: 'Schritt 3',
          title: 'Eine Maßnahme wählen',
          text: 'Abschnitt 05 priorisiert die Hebel nach Wirkung und enthält einen 90-Tage-Plan mit konkreten Beträgen.',
        },
      ]
    : [
        {
          step: 'Step 1',
          title: 'Check the success rate',
          text: 'It shows how many simulation runs keep capital alive to the planning horizon. Above 85% a plan is usually considered sustainable.',
        },
        {
          step: 'Step 2',
          title: 'Read the range',
          text: 'The figure in section 03 shows a spread, not a single future. The lower edge (P10) matters more than the median.',
        },
        {
          step: 'Step 3',
          title: 'Pick one action',
          text: 'Section 05 ranks the levers by effect and closes with a 90-day plan carrying concrete amounts.',
        },
      ]

  const figureLegend: Array<{
    label: string
    text: string
    color: string
    kind: 'line' | 'swatch'
  }> = [
    {
      label: isGerman ? 'Blaue Linie' : 'Blue line',
      text: isGerman ? 'Medianpfad (P50)' : 'median path (P50)',
      color: tokens.colors.accent[600],
      kind: 'line',
    },
    {
      label: isGerman ? 'Blaue Fläche' : 'Blue area',
      text: isGerman ? 'P10–P90-Band, also 80 % aller Läufe' : 'P10–P90 band, i.e. 80% of all runs',
      color: tokens.colors.accent[100],
      kind: 'swatch',
    },
    {
      label: isGerman ? 'Gelbe Markierung' : 'Yellow marker',
      text: isGerman
        ? 'Lebensphase: Ruhestand und Rentenbeginn'
        : 'life stage: retirement and state pension',
      color: tokens.colors.brand.yellow,
      kind: 'line',
    },
    {
      label: isGerman ? 'Rote Markierung' : 'Red marker',
      text: isGerman
        ? 'Kapitalerschöpfung — die einzige Bedeutung von Rot im Bericht'
        : 'capital depletion — the only meaning red carries in this report',
      color: tokens.colors.danger[600],
      kind: 'line',
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
            <CoverSparkline
              data={milestones}
              locale={content.locale}
              retireAge={profile.person.retireAge}
              pensionAge={profile.person.pensionAge}
            />
          ) : undefined
        }
        heroCaption={
          isGerman
            ? `Medianpfad des Vermögens mit P10–P90-Band, Alter ${profile.person.currentAge} bis ${profile.person.horizonAge} · Detailgrafik in Abschnitt 03`
            : `Median asset path with P10–P90 band, age ${profile.person.currentAge} to ${profile.person.horizonAge} · detailed chart in section 03`
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
          <View style={{ marginTop: 20 }}>
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
              <View style={[styles.cardMuted, { flex: 1, marginRight: 10, marginBottom: 0 }]} wrap={false}>
                <Text style={styles.kpiLabel}>{isGerman ? 'Jahresbudget' : 'Annual Budget'}</Text>
                <Text style={styles.kpiValue}>{fmtCurrency(annualSpend, intlLocale)}</Text>
                <Text style={styles.kpiDescription}>
                  {isGerman ? 'Ausgaben pro Jahr' : 'Spending per year'}
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

          {/* Reading guide — turns the second page into orientation rather
              than a mostly empty list of links. */}
          <View style={{ marginTop: 20 }}>
            <Text style={[styles.label, { marginBottom: 8 }]}>
              {isGerman ? 'So lesen Sie diesen Bericht' : 'How to Read This Report'}
            </Text>
            <View style={{ flexDirection: 'row' }}>
              {readingGuide.map((entry, index) => (
                <View
                  key={entry.title}
                  style={[
                    styles.cardAccent,
                    {
                      flex: 1,
                      marginRight: index < readingGuide.length - 1 ? 10 : 0,
                      marginBottom: 0,
                    },
                  ]}
                  wrap={false}
                >
                  <Text
                    style={{
                      fontSize: 6.5,
                      fontWeight: 600,
                      letterSpacing: 0.8,
                      textTransform: 'uppercase',
                      color: tokens.colors.ink[500],
                    }}
                  >
                    {entry.step}
                  </Text>
                  <Text
                    style={{
                      fontSize: 9.5,
                      fontWeight: 600,
                      color: tokens.colors.ink[900],
                      marginTop: 4,
                      marginBottom: 3,
                    }}
                  >
                    {entry.title}
                  </Text>
                  <Text style={{ fontSize: 7.5, color: tokens.colors.ink[600], lineHeight: 1.5 }}>
                    {entry.text}
                  </Text>
                </View>
              ))}
            </View>
          </View>

          {/* Figure conventions — one legend for every chart in the report */}
          <View style={[styles.cardMuted, { marginTop: 16, marginBottom: 0 }]}>
            <Text style={[styles.cardTitle, { marginBottom: 6 }]}>
              {isGerman ? 'Farben und Linien in den Grafiken' : 'Colours and Lines in the Figures'}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
              {figureLegend.map((item, index) => (
                <View
                  key={item.label}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'flex-start',
                    width: '50%',
                    paddingRight: index % 2 === 0 ? 10 : 0,
                    marginBottom: 5,
                  }}
                >
                  <View
                    style={{
                      width: 12,
                      height: item.kind === 'swatch' ? 7 : 2,
                      marginTop: item.kind === 'swatch' ? 1.5 : 4,
                      marginRight: 6,
                      backgroundColor: item.color,
                    }}
                  />
                  <Text
                    style={{ flex: 1, fontSize: 7.5, color: tokens.colors.ink[600], lineHeight: 1.4 }}
                  >
                    <Text style={{ fontWeight: 600, color: tokens.colors.ink[900] }}>
                      {item.label}
                    </Text>
                    {' — '}
                    {item.text}
                  </Text>
                </View>
              ))}
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
