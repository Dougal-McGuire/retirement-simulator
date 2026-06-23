import { POST } from './route'

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
    const request = new Request('http://localhost/api/generate-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reportData: {
          person: {
            currentAge: 55,
          },
        },
        locale: 'en',
      }),
    })

    const response = await POST(request as never)
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBeTruthy()
  })

  it('returns a PDF attachment for valid report payloads', async () => {
    renderToBuffer.mockResolvedValue(Buffer.from('%PDF-1.4\nfake pdf'))

    const request = new Request('http://localhost/api/generate-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reportData: createValidReportData(),
        locale: 'en',
      }),
    })

    const response = await POST(request as never)
    const body = Buffer.from(await response.arrayBuffer())

    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/pdf')
    expect(response.headers.get('Content-Disposition')).toContain('attachment; filename=')
    expect(body.toString()).toContain('%PDF-1.4')
  })
})
