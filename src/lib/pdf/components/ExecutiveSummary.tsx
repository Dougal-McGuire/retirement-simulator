import React from 'react'
import { Page, View, Text } from '@react-pdf/renderer'
import { styles } from '../styles'
import { SimulationResults } from '@/types'
import { ReportHeader } from './ReportHeader'

interface ExecutiveSummaryProps {
  results: SimulationResults
  reportDate: string
  reportId: string
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const getSuccessRating = (successRate: number): { rating: string; color: string } => {
  if (successRate >= 90) return { rating: 'Excellent', color: '#10b981' }
  if (successRate >= 80) return { rating: 'Very Good', color: '#22c55e' }
  if (successRate >= 70) return { rating: 'Good', color: '#84cc16' }
  if (successRate >= 60) return { rating: 'Fair', color: '#eab308' }
  if (successRate >= 50) return { rating: 'Concerning', color: '#f59e0b' }
  return { rating: 'High Risk', color: '#ef4444' }
}

const calculateRetirementGap = (results: SimulationResults): number => {
  const retirementIndex = results.ages.findIndex(age => age === results.params.retirementAge)
  const endIndex = results.ages.findIndex(age => age === results.params.endAge)
  
  if (retirementIndex === -1 || endIndex === -1) return 0
  
  const assetsAtRetirement = results.assetPercentiles.p50[retirementIndex]
  const assetsAtEnd = results.assetPercentiles.p50[endIndex]
  
  return assetsAtRetirement - assetsAtEnd
}

export const ExecutiveSummary: React.FC<ExecutiveSummaryProps> = ({
  results,
  reportDate,
  reportId,
}) => {
  const successRating = getSuccessRating(results.successRate)
  const retirementGap = calculateRetirementGap(results)
  const currentAssets = results.params.currentAssets
  const projectedAtRetirement = results.assetPercentiles.p50[
    results.ages.findIndex(age => age === results.params.retirementAge)
  ] || 0
  
  const totalMonthlyExpenses = Object.values(results.params.monthlyExpenses).reduce((sum, exp) => sum + exp, 0)
  const totalAnnualExpenses = Object.values(results.params.annualExpenses).reduce((sum, exp) => sum + exp, 0)
  const monthlySpendingNeed = totalMonthlyExpenses + (totalAnnualExpenses / 12)

  return (
    <Page size="A4" style={styles.page}>
      <ReportHeader
        reportTitle="Executive Summary"
        reportDate={reportDate}
        reportId={reportId}
      />

      {/* Key Metrics Dashboard */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Key Findings</Text>
        
        <View style={[styles.highlight, { backgroundColor: successRating.color + '20', borderLeftColor: successRating.color }]}>
          <Text style={styles.heading}>Retirement Success Probability</Text>
          <Text style={[styles.text, styles.boldText, { fontSize: 16, color: successRating.color }]}>
            {results.successRate.toFixed(1)}% - {successRating.rating}
          </Text>
          <Text style={styles.smallText}>
            Probability of maintaining your desired lifestyle throughout retirement
          </Text>
        </View>

        <View style={styles.row}>
          <View style={styles.leftColumn}>
            <View style={styles.highlight}>
              <Text style={styles.heading}>Current Position</Text>
              <Text style={[styles.text, styles.boldText]}>
                Current Assets: {formatCurrency(currentAssets)}
              </Text>
              <Text style={[styles.text, styles.boldText]}>
                Annual Savings: {formatCurrency(results.params.annualSavings)}
              </Text>
              <Text style={styles.smallText}>
                Starting point for your retirement journey
              </Text>
            </View>
          </View>

          <View style={styles.rightColumn}>
            <View style={styles.highlight}>
              <Text style={styles.heading}>Retirement Projection</Text>
              <Text style={[styles.text, styles.boldText]}>
                Assets at Age {results.params.retirementAge}: {formatCurrency(projectedAtRetirement)}
              </Text>
              <Text style={[styles.text, styles.boldText]}>
                Monthly Pension: {formatCurrency(results.params.monthlyPension)}
              </Text>
              <Text style={styles.smallText}>
                Expected financial position at retirement
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.leftColumn}>
            <Text style={styles.heading}>Monthly Spending Requirement</Text>
            <Text style={[styles.text, styles.boldText]}>
              {formatCurrency(monthlySpendingNeed)}
            </Text>
            <Text style={styles.smallText}>
              • Health: {formatCurrency(results.params.monthlyExpenses.health)}
            </Text>
            <Text style={styles.smallText}>
              • Food: {formatCurrency(results.params.monthlyExpenses.food)}
            </Text>
            <Text style={styles.smallText}>
              • Utilities: {formatCurrency(results.params.monthlyExpenses.utilities)}
            </Text>
            <Text style={styles.smallText}>
              • Other: {formatCurrency(totalMonthlyExpenses - results.params.monthlyExpenses.health - results.params.monthlyExpenses.food - results.params.monthlyExpenses.utilities)}
            </Text>
            <Text style={styles.smallText}>
              • Annual expenses (monthly avg): {formatCurrency(totalAnnualExpenses / 12)}
            </Text>
          </View>

          <View style={styles.rightColumn}>
            <Text style={styles.heading}>Critical Milestones</Text>
            <Text style={styles.text}>
              • Age {results.params.currentAge}: Current age (today)
            </Text>
            <Text style={styles.text}>
              • Age {results.params.retirementAge}: Planned retirement
            </Text>
            <Text style={styles.text}>
              • Age {results.params.legalRetirementAge}: Pension starts
            </Text>
            <Text style={styles.text}>
              • Age {results.params.endAge}: Planning horizon
            </Text>
          </View>
        </View>
      </View>

      {/* Key Recommendations */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Key Recommendations</Text>
        
        {results.successRate < 80 && (
          <View style={styles.warning}>
            <Text style={styles.heading}>⚠️ Action Required</Text>
            <Text style={styles.text}>
              Your current plan has a {results.successRate.toFixed(1)}% success rate. Consider increasing savings, 
              adjusting retirement age, or reducing expenses to improve your retirement security.
            </Text>
          </View>
        )}

        {results.successRate >= 80 && results.successRate < 90 && (
          <View style={styles.highlight}>
            <Text style={styles.heading}>✓ Good Progress</Text>
            <Text style={styles.text}>
              Your plan shows strong potential. Minor adjustments could further improve your retirement security.
            </Text>
          </View>
        )}

        {results.successRate >= 90 && (
          <View style={styles.success}>
            <Text style={styles.heading}>✓ Excellent Planning</Text>
            <Text style={styles.text}>
              Your retirement plan is very robust. You may have opportunities for early retirement or increased spending.
            </Text>
          </View>
        )}

        <Text style={styles.text}>
          • <Text style={styles.boldText}>Risk Assessment:</Text> Review the detailed risk analysis on pages 9-10
        </Text>
        <Text style={styles.text}>
          • <Text style={styles.boldText}>Asset Allocation:</Text> Consider age-appropriate investment strategies
        </Text>
        <Text style={styles.text}>
          • <Text style={styles.boldText}>Regular Reviews:</Text> Reassess your plan annually or after major life changes
        </Text>
        <Text style={styles.text}>
          • <Text style={styles.boldText}>Professional Guidance:</Text> Consider consulting with a certified financial planner
        </Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Report Structure</Text>
        <Text style={styles.text}>This comprehensive report contains:</Text>
        <Text style={styles.text}>• Personal profile and financial assumptions (Pages 3-4)</Text>
        <Text style={styles.text}>• Milestone timeline and key transitions (Page 5)</Text>
        <Text style={styles.text}>• Detailed asset and spending projections (Pages 6-8)</Text>
        <Text style={styles.text}>• Risk analysis and scenario testing (Page 9)</Text>
        <Text style={styles.text}>• Personalized recommendations (Page 10)</Text>
        <Text style={styles.text}>• Technical appendix and methodology (Page 11)</Text>
      </View>

      <Text style={styles.pageNumber}>Page 2</Text>
    </Page>
  )
}