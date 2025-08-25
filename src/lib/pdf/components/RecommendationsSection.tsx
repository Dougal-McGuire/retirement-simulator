import React from 'react'
import { Page, View, Text } from '@react-pdf/renderer'
import { styles } from '../styles'
import { SimulationResults } from '@/types'
import { ReportHeader } from './ReportHeader'

interface RecommendationsSectionProps {
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

export const RecommendationsSection: React.FC<RecommendationsSectionProps> = ({
  results,
  reportDate,
  reportId,
}) => {
  const { params } = results
  
  // Calculate some recommendation metrics
  const yearsToRetirement = params.retirementAge - params.currentAge
  const earlyRetirementYears = params.legalRetirementAge - params.retirementAge
  const totalExpenses = Object.values(params.monthlyExpenses).reduce((sum, exp) => sum + exp, 0) * 12 + 
                        Object.values(params.annualExpenses).reduce((sum, exp) => sum + exp, 0)
  const expenseMultiple = params.currentAssets / totalExpenses

  // Generate personalized recommendations based on the simulation results
  const getRecommendations = () => {
    const recommendations = []

    // Success rate based recommendations
    if (results.successRate < 60) {
      recommendations.push({
        priority: "Critical",
        category: "Risk Reduction",
        title: "Immediate Action Required",
        description: `With a ${results.successRate.toFixed(1)}% success rate, your retirement plan needs significant improvement. Consider increasing savings by €${Math.round(params.annualSavings * 0.3)} annually or delaying retirement by 2-3 years.`,
        impact: "High"
      })
    } else if (results.successRate < 80) {
      recommendations.push({
        priority: "High",
        category: "Plan Optimization",
        title: "Enhance Retirement Security", 
        description: `Your ${results.successRate.toFixed(1)}% success rate indicates good progress, but improvement opportunities exist. Consider increasing savings by €${Math.round(params.annualSavings * 0.2)} annually.`,
        impact: "Medium"
      })
    } else if (results.successRate > 95) {
      recommendations.push({
        priority: "Medium",
        category: "Optimization",
        title: "Consider Early Retirement or Lifestyle Enhancement",
        description: `With a ${results.successRate.toFixed(1)}% success rate, you may have opportunities for early retirement or increased retirement spending.`,
        impact: "Positive"
      })
    }

    // Early retirement gap recommendations
    if (earlyRetirementYears > 0) {
      recommendations.push({
        priority: "High", 
        category: "Bridge Strategy",
        title: "Early Retirement Funding Gap",
        description: `You have a ${earlyRetirementYears}-year gap between retirement and pension eligibility. Build a separate fund of approximately €${formatCurrency(totalExpenses * earlyRetirementYears)} to bridge this period.`,
        impact: "High"
      })
    }

    // Asset allocation recommendations
    if (yearsToRetirement > 10) {
      recommendations.push({
        priority: "Medium",
        category: "Investment Strategy",
        title: "Growth-Focused Asset Allocation",
        description: `With ${yearsToRetirement} years until retirement, consider a growth-oriented portfolio (70-80% equities) to maximize accumulation potential.`,
        impact: "Medium"
      })
    } else if (yearsToRetirement > 5) {
      recommendations.push({
        priority: "Medium",
        category: "Investment Strategy", 
        title: "Begin Retirement Transition",
        description: `With ${yearsToRetirement} years to retirement, gradually shift toward more conservative allocations (60-70% equities).`,
        impact: "Medium"
      })
    } else {
      recommendations.push({
        priority: "High",
        category: "Investment Strategy",
        title: "Pre-Retirement Asset Allocation",
        description: `With retirement approaching, implement a bond tent strategy to reduce portfolio volatility and sequence of returns risk.`,
        impact: "High"
      })
    }

    // Savings rate recommendations
    const savingsRate = params.annualSavings / (params.annualSavings + totalExpenses)
    if (savingsRate < 0.15) {
      recommendations.push({
        priority: "High",
        category: "Savings Strategy",
        title: "Increase Savings Rate",
        description: `Your current savings rate appears low. Aim for 15-20% of income. Consider automatic increases or lifestyle adjustments.`,
        impact: "High"
      })
    }

    // Emergency fund recommendations
    if (expenseMultiple < 3) {
      recommendations.push({
        priority: "Medium",
        category: "Emergency Planning",
        title: "Build Emergency Fund",
        description: `Maintain 3-6 months of expenses (€${formatCurrency(totalExpenses * 0.5)}) in liquid savings separate from retirement accounts.`,
        impact: "Medium"
      })
    }

    // Healthcare planning
    if (params.monthlyExpenses.health < totalExpenses * 0.15 / 12) {
      recommendations.push({
        priority: "Medium",
        category: "Healthcare Planning",
        title: "Healthcare Cost Planning",
        description: `Healthcare typically represents 15-20% of retirement expenses. Your current budget may be optimistic. Consider increasing healthcare allocations.`,
        impact: "Medium"
      })
    }

    return recommendations.slice(0, 8) // Limit to top 8 recommendations
  }

  const recommendations = getRecommendations()

  return (
    <>
      {/* Page 9: Personalized Recommendations */}
      <Page size="A4" style={styles.page}>
        <ReportHeader
          reportTitle="Personalized Recommendations"
          reportDate={reportDate}
          reportId={reportId}
          showLogo={false}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Action Plan for Retirement Success</Text>
          <Text style={styles.text}>
            Based on your specific situation and simulation results, here are personalized recommendations 
            to improve your retirement security and optimize your financial strategy.
          </Text>
        </View>

        {/* High Priority Recommendations */}
        <View style={styles.section}>
          <Text style={styles.subtitle}>Priority Actions</Text>

          {recommendations.filter(r => r.priority === "Critical" || r.priority === "High").map((rec, index) => (
            <View key={index} style={rec.priority === "Critical" ? styles.warning : styles.highlight}>
              <Text style={styles.heading}>
                {rec.priority === "Critical" ? "🚨" : "⚠️"} {rec.title}
              </Text>
              <Text style={[styles.text, styles.boldText]}>Category: {rec.category}</Text>
              <Text style={styles.text}>{rec.description}</Text>
              <Text style={styles.smallText}>Expected Impact: {rec.impact}</Text>
            </View>
          ))}
        </View>

        {/* Medium Priority Recommendations */}
        {recommendations.filter(r => r.priority === "Medium").length > 0 && (
          <View style={styles.section}>
            <Text style={styles.subtitle}>Additional Opportunities</Text>

            {recommendations.filter(r => r.priority === "Medium").map((rec, index) => (
              <View key={index} style={styles.highlight}>
                <Text style={styles.heading}>💡 {rec.title}</Text>
                <Text style={[styles.text, styles.boldText]}>Category: {rec.category}</Text>
                <Text style={styles.text}>{rec.description}</Text>
                <Text style={styles.smallText}>Expected Impact: {rec.impact}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Implementation Timeline */}
        <View style={styles.section}>
          <Text style={styles.subtitle}>Implementation Timeline</Text>

          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Timeframe</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Priority Actions</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Review Frequency</Text>
              </View>
            </View>

            <View style={styles.tableRow}>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Next 30 Days</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>
                  {recommendations.filter(r => r.priority === "Critical").length > 0 ? 
                    "Address critical issues" : "Review investment allocation"}
                </Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Immediate</Text>
              </View>
            </View>

            <View style={styles.tableRow}>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Next 3 Months</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Implement high-priority changes</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Monthly</Text>
              </View>
            </View>

            <View style={styles.tableRow}>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Next 6-12 Months</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Execute medium-priority optimizations</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Quarterly</Text>
              </View>
            </View>

            <View style={styles.tableRow}>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Ongoing</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Monitor progress and adjust</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Annual</Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.pageNumber}>Page 9</Text>
      </Page>

      {/* Page 10: Professional Guidance & Next Steps */}
      <Page size="A4" style={styles.page}>
        <ReportHeader
          reportTitle="Professional Guidance & Next Steps"
          reportDate={reportDate}
          reportId={reportId}
          showLogo={false}
        />

        {/* When to Seek Professional Help */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>When to Consult a Financial Advisor</Text>

          <View style={styles.highlight}>
            <Text style={styles.heading}>Consider Professional Guidance If:</Text>
            <Text style={styles.text}>• Your success rate is below 80%</Text>
            <Text style={styles.text}>• You have complex tax situations or multiple income sources</Text>
            <Text style={styles.text}>• You're within 5 years of retirement</Text>
            <Text style={styles.text}>• You have significant life changes (marriage, divorce, inheritance)</Text>
            <Text style={styles.text}>• You're considering early retirement</Text>
            <Text style={styles.text}>• You need help with estate planning or tax optimization</Text>
          </View>

          <Text style={styles.text}>
            A qualified financial advisor can provide personalized strategies, tax optimization, 
            estate planning, and ongoing portfolio management tailored to your specific situation.
          </Text>
        </View>

        {/* Regular Review Schedule */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Ongoing Plan Management</Text>

          <View style={styles.row}>
            <View style={styles.leftColumn}>
              <Text style={styles.heading}>Annual Review Checklist</Text>
              <Text style={styles.text}>□ Update income and expense projections</Text>
              <Text style={styles.text}>□ Review investment performance and allocation</Text>
              <Text style={styles.text}>□ Reassess risk tolerance and time horizon</Text>
              <Text style={styles.text}>□ Update beneficiaries and estate documents</Text>
              <Text style={styles.text}>□ Re-run retirement simulation</Text>
              <Text style={styles.text}>□ Adjust savings rate if needed</Text>
            </View>

            <View style={styles.rightColumn}>
              <Text style={styles.heading}>Major Life Event Reviews</Text>
              <Text style={styles.text}>Update your plan when experiencing:</Text>
              <Text style={styles.text}>• Job changes or promotions</Text>
              <Text style={styles.text}>• Marriage or divorce</Text>
              <Text style={styles.text}>• Birth of children</Text>
              <Text style={styles.text}>• Health issues</Text>
              <Text style={styles.text}>• Inheritance or windfalls</Text>
              <Text style={styles.text}>• Major market events</Text>
            </View>
          </View>
        </View>

        {/* Key Performance Indicators */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Track Your Progress</Text>

          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Key Metric</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Target/Current Status</Text>
              </View>
            </View>

            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Annual Savings Rate</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Target: 15-20% | Current: {formatCurrency(params.annualSavings)}</Text>
              </View>
            </View>

            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Asset Growth Rate</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Target: {((params.averageROI - params.averageInflation) * 100).toFixed(1)}% real return</Text>
              </View>
            </View>

            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Retirement Readiness</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Current: {results.successRate.toFixed(1)}% | Target: 85%+</Text>
              </View>
            </View>

            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Emergency Fund</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Target: 3-6 months expenses</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Technology and Tools */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Helpful Resources</Text>

          <View style={styles.row}>
            <View style={styles.leftColumn}>
              <Text style={styles.heading}>Financial Planning Tools</Text>
              <Text style={styles.text}>• Monte Carlo retirement simulators</Text>
              <Text style={styles.text}>• Asset allocation calculators</Text>
              <Text style={styles.text}>• Tax optimization software</Text>
              <Text style={styles.text}>• Portfolio rebalancing tools</Text>
            </View>

            <View style={styles.rightColumn}>
              <Text style={styles.heading}>Educational Resources</Text>
              <Text style={styles.text}>• Retirement planning books and courses</Text>
              <Text style={styles.text}>• Investment fundamentals education</Text>
              <Text style={styles.text}>• Tax strategy resources</Text>
              <Text style={styles.text}>• Estate planning guides</Text>
            </View>
          </View>
        </View>

        {/* Final Encouragement */}
        <View style={styles.success}>
          <Text style={styles.heading}>✓ You're on the Right Track</Text>
          <Text style={styles.text}>
            Creating a comprehensive retirement plan puts you ahead of many people. By regularly 
            reviewing and adjusting your strategy, you're building a foundation for financial 
            security and peace of mind in retirement.
          </Text>
          <Text style={styles.text}>
            Remember that retirement planning is a journey, not a destination. Stay consistent 
            with your savings, remain flexible with your strategies, and celebrate the progress 
            you make along the way.
          </Text>
        </View>

        <Text style={styles.pageNumber}>Page 10</Text>
      </Page>
    </>
  )
}