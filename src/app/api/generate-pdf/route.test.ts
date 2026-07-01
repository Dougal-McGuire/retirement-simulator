import { POST } from './route'
import { NextRequest } from 'next/server'
import { DEFAULT_PARAMS, type SimulationParams, type SimulationResults } from '@/types'

const renderToBuffer = jest.fn()
const mapReportDataToContent = jest.fn((data) => data)

jest.mock('@react-pdf/renderer', () => ({
  renderToBuffer: (document: unknown) => renderToBuffer(document),
}))

jest.mock('@/lib/pdf-generator/reportTypes', () => ({
  mapReportDataToContent: (data: unknown) => mapReportDataToContent(data),
}))

jest.mock('@/lib/pdf-generator/react-pdf', () => ({
  RetirementReport: () => null,
}))

function createJsonRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/generate-pdf', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

function createSimulationResults(params: SimulationParams = DEFAULT_PARAMS): SimulationResults {
  const ages = [params.currentAge, params.retirementAge, params.legalRetirementAge, params.endAge]

  return {
    ages,
    assetPercentiles: {
      p10: [580000, 540000, 390000, 100000],
      p20: [600000, 590000, 470000, 180000],
      p50: [630000, 710000, 650000, 420000],
      p80: [700000, 840000, 880000, 760000],
      p90: [760000, 930000, 1040000, 920000],
    },
    spendingPercentiles: {
      p10: [56000, 59000, 63000, 71000],
      p20: [57000, 60000, 65000, 73000],
      p50: [61000, 66000, 72000, 82000],
      p80: [66000, 72000, 79000, 90000],
      p90: [69000, 76000, 84000, 96000],
    },
    successRate: 82,
    params,
  }
}

function createValidReportData() {
  return {
    person: {
      currentAge: 55,
      retireAge: 60,
      pensionAge: 67,
      horizonAge: 90,
    },
    finances: {
      currentAssetsEUR: 630000,
      annualSavingsEUR: 48000,
      expectedMonthlyPensionEUR: 5000,
    },
    spending: {
      monthly: {
        health: 1300,
        food: 1200,
        entertainment: 300,
        shopping: 500,
        utilities: 400,
      },
      annual: {
        vacations: 12000,
        homeRepairs: 5000,
        car: 1500,
      },
      custom: [],
    },
    assumptions: {
      roiMean: 0.07,
      roiStdev: 0.15,
      inflationMean: 0.025,
      inflationStdev: 0.01,
      capGainsTaxRatePct: 26.25,
      mcRuns: 500,
    },
    projections: {
      milestones: [
        {
          age: 55,
          p10: 500000,
          p20: 550000,
          p50: 630000,
          p80: 700000,
          p90: 760000,
        },
      ],
      successRatePct: 82,
    },
    summary: {
      planHealthScore: 78,
      planHealthLabel: 'Moderate',
      successProbabilityPct: 82,
      bridge: {
        startAge: 60,
        endAge: 66,
        cashNeedEUR: 120000,
      },
      topActions: ['Optimize Investment Mix'],
      topActionsDetailed: [
        {
          title: 'Optimize Investment Mix',
          upliftMin: 3,
          upliftMax: 6,
        },
      ],
    },
    recommendations: [],
    metadata: {
      reportId: 'RPT-test',
      generatedAt: '2026-03-19T00:00:00.000Z',
      version: '1.0.0',
    },
  }
}

describe('/api/generate-pdf', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('returns 400 for schema-invalid report payloads', async () => {
    const request = createJsonRequest({
      reportData: {
        person: {
          currentAge: 55,
        },
      },
      locale: 'en',
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBeTruthy()
  })

  it('returns 400 for unsupported locales', async () => {
    const request = createJsonRequest({
      reportData: createValidReportData(),
      locale: 'fr',
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Unsupported locale')
    expect(mapReportDataToContent).not.toHaveBeenCalled()
    expect(renderToBuffer).not.toHaveBeenCalled()
  })

  it('returns 400 when report and simulation payloads are missing', async () => {
    const request = createJsonRequest({
      locale: 'en',
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Parameter fehlen')
    expect(mapReportDataToContent).not.toHaveBeenCalled()
    expect(renderToBuffer).not.toHaveBeenCalled()
  })

  it('returns 400 for malformed params and results payloads', async () => {
    const request = createJsonRequest({
      params: DEFAULT_PARAMS,
      results: {
        ...createSimulationResults(DEFAULT_PARAMS),
        assetPercentiles: {
          p10: null,
          p20: [],
          p50: [],
          p80: [],
          p90: [],
        },
      },
      locale: 'en',
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Ungueltige Simulationsergebnisse')
    expect(mapReportDataToContent).not.toHaveBeenCalled()
    expect(renderToBuffer).not.toHaveBeenCalled()
  })

  it('returns 400 for length-mismatched simulation percentile arrays', async () => {
    const results = createSimulationResults(DEFAULT_PARAMS)
    const request = createJsonRequest({
      params: DEFAULT_PARAMS,
      results: {
        ...results,
        ages: results.ages.slice(0, 2),
        assetPercentiles: {
          p10: results.assetPercentiles.p10.slice(0, 1),
          p20: results.assetPercentiles.p20.slice(0, 2),
          p50: results.assetPercentiles.p50.slice(0, 2),
          p80: results.assetPercentiles.p80.slice(0, 2),
          p90: results.assetPercentiles.p90.slice(0, 2),
        },
        spendingPercentiles: {
          p10: results.spendingPercentiles.p10.slice(0, 2),
          p20: results.spendingPercentiles.p20.slice(0, 2),
          p50: results.spendingPercentiles.p50.slice(0, 2),
          p80: results.spendingPercentiles.p80.slice(0, 2),
          p90: results.spendingPercentiles.p90.slice(0, 2),
        },
      },
      locale: 'en',
    })

    const response = await POST(request)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('Ungueltige Simulationsergebnisse')
    expect(mapReportDataToContent).not.toHaveBeenCalled()
    expect(renderToBuffer).not.toHaveBeenCalled()
  })

  it('returns a PDF attachment for valid report payloads', async () => {
    renderToBuffer.mockResolvedValue(Buffer.from('%PDF-1.4\nfake pdf'))

    const request = createJsonRequest({
      reportData: createValidReportData(),
      locale: 'en',
    })

    const response = await POST(request)
    const body = Buffer.from(await response.arrayBuffer())

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Content-Disposition')).toContain('attachment; filename=')
    expect(body.toString()).toContain('%PDF-1.4')
  })

  it('returns a PDF attachment for params and results payloads with the requested locale', async () => {
    renderToBuffer.mockResolvedValue(Buffer.from('%PDF-1.4\nfake pdf'))

    const params = { ...DEFAULT_PARAMS, simulationRuns: 100 }
    const results = createSimulationResults(params)
    const request = createJsonRequest({
      params,
      results,
      locale: 'en',
    })

    const response = await POST(request)
    const body = Buffer.from(await response.arrayBuffer())

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(body.toString()).toContain('%PDF-1.4')
    expect(mapReportDataToContent).toHaveBeenCalledWith(
      expect.objectContaining({
        locale: 'en',
        person: expect.objectContaining({
          currentAge: params.currentAge,
          retireAge: params.retirementAge,
        }),
        assumptions: expect.objectContaining({
          mcRuns: params.simulationRuns,
        }),
        projections: expect.objectContaining({
          successRatePct: results.successRate,
        }),
      })
    )
  })
})
