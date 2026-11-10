import type { LeverEffects } from '@/lib/insights/leverEffects'
import { HAND_PARAMS, handResults } from '@/lib/insights/testing/handLedger'
import { ReportDataSchema } from '@/lib/pdf-generator/schema/reportData'

type TransformerModule = typeof import('../reportDataTransformer')

/** Measured against the hand results (success rate 92). */
const measured: LeverEffects = {
  fingerprint: 'hand',
  baseSuccessRate: 92,
  baseWorstDecileEnd: 347_040,
  baseWorstDecileEndReal: 275_428,
  levers: [
    {
      id: 'laterRetirement',
      successRate: 96.4,
      delta: 4.4,
      worstDecileEnd: 500_000,
      worstDecileEndReal: 400_000,
    },
    {
      id: 'moreSavings',
      successRate: 92,
      delta: 0,
      worstDecileEnd: 360_000,
      worstDecileEndReal: 290_000,
    },
    {
      id: 'lowerSpending',
      successRate: 95,
      delta: 3,
      worstDecileEnd: 450_000,
      worstDecileEndReal: 370_000,
    },
  ],
}

describe('reportDataTransformer behavior', () => {
  afterEach(() => {
    jest.resetModules()
    jest.clearAllMocks()
  })

  it('never runs a simulation itself — the levers are measured by the caller', () => {
    const runMonteCarloSimulation = jest.fn()

    jest.doMock('@/lib/simulation/engine', () => ({
      ...jest.requireActual('@/lib/simulation/engine'),
      runMonteCarloSimulation,
    }))

    let transformerModule!: TransformerModule
    jest.isolateModules(() => {
      transformerModule = require('../reportDataTransformer') as TransformerModule
    })

    const results = handResults()
    const without = transformerModule.transformToReportData(HAND_PARAMS, results)
    const withLevers = transformerModule.transformToReportData(HAND_PARAMS, results, 'x', 'en', {
      leverEffects: measured,
    })

    expect(runMonteCarloSimulation).not.toHaveBeenCalled()
    // No measurement, no lever table — and no estimate in its place.
    expect(without.summary?.leverEffects).toBeUndefined()
    expect(JSON.stringify(without)).not.toMatch(/uplift/i)
    expect(withLevers.summary?.leverEffects?.levers).toHaveLength(3)
  })
})

describe('measured lever effects in the report data', () => {
  const { transformToReportData } = jest.requireActual(
    '../reportDataTransformer'
  ) as TransformerModule
  const results = handResults()

  it('passes the measured deltas through unchanged', () => {
    const data = transformToReportData(HAND_PARAMS, results, 'x', 'en', {
      leverEffects: measured,
    })
    const effects = ReportDataSchema.parse(data).summary!.leverEffects!
    expect(effects.baseSuccessRatePct).toBe(92)
    expect(effects.levers.map((lever) => [lever.id, lever.successRatePct, lever.deltaPoints])).toEqual(
      [
        ['laterRetirement', 96.4, 4.4],
        ['moreSavings', 92, 0],
        ['lowerSpending', 95, 3],
      ]
    )
  })

  it('states the P10 end assets in the report’s unit — never one of each', () => {
    const nominal = transformToReportData(HAND_PARAMS, results, 'x', 'en', {
      leverEffects: measured,
    }).summary!.leverEffects!
    // Base: the nominal P10 band's last value (0.6 × 578,400).
    expect(nominal.baseWorstDecileEndEUR).toBeCloseTo(347_040, 6)
    expect(nominal.levers.map((lever) => lever.worstDecileEndEUR)).toEqual([
      500_000, 360_000, 450_000,
    ])

    const real = transformToReportData(HAND_PARAMS, results, 'x', 'en', {
      displayReal: true,
      leverEffects: measured,
    }).summary!.leverEffects!
    // A year-end balance, so priced at the level the last year closes with:
    // 0.6 × 578,400 / (1.26 × 1.025) = 268,711.
    expect(real.baseWorstDecileEndEUR).toBeCloseTo((0.6 * 578_400) / 1.2915, 6)
    expect(Math.round(real.baseWorstDecileEndEUR)).toBe(268_711)
    expect(real.levers.map((lever) => lever.worstDecileEndEUR)).toEqual([
      400_000, 290_000, 370_000,
    ])
  })

  it('drops measurements that belong to another result', () => {
    const stale = { ...measured, baseSuccessRate: 80 }
    expect(
      transformToReportData(HAND_PARAMS, results, 'x', 'en', { leverEffects: stale }).summary
        ?.leverEffects
    ).toBeUndefined()
  })

  it('drops the table when a real figure is missing for a real report', () => {
    const noReal = {
      ...measured,
      levers: measured.levers.map((lever) => ({ ...lever, worstDecileEndReal: null })),
    }
    expect(
      transformToReportData(HAND_PARAMS, results, 'x', 'en', {
        displayReal: true,
        leverEffects: noReal,
      }).summary?.leverEffects
    ).toBeUndefined()
    // The nominal report does not need it.
    expect(
      transformToReportData(HAND_PARAMS, results, 'x', 'en', { leverEffects: noReal }).summary
        ?.leverEffects
    ).toBeDefined()
  })
})
