interface ReportHeaderProps {
  reportDate: string
  reportId: string
}

export function ReportHeader({ reportDate, reportId }: ReportHeaderProps) {
  return (
    <header className="bg-blue-600 text-white py-4 px-6 print-hidden">
      <div className="max-w-4xl mx-auto flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold">Retirement Planning Report</h1>
          <p className="text-blue-100">Generated on {reportDate}</p>
        </div>
        <div className="text-right">
          <p className="text-sm text-blue-100">Report ID</p>
          <p className="font-mono text-sm">{reportId}</p>
        </div>
      </div>
    </header>
  )
}