import React from 'react'
import { Page, View, Text } from '@react-pdf/renderer'
import { styles } from '../styles'
import { SimulationResults } from '@/types'
import { ReportHeader } from './ReportHeader'

interface RiskAnalysisProps {
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

const formatPercentage = (value: number): string => {
  return `${(value * 100).toFixed(1)}%`
}

export const RiskAnalysis: React.FC<RiskAnalysisProps> = ({
  results,
  reportDate,
  reportId,
}) => {
  const { params } = results

  // Calculate risk metrics
  const endIndex = results.ages.findIndex(age => age === params.endAge)
  const retirementIndex = results.ages.findIndex(age => age === params.retirementAge)
  
  const finalAssets = {
    p10: results.assetPercentiles.p10[endIndex] || 0,
    p50: results.assetPercentiles.p50[endIndex] || 0,
    p90: results.assetPercentiles.p90[endIndex] || 0,
  }

  const retirementAssets = {
    p10: results.assetPercentiles.p10[retirementIndex] || 0,
    p50: results.assetPercentiles.p50[retirementIndex] || 0,
    p90: results.assetPercentiles.p90[retirementIndex] || 0,
  }

  // Calculate shortfall risk
  const shortfallRisk = finalAssets.p10 < 0 ? 
    "High - Assets may be depleted" : 
    finalAssets.p10 < (finalAssets.p50 * 0.1) ? 
    "Medium - Significant asset reduction possible" : 
    "Low - Assets likely to be preserved"

  // Estimate sequence of returns risk
  const earlyRetirementYears = params.legalRetirementAge - params.retirementAge
  const sequenceRisk = earlyRetirementYears > 5 ? "High" : 
                      earlyRetirementYears > 0 ? "Medium" : "Low"

  return (
    <Page size="A4" style={styles.page}>
      <ReportHeader
        reportTitle="Risk Analysis & Scenario Testing"
        reportDate={reportDate}
        reportId={reportId}
        showLogo={false}
      />

      {/* Risk Summary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Risk Assessment Summary</Text>
        
        <View style={styles.highlight}>
          <Text style={styles.heading}>Overall Risk Profile</Text>
          <Text style={[styles.text, styles.boldText]}>
            Success Probability: {results.successRate.toFixed(1)}%
          </Text>
          <Text style={styles.text}>
            This represents the percentage of simulations where your assets lasted through age {params.endAge} 
            while maintaining your desired spending level.
          </Text>
        </View>

        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <View style={styles.tableColWide}>
              <Text style={styles.tableCell}>Risk Factor</Text>
            </View>
            <View style={styles.tableColWide}>
              <Text style={styles.tableCell}>Assessment</Text>
            </View>
          </View>
          
          <View style={styles.tableRow}>
            <View style={styles.tableColWide}>
              <Text style={styles.tableCell}>Asset Depletion Risk</Text>
            </View>
            <View style={styles.tableColWide}>
              <Text style={styles.tableCell}>{shortfallRisk}</Text>
            </View>
          </View>
          
          <View style={styles.tableRow}>
            <View style={styles.tableColWide}>
              <Text style={styles.tableCell}>Sequence of Returns Risk</Text>
            </View>
            <View style={styles.tableColWide}>
              <Text style={styles.tableCell}>{sequenceRisk}</Text>
            </View>
          </View>
          
          <View style={styles.tableRow}>
            <View style={styles.tableColWide}>
              <Text style={styles.tableCell}>Inflation Risk</Text>
            </View>
            <View style={styles.tableColWide}>
              <Text style={styles.tableCell}>
                {params.inflationVolatility > 0.02 ? "High" : 
                 params.inflationVolatility > 0.01 ? "Medium" : "Low"}
              </Text>
            </View>
          </View>
          
          <View style={styles.tableRow}>
            <View style={styles.tableColWide}>
              <Text style={styles.tableCell}>Longevity Risk</Text>
            </View>
            <View style={styles.tableColWide}>
              <Text style={styles.tableCell}>
                {params.endAge - params.currentAge > 40 ? "High" : "Medium"}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Scenario Analysis */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Scenario Analysis</Text>

        <View style={styles.row}>
          <View style={styles.leftColumn}>
            <View style={styles.warning}>
              <Text style={styles.heading}>Pessimistic Scenario (10th Percentile)</Text>
              <Text style={styles.text}>
                <Text style={styles.boldText}>At Retirement:</Text> {formatCurrency(retirementAssets.p10)}
              </Text>
              <Text style={styles.text}>
                <Text style={styles.boldText}>At Age {params.endAge}:</Text> {formatCurrency(finalAssets.p10)}
              </Text>
              <Text style={styles.smallText}>
                This scenario assumes poor market performance, high inflation, or other adverse conditions.
              </Text>
            </View>
          </View>

          <View style={styles.rightColumn}>
            <View style={styles.success}>
              <Text style={styles.heading}>Optimistic Scenario (90th Percentile)</Text>
              <Text style={styles.text}>
                <Text style={styles.boldText}>At Retirement:</Text> {formatCurrency(retirementAssets.p90)}
              </Text>
              <Text style={styles.text}>
                <Text style={styles.boldText}>At Age {params.endAge}:</Text> {formatCurrency(finalAssets.p90)}
              </Text>
              <Text style={styles.smallText}>
                This scenario assumes favorable market conditions and controlled inflation.
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Sensitivity Analysis */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Sensitivity to Key Variables</Text>

        <Text style={styles.text}>
          Your retirement plan's sensitivity to changes in key assumptions:
        </Text>

        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Variable</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Current</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>+1% Impact</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>-1% Impact</Text>
            </View>
          </View>

          <View style={styles.tableRow}>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Investment Return</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCellCenter}>{formatPercentage(params.averageROI)}</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCellCenter}>Significant +</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCellCenter}>Significant -</Text>
            </View>
          </View>

          <View style={styles.tableRow}>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Inflation Rate</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCellCenter}>{formatPercentage(params.averageInflation)}</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCellCenter}>Moderate -</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCellCenter}>Moderate +</Text>
            </View>
          </View>

          <View style={styles.tableRow}>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Annual Savings</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCellCenter}>{formatCurrency(params.annualSavings)}</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCellCenter}>High +</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCellCenter}>High -</Text>
            </View>
          </View>

          <View style={styles.tableRow}>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Retirement Age</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCellCenter}>{params.retirementAge}</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCellCenter}>1 yr later: +</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCellCenter}>1 yr earlier: -</Text>
            </View>
          </View>
        </View>
      </View>

      {/* Risk Mitigation Strategies */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Risk Mitigation Strategies</Text>

        {results.successRate < 80 && (
          <View style={styles.warning}>
            <Text style={styles.heading}>⚠️ High Priority Actions</Text>
            <Text style={styles.text}>
              Your current plan has elevated risk. Consider these immediate strategies:
            </Text>
            <Text style={styles.text}>• Increase annual savings by 10-20%</Text>
            <Text style={styles.text}>• Delay retirement by 1-2 years</Text>
            <Text style={styles.text}>• Reduce planned expenses by 10-15%</Text>
            <Text style={styles.text}>• Consider more aggressive asset allocation while young</Text>
          </View>
        )}

        <View style={styles.row}>
          <View style={styles.leftColumn}>
            <Text style={styles.heading}>Sequence of Returns Risk</Text>
            <Text style={styles.text}>
              Risk of poor returns early in retirement when withdrawals are high.
            </Text>
            <Text style={styles.smallText}>
              <Text style={styles.boldText}>Mitigation:</Text>
            </Text>
            <Text style={styles.smallText}>
              • Maintain 2-3 years expenses in cash/bonds
            </Text>
            <Text style={styles.smallText}>
              • Use bond tent strategy approaching retirement
            </Text>
            <Text style={styles.smallText}>
              • Consider flexible withdrawal strategies
            </Text>
          </View>

          <View style={styles.rightColumn}>
            <Text style={styles.heading}>Longevity Risk</Text>
            <Text style={styles.text}>
              Risk of outliving your assets due to longer than expected lifespan.
            </Text>
            <Text style={styles.smallText}>
              <Text style={styles.boldText}>Mitigation:</Text>
            </Text>
            <Text style={styles.smallText}>
              • Plan for age 90+ even if optimistic
            </Text>
            <Text style={styles.smallText}>
              • Consider annuities for guaranteed income
            </Text>
            <Text style={styles.smallText}>
              • Maintain some equity exposure in retirement
            </Text>
          </View>
        </View>

        <View style={styles.row}>
          <View style={styles.leftColumn}>
            <Text style={styles.heading}>Inflation Risk</Text>
            <Text style={styles.text}>
              Risk of reduced purchasing power over long retirement periods.
            </Text>
            <Text style={styles.smallText}>
              <Text style={styles.boldText}>Mitigation:</Text>
            </Text>
            <Text style={styles.smallText}>
              • Maintain equity allocations in retirement
            </Text>
            <Text style={styles.smallText}>
              • Consider TIPS or I-Bonds
            </Text>
            <Text style={styles.smallText}>
              • Plan for variable spending in retirement
            </Text>
          </View>

          <View style={styles.rightColumn}>
            <Text style={styles.heading}>Healthcare Cost Risk</Text>
            <Text style={styles.text}>
              Risk of healthcare costs exceeding planned medical expenses.
            </Text>
            <Text style={styles.smallText}>
              <Text style={styles.boldText}>Mitigation:</Text>
            </Text>
            <Text style={styles.smallText}>
              • Budget extra 20-30% for healthcare
            </Text>
            <Text style={styles.smallText}>
              • Consider long-term care insurance
            </Text>
            <Text style={styles.smallText}>
              • Maintain HSA if available
            </Text>
          </View>
        </View>
      </View>

      <Text style={styles.pageNumber}>Page 8</Text>
    </Page>
  )
}