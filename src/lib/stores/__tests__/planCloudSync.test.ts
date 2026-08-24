/**
 * End-to-end shape of cloud sync, minus the network: what one device stores,
 * what the server keeps, and what a second device ends up with.
 */

import { DEFAULT_PARAMS, type Plan } from '@/types'
import { makePlan } from '@/lib/stores/plans'
import { useSimulationStore } from '@/lib/stores/simulationStore'
import { mergePlanSnapshots, type RemoteSnapshot } from '@/lib/stores/planSync'
import { sanitizeCloudBlob } from '@/lib/server/planStore'

const plan = (id: string, updatedAt: number, name = id, params = DEFAULT_PARAMS): Plan =>
  makePlan({ id, name, params, createdAt: 100, updatedAt })

const pristine = useSimulationStore.getInitialState()

const resetStore = (plans: Plan[], activePlanId: string) => {
  useSimulationStore.setState({
    ...pristine,
    plans,
    activePlanId,
    params: plans.find((entry) => entry.id === activePlanId)?.params ?? DEFAULT_PARAMS,
    draftParams: null,
    isDirty: false,
    // Keeps `requestRun()` from starting a real Monte Carlo run in the test.
    autoRunSuspended: true,
  })
}

describe('applySyncedPlans', () => {
  beforeEach(() => {
    resetStore([plan('plan-base', 1_000)], 'plan-base')
  })

  it('adopts the account and follows its active plan', () => {
    const changed = useSimulationStore
      .getState()
      .applySyncedPlans([plan('plan-base', 2_000), plan('plan-b', 3_000, 'Retire at 60')], 'plan-b')

    expect(changed).toBe(true)
    const state = useSimulationStore.getState()
    expect(state.plans.map((entry) => entry.id)).toEqual(['plan-base', 'plan-b'])
    expect(state.activePlanId).toBe('plan-b')
    // The legacy saved-setup mirror follows plans, as everywhere else.
    expect(state.savedSetups.map((setup) => setup.id)).toEqual(['plan-base', 'plan-b'])
    expect(state.isDirty).toBe(false)
  })

  it('is a no-op when the account holds exactly what this device has', () => {
    const same = [plan('plan-base', 1_000)]
    expect(useSimulationStore.getState().applySyncedPlans(same, 'plan-base')).toBe(false)
  })

  it('ignores an empty or unusable payload rather than wiping the device', () => {
    expect(useSimulationStore.getState().applySyncedPlans([], 'plan-base')).toBe(false)
    expect(
      useSimulationStore.getState().applySyncedPlans([{ id: '' } as unknown as Plan], 'plan-base')
    ).toBe(false)
    expect(useSimulationStore.getState().plans).toHaveLength(1)
  })

  it('never strands an unsaved edit on another plan', () => {
    const edited = { ...DEFAULT_PARAMS, currentAge: DEFAULT_PARAMS.currentAge + 3 }
    useSimulationStore.setState({ params: edited, draftParams: edited, isDirty: true })

    useSimulationStore
      .getState()
      .applySyncedPlans([plan('plan-base', 1_000), plan('plan-b', 9_000)], 'plan-b')

    const state = useSimulationStore.getState()
    // The remote wanted plan-b selected; the working copy keeps the user put.
    expect(state.activePlanId).toBe('plan-base')
    expect(state.params.currentAge).toBe(edited.currentAge)
    expect(state.isDirty).toBe(true)
    expect(state.plans.map((entry) => entry.id)).toEqual(['plan-base', 'plan-b'])
  })

  it('sanitizes whatever arrived over the wire', () => {
    const tampered = [
      {
        id: 'evil',
        name: 'Tampered',
        params: { currentAge: 'not a number', endAge: null, marketModel: 'moon' },
        createdAt: 1,
        updatedAt: 5_000,
      },
    ] as unknown as Plan[]

    useSimulationStore.getState().applySyncedPlans(tampered, 'evil')

    const applied = useSimulationStore.getState().plans[0]
    expect(applied.params.currentAge).toBe(DEFAULT_PARAMS.currentAge)
    expect(applied.params.endAge).toBe(DEFAULT_PARAMS.endAge)
    expect(applied.params.marketModel).toBe(DEFAULT_PARAMS.marketModel)
  })
})

describe('device round trip', () => {
  it('seeds from device A and adopts on a pristine device B', () => {
    // --- Device A: two real plans, account still empty.
    const deviceA = [plan('plan-base', 1_000), plan('plan-b', 2_000, 'Retire at 60')]
    const seed = mergePlanSnapshots({
      local: { plans: deviceA, activePlanId: 'plan-b' },
      remote: null,
      localPristine: false,
    })
    expect(seed.outcome).toBe('seed')
    expect(seed.shouldPush).toBe(true)

    // --- Server: the pushed body, sanitized exactly as `/api/plans` does.
    const stored = sanitizeCloudBlob({
      schemaVersion: 1,
      updatedAt: 5_000,
      plans: JSON.parse(JSON.stringify(seed.plans)) as Plan[],
      activePlanId: seed.activePlanId,
    })
    expect(stored).not.toBeNull()

    // --- Device B: fresh browser, untouched namespace.
    resetStore([plan('plan-base', 0)], 'plan-base')
    const adopt = mergePlanSnapshots({
      local: { plans: useSimulationStore.getState().plans, activePlanId: 'plan-base' },
      remote: stored as RemoteSnapshot,
      localPristine: true,
    })

    expect(adopt.outcome).toBe('adopt')
    expect(adopt.shouldPush).toBe(false)
    useSimulationStore.getState().applySyncedPlans(adopt.plans, adopt.activePlanId)

    const state = useSimulationStore.getState()
    expect(state.plans.map((entry) => entry.name)).toEqual(['plan-base', 'Retire at 60'])
    expect(state.activePlanId).toBe('plan-b')
    expect(state.params).toEqual(DEFAULT_PARAMS)
  })

  it('merges divergent edits made on two devices', () => {
    const localParams = { ...DEFAULT_PARAMS, currentAge: 44 }
    const remoteParams = { ...DEFAULT_PARAMS, currentAge: 55 }

    const merged = mergePlanSnapshots({
      local: {
        plans: [plan('plan-base', 9_000, 'edited here', localParams), plan('only-a', 3_000)],
        activePlanId: 'plan-base',
      },
      remote: {
        schemaVersion: 1,
        updatedAt: 8_000,
        plans: [plan('plan-base', 4_000, 'edited there', remoteParams), plan('only-b', 6_000)],
        activePlanId: 'only-b',
      },
      localPristine: false,
    })

    expect(merged.outcome).toBe('merge')
    expect(merged.plans.map((entry) => entry.id)).toEqual(['plan-base', 'only-a', 'only-b'])
    // Last write wins per plan: this device saved plan-base most recently.
    expect(merged.plans[0].params.currentAge).toBe(44)
    // And this device is the one that was edited last, so it keeps its selection.
    expect(merged.activePlanId).toBe('plan-base')
    expect(merged.shouldApply).toBe(true)
    expect(merged.shouldPush).toBe(true)

    resetStore([plan('plan-base', 9_000, 'edited here', localParams)], 'plan-base')
    expect(useSimulationStore.getState().applySyncedPlans(merged.plans, merged.activePlanId)).toBe(
      true
    )
    expect(useSimulationStore.getState().plans).toHaveLength(3)
  })
})
