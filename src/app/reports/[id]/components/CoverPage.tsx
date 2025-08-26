import { SimulationParams } from '@/types'

interface CoverPageProps {
  params: SimulationParams
  reportDate: string
  reportId: string
}

export function CoverPage({ params, reportDate, reportId }: CoverPageProps) {
  return (
    <div className="report-section min-h-screen flex flex-col justify-center items-center p-12 bg-white">
      {/* Logo placeholder */}
      <div className="w-16 h-16 bg-blue-600 rounded-lg mb-8"></div>
      
      {/* Main title */}
      <h1 className="text-4xl font-bold text-blue-600 text-center mb-4">
        Retirement Planning Analysis
      </h1>
      
      <h2 className="text-xl text-gray-600 text-center mb-12">
        Comprehensive Financial Projection Report
      </h2>
      
      {/* Client info */}
      <div className="text-center mb-16">
        <h3 className="text-lg text-gray-800 mb-2">
          Age {params.currentAge} • Retirement at {params.retirementAge}
        </h3>
        <p className="text-gray-600">Generated on {reportDate}</p>
      </div>
      
      {/* Report ID */}
      <div className="text-center mb-16">
        <p className="text-sm text-gray-500">Report ID: {reportId}</p>
      </div>
      
      {/* Disclaimer */}
      <div className="mt-auto max-w-2xl text-center">
        <p className="text-xs text-gray-500 leading-relaxed">
          This report is based on the assumptions and parameters provided and should not be considered as investment advice. 
          Past performance does not guarantee future results. Market conditions, tax laws, and personal circumstances may change, 
          affecting the actual outcomes. Please consult with a qualified financial advisor before making investment decisions. 
          The Monte Carlo simulation provides probabilistic projections based on historical market data and mathematical models.
        </p>
      </div>
    </div>
  )
}