import React from 'react'
import { Page, View, Text } from '@react-pdf/renderer'
import { styles } from '../styles'
import { SimulationResults } from '@/types'
import { ReportHeader } from './ReportHeader'

interface MilestoneTimelineProps {
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

interface Milestone {
  age: number
  title: string
  description: string
  assets?: number
  isRetirement?: boolean
  isPensionStart?: boolean
  isCurrentAge?: boolean
}

export const MilestoneTimeline: React.FC<MilestoneTimelineProps> = ({
  results,
  reportDate,
  reportId,
}) => {
  const { params } = results

  // Calculate assets at key ages
  const getAssetsAtAge = (age: number): number => {
    const index = results.ages.findIndex(a => a === age)
    return index >= 0 ? results.assetPercentiles.p50[index] : 0
  }

  const milestones: Milestone[] = [
    {
      age: params.currentAge,
      title: "Today - Current Position",
      description: `Starting your retirement planning journey with ${formatCurrency(params.currentAssets)} in assets and ${formatCurrency(params.annualSavings)} in annual savings.`,
      assets: params.currentAssets,
      isCurrentAge: true,
    },
    {
      age: Math.floor((params.currentAge + params.retirementAge) / 2),
      title: "Mid-Career Checkpoint",
      description: `Halfway point to retirement. Review and adjust your savings strategy based on life changes and market conditions.`,
      assets: getAssetsAtAge(Math.floor((params.currentAge + params.retirementAge) / 2)),
    },
    {
      age: params.retirementAge,
      title: "Retirement Begins",
      description: `Stop working and begin drawing from your retirement assets. Projected assets: ${formatCurrency(getAssetsAtAge(params.retirementAge))}.`,
      assets: getAssetsAtAge(params.retirementAge),
      isRetirement: true,
    },
    {
      age: params.legalRetirementAge,
      title: "Pension Income Starts",
      description: `Begin receiving your monthly pension of ${formatCurrency(params.monthlyPension)}, providing additional income security.`,
      assets: getAssetsAtAge(params.legalRetirementAge),
      isPensionStart: true,
    },
    {
      age: Math.floor((params.legalRetirementAge + params.endAge) / 2),
      title: "Late Retirement",
      description: `Enjoying established retirement lifestyle with combined pension income and asset withdrawals.`,
      assets: getAssetsAtAge(Math.floor((params.legalRetirementAge + params.endAge) / 2)),
    },
    {
      age: params.endAge,
      title: "Planning Horizon",
      description: `End of financial modeling period. Projected remaining assets: ${formatCurrency(getAssetsAtAge(params.endAge))}.`,
      assets: getAssetsAtAge(params.endAge),
    },
  ]

  // Filter out milestones that are too close together
  const filteredMilestones = milestones.filter((milestone, index, array) => {
    if (index === 0) return true
    const prevMilestone = array[index - 1]
    return milestone.age - prevMilestone.age >= 3 // At least 3 years apart
  })

  return (
    <Page size="A4" style={styles.page}>
      <ReportHeader
        reportTitle="Milestone Timeline & Key Transitions"
        reportDate={reportDate}
        reportId={reportId}
        showLogo={false}
      />

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Your Financial Journey Timeline</Text>
        <Text style={styles.text}>
          This timeline shows the key milestones in your retirement planning journey, with projected 
          asset values at each major transition point.
        </Text>
      </View>

      <View style={styles.timelineContainer}>
        {filteredMilestones.map((milestone, index) => (
          <View key={milestone.age} style={styles.timelineItem}>
            <View 
              style={[
                styles.timelineDot, 
                milestone.isCurrentAge && { backgroundColor: '#10b981' },
                milestone.isRetirement && { backgroundColor: '#dc2626' },
                milestone.isPensionStart && { backgroundColor: '#059669' },
              ]} 
            />
            <View style={styles.timelineContent}>
              <Text style={styles.timelineAge}>Age {milestone.age}</Text>
              <Text style={[styles.text, styles.boldText]}>{milestone.title}</Text>
              <Text style={styles.text}>{milestone.description}</Text>
              {milestone.assets !== undefined && milestone.assets > 0 && (
                <Text style={styles.smallText}>
                  Projected Assets: {formatCurrency(milestone.assets)}
                </Text>
              )}
            </View>
          </View>
        ))}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Critical Transition Periods</Text>
        
        <View style={styles.highlight}>
          <Text style={styles.heading}>Early Retirement Gap (Age {params.retirementAge} - {params.legalRetirementAge})</Text>
          <Text style={styles.text}>
            During this {params.legalRetirementAge - params.retirementAge}-year period, you'll rely entirely on your 
            personal savings without pension income. This is often the highest-risk period for retirement security.
          </Text>
          <Text style={styles.text}>
            <Text style={styles.boldText}>Strategy:</Text> Ensure you have sufficient assets to cover all expenses 
            during this gap period while preserving capital for later years.
          </Text>
        </View>

        {params.retirementAge < params.legalRetirementAge && (
          <View style={styles.warning}>
            <Text style={styles.heading}>⚠️ Bridge Strategy Required</Text>
            <Text style={styles.text}>
              Since you plan to retire before pension eligibility, you'll need a bridge strategy for 
              {params.legalRetirementAge - params.retirementAge} years. Consider:
            </Text>
            <Text style={styles.text}>• Building a separate "bridge fund" for early retirement years</Text>
            <Text style={styles.text}>• Ensuring liquid assets to avoid early withdrawal penalties</Text>
            <Text style={styles.text}>• Reviewing healthcare coverage options during this period</Text>
          </View>
        )}

        <View style={styles.row}>
          <View style={styles.leftColumn}>
            <Text style={styles.heading}>Pre-Retirement Phase</Text>
            <Text style={styles.text}>
              <Text style={styles.boldText}>Ages {params.currentAge}-{params.retirementAge}</Text>
            </Text>
            <Text style={styles.text}>
              Focus on maximizing savings and optimizing investment growth. This is your 
              accumulation phase where compound growth has the most impact.
            </Text>
            <Text style={styles.smallText}>
              • Years remaining: {params.retirementAge - params.currentAge}
            </Text>
            <Text style={styles.smallText}>
              • Annual savings: {formatCurrency(params.annualSavings)}
            </Text>
          </View>

          <View style={styles.rightColumn}>
            <Text style={styles.heading}>Retirement Phase</Text>
            <Text style={styles.text}>
              <Text style={styles.boldText}>Ages {params.retirementAge}-{params.endAge}</Text>
            </Text>
            <Text style={styles.text}>
              Transition to drawing from your assets while managing longevity risk and 
              maintaining purchasing power against inflation.
            </Text>
            <Text style={styles.smallText}>
              • Retirement years: {params.endAge - params.retirementAge}
            </Text>
            <Text style={styles.smallText}>
              • Pension starts: Age {params.legalRetirementAge}
            </Text>
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Key Planning Considerations by Phase</Text>

        <View style={styles.table}>
          <View style={[styles.tableRow, styles.tableHeader]}>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Life Phase</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Age Range</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Primary Focus</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Key Risks</Text>
            </View>
          </View>

          <View style={styles.tableRow}>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Accumulation</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCellCenter}>{params.currentAge}-{params.retirementAge}</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Maximize savings & growth</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Market downturns, job loss</Text>
            </View>
          </View>

          <View style={styles.tableRow}>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Early Retirement</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCellCenter}>{params.retirementAge}-{params.legalRetirementAge}</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Asset preservation</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Sequence of returns risk</Text>
            </View>
          </View>

          <View style={styles.tableRow}>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Pension Phase</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCellCenter}>{params.legalRetirementAge}-{params.endAge}</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Income security</Text>
            </View>
            <View style={styles.tableCol}>
              <Text style={styles.tableCell}>Inflation, longevity</Text>
            </View>
          </View>
        </View>
      </View>

      <Text style={styles.pageNumber}>Page 5</Text>
    </Page>
  )
}