import { SimulationParams } from '@/types'

interface TechnicalAppendixProps {
  params: SimulationParams
  reportDate: string
  reportId: string
}

export function TechnicalAppendix({ params, reportDate, reportId }: TechnicalAppendixProps) {
  return (
    <div className="report-section p-8 bg-white">
      {/* Header */}
      <div className="print-only mb-6 text-right text-sm text-gray-500">
        <p>Report Generated: {reportDate}</p>
        <p>Report ID: {reportId}</p>
      </div>
      
      <h1 className="text-3xl font-bold text-blue-600 mb-8">Appendix: Methodology & Glossary</h1>
      
      {/* Glossary of Terms */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Glossary of Terms</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <div>
              <h4 className="font-bold text-gray-800 mb-1">Asset Allocation</h4>
              <p className="text-sm text-gray-600">
                The distribution of investments across different asset classes (stocks, bonds, cash) to balance risk and return potential.
              </p>
            </div>
            
            <div>
              <h4 className="font-bold text-gray-800 mb-1">Capital Gains Tax</h4>
              <p className="text-sm text-gray-600">
                Tax on the profit from selling investments. Applied when assets are sold to fund retirement expenses.
              </p>
            </div>
            
            <div>
              <h4 className="font-bold text-gray-800 mb-1">Inflation</h4>
              <p className="text-sm text-gray-600">
                The rate at which the general level of prices rises, reducing purchasing power over time. Used to adjust future expenses.
              </p>
            </div>
            
            <div>
              <h4 className="font-bold text-gray-800 mb-1">Monte Carlo Simulation</h4>
              <p className="text-sm text-gray-600">
                A mathematical technique that uses random sampling to model uncertainty and calculate probable outcomes.
              </p>
            </div>
            
            <div>
              <h4 className="font-bold text-gray-800 mb-1">Percentiles</h4>
              <p className="text-sm text-gray-600">
                Statistical measures showing the value below which a percentage of observations fall. P50 is the median (50th percentile).
              </p>
            </div>
            
            <div>
              <h4 className="font-bold text-gray-800 mb-1">Real Return</h4>
              <p className="text-sm text-gray-600">
                Investment return adjusted for inflation, representing true purchasing power growth.
              </p>
            </div>
          </div>
          
          <div className="space-y-4">
            <div>
              <h4 className="font-bold text-gray-800 mb-1">Sequence of Returns Risk</h4>
              <p className="text-sm text-gray-600">
                The risk of experiencing poor investment returns early in retirement when withdrawal amounts are highest.
              </p>
            </div>
            
            <div>
              <h4 className="font-bold text-gray-800 mb-1">Standard Deviation</h4>
              <p className="text-sm text-gray-600">
                A measure of volatility showing how much returns typically vary from the average. Higher values indicate more volatile investments.
              </p>
            </div>
            
            <div>
              <h4 className="font-bold text-gray-800 mb-1">Success Rate</h4>
              <p className="text-sm text-gray-600">
                The percentage of simulation runs where assets lasted through the entire planning period while meeting spending goals.
              </p>
            </div>
            
            <div>
              <h4 className="font-bold text-gray-800 mb-1">Volatility</h4>
              <p className="text-sm text-gray-600">
                The degree of variation in investment returns over time. Higher volatility means larger swings in portfolio value.
              </p>
            </div>
            
            <div>
              <h4 className="font-bold text-gray-800 mb-1">Withdrawal Rate</h4>
              <p className="text-sm text-gray-600">
                The percentage of portfolio value withdrawn annually to fund retirement expenses. Traditional safe rate is 4%.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Technical Methodology */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Technical Methodology</h2>
        
        <div className="bg-blue-50 p-6 rounded-lg mb-6">
          <h3 className="text-lg font-bold text-blue-800 mb-4">Simulation Process</h3>
          <ol className="space-y-3 text-sm text-blue-700 pl-4">
            <li>
              <strong>1. Parameter Setup:</strong> Initialize all user inputs including current assets, savings rate, 
              expenses, and market assumptions.
            </li>
            <li>
              <strong>2. Random Generation:</strong> For each simulation run, generate random annual returns and 
              inflation rates using normal distributions.
            </li>
            <li>
              <strong>3. Year-by-Year Calculation:</strong> For each year from current age to end age, calculate 
              asset growth, add savings (if working), subtract expenses, and apply taxes.
            </li>
            <li>
              <strong>4. Statistical Analysis:</strong> Aggregate results across all simulation runs to calculate 
              percentiles and success rates.
            </li>
          </ol>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Return Modeling</h3>
            <p className="text-sm text-gray-600 mb-3">
              Investment returns are modeled using a normal distribution with mean equal to the expected return 
              and standard deviation equal to the specified volatility.
            </p>
            <p className="text-sm text-gray-600">
              This approach reflects the historical behavior of diversified portfolios while acknowledging that 
              actual returns may not follow a perfect normal distribution.
            </p>
          </div>

          <div className="bg-gray-50 p-6 rounded-lg">
            <h3 className="text-lg font-bold text-gray-800 mb-4">Inflation Adjustment</h3>
            <p className="text-sm text-gray-600 mb-3">
              All expenses and pension income are adjusted annually for inflation. Inflation rates are also 
              randomly generated using a normal distribution.
            </p>
            <p className="text-sm text-gray-600">
              This ensures that purchasing power is maintained throughout the simulation period.
            </p>
          </div>
        </div>

        <div className="mt-6 bg-yellow-50 p-6 rounded-lg">
          <h3 className="text-lg font-bold text-yellow-800 mb-4">Tax Treatment</h3>
          <p className="text-sm text-yellow-700">
            Capital gains taxes are applied when assets are withdrawn to fund retirement expenses. The model assumes 
            all withdrawals are subject to capital gains tax at the specified rate. This is a simplified treatment 
            that may not reflect the complexity of actual tax situations.
          </p>
        </div>
      </div>

      {/* Key Assumptions & Limitations */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Key Assumptions & Limitations</h2>
        
        <div className="bg-yellow-50 border-l-4 border-yellow-500 p-6 rounded-lg mb-6">
          <h3 className="text-lg font-bold text-yellow-800 mb-4">Important Limitations</h3>
          <p className="text-yellow-700 mb-4">
            This analysis makes several simplifying assumptions that may not reflect real-world complexity:
          </p>
        </div>

        <div className="space-y-4 text-sm text-gray-600">
          <div>
            <h4 className="font-bold text-gray-800 mb-2">• Market Behavior:</h4>
            <p className="ml-4">
              Assumes returns follow a normal distribution, which may not capture extreme market events or long-term trends.
            </p>
          </div>
          
          <div>
            <h4 className="font-bold text-gray-800 mb-2">• Tax Simplification:</h4>
            <p className="ml-4">
              Uses a single capital gains tax rate for all withdrawals, ignoring tax-advantaged accounts, 
              progressive tax brackets, and changing tax laws.
            </p>
          </div>
          
          <div>
            <h4 className="font-bold text-gray-800 mb-2">• Constant Expenses:</h4>
            <p className="ml-4">
              Assumes retirement expenses remain constant in real terms, but actual spending patterns may change with age and health.
            </p>
          </div>
          
          <div>
            <h4 className="font-bold text-gray-800 mb-2">• No Major Life Events:</h4>
            <p className="ml-4">
              Does not account for potential major expenses like long-term care, home modifications, or family emergencies.
            </p>
          </div>
          
          <div>
            <h4 className="font-bold text-gray-800 mb-2">• Asset Allocation:</h4>
            <p className="ml-4">
              Uses a single expected return and volatility, rather than modeling dynamic asset allocation strategies.
            </p>
          </div>
          
          <div>
            <h4 className="font-bold text-gray-800 mb-2">• Inflation Consistency:</h4>
            <p className="ml-4">
              Assumes general inflation applies equally to all expense categories, but healthcare and other costs may inflate differently.
            </p>
          </div>
        </div>
      </div>

      {/* Legal Disclaimer */}
      <div className="mb-8">
        <h2 className="text-xl font-bold text-gray-800 mb-6">Legal Disclaimer</h2>
        
        <div className="bg-gray-100 p-6 rounded-lg">
          <p className="text-sm text-gray-700 leading-relaxed mb-4">
            This report is for informational and educational purposes only and should not be construed as personalized 
            investment advice, tax advice, or a recommendation to buy or sell any specific investments. The analysis is 
            based on assumptions and projections that may not reflect actual future conditions.
          </p>
          
          <p className="text-sm text-gray-700 leading-relaxed mb-4">
            Past performance does not guarantee future results. All investments involve risk of loss, including loss of 
            principal. Market conditions, tax laws, and personal circumstances can change, potentially affecting the accuracy 
            of these projections.
          </p>
          
          <p className="text-sm text-gray-700 leading-relaxed">
            Before making any investment decisions, please consult with qualified financial, tax, and legal advisors who can 
            provide advice based on your specific situation and current regulations. The creators of this report disclaim any 
            liability for decisions made based on this analysis.
          </p>
        </div>
      </div>

      {/* Best Results */}
      <div className="bg-green-50 border-l-4 border-green-500 p-6 rounded-lg">
        <h3 className="text-lg font-bold text-green-800 mb-4">For Best Results</h3>
        <p className="text-green-700">
          Use this analysis as a starting point for retirement planning discussions with qualified professionals. 
          Regular reviews and updates will help ensure your plan remains aligned with your goals and changing circumstances.
        </p>
      </div>
    </div>
  )
}