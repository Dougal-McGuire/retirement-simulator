import React from 'react'
import { Page, View, Text } from '@react-pdf/renderer'
import { styles } from '../styles'
import { SimulationParams } from '@/types'

interface CoverPageProps {
  params: SimulationParams
  reportDate: string
  reportId: string
}

export const CoverPage: React.FC<CoverPageProps> = ({
  params,
  reportDate,
  reportId,
}) => {
  return (
    <Page size="A4" style={styles.coverPage}>
      <View>
        <View style={styles.logo} />
      </View>
      
      <View>
        <Text style={styles.coverTitle}>
          Retirement Planning Analysis
        </Text>
        <Text style={styles.coverSubtitle}>
          Comprehensive Financial Projection Report
        </Text>
        <Text style={styles.coverClient}>
          Age {params.currentAge} → Retirement at {params.retirementAge}
        </Text>
        <Text style={styles.coverDate}>
          Generated on {reportDate}
        </Text>
        <Text style={[styles.smallText, {textAlign: 'center', marginBottom: 20}]}>
          Report ID: {reportId}
        </Text>
      </View>

      <View>
        <Text style={styles.disclaimer}>
          This report is based on the assumptions and parameters provided and should not be considered as investment advice. 
          Past performance does not guarantee future results. Market conditions, tax laws, and personal circumstances may change, 
          affecting the actual outcomes. Please consult with a qualified financial advisor before making investment decisions. 
          The Monte Carlo simulation provides probabilistic projections based on historical market data and mathematical models.
        </Text>
      </View>
    </Page>
  )
}