import { renderBreakdownChart, renderProjectionChart } from '@/lib/pdf-generator/charts/chartRenderer'
import type { ReportData } from '@/lib/pdf-generator/schema/reportData'
import { mapReportDataToContent, type ReportContent } from '@/lib/pdf-generator/reportTypes'

interface PreparedReport {
  content: ReportContent
  projectionSvg: string
  breakdownSvg: string
}

export async function prepareReport(data: ReportData): Promise<PreparedReport> {
  const content = mapReportDataToContent(data)
  const projectionSvg = await renderProjectionChart(content.projections.milestones)
  const breakdownInput = [...content.expenses.monthlyCategories, ...content.expenses.annualCategories]
  const breakdownSvg = await renderBreakdownChart(breakdownInput)

  return { content, projectionSvg, breakdownSvg }
}
