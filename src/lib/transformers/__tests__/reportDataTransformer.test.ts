import { transformToReportData } from '@/lib/transformers/reportDataTransformer'
import { ReportDataSchema } from '@/lib/pdf-generator/schema/reportData'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import { DEFAULT_PARAMS } from '@/types'

describe('Report data transformer', () => {
  it('produces schema-valid report data', () => {
    const params = { ...DEFAULT_PARAMS, simulationRuns: 120 }
    const results = runMonteCarloSimulation(params)
    const reportData = transformToReportData(params, results)
    const parsed = ReportDataSchema.parse(reportData)
    expect(parsed.projections.milestones.length).toBe(results.ages.length)
    expect(parsed.projections.successRatePct).toBeGreaterThanOrEqual(0)
    expect(parsed.projections.successRatePct).toBeLessThanOrEqual(100)
  })

  it('corrects absurd cap gains tax inputs (>100) down to sensible range', () => {
    const params = { ...DEFAULT_PARAMS, simulationRuns: 140 }
    const results = runMonteCarloSimulation(params)
    const base = transformToReportData(params, results)
    // Inject an absurd tax rate and ensure schema transform scales it
    const bad = { ...base, assumptions: { ...base.assumptions, capGainsTaxRatePct: 2625 } }
    const parsed = ReportDataSchema.parse(bad)
    expect(parsed.assumptions.capGainsTaxRatePct).toBeCloseTo(26.25, 2)
  })
})
