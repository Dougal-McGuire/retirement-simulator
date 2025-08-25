import React from 'react'
import { Page, View, Text } from '@react-pdf/renderer'
import { styles } from '../styles'
import { SimulationParams } from '@/types'
import { ReportHeader } from './ReportHeader'

interface AssumptionsSectionProps {
  params: SimulationParams
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
  return `${(value * 100).toFixed(2)}%`
}

export const AssumptionsSection: React.FC<AssumptionsSectionProps> = ({
  params,
  reportDate,
  reportId,
}) => {
  const totalMonthlyExpenses = Object.values(params.monthlyExpenses).reduce((sum, exp) => sum + exp, 0)
  const totalAnnualExpenses = Object.values(params.annualExpenses).reduce((sum, exp) => sum + exp, 0)

  return (
    <>
      {/* Page 3: Personal Profile & Financial Position */}
      <Page size="A4" style={styles.page}>
        <ReportHeader
          reportTitle="Personal Profile & Financial Assumptions"
          reportDate={reportDate}
          reportId={reportId}
        />

        {/* Personal Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Personal Information</Text>
          
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Parameter</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Value</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Current Age</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{params.currentAge} years</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Planned Retirement Age</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{params.retirementAge} years</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Legal Retirement Age (Pension Starts)</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{params.legalRetirementAge} years</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Planning Horizon</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{params.endAge} years</Text>
              </View>
            </View>
          </View>

          <Text style={styles.smallText}>
            <Text style={styles.boldText}>Note:</Text> The planning horizon represents the age until which we model your financial needs. 
            This provides a comprehensive long-term view while acknowledging that actual longevity may vary.
          </Text>
        </View>

        {/* Current Financial Position */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Current Financial Position</Text>
          
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Asset/Income Type</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Amount</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Current Total Assets</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{formatCurrency(params.currentAssets)}</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Annual Savings</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{formatCurrency(params.annualSavings)}</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Expected Monthly Pension</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{formatCurrency(params.monthlyPension)}</Text>
              </View>
            </View>
          </View>

          <View style={styles.highlight}>
            <Text style={styles.heading}>Assumptions Explained</Text>
            <Text style={styles.text}>
              <Text style={styles.boldText}>Current Assets:</Text> Total value of all invested assets, including 401(k), IRA, 
              brokerage accounts, and other retirement savings. This excludes your primary residence and emergency funds.
            </Text>
            <Text style={styles.text}>
              <Text style={styles.boldText}>Annual Savings:</Text> Amount you plan to save each year until retirement. 
              This should include employer matching contributions and all retirement account contributions.
            </Text>
            <Text style={styles.text}>
              <Text style={styles.boldText}>Monthly Pension:</Text> Expected monthly pension or Social Security benefits 
              starting at your legal retirement age. This amount is inflation-adjusted in our projections.
            </Text>
          </View>
        </View>

        {/* Monthly Expenses Breakdown */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Monthly Expenses During Retirement</Text>
          
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Expense Category</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Monthly Amount</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Health & Medical</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{formatCurrency(params.monthlyExpenses.health)}</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Food & Groceries</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{formatCurrency(params.monthlyExpenses.food)}</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Entertainment & Leisure</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{formatCurrency(params.monthlyExpenses.entertainment)}</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Shopping & Miscellaneous</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{formatCurrency(params.monthlyExpenses.shopping)}</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Utilities & Housing</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{formatCurrency(params.monthlyExpenses.utilities)}</Text>
              </View>
            </View>
            
            <View style={[styles.tableRow, styles.tableHeader]}>
              <View style={styles.tableColWide}>
                <Text style={[styles.tableCell, styles.boldText]}>Total Monthly</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={[styles.tableCellRight, styles.boldText]}>{formatCurrency(totalMonthlyExpenses)}</Text>
              </View>
            </View>
          </View>
        </View>

        <Text style={styles.pageNumber}>Page 3</Text>
      </Page>

      {/* Page 4: Market Assumptions & Methodology */}
      <Page size="A4" style={styles.page}>
        <ReportHeader
          reportTitle="Market Assumptions & Simulation Methodology"
          reportDate={reportDate}
          reportId={reportId}
          showLogo={false}
        />

        {/* Annual Expenses */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Annual Expenses</Text>
          
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Expense Category</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Annual Amount</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Vacations & Travel</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{formatCurrency(params.annualExpenses.vacations)}</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Home Repairs & Maintenance</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{formatCurrency(params.annualExpenses.repairs)}</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Car Maintenance & Insurance</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{formatCurrency(params.annualExpenses.carMaintenance)}</Text>
              </View>
            </View>
            
            <View style={[styles.tableRow, styles.tableHeader]}>
              <View style={styles.tableColWide}>
                <Text style={[styles.tableCell, styles.boldText]}>Total Annual</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={[styles.tableCellRight, styles.boldText]}>{formatCurrency(totalAnnualExpenses)}</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={[styles.tableCell, styles.boldText]}>Monthly Equivalent</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={[styles.tableCellRight, styles.boldText]}>{formatCurrency(totalAnnualExpenses / 12)}</Text>
              </View>
            </View>
          </View>

          <Text style={styles.smallText}>
            Annual expenses are distributed evenly across each year in the simulation and adjusted for inflation.
          </Text>
        </View>

        {/* Market Assumptions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Market & Economic Assumptions</Text>
          
          <View style={styles.table}>
            <View style={[styles.tableRow, styles.tableHeader]}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Parameter</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Assumption</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Average Return on Investment (ROI)</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{formatPercentage(params.averageROI)}</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>ROI Volatility (Standard Deviation)</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{formatPercentage(params.roiVolatility)}</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Average Inflation Rate</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{formatPercentage(params.averageInflation)}</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Inflation Volatility</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{formatPercentage(params.inflationVolatility)}</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Capital Gains Tax Rate</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{formatPercentage(params.capitalGainsTax / 100)}</Text>
              </View>
            </View>
            
            <View style={styles.tableRow}>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCell}>Monte Carlo Simulation Runs</Text>
              </View>
              <View style={styles.tableColWide}>
                <Text style={styles.tableCellRight}>{params.simulationRuns.toLocaleString()}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Methodology Explanation */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Simulation Methodology</Text>
          
          <View style={styles.highlight}>
            <Text style={styles.heading}>Monte Carlo Simulation</Text>
            <Text style={styles.text}>
              This analysis uses Monte Carlo simulation to model thousands of possible market scenarios. 
              Each simulation run uses random but historically-informed returns and inflation rates to project 
              your financial future. This approach accounts for market volatility and uncertainty.
            </Text>
          </View>

          <Text style={styles.text}>
            <Text style={styles.boldText}>Return Modeling:</Text> Investment returns are generated using a normal distribution 
            with the specified average return and volatility. This reflects the historical behavior of diversified portfolios.
          </Text>
          
          <Text style={styles.text}>
            <Text style={styles.boldText}>Inflation Adjustment:</Text> All expenses and pension income are adjusted annually 
            for inflation using randomly generated inflation rates within the specified parameters.
          </Text>
          
          <Text style={styles.text}>
            <Text style={styles.boldText}>Tax Treatment:</Text> Capital gains taxes are applied when assets are withdrawn 
            to fund retirement expenses. The tax rate reflects current German tax regulations for investment income.
          </Text>
          
          <Text style={styles.text}>
            <Text style={styles.boldText}>Percentile Analysis:</Text> Results are presented as percentiles (10th, 50th, 90th) 
            showing pessimistic, median, and optimistic scenarios. The 50th percentile represents the most likely outcome.
          </Text>

          <View style={styles.warning}>
            <Text style={styles.heading}>Important Limitations</Text>
            <Text style={styles.text}>
              • Historical performance does not guarantee future results
            </Text>
            <Text style={styles.text}>
              • Tax laws and rates may change over time
            </Text>
            <Text style={styles.text}>
              • Major life events may significantly impact financial needs
            </Text>
            <Text style={styles.text}>
              • Healthcare costs may increase faster than general inflation
            </Text>
          </View>
        </View>

        <Text style={styles.pageNumber}>Page 4</Text>
      </Page>
    </>
  )
}