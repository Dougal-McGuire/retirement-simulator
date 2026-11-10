/**
 * The store's side of cloud sync: what `applySyncedPlans`, `deletePlan` and
 * the save actions do for it, and the shape of one device round trip minus
 * the network.
 */

import { DEFAULT_PARAMS, type Plan } from '@/types'
import { PLAN_TOMBSTONE_TTL_MS, makePlan } from '@/lib/stores/plans'
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

beforeEach(() => {
  // The store has no storage in Node; zustand says so on every write.
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

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

  it('stores the sync bookkeeping with the plans, sanitized', () => {
    const now = Date.now()
    useSimulationStore.getState().applySyncedPlans([plan('plan-base', 2_000)], 'plan-base', {
      deletedPlans: {
        gone: now - 5,
        expired: now - PLAN_TOMBSTONE_TTL_MS - 5,
        junk: 'x' as unknown as number,
      },
      syncedPlanStamps: { 'plan-base': 2_000, junk: Number.NaN },
    })

    const state = useSimulationStore.getState()
    expect(state.deletedPlans).toEqual({ gone: now - 5 })
    expect(state.syncedPlanStamps).toEqual({ 'plan-base': 2_000 })
  })

  it('stores the bookkeeping even when the plans themselves did not change', () => {
    const changed = useSimulationStore
      .getState()
      .applySyncedPlans([plan('plan-base', 1_000)], 'plan-base', {
        syncedPlanStamps: { 'plan-base': 1_000 },
      })

    expect(changed).toBe(false)
    expect(useSimulationStore.getState().syncedPlanStamps).toEqual({ 'plan-base': 1_000 })
  })

  it('moves the selection with a plan that was kept under a new id', () => {
    const mine = { ...DEFAULT_PARAMS, currentAssets: 111 }
    resetStore([plan('plan-x', 800, 'Plan', mine)], 'plan-x')

    useSimulationStore
      .getState()
      .applySyncedPlans(
        [
          plan('plan-x', 900, 'Plan', { ...DEFAULT_PARAMS, currentAssets: 222 }),
          plan('plan-x-copy', 800, 'Plan (copy from this device)', mine),
        ],
        'plan-x-copy',
        { renamedIds: { 'plan-x': 'plan-x-copy' } }
      )

    const state = useSimulationStore.getState()
    expect(state.activePlanId).toBe('plan-x-copy')
    // What was on screen stays on screen.
    expect(state.params.currentAssets).toBe(111)
    expect(state.isDirty).toBe(false)
  })

  it('moves an unsaved edit with the plan it belongs to', () => {
    const mine = { ...DEFAULT_PARAMS, currentAssets: 111 }
    const draft = { ...mine, currentAge: mine.currentAge + 1 }
    resetStore([plan('plan-x', 800, 'Plan', mine)], 'plan-x')
    useSimulationStore.setState({ params: draft, draftParams: draft, isDirty: true })

    useSimulationStore.getState().applySyncedPlans(
      [
        plan('plan-x', 900, 'Plan', { ...DEFAULT_PARAMS, currentAssets: 222 }),
        plan('plan-x-copy', 800, 'Plan (copy from this device)', mine),
      ],
      // Whatever the merge asks for: a dirty working copy is pinned to its plan.
      'plan-x',
      { renamedIds: { 'plan-x': 'plan-x-copy' } }
    )

    const state = useSimulationStore.getState()
    expect(state.activePlanId).toBe('plan-x-copy')
    expect(state.isDirty).toBe(true)
    expect(state.params).toEqual(draft)
  })
})

describe('deleting a plan', () => {
  it('remembers the deletion, so sync can tell "deleted here" from "never seen here"', () => {
    jest.useFakeTimers().setSystemTime(50_000)
    resetStore([plan('plan-base', 1_000), plan('plan-b', 2_000)], 'plan-base')
    useSimulationStore.setState({ syncedPlanStamps: { 'plan-base': 1_000, 'plan-b': 2_000 } })

    useSimulationStore.getState().deletePlan('plan-b')

    const state = useSimulationStore.getState()
    expect(state.plans.map((entry) => entry.id)).toEqual(['plan-base'])
    expect(state.deletedPlans).toEqual({ 'plan-b': 50_000 })
    // The base stays: it says which revision was deleted.
    expect(state.syncedPlanStamps['plan-b']).toBe(2_000)
  })

  it('stamps the deletion no earlier than the revision it deleted', () => {
    jest.useFakeTimers().setSystemTime(50_000)
    // Pulled from a device whose clock runs ahead.
    resetStore([plan('plan-base', 1_000), plan('plan-b', 90_000)], 'plan-base')

    useSimulationStore.getState().deletePlan('plan-b')
    expect(useSimulationStore.getState().deletedPlans['plan-b']).toBe(90_000)
  })

  it('records nothing when nothing was deleted', () => {
    resetStore([plan('plan-base', 1_000)], 'plan-base')

    useSimulationStore.getState().deletePlan('plan-base') // the last plan stays
    useSimulationStore.getState().deletePlan('ghost')
    expect(useSimulationStore.getState().deletedPlans).toEqual({})
  })

  it('"undo" restores under a new id, so the tombstone of the old one cannot touch it', () => {
    resetStore([plan('plan-base', 1_000), plan('plan-b', 2_000, 'Retire at 60')], 'plan-base')

    const removed = useSimulationStore.getState().plans[1]
    useSimulationStore.getState().deletePlan('plan-b')
    // What the "Undo" button of the delete toast does.
    const restoredId = useSimulationStore.getState().createPlan(removed.name, removed.params)

    const state = useSimulationStore.getState()
    expect(restoredId).not.toBeNull()
    expect(restoredId).not.toBe('plan-b')
    expect(state.plans.map((entry) => entry.name)).toEqual(['plan-base', 'Retire at 60'])
    expect(Object.keys(state.deletedPlans)).toEqual(['plan-b'])
    expect(state.deletedPlans[restoredId as string]).toBeUndefined()
  })
})

describe('saving on a device that holds a plan stamped in the future', () => {
  const DAY = 86_400_000

  it('stamps a save after the stamp the plan already has', () => {
    jest.useFakeTimers().setSystemTime(1_000_000)
    // Pulled from a device whose clock runs a day ahead.
    resetStore([plan('plan-base', 1_000_000 + DAY)], 'plan-base')

    useSimulationStore.getState().updateParams({ currentAssets: 5 })
    useSimulationStore.getState().savePlanDraft()

    expect(useSimulationStore.getState().plans[0].updatedAt).toBe(1_000_000 + DAY + 1)
  })

  it('uses the device clock when that is later', () => {
    jest.useFakeTimers().setSystemTime(1_000_000)
    resetStore([plan('plan-base', 500)], 'plan-base')

    useSimulationStore.getState().updateParams({ currentAssets: 5 })
    useSimulationStore.getState().savePlanDraft()

    expect(useSimulationStore.getState().plans[0].updatedAt).toBe(1_000_000)
  })

  it('stamps a rename the same way', () => {
    jest.useFakeTimers().setSystemTime(1_000_000)
    resetStore([plan('plan-base', 1_000_000 + DAY)], 'plan-base')

    useSimulationStore.getState().renamePlan('plan-base', 'Renamed')

    expect(useSimulationStore.getState().plans[0].updatedAt).toBe(1_000_000 + DAY + 1)
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
      plans: JSON.parse(JSON.stringify(seed.cloud.plans)) as Plan[],
      activePlanId: seed.cloud.activePlanId,
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
    useSimulationStore.getState().applySyncedPlans(adopt.plans, adopt.activePlanId, adopt)

    const state = useSimulationStore.getState()
    expect(state.plans.map((entry) => entry.name)).toEqual(['plan-base', 'Retire at 60'])
    expect(state.activePlanId).toBe('plan-b')
    expect(state.params).toEqual(DEFAULT_PARAMS)
    expect(state.syncedPlanStamps).toEqual({ 'plan-base': 1_000, 'plan-b': 2_000 })
  })

  it('merges divergent work from two devices without dropping either side', () => {
    const localParams = { ...DEFAULT_PARAMS, currentAge: 44 }
    const remoteParams = { ...DEFAULT_PARAMS, currentAge: 55 }

    resetStore(
      [plan('plan-base', 9_000, 'edited here', localParams), plan('only-a', 3_000)],
      'plan-base'
    )
    const { plans, activePlanId } = useSimulationStore.getState()

    const merged = mergePlanSnapshots({
      local: { plans, activePlanId },
      remote: {
        schemaVersion: 1,
        updatedAt: 8_000,
        plans: [plan('plan-base', 4_000, 'edited there', remoteParams), plan('only-b', 6_000)],
        activePlanId: 'only-b',
      },
      localPristine: false,
    })

    expect(merged.outcome).toBe('merge')
    // Two devices' own "plan-base": both versions are kept.
    expect(merged.plans.map((entry) => entry.params.currentAge)).toEqual([
      55,
      44,
      DEFAULT_PARAMS.currentAge,
      DEFAULT_PARAMS.currentAge,
    ])
    expect(merged.plans[0].id).toBe('plan-base')
    expect(merged.plans.slice(2).map((entry) => entry.id)).toEqual(['only-a', 'only-b'])
    expect(merged.shouldApply).toBe(true)
    expect(merged.shouldPush).toBe(true)

    expect(
      useSimulationStore.getState().applySyncedPlans(merged.plans, merged.activePlanId, merged)
    ).toBe(true)
    const state = useSimulationStore.getState()
    expect(state.plans).toHaveLength(4)
    // This device keeps looking at its own version.
    expect(state.activePlanId).toBe(merged.plans[1].id)
    expect(state.params.currentAge).toBe(44)
  })
})
