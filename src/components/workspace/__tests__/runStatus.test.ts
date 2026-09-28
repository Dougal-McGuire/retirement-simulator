import { deriveRunStatus, type RunInputs } from '../useRunStatus'

const current: RunInputs = {
  loading: false,
  pending: false,
  suspended: false,
  stale: false,
  hasResults: true,
  error: null,
  holding: false,
}

describe('deriveRunStatus', () => {
  it('keeps Recalculate quiet while results are current', () => {
    expect(deriveRunStatus(current)).toEqual({ status: 'updated', needsRun: false })
  })

  it('reports running while a run is in flight, queued or held for legibility', () => {
    expect(deriveRunStatus({ ...current, loading: true })).toEqual({
      status: 'running',
      needsRun: false,
    })
    // A queued auto-run fires within the debounce: not stale, just about to run.
    expect(deriveRunStatus({ ...current, pending: true, stale: true })).toEqual({
      status: 'running',
      needsRun: false,
    })
    expect(deriveRunStatus({ ...current, holding: true }).status).toBe('running')
  })

  it('asks for a recalculation only when auto-run is suspended with stale results', () => {
    expect(deriveRunStatus({ ...current, pending: true, suspended: true, stale: true })).toEqual({
      status: 'stale',
      needsRun: true,
    })
  })

  it('asks for a recalculation after a failed run but not for plan-list errors', () => {
    expect(deriveRunStatus({ ...current, error: 'Simulation failed' }).needsRun).toBe(true)
    expect(deriveRunStatus({ ...current, error: 'planLimitReached' }).needsRun).toBe(false)
  })

  it('treats a missing result as empty and runnable', () => {
    expect(deriveRunStatus({ ...current, hasResults: false })).toEqual({
      status: 'empty',
      needsRun: true,
    })
  })
})
