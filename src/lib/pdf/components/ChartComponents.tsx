import React from 'react'
import { Page, View, Text, Image } from '@react-pdf/renderer'
import { styles } from '../styles'
import { SimulationResults } from '@/types'
import { ReportHeader } from './ReportHeader'

interface ChartComponentsProps {
  results: SimulationResults
  reportDate: string
  reportId: string
  chartImages: {
    assetProjection: string
    monthlySpending: string
    successRate: string
    expenseBreakdown: string
  }
}

const formatCurrency = (value: number): string => {
  return new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const formatCurrencyShort = (value: number): string => {
  if (value >= 1000000) {
    return `€${(value / 1000000).toFixed(1)}M`
  }
  if (value >= 1000) {
    return `€${(value / 1000).toFixed(0)}K`
  }
  return `€${value.toFixed(0)}`
}

export const ChartComponents: React.FC<ChartComponentsProps> = ({
  results,
  reportDate,
  reportId,
  chartImages,
}) => {
  // Transform data for charts
  const chartData = results.ages.map((age, index) => ({
    age,
    assets_p10: Math.round(results.assetPercentiles.p10[index]),
    assets_p50: Math.round(results.assetPercentiles.p50[index]),
    assets_p90: Math.round(results.assetPercentiles.p90[index]),
    spending_p10: Math.round(results.spendingPercentiles.p10[index]),
    spending_p50: Math.round(results.spendingPercentiles.p50[index]),
    spending_p90: Math.round(results.spendingPercentiles.p90[index]),
  }))

  // Create actual chart component with generated images
  const createChartComponent = (title: string, imageData: string, description?: string) => (
    <View style={styles.chartContainer}>
      <Text style={styles.chartTitle}>{title}</Text>
      <Image 
        src={imageData} 
        style={{ width: '100%', height: 300, marginBottom: 10 }} 
      />
      {description && (
        <Text style={styles.smallText}>
          {description}
        </Text>
      )}
    </View>
  )

  return (
    <>
      {/* Page 6: Asset Projections */}
      <Page size="A4" style={styles.page}>
        <ReportHeader
          reportTitle="Asset Projections Analysis"
          reportDate={reportDate}
          reportId={reportId}
          showLogo={false}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Asset Growth Over Time</Text>
          <Text style={styles.text}>
            This chart shows how your assets are projected to grow and decline over your lifetime under 
            three different scenarios: pessimistic (10th percentile), most likely (50th percentile), 
            and optimistic (90th percentile).
          </Text>
        </View>

        {createChartComponent(
          "Asset Projections by Age",
          chartImages.assetProjection,
          "Line chart showing pessimistic (10th), median (50th), and optimistic (90th) percentile asset projections from current age through retirement planning horizon."
        )}

        <View style={styles.row}>
          <View style={styles.leftColumn}>
            <View style={styles.highlight}>
              <Text style={styles.heading}>Chart Legend</Text>
              <Text style={styles.text}>
                🔴 <Text style={styles.boldText}>Red Line (10th Percentile):</Text> Pessimistic scenario - 
                only 10% of simulations perform worse than this
              </Text>
              <Text style={styles.text}>
                🔵 <Text style={styles.boldText}>Blue Line (50th Percentile):</Text> Most likely scenario - 
                median outcome across all simulations
              </Text>
              <Text style={styles.text}>
                🟢 <Text style={styles.boldText}>Green Line (90th Percentile):</Text> Optimistic scenario - 
                90% of simulations perform worse than this
              </Text>
            </View>
          </View>

          <View style={styles.rightColumn}>
            <View style={styles.highlight}>
              <Text style={styles.heading}>Key Observations</Text>
              <Text style={styles.text}>
                <Text style={styles.boldText}>Accumulation Phase:</Text> Assets grow from savings and investment returns
              </Text>
              <Text style={styles.text}>
                <Text style={styles.boldText}>Retirement Transition:</Text> Assets peak around retirement age
              </Text>
              <Text style={styles.text}>
                <Text style={styles.boldText}>Distribution Phase:</Text> Assets decline as you fund retirement expenses
              </Text>
            </View>
          </View>
        </View>

        {/* Key Milestone Data Table */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Asset Values at Key Milestones</Text>
          
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Age</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Pessimistic (P10)</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Most Likely (P50)</Text>
              </View>
              <View style={styles.tableCol}>
                <Text style={styles.tableCell}>Optimistic (P90)</Text>
              </View>
            </View>

            {[
              { age: results.params.currentAge, label: 'Today' },
              { age: results.params.retirementAge, label: 'Retirement' },
              { age: results.params.legalRetirementAge, label: 'Pension Starts' },
              { age: results.params.endAge, label: 'End of Plan' }
            ].map(milestone => {
              const index = results.ages.findIndex(age => age === milestone.age)
              if (index === -1) return null
              
              return (
                <View key={milestone.age} style={styles.tableRow}>
                  <View style={styles.tableCol}>
                    <Text style={styles.tableCell}>{milestone.age} ({milestone.label})</Text>
                  </View>
                  <View style={styles.tableCol}>
                    <Text style={styles.tableCellRight}>
                      {formatCurrency(results.assetPercentiles.p10[index])}
                    </Text>
                  </View>
                  <View style={styles.tableCol}>
                    <Text style={styles.tableCellRight}>
                      {formatCurrency(results.assetPercentiles.p50[index])}
                    </Text>
                  </View>
                  <View style={styles.tableCol}>
                    <Text style={styles.tableCellRight}>
                      {formatCurrency(results.assetPercentiles.p90[index])}
                    </Text>
                  </View>
                </View>
              )
            })}
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Risk Analysis</Text>
          
          {results.assetPercentiles.p10[results.ages.findIndex(age => age === results.params.endAge)] < 0 ? (
            <View style={styles.warning}>
              <Text style={styles.heading}>⚠️ Asset Depletion Risk</Text>
              <Text style={styles.text}>
                In the pessimistic scenario (10th percentile), your assets may be depleted before the end 
                of the planning period. Consider strategies to reduce this risk.
              </Text>
            </View>
          ) : (
            <View style={styles.success}>
              <Text style={styles.heading}>✓ Asset Sustainability</Text>
              <Text style={styles.text}>
                Even in pessimistic scenarios, your assets are projected to last through the planning period.
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.pageNumber}>Page 6</Text>
      </Page>

      {/* Page 7: Spending Analysis */}
      <Page size="A4" style={styles.page}>
        <ReportHeader
          reportTitle="Retirement Spending Analysis"
          reportDate={reportDate}
          reportId={reportId}
          showLogo={false}
        />

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Monthly Spending During Retirement</Text>
          <Text style={styles.text}>
            This analysis shows your total monthly spending needs during retirement, including both 
            regular monthly expenses and the monthly portion of annual expenses (vacations, repairs, etc.), 
            all adjusted for inflation.
          </Text>
        </View>

        {createChartComponent(
          "Monthly Spending by Age",
          chartImages.monthlySpending,
          "Bar chart showing monthly spending requirements during retirement across different scenarios, including inflation-adjusted expenses."
        )}

        <View style={styles.row}>
          <View style={styles.leftColumn}>
            <Text style={styles.heading}>Spending Components</Text>
            <Text style={styles.text}>
              <Text style={styles.boldText}>Monthly Expenses:</Text>
            </Text>
            <Text style={styles.smallText}>
              • Health: {formatCurrency(results.params.monthlyExpenses.health)}
            </Text>
            <Text style={styles.smallText}>
              • Food: {formatCurrency(results.params.monthlyExpenses.food)}
            </Text>
            <Text style={styles.smallText}>
              • Entertainment: {formatCurrency(results.params.monthlyExpenses.entertainment)}
            </Text>
            <Text style={styles.smallText}>
              • Shopping: {formatCurrency(results.params.monthlyExpenses.shopping)}
            </Text>
            <Text style={styles.smallText}>
              • Utilities: {formatCurrency(results.params.monthlyExpenses.utilities)}
            </Text>
            
            <Text style={styles.text}>
              <Text style={styles.boldText}>Annual Expenses (Monthly Avg):</Text>
            </Text>
            <Text style={styles.smallText}>
              • Vacations: {formatCurrency(results.params.annualExpenses.vacations / 12)}
            </Text>
            <Text style={styles.smallText}>
              • Repairs: {formatCurrency(results.params.annualExpenses.repairs / 12)}
            </Text>
            <Text style={styles.smallText}>
              • Car: {formatCurrency(results.params.annualExpenses.carMaintenance / 12)}
            </Text>
          </View>

          <View style={styles.rightColumn}>
            <Text style={styles.heading}>Inflation Impact</Text>
            <Text style={styles.text}>
              All expenses are adjusted for inflation at {(results.params.averageInflation * 100).toFixed(1)}% 
              annually. This means your spending power requirements increase over time to maintain 
              the same lifestyle.
            </Text>
            
            <Text style={styles.text}>
              <Text style={styles.boldText}>Example:</Text> An expense of €1,000 today will require 
              approximately €1,344 in 10 years and €1,806 in 20 years to maintain the same 
              purchasing power.
            </Text>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Income vs. Expenses Analysis</Text>
          
          <Text style={styles.text}>
            Starting at age {results.params.legalRetirementAge}, you'll receive a monthly pension of {formatCurrency(results.params.monthlyPension)} 
            (in today's purchasing power). This pension will also be adjusted for inflation.
          </Text>

          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Phase</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Primary Funding Source</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Age {results.params.retirementAge}-{results.params.legalRetirementAge}</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Personal Assets Only</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Age {results.params.legalRetirementAge}+</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Pension + Asset Withdrawals</Text>
              </View>
            </View>
          </View>

          {results.params.monthlyPension * 12 > (Object.values(results.params.monthlyExpenses).reduce((sum, exp) => sum + exp, 0) * 12 + Object.values(results.params.annualExpenses).reduce((sum, exp) => sum + exp, 0)) && (
            <View style={styles.success}>
              <Text style={styles.heading}>✓ Pension Coverage</Text>
              <Text style={styles.text}>
                Your expected pension income exceeds your planned expenses, providing additional security 
                in later retirement years.
              </Text>
            </View>
          )}
        </View>

        <Text style={styles.pageNumber}>Page 7</Text>
      </Page>
    </>
  )
}