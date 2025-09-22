import { mapReportDataToContent } from '@/lib/pdf-generator/reportTypes'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import { DEFAULT_PARAMS } from '@/types'

describe('Report content mapping', () => {
  const params = { ...DEFAULT_PARAMS, simulationRuns: 320 }
  const results = runMonteCarloSimulation(params)
  const reportData = transformToReportData(params, results)
  const content = mapReportDataToContent(reportData)

  it('keeps success count mathematisch konsistent', () => {
    const expected = Math.round(content.profile.success.successRate * content.profile.success.trials)
    expect(content.profile.success.successCount).toBe(expected)
  })

  it('liefert deutsche Beschriftungen', () => {
    const label = content.profile.success.label
    if (label) {
      expect(['Stark', 'Ausgewogen', 'Überarbeiten']).toContain(label)
    }

    content.profile.highlights.forEach((entry) => {
      expect(entry).not.toMatch(/Increase Savings Rate|Delay Retirement|Optimize Investment Mix/)
    })

    content.recommendations.primary.forEach((rec) => {
      expect(rec.title).not.toMatch(/Increase Savings Rate|Delay Retirement|Optimize Investment Mix/)
      expect(rec.category).not.toMatch(/Savings Strategy|Investment Strategy|Expense Management/)
      expect(rec.body).not.toMatch(/Your current success rate|Working an additional|Review your asset allocation/)
    })
  })
})
