interface TableOfContentsProps {
  reportDate: string
  reportId: string
}

export function TableOfContents({ reportDate, reportId }: TableOfContentsProps) {
  const sections = [
    {
      title: "Executive Summary",
      description: "Key findings and recommendations from your retirement analysis",
      page: "2"
    },
    {
      title: "Personal Profile",
      description: "Overview of your current financial situation and retirement goals",
      page: "3"
    },
    {
      title: "Asset Projections Analysis",
      description: "How your assets are projected to grow and decline over time",
      page: "4"
    },
    {
      title: "Retirement Spending Analysis", 
      description: "Monthly spending requirements during retirement years",
      page: "5"
    },
    {
      title: "Risk Analysis",
      description: "Assessment of potential risks and market volatility impacts",
      page: "6"
    },
    {
      title: "Recommendations",
      description: "Strategic recommendations to optimize your retirement plan",
      page: "7"
    },
    {
      title: "Technical Appendix",
      description: "Detailed assumptions, methodology, and calculation parameters",
      page: "8"
    }
  ]

  return (
    <div className="report-section min-h-screen p-8 bg-white">
      {/* Header */}
      <div className="print-only mb-6 text-right text-sm text-gray-500">
        <p>Report Generated: {reportDate}</p>
        <p>Report ID: {reportId}</p>
      </div>
      
      <h1 className="text-3xl font-bold text-blue-600 mb-8">Table of Contents</h1>
      
      <div className="mb-6">
        <p className="text-gray-600 mb-8">
          This comprehensive retirement planning analysis provides detailed insights into your financial future. 
          Each section builds upon the previous to give you a complete picture of your retirement readiness.
        </p>
      </div>

      <div className="space-y-6">
        {sections.map((section, index) => (
          <div key={index} className="flex items-start justify-between border-b border-gray-200 pb-4">
            <div className="flex-1 pr-4">
              <h3 className="text-lg font-semibold text-gray-800 mb-2">
                {section.title}
              </h3>
              <p className="text-gray-600 text-sm">
                {section.description}
              </p>
            </div>
            <div className="flex-shrink-0 ml-4">
              <span className="text-blue-600 font-semibold text-lg">
                {section.page}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Footer note */}
      <div className="mt-12 p-4 bg-blue-50 rounded-lg">
        <h4 className="text-sm font-semibold text-blue-800 mb-2">How to Use This Report</h4>
        <ul className="text-xs text-blue-700 space-y-1">
          <li>• Start with the Executive Summary for key insights</li>
          <li>• Review your Personal Profile to confirm all assumptions</li>
          <li>• Study the Asset Projections and Spending Analysis for detailed forecasts</li>
          <li>• Consider the Risk Analysis to understand potential variations</li>
          <li>• Implement the Recommendations to optimize your retirement plan</li>
          <li>• Refer to the Technical Appendix for methodology details</li>
        </ul>
      </div>
    </div>
  )
}