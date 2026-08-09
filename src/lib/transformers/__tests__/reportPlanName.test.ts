import { transformToReportData } from '../reportDataTransformer'
import { ReportDataSchema } from '@/lib/pdf-generator/schema/reportData'
import { mapReportDataToContent } from '@/lib/pdf-generator/reportTypes'
import { DEFAULT_PARAMS, type SimulationResults } from '@/types'

const results: SimulationResults = {
  ages: [DEFAULT_PARAMS.currentAge, DEFAULT_PARAMS.currentAge + 1],
  assetPercentiles: {
    p10: [100_000, 90_000],
    p20: [125_000, 120_000],
    p50: [150_000, 155_000],
    p80: [200_000, 210_000],
    p90: [250_000, 265_000],
  },
  spendingPercentiles: {
    p10: [2_000, 2_050],
    p20: [2_200, 2_250],
    p50: [2_500, 2_550],
    p80: [2_800, 2_850],
    p90: [3_000, 3_050],
  },
  successRate: 92,
  params: { ...DEFAULT_PARAMS },
}

describe('report plan name', () => {
  it('carries the plan name from the transformer to the PDF content', () => {
    const data = transformToReportData(DEFAULT_PARAMS, results, 'Retire 2 years later')

    expect(data.metadata?.planName).toBe('Retire 2 years later')

    const parsed = ReportDataSchema.parse({ ...data, locale: 'en' })
    expect(parsed.metadata?.planName).toBe('Retire 2 years later')
    expect(mapReportDataToContent(parsed).metadata.planName).toBe('Retire 2 years later')
  })

  it('trims and caps overlong names', () => {
    const long = `  ${'x'.repeat(200)}  `
    const data = transformToReportData(DEFAULT_PARAMS, results, long)

    expect(data.metadata?.planName).toHaveLength(80)
    expect(() => ReportDataSchema.parse({ ...data, locale: 'en' })).not.toThrow()
  })

  it('omits the field entirely for blank or missing names', () => {
    expect(transformToReportData(DEFAULT_PARAMS, results).metadata?.planName).toBeUndefined()
    expect(transformToReportData(DEFAULT_PARAMS, results, '   ').metadata?.planName).toBeUndefined()
  })

  it('stays backward compatible: payloads without a plan name still validate', () => {
    const data = transformToReportData(DEFAULT_PARAMS, results)
    const parsed = ReportDataSchema.safeParse({ ...data, locale: 'de' })

    expect(parsed.success).toBe(true)
    expect(mapReportDataToContent(parsed.data!).metadata.planName).toBeUndefined()
  })

  it('rejects an empty plan name rather than printing a blank label', () => {
    const data = transformToReportData(DEFAULT_PARAMS, results)
    const parsed = ReportDataSchema.safeParse({
      ...data,
      metadata: { ...data.metadata!, planName: '' },
      locale: 'en',
    })

    expect(parsed.success).toBe(false)
  })
})
