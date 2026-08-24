import { DEFAULT_PARAMS, MAX_PLANS, type Plan, type SimulationParams } from '@/types'
import { makePlan } from '@/lib/stores/plans'
import {
  cloudProbeState,
  fetchRemoteSnapshot,
  mergePlanSnapshots,
  pushSnapshot,
  resetCloudProbe,
  snapshotSignature,
  usePlanSyncStore,
  markNamespaceReady,
  type PlanSnapshot,
  type RemoteSnapshot,
} from '@/lib/stores/planSync'

const params = (overrides: Partial<SimulationParams> = {}): SimulationParams => ({
  ...DEFAULT_PARAMS,
  ...overrides,
})

const plan = (id: string, updatedAt: number, overrides: Partial<Plan> = {}): Plan =>
  makePlan({
    id,
    name: overrides.name ?? id,
    params: overrides.params ?? params(),
    createdAt: overrides.createdAt ?? 1_000,
    updatedAt,
  })

const local = (plans: Plan[], activePlanId = plans[0]?.id ?? ''): PlanSnapshot => ({
  plans,
  activePlanId,
})

const remote = (plans: Plan[], activePlanId = plans[0]?.id ?? '', updatedAt = 5_000): RemoteSnapshot => ({
  schemaVersion: 1,
  updatedAt,
  plans,
  activePlanId,
})

describe('mergePlanSnapshots', () => {
  it('does nothing when both sides are empty or the device is untouched', () => {
    const result = mergePlanSnapshots({
      local: local([plan('plan-base', 100)]),
      remote: null,
      localPristine: true,
    })

    expect(result.outcome).toBe('idle')
    expect(result.shouldApply).toBe(false)
    expect(result.shouldPush).toBe(false)
  })

  it('seeds an empty account from the first device that has real work', () => {
    const plans = [plan('plan-base', 100), plan('plan-b', 200)]

    const result = mergePlanSnapshots({
      local: local(plans, 'plan-b'),
      remote: null,
      localPristine: false,
    })

    expect(result.outcome).toBe('seed')
    expect(result.shouldPush).toBe(true)
    expect(result.shouldApply).toBe(false)
    expect(result.plans).toEqual(plans)
    expect(result.activePlanId).toBe('plan-b')
  })

  it('treats an account whose blob holds no plans as empty', () => {
    const result = mergePlanSnapshots({
      local: local([plan('plan-base', 100)]),
      remote: remote([], ''),
      localPristine: false,
    })

    expect(result.outcome).toBe('seed')
    expect(result.shouldPush).toBe(true)
  })

  it('adopts the account on a pristine second device without pushing back', () => {
    const remotePlans = [plan('plan-base', 300), plan('plan-x', 400)]

    const result = mergePlanSnapshots({
      local: local([plan('plan-base', 100)]),
      remote: remote(remotePlans, 'plan-x'),
      localPristine: true,
    })

    expect(result.outcome).toBe('adopt')
    expect(result.plans).toEqual(remotePlans)
    expect(result.activePlanId).toBe('plan-x')
    expect(result.shouldApply).toBe(true)
    expect(result.shouldPush).toBe(false)
  })

  it('merges by plan id, newest updatedAt winning per plan', () => {
    const localShared = plan('shared', 900, { name: 'local name' })
    const remoteShared = plan('shared', 500, { name: 'remote name' })

    const result = mergePlanSnapshots({
      local: local([localShared, plan('only-local', 100)], 'only-local'),
      remote: remote([remoteShared, plan('only-remote', 700)], 'only-remote'),
      localPristine: false,
    })

    expect(result.outcome).toBe('merge')
    expect(result.plans.map((entry) => entry.id)).toEqual(['shared', 'only-local', 'only-remote'])
    expect(result.plans[0].name).toBe('local name')
    expect(result.shouldApply).toBe(true)
    expect(result.shouldPush).toBe(true)
  })

  it('lets the remote copy win when it is newer', () => {
    const result = mergePlanSnapshots({
      local: local([plan('shared', 100, { name: 'local name' })]),
      remote: remote([plan('shared', 900, { name: 'remote name' })]),
      localPristine: false,
    })

    expect(result.plans).toHaveLength(1)
    expect(result.plans[0].name).toBe('remote name')
  })

  it('keeps the local copy on an updatedAt tie', () => {
    const result = mergePlanSnapshots({
      local: local([plan('shared', 500, { name: 'local name' })]),
      remote: remote([plan('shared', 500, { name: 'remote name' })]),
      localPristine: false,
    })

    expect(result.plans[0].name).toBe('local name')
  })

  it('takes the active plan from whichever side was edited last', () => {
    const localSide = local([plan('a', 100), plan('b', 200)], 'a')
    const remoteSide = remote([plan('c', 900)], 'c')

    expect(mergePlanSnapshots({ local: localSide, remote: remoteSide, localPristine: false }).activePlanId).toBe('c')

    const staleRemote = remote([plan('c', 10)], 'c')
    expect(mergePlanSnapshots({ local: localSide, remote: staleRemote, localPristine: false }).activePlanId).toBe('a')
  })

  it('falls back to the other side when the preferred active plan did not survive', () => {
    // Remote is newer, but its `activePlanId` points at a plan it does not hold.
    const result = mergePlanSnapshots({
      local: local([plan('a', 100)], 'a'),
      remote: remote([plan('b', 900)], 'ghost'),
      localPristine: false,
    })

    expect(result.plans.map((entry) => entry.id)).toEqual(['a', 'b'])
    expect(result.activePlanId).toBe('a')
  })

  it('caps the union at MAX_PLANS, dropping the oldest plans first', () => {
    const localPlans = Array.from({ length: MAX_PLANS }, (_, index) =>
      plan(`local-${index}`, 1_000 + index)
    )
    const remotePlans = Array.from({ length: 6 }, (_, index) => plan(`remote-${index}`, 5_000 + index))

    const result = mergePlanSnapshots({
      local: local(localPlans, 'local-0'),
      remote: remote(remotePlans, 'remote-0'),
      localPristine: false,
    })

    expect(result.plans).toHaveLength(MAX_PLANS)
    // The oldest local plans are shed; every (newer) remote plan survives.
    expect(result.plans.some((entry) => entry.id === 'remote-5')).toBe(true)
    expect(result.plans.some((entry) => entry.id === `local-${MAX_PLANS - 1}`)).toBe(true)
    expect(result.plans.some((entry) => entry.id === 'local-0')).toBe(false)
    // Ordering is preserved: surviving local plans first, then remote-only ones.
    expect(result.plans.map((entry) => entry.id).slice(-6)).toEqual([
      'remote-0',
      'remote-1',
      'remote-2',
      'remote-3',
      'remote-4',
      'remote-5',
    ])
  })

  it('never drops the active plan to honour the cap', () => {
    const localPlans = [
      plan('ancient-active', 1),
      ...Array.from({ length: MAX_PLANS - 1 }, (_, index) => plan(`local-${index}`, 2_000 + index)),
    ]
    const remotePlans = Array.from({ length: 4 }, (_, index) => plan(`remote-${index}`, 9_000 + index))

    const result = mergePlanSnapshots({
      // Local is stale overall, so the local `activePlanId` is the preferred one.
      local: local(localPlans, 'ancient-active'),
      remote: remote(remotePlans, 'remote-0', 9_999),
      localPristine: false,
    })

    expect(result.plans).toHaveLength(MAX_PLANS)
    expect(result.activePlanId).toBe('remote-0')
    expect(result.plans.some((entry) => entry.id === 'remote-0')).toBe(true)
  })

  it('reports no work when a merge reproduces both sides exactly', () => {
    const shared = [plan('a', 100), plan('b', 200)]

    const result = mergePlanSnapshots({
      local: local(shared, 'a'),
      remote: remote(shared, 'a'),
      localPristine: false,
    })

    expect(result.outcome).toBe('merge')
    expect(result.shouldApply).toBe(false)
    expect(result.shouldPush).toBe(false)
  })
})

describe('snapshotSignature', () => {
  it('ignores everything that is not a plan', () => {
    const plans = [plan('a', 100)]
    expect(snapshotSignature({ plans, activePlanId: 'a' })).toBe(
      snapshotSignature({ plans: [...plans], activePlanId: 'a' })
    )
  })

  it('changes when a plan is saved with new params', () => {
    const before = snapshotSignature({ plans: [plan('a', 100)], activePlanId: 'a' })
    const after = snapshotSignature({
      plans: [plan('a', 200, { params: params({ currentAge: 44 }) })],
      activePlanId: 'a',
    })

    expect(before).not.toBe(after)
  })
})

describe('transport', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    resetCloudProbe()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  const mockFetch = (impl: jest.Mock) => {
    global.fetch = impl as unknown as typeof fetch
    return impl
  }

  it('probes once per session and never asks again after a 501', async () => {
    const fetchMock = mockFetch(
      jest.fn().mockResolvedValue({ ok: false, status: 501, json: async () => ({}) })
    )

    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'unconfigured' })
    expect(cloudProbeState()).toBe(false)

    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'unconfigured' })
    await expect(pushSnapshot({ plans: [plan('a', 1)], activePlanId: 'a' })).resolves.toEqual({
      status: 'unconfigured',
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reads an account blob', async () => {
    mockFetch(
      jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          configured: true,
          blob: { schemaVersion: 1, updatedAt: 42, plans: [plan('a', 5)], activePlanId: 'a' },
        }),
      })
    )

    const result = await fetchRemoteSnapshot()
    expect(result.status).toBe('ok')
    expect(result.status === 'ok' && result.blob?.updatedAt).toBe(42)
    expect(result.status === 'ok' && result.blob?.plans).toHaveLength(1)
  })

  it('reads an empty account as null without disabling sync', async () => {
    mockFetch(
      jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ configured: true, blob: null }),
      })
    )

    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'ok', blob: null })
    expect(cloudProbeState()).toBe(true)
  })

  it('degrades to an error (never a throw) when the network is gone', async () => {
    mockFetch(jest.fn().mockRejectedValue(new Error('offline')))

    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'error' })
    await expect(pushSnapshot({ plans: [plan('a', 1)], activePlanId: 'a' })).resolves.toEqual({
      status: 'error',
    })
    // An error is not a verdict about the deployment: it stays probe-able.
    expect(cloudProbeState()).toBeNull()
  })

  it('reports a lost session as unauthorized', async () => {
    mockFetch(jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }))

    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'unauthorized' })
  })

  it('sends the plans and active plan as the PUT body', async () => {
    const fetchMock = mockFetch(
      jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ configured: true, updatedAt: 777 }),
      })
    )

    await expect(pushSnapshot({ plans: [plan('a', 1)], activePlanId: 'a' })).resolves.toEqual({
      status: 'ok',
      updatedAt: 777,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('PUT')
    const body = JSON.parse(String(init.body)) as { plans: Plan[]; activePlanId: string }
    expect(body.activePlanId).toBe('a')
    expect(body.plans).toHaveLength(1)
  })
})

describe('namespace signal', () => {
  beforeEach(() => {
    usePlanSyncStore.setState({
      phase: 'disabled',
      lastSyncedAt: null,
      namespaceUserId: null,
      namespaceReady: false,
    })
  })

  it('publishes the signed-in account and clears status on sign-out', () => {
    markNamespaceReady('user-1')
    expect(usePlanSyncStore.getState().namespaceUserId).toBe('user-1')
    expect(usePlanSyncStore.getState().namespaceReady).toBe(true)

    usePlanSyncStore.getState().setPhase('synced', 1234)
    markNamespaceReady(null)

    // The anonymous namespace never syncs, and must not inherit a stale status.
    expect(usePlanSyncStore.getState().namespaceUserId).toBeNull()
    expect(usePlanSyncStore.getState().phase).toBe('disabled')
    expect(usePlanSyncStore.getState().lastSyncedAt).toBeNull()
  })
})
