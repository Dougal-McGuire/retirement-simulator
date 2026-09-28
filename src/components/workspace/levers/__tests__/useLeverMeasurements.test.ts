import { DEFAULT_PARAMS, type SimulationResults } from '@/types'
import {
  isLeverSaturated,
  LEVER_SATURATION,
  LEVER_SETTLE_MS,
  measureLever,
  shouldMeasureLevers,
  sortLeverResults,
  terminalP10,
  type LeverGateInputs,
  type LeverResult,
} from '../useLeverMeasurements'

const open: LeverGateInputs = {
  near: true,
  editorOpen: false,
  comparing: false,
  busy: false,
  current: true,
  holding: false,
}

const results = (successRate: number, p10End: number): SimulationResults => ({
  ages: [60, 61, 62],
  assetPercentiles: {
    p10: [100, 50, p10End],
    p20: [0, 0, 0],
    p50: [0, 0, 0],
    p80: [0, 0, 0],
    p90: [0, 0, 0],
  },
  spendingPercentiles: {
    p10: [0, 0, 0],
    p20: [0, 0, 0],
    p50: [0, 0, 0],
    p80: [0, 0, 0],
    p90: [0, 0, 0],
  },
  successRate,
  params: DEFAULT_PARAMS,
})

describe('lever measurement gating', () => {
  it('measures only when the list is near, nothing is open or running, and results are current', () => {
    expect(shouldMeasureLevers(open)).toBe(true)
  })

  it.each([
    ['the list is off screen', { near: false }],
    ['an assumption panel is open', { editorOpen: true }],
    ['compare mode hides the sections', { comparing: true }],
    ['a run is loading or queued', { busy: true }],
    ['the results describe another draft', { current: false }],
    ['a quick slider is held', { holding: true }],
  ] as const)('waits while %s', (_reason, override) => {
    expect(shouldMeasureLevers({ ...open, ...override })).toBe(false)
  })

  it('settles for 800 ms (spec §5.5, §7)', () => {
    expect(LEVER_SETTLE_MS).toBe(800)
  })
})

describe('lever results', () => {
  it('saturates at 99 %', () => {
    expect(LEVER_SATURATION).toBe(99)
    expect(isLeverSaturated(98.9)).toBe(false)
    expect(isLeverSaturated(99)).toBe(true)
    expect(isLeverSaturated(100)).toBe(true)
  })

  it('reads the worst decile at the horizon', () => {
    expect(terminalP10(results(90, 1234))).toBe(1234)
  })

  it('measures a lever against the base result', () => {
    const base = results(90.2, 100_000)
    expect(measureLever('moreSavings', base, results(93.5, 160_000))).toEqual({
      id: 'moreSavings',
      successRate: 93.5,
      delta: 93.5 - 90.2,
      worstDecileEnd: 160_000,
      worstDecileDelta: 60_000,
    })
  })

  const levers: LeverResult[] = [
    { id: 'laterRetirement', successRate: 95, delta: 3, worstDecileEnd: 0, worstDecileDelta: 900 },
    { id: 'moreSavings', successRate: 93, delta: 1, worstDecileEnd: 0, worstDecileDelta: 5000 },
    { id: 'lowerSpending', successRate: 97, delta: 5, worstDecileEnd: 0, worstDecileDelta: 100 },
  ]

  it('sorts by success-rate delta, biggest first', () => {
    expect(sortLeverResults(levers, false).map((lever) => lever.id)).toEqual([
      'lowerSpending',
      'laterRetirement',
      'moreSavings',
    ])
  })

  it('sorts by worst-decile delta once saturated', () => {
    expect(sortLeverResults(levers, true).map((lever) => lever.id)).toEqual([
      'moreSavings',
      'laterRetirement',
      'lowerSpending',
    ])
  })

  it('does not reorder its input', () => {
    const copy = [...levers]
    sortLeverResults(levers, false)
    expect(levers).toEqual(copy)
  })
})
