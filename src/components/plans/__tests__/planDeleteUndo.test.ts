import { DEFAULT_PARAMS } from '@/types'
import { useSimulationStore } from '@/lib/stores/simulationStore'
import { deletePlanWithUndo } from '@/components/plans/planDeleteUndo'

const showActionToastMock = jest.fn()
const toastSuccessMock = jest.fn()
const toastErrorMock = jest.fn()

jest.mock('@/components/ui/action-toast', () => ({
  showActionToast: (opts: unknown) => showActionToastMock(opts),
}))

jest.mock('@/components/ui/toast', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    error: (...args: unknown[]) => toastErrorMock(...args),
  },
}))

const t = (key: string, values?: Record<string, string>) =>
  values ? `${key}:${JSON.stringify(values)}` : key

describe('deletePlanWithUndo', () => {
  const initialState = useSimulationStore.getState()

  beforeEach(() => {
    jest.clearAllMocks()
    useSimulationStore.setState({
      ...initialState,
      autoRunSuspended: true,
    })
  })

  it('returns false and shows no toast when only one plan remains or the plan is already gone', () => {
    const onlyPlan = useSimulationStore.getState().plans[0]

    expect(deletePlanWithUndo(onlyPlan, t)).toBe(false)
    expect(showActionToastMock).not.toHaveBeenCalled()
    expect(useSimulationStore.getState().plans).toHaveLength(1)

    const secondId = useSimulationStore.getState().createPlan('Second', DEFAULT_PARAMS)
    expect(secondId).not.toBeNull()
    expect(deletePlanWithUndo({ ...onlyPlan, id: 'missing-plan' }, t)).toBe(false)
    expect(showActionToastMock).not.toHaveBeenCalled()
  })

  it('deletes the plan and restores + activates it on Undo when the surviving plan is clean', () => {
    const secondId = useSimulationStore.getState().createPlan('Second', {
      ...DEFAULT_PARAMS,
      retirementAge: 63,
    })
    const second = useSimulationStore.getState().plans.find((p) => p.id === secondId)!

    expect(deletePlanWithUndo(second, t)).toBe(true)
    expect(useSimulationStore.getState().plans.some((p) => p.id === secondId)).toBe(false)
    expect(showActionToastMock).toHaveBeenCalledTimes(1)

    const call = showActionToastMock.mock.calls[0][0] as {
      testId: string
      undo: { testId: string; run: () => void }
    }
    expect(call.testId).toBe('plan-deleted-toast')
    expect(call.undo.testId).toBe('plan-deleted-toast-undo')

    call.undo.run()
    const restored = useSimulationStore.getState().plans.find((p) => p.name === 'Second')
    expect(restored).toBeDefined()
    expect(restored?.params.retirementAge).toBe(63)
    expect(useSimulationStore.getState().activePlanId).toBe(restored?.id)
    expect(toastSuccessMock).toHaveBeenCalledWith(expect.stringContaining('deleted.restored:'))
  })

  it('restores in the background on Undo when the surviving plan has unsaved edits', () => {
    const baseId = useSimulationStore.getState().plans[0].id
    const secondId = useSimulationStore.getState().createPlan('Second', DEFAULT_PARAMS)
    const second = useSimulationStore.getState().plans.find((p) => p.id === secondId)!

    expect(deletePlanWithUndo(second, t)).toBe(true)
    expect(useSimulationStore.getState().activePlanId).toBe(baseId)

    // User starts editing the surviving plan before pressing Undo.
    useSimulationStore.getState().updateParams({ retirementAge: 59 })
    expect(useSimulationStore.getState().isDirty).toBe(true)

    const { undo } = showActionToastMock.mock.calls[0][0] as { undo: { run: () => void } }
    undo.run()

    const state = useSimulationStore.getState()
    expect(state.activePlanId).toBe(baseId)
    expect(state.isDirty).toBe(true)
    expect(state.params.retirementAge).toBe(59)
    expect(state.plans.some((p) => p.name === 'Second')).toBe(true)
    expect(toastSuccessMock).toHaveBeenCalledWith(
      expect.stringContaining('deleted.restoredInBackground:')
    )
  })
})
