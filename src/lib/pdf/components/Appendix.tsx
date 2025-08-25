import React from 'react'
import { Page, View, Text } from '@react-pdf/renderer'
import { styles } from '../styles'
import { SimulationParams } from '@/types'
import { ReportHeader } from './ReportHeader'

interface AppendixProps {
  params: SimulationParams
  reportDate: string
  reportId: string
}

export const Appendix: React.FC<AppendixProps> = ({
  params,
  reportDate,
  reportId,
}) => {
  return (
    <Page size="A4" style={styles.page}>
      <ReportHeader
        reportTitle="Appendix: Methodology & Glossary"
        reportDate={reportDate}
        reportId={reportId}
        showLogo={false}
      />

      {/* Glossary */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Glossary of Terms</Text>

        <View style={styles.row}>
          <View style={styles.leftColumn}>
            <Text style={styles.heading}>Asset Allocation</Text>
            <Text style={styles.text}>
              The distribution of investments across different asset classes (stocks, bonds, cash) 
              to balance risk and return potential.
            </Text>

            <Text style={styles.heading}>Capital Gains Tax</Text>
            <Text style={styles.text}>
              Tax on the profit from selling investments. Applied when assets are sold to fund 
              retirement expenses.
            </Text>

            <Text style={styles.heading}>Inflation</Text>
            <Text style={styles.text}>
              The rate at which the general level of prices rises, reducing purchasing power 
              over time. Used to adjust future expenses.
            </Text>

            <Text style={styles.heading}>Monte Carlo Simulation</Text>
            <Text style={styles.text}>
              A mathematical technique that uses random sampling to model uncertainty and 
              calculate probable outcomes.
            </Text>

            <Text style={styles.heading}>Percentiles</Text>
            <Text style={styles.text}>
              Statistical measures showing the value below which a percentage of observations fall. 
              P50 is the median (50th percentile).
            </Text>

            <Text style={styles.heading}>Real Return</Text>
            <Text style={styles.text}>
              Investment return adjusted for inflation, representing true purchasing power growth.
            </Text>
          </View>

          <View style={styles.rightColumn}>
            <Text style={styles.heading}>Sequence of Returns Risk</Text>
            <Text style={styles.text}>
              The risk of experiencing poor investment returns early in retirement when withdrawal 
              amounts are highest.
            </Text>

            <Text style={styles.heading}>Standard Deviation</Text>
            <Text style={styles.text}>
              A measure of volatility showing how much returns typically vary from the average. 
              Higher values indicate more volatile investments.
            </Text>

            <Text style={styles.heading}>Success Rate</Text>
            <Text style={styles.text}>
              The percentage of simulation runs where assets lasted through the entire planning 
              period while meeting spending goals.
            </Text>

            <Text style={styles.heading}>Volatility</Text>
            <Text style={styles.text}>
              The degree of variation in investment returns over time. Higher volatility means 
              larger swings in portfolio value.
            </Text>

            <Text style={styles.heading}>Withdrawal Rate</Text>
            <Text style={styles.text}>
              The percentage of portfolio value withdrawn annually to fund retirement expenses. 
              Traditional safe rate is 4%.
            </Text>
          </View>
        </View>
      </View>

      {/* Technical Methodology */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Technical Methodology</Text>

        <Text style={styles.heading}>Simulation Process</Text>
        <Text style={styles.text}>
          1. <Text style={styles.boldText}>Parameter Setup:</Text> Initialize all user inputs including 
          current assets, savings rate, expenses, and market assumptions.
        </Text>
        <Text style={styles.text}>
          2. <Text style={styles.boldText}>Random Generation:</Text> For each simulation run, generate 
          random annual returns and inflation rates using normal distributions.
        </Text>
        <Text style={styles.text}>
          3. <Text style={styles.boldText}>Year-by-Year Calculation:</Text> For each year from current 
          age to end age, calculate asset growth, add savings (if working), subtract expenses, and 
          apply taxes.
        </Text>
        <Text style={styles.text}>
          4. <Text style={styles.boldText}>Statistical Analysis:</Text> Aggregate results across all 
          simulation runs to calculate percentiles and success rates.
        </Text>

        <Text style={styles.heading}>Return Modeling</Text>
        <Text style={styles.text}>
          Investment returns are modeled using a normal distribution with mean equal to the expected 
          return and standard deviation equal to the specified volatility. This approach reflects 
          the historical behavior of diversified portfolios while acknowledging that actual returns 
          may not follow a perfect normal distribution.
        </Text>

        <Text style={styles.heading}>Inflation Adjustment</Text>
        <Text style={styles.text}>
          All expenses and pension income are adjusted annually for inflation. Inflation rates are 
          also randomly generated using a normal distribution centered on the expected inflation 
          rate with the specified volatility.
        </Text>

        <Text style={styles.heading}>Tax Treatment</Text>
        <Text style={styles.text}>
          Capital gains taxes are applied when assets are withdrawn to fund retirement expenses. 
          The model assumes all withdrawals are subject to capital gains tax at the specified rate. 
          This is a simplified treatment that may not reflect the complexity of actual tax situations.
        </Text>
      </View>

      {/* Assumptions and Limitations */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Key Assumptions & Limitations</Text>

        <View style={styles.warning}>
          <Text style={styles.heading}>⚠️ Important Limitations</Text>
          <Text style={styles.text}>
            This analysis makes several simplifying assumptions that may not reflect real-world complexity:
          </Text>
        </View>

        <Text style={styles.text}>
          • <Text style={styles.boldText}>Market Behavior:</Text> Assumes returns follow a normal 
          distribution, which may not capture extreme market events or long-term trends.
        </Text>

        <Text style={styles.text}>
          • <Text style={styles.boldText}>Tax Simplification:</Text> Uses a single capital gains tax 
          rate for all withdrawals, ignoring tax-advantaged accounts, progressive tax brackets, and 
          changing tax laws.
        </Text>

        <Text style={styles.text}>
          • <Text style={styles.boldText}>Constant Expenses:</Text> Assumes retirement expenses remain 
          constant in real terms, but actual spending patterns may change with age and health.
        </Text>

        <Text style={styles.text}>
          • <Text style={styles.boldText}>No Major Life Events:</Text> Does not account for potential 
          major expenses like long-term care, home modifications, or family emergencies.
        </Text>

        <Text style={styles.text}>
          • <Text style={styles.boldText}>Asset Allocation:</Text> Uses a single expected return and 
          volatility, rather than modeling dynamic asset allocation strategies.
        </Text>

        <Text style={styles.text}>
          • <Text style={styles.boldText}>Inflation Consistency:</Text> Assumes general inflation 
          applies equally to all expense categories, but healthcare and other costs may inflate differently.
        </Text>
      </View>

      {/* Disclaimer */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Legal Disclaimer</Text>
        
        <Text style={styles.text}>
          This report is for informational and educational purposes only and should not be construed 
          as personalized investment advice, tax advice, or a recommendation to buy or sell any 
          specific investments. The analysis is based on assumptions and projections that may not 
          reflect actual future conditions.
        </Text>

        <Text style={styles.text}>
          Past performance does not guarantee future results. All investments involve risk of loss, 
          including loss of principal. Market conditions, tax laws, and personal circumstances can 
          change, potentially affecting the accuracy of these projections.
        </Text>

        <Text style={styles.text}>
          Before making any investment decisions, please consult with qualified financial, tax, and 
          legal advisors who can provide advice based on your specific situation and current 
          regulations. The creators of this report disclaim any liability for decisions made based 
          on this analysis.
        </Text>

        <View style={styles.highlight}>
          <Text style={styles.heading}>For Best Results</Text>
          <Text style={styles.text}>
            Use this analysis as a starting point for retirement planning discussions with qualified 
            professionals. Regular reviews and updates will help ensure your plan remains aligned 
            with your goals and changing circumstances.
          </Text>
        </View>
      </View>

      <Text style={styles.pageNumber}>Page 11</Text>
    </Page>
  )
}