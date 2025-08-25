import React from 'react'
import { Document, Page, View, Text } from '@react-pdf/renderer'
import { SimulationResults } from '@/types'
import { styles } from './styles'
import { CoverPage } from './components/CoverPage'
import { ExecutiveSummary } from './components/ExecutiveSummary'
import { AssumptionsSection } from './components/AssumptionsSection'
import { MilestoneTimeline } from './components/MilestoneTimeline'
import { ChartComponents } from './components/ChartComponents'
import { RiskAnalysis } from './components/RiskAnalysis'
import { RecommendationsSection } from './components/RecommendationsSection'
import { Appendix } from './components/Appendix'
import { ReportHeader } from './components/ReportHeader'

interface RetirementReportProps {
  results: SimulationResults
  reportDate: string
  reportId: string
  includeCover?: boolean
  includeCharts?: boolean
  qualityLevel?: 'draft' | 'standard' | 'high'
  chartImages?: {
    assetProjection: string
    monthlySpending: string
    successRate: string
    expenseBreakdown: string
  }
}

export const RetirementReport: React.FC<RetirementReportProps> = ({
  results,
  reportDate,
  reportId,
  includeCover = true,
  includeCharts = true,
  qualityLevel = 'standard',
  chartImages,
}) => {
  const documentProps = {
    title: 'Retirement Planning Analysis',
    author: 'Retirement Simulator',
    subject: 'Personal Financial Planning Report',
    creator: 'Retirement Simulator Application',
    producer: 'React-PDF',
    keywords: 'retirement, financial planning, Monte Carlo simulation',
    language: 'en',
  }

  return (
    <Document {...documentProps}>
      {/* Page 1: Cover Page (Optional) */}
      {includeCover && (
        <CoverPage
          params={results.params}
          reportDate={reportDate}
          reportId={reportId}
        />
      )}

      {/* Page 2: Executive Summary - Key Findings at a Glance */}
      <ExecutiveSummary
        results={results}
        reportDate={reportDate}
        reportId={reportId}
      />

      {/* Page 3-4: Personal Profile & Financial Assumptions */}
      <AssumptionsSection
        params={results.params}
        reportDate={reportDate}
        reportId={reportId}
      />

      {/* Page 5: Milestone Timeline - Key Life Events */}
      <MilestoneTimeline
        results={results}
        reportDate={reportDate}
        reportId={reportId}
      />

      {/* Page 6-7: Visual Analysis - Charts and Projections */}
      {includeCharts ? (
        chartImages ? (
          <ChartComponents
            results={results}
            reportDate={reportDate}
            reportId={reportId}
            chartImages={chartImages}
          />
        ) : (
          // Show a message if charts are requested but not available
          <Page size="A4" style={styles.page}>
            <ReportHeader
              reportTitle="Chart Analysis"
              reportDate={reportDate}
              reportId={reportId}
              showLogo={false}
            />
            <View style={styles.section}>
              <Text style={styles.text}>
                Charts are being generated. Please wait for the complete report.
              </Text>
            </View>
          </Page>
        )
      ) : null}

      {/* Page 8: Risk Analysis - Scenario Testing */}
      <RiskAnalysis
        results={results}
        reportDate={reportDate}
        reportId={reportId}
      />

      {/* Page 9-10: Personalized Recommendations & Action Plan */}
      <RecommendationsSection
        results={results}
        reportDate={reportDate}
        reportId={reportId}
      />

      {/* Page 11: Technical Appendix - Methodology & Assumptions */}
      <Appendix
        params={results.params}
        reportDate={reportDate}
        reportId={reportId}
      />
    </Document>
  )
}