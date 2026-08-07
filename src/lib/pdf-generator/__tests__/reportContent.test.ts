import { mapReportDataToContent } from '@/lib/pdf-generator/reportTypes'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import { computePlanHealthScore } from '@/lib/insights/planHealth'
import { deriveKeyFindings } from '@/lib/pdf-generator/insights/keyFindings'
import { DEFAULT_PARAMS } from '@/types'

describe('Report content mapping', () => {
  const params = { ...DEFAULT_PARAMS, simulationRuns: 320 }
  const results = runMonteCarloSimulation(params)
  const reportData = transformToReportData(params, results)
  const content = mapReportDataToContent(reportData)

  it('keeps success count mathematisch konsistent', () => {
    const expected = Math.round(
      content.profile.success.successRate * content.profile.success.trials
    )
    expect(content.profile.success.successCount).toBe(expected)
  })

  it('maps withdrawal strategy assumptions', () => {
    expect(content.assumptions.withdrawalStrategy).toBe(params.withdrawalStrategy)
    expect(content.assumptions.dsWithdrawalRate).toBe(params.dsWithdrawalRate)
    expect(content.assumptions.dsCeilingRate).toBe(params.dsCeilingRate)
    expect(content.assumptions.dsFloorRate).toBe(params.dsFloorRate)
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
      expect(rec.title).not.toMatch(
        /Increase Savings Rate|Delay Retirement|Optimize Investment Mix/
      )
      expect(rec.category).not.toMatch(/Savings Strategy|Investment Strategy|Expense Management/)
      expect(rec.body).not.toMatch(
        /Your current success rate|Working an additional|Review your asset allocation/
      )
    })
  })
})

describe('Plan score and key findings parity', () => {
  const params = { ...DEFAULT_PARAMS, simulationRuns: 320 }
  const results = runMonteCarloSimulation(params)
  const reportData = transformToReportData(params, results)
  const content = mapReportDataToContent({ ...reportData, locale: 'en' })
  const health = computePlanHealthScore(params, results)

  it('reports the same plan score the dashboard shows', () => {
    // Both surfaces read `computePlanHealthScore`; this locks the wiring so a
    // future change cannot let the PDF drift from the app by a point.
    expect(content.profile.success.score).toBe(health.score)
    expect(content.profile.success.components).toEqual(health.components)
  })

  it('rounds the score from its weighted components', () => {
    const recomputed = Math.round(
      content.profile.success.components.reduce(
        (sum, component) => sum + component.weight * component.value,
        0
      )
    )
    expect(recomputed).toBe(content.profile.success.score)
  })

  it('derives key findings from the results rather than the recommendations', () => {
    const findings = deriveKeyFindings(content)
    expect(findings.length).toBeGreaterThanOrEqual(3)

    const recommendationTitles = content.recommendations.primary.map((rec) => rec.title)
    findings.forEach((finding) => {
      recommendationTitles.forEach((title) => {
        expect(finding.text).not.toContain(title)
      })
    })

    // The success-band finding must quote the same rate the KPI tile shows.
    const successFinding = findings.find((finding) => finding.id === 'successBand')
    expect(successFinding).toBeDefined()
    expect(successFinding?.text).toContain(String(content.profile.success.trials))
  })
})
