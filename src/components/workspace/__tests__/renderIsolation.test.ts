import { shallow } from 'zustand/shallow'
import { DEFAULT_PARAMS, type SimulationResults, type SimulationStore } from '@/types'
import { selectResultsStale, selectRunState } from '../useRunStatus'

/**
 * `useRunStatus` subscribes through `selectRunState` with `useShallow`: a
 * component re-renders only when the selection changes shallowly. These pin
 * down the store transitions that must NOT change it — each one used to
 * re-render the whole workspace (§7: edit → result bar ≤ 250 ms).
 */

const results = (params = DEFAULT_PARAMS): SimulationResults => ({
  ages: [params.currentAge],
  assetPercentiles: { p10: [1], p20: [2], p50: [3], p80: [4], p90: [5] },
  spendingPercentiles: { p10: [1], p20: [2], p50: [3], p80: [4], p90: [5] },
  successRate: 90,
  params,
})

const state = (overrides: Partial<SimulationStore>): SimulationStore =>
  ({
    params: DEFAULT_PARAMS,
    results: results(),
    isLoading: false,
    pendingRun: false,
    autoRunSuspended: false,
    error: null,
    ...overrides,
  }) as SimulationStore

describe('selectRunState', () => {
  const edited = { ...DEFAULT_PARAMS, retirementAge: DEFAULT_PARAMS.retirementAge + 1 }

  it('does not change when the debounce hands the run to the worker', () => {
    const queued = state({ params: edited, pendingRun: true })
    const running = state({ params: edited, pendingRun: false, isLoading: true })
    expect(selectRunState(queued).busy).toBe(true)
    expect(shallow(selectRunState(queued), selectRunState(running))).toBe(true)
  })

  it('does not change for further keystrokes while results are already stale', () => {
    const first = state({ params: edited, pendingRun: true })
    const second = state({
      params: { ...edited, retirementAge: edited.retirementAge + 1 },
      pendingRun: true,
    })
    expect(shallow(selectRunState(first), selectRunState(second))).toBe(true)
  })

  it('does not change for a new result object with the same outcome', () => {
    const before = state({ results: results() })
    const after = state({ results: results() })
    expect(shallow(selectRunState(before), selectRunState(after))).toBe(true)
  })

  it('changes when a run starts and when it lands', () => {
    const idle = state({})
    const queued = state({ params: edited, pendingRun: true })
    const landed = state({ params: edited, results: results(edited) })
    expect(shallow(selectRunState(idle), selectRunState(queued))).toBe(false)
    expect(shallow(selectRunState(queued), selectRunState(landed))).toBe(false)
    expect(selectRunState(landed)).toEqual({
      busy: false,
      stale: false,
      hasResults: true,
      error: null,
    })
  })
})

describe('selectResultsStale', () => {
  it('is false without results or for the params they were computed for', () => {
    expect(selectResultsStale(state({ results: null }))).toBe(false)
    expect(selectResultsStale(state({}))).toBe(false)
  })

  it('is true once the draft moves away from the results', () => {
    expect(
      selectResultsStale(state({ params: { ...DEFAULT_PARAMS, endAge: DEFAULT_PARAMS.endAge + 1 } }))
    ).toBe(true)
  })
})
