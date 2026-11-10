/**
 * Cloud sync end to end, minus the browser: the real `/api/plans` route and
 * plan store behind a fake Upstash, driven by the real client loop.
 *
 * Every scenario here was once a way to lose data (review of 2026-11-09); each
 * test states what must happen instead. A "device" is a snapshot of the local
 * store — plans plus the sync bookkeeping that is persisted with them — loaded
 * into the one store this process has; a "visit" is one page life of the loop.
 */

import { DEFAULT_PARAMS, MAX_PLANS, type Plan } from '@/types'
import { makePlan } from '@/lib/stores/plans'

const authMock = jest.fn()
jest.mock('@/auth', () => ({ auth: () => authMock() }))

import { GET, PUT } from '@/app/api/plans/route'
import { planMetaKey, planStoreKey, type CloudPlanBlob } from '@/lib/server/planStore'
import {
  createFakeUpstash,
  FAKE_UPSTASH_URL,
  type FakeUpstash,
} from '@/lib/server/testing/fakeUpstash'
import { PLAN_REV_HEADER, PLAN_SCHEMA_HEADER, PLAN_SCHEMA_VERSION } from '@/lib/plans/schemaVersion'
import { setActiveAuthUserId } from '@/lib/stores/persistenceKey'
import { useSimulationStore } from '@/lib/stores/simulationStore'
import { resetCloudProbe, usePlanSyncStore } from '@/lib/stores/planSync'
import { flushPlanSync, startPlanCloudSync } from '@/components/auth/PlanCloudSync'

const ACCOUNT = 'google-sub-1'
const KEY = planStoreKey(ACCOUNT)
const META = planMetaKey(ACCOUNT)

const plan = (
  id: string,
  updatedAt: number,
  currentAssets = DEFAULT_PARAMS.currentAssets,
  name = id
): Plan =>
  makePlan({ id, name, params: { ...DEFAULT_PARAMS, currentAssets }, createdAt: 100, updatedAt })

/** The part of the local store that is one device's sync-relevant state. */
interface Device {
  plans: Plan[]
  activePlanId: string
  deletedPlans: Record<string, number>
  syncedPlanStamps: Record<string, number>
}

const device = (plans: Plan[], activePlanId = plans[0].id): Device => ({
  plans,
  activePlanId,
  deletedPlans: {},
  syncedPlanStamps: {},
})

const pristine = useSimulationStore.getInitialState()
/** A browser that has never been used: the untouched starter plan. */
const freshDevice = (): Device => device(pristine.plans, pristine.activePlanId)

const loadDevice = (state: Device) => {
  useSimulationStore.setState({
    ...pristine,
    ...state,
    params: state.plans.find((entry) => entry.id === state.activePlanId)?.params ?? DEFAULT_PARAMS,
    draftParams: null,
    isDirty: false,
    // Keeps `requestRun()` from starting a real Monte Carlo run in the test.
    autoRunSuspended: true,
  })
}

const snapshotDevice = (): Device => {
  const { plans, activePlanId, deletedPlans, syncedPlanStamps } = useSimulationStore.getState()
  return { plans, activePlanId, deletedPlans, syncedPlanStamps }
}

const localPlans = () => useSimulationStore.getState().plans
const ids = (plans: readonly Plan[] | undefined) => (plans ?? []).map((entry) => entry.id)
const assets = (plans: readonly Plan[] | undefined) =>
  (plans ?? []).map((entry) => entry.params.currentAssets)

/** Saves a change to the active plan, the way the UI does. */
const editActivePlan = (currentAssets: number) => {
  useSimulationStore.getState().updateParams({ currentAssets })
  useSimulationStore.getState().savePlanDraft()
}

// ---- The server behind the loop ---------------------------------------------

interface ApiCall {
  method: string
  status: number
  rev: string | null
  keepalive: boolean
}

let upstash: FakeUpstash
/** Every `/api/plans` request the client made, with the answer it got. */
let api: ApiCall[] = []
/**
 * Number of pulls (GET) that fail before they reach the server. A PUT is
 * never failed this way: if the client sent one, it would get through — which
 * is what "nothing is pushed without a pull" has to be tested against.
 */
let failClientPulls = 0
/** While set, client requests wait here before they are answered. */
let apiGate: Promise<void> | null = null

const fakeFetch = async (input: unknown, init?: RequestInit): Promise<Response> => {
  const url = String(input)
  if (upstash.handles(url)) return upstash.fetch(input, init)
  if (url !== '/api/plans') throw new Error(`unexpected url ${url}`)

  if (failClientPulls > 0 && init?.method !== 'PUT') {
    failClientPulls -= 1
    throw new TypeError('Failed to fetch')
  }
  if (apiGate) await apiGate

  const request = new Request('https://example.com/api/plans', init)
  const response = init?.method === 'PUT' ? await PUT(request) : await GET(request)
  api.push({
    method: String(init?.method),
    status: response.status,
    rev: new Headers(init?.headers).get(PLAN_REV_HEADER),
    keepalive: init?.keepalive === true,
  })
  return response
}

const calls = (method: string) => api.filter((call) => call.method === method)
const trace = () => api.map((call) => `${call.method} ${call.status}`)

const cloud = (): CloudPlanBlob | null =>
  upstash.data[KEY] ? (JSON.parse(upstash.data[KEY]) as CloudPlanBlob) : null

/**
 * Puts a blob into the account the way a deployment from BEFORE this protocol
 * left it: schema 2, no revision, no tombstones, no meta key. Existing data
 * must keep working, so most scenarios start from this.
 */
const seedLegacyCloud = (plans: Plan[], activePlanId = plans[0].id) => {
  upstash.data[KEY] = JSON.stringify({ schemaVersion: 2, updatedAt: 1, plans, activePlanId })
}

/** Another device writing straight to the API, with whatever revision it holds. */
const writeAsOtherDevice = async (rev: number, plans: Plan[], deletedPlans = {}) =>
  PUT(
    new Request('https://example.com/api/plans', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        [PLAN_SCHEMA_HEADER]: String(PLAN_SCHEMA_VERSION),
        [PLAN_REV_HEADER]: String(rev),
      },
      body: JSON.stringify({ plans, activePlanId: plans[0].id, deletedPlans }),
    })
  )

// ---- The loop -----------------------------------------------------------------

/** Lets promise chains (and real `Response` bodies) settle. */
const settle = async () => {
  for (let index = 0; index < 40; index += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

/** Past the 2 s push debounce. */
const passDebounce = async () => {
  jest.advanceTimersByTime(2_100)
  await settle()
}

let stop: (() => void) | null = null

const startSession = async () => {
  resetCloudProbe()
  usePlanSyncStore.setState({
    phase: 'disabled',
    lastSyncedAt: null,
    reloadNotice: null,
    planLimit: null,
    conflictCopyNames: [],
  })
  stop = startPlanCloudSync()
  await settle()
  return usePlanSyncStore.getState().phase
}

const endSession = () => {
  stop?.()
  stop = null
}

/** One page visit: reconcile, optional work (pushed after the debounce), close. */
const visit = async (work?: () => void) => {
  const phaseAfterReconcile = await startSession()
  if (work) {
    work()
    await passDebounce()
  }
  endSession()
  return phaseAfterReconcile
}

/** `window` / `document` as far as the loop uses them (Jest runs in Node). */
const installDom = () => {
  const windowTarget = new EventTarget()
  const documentTarget = Object.assign(new EventTarget(), { visibilityState: 'visible' })
  Object.defineProperty(globalThis, 'window', { value: windowTarget, configurable: true })
  Object.defineProperty(globalThis, 'document', { value: documentTarget, configurable: true })
  return { window: windowTarget, document: documentTarget }
}

const originalFetch = global.fetch
const originalEnv = { ...process.env }

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] })
  process.env.AUTH_SECRET = 'test-secret'
  process.env.GOOGLE_CLIENT_ID = 'client-id'
  process.env.GOOGLE_CLIENT_SECRET = 'client-secret'
  process.env.KV_REST_API_URL = FAKE_UPSTASH_URL
  process.env.KV_REST_API_TOKEN = 'token-123'
  delete process.env.VERCEL_ENV
  authMock.mockResolvedValue({ user: { id: ACCOUNT } })
  upstash = createFakeUpstash()
  api = []
  failClientPulls = 0
  apiGate = null
  setActiveAuthUserId(null)
  global.fetch = fakeFetch as typeof fetch
  jest.spyOn(console, 'error').mockImplementation(() => {})
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  endSession()
  jest.useRealTimers()
  jest.restoreAllMocks()
  global.fetch = originalFetch
  process.env = { ...originalEnv }
  setActiveAuthUserId(null)
  delete (globalThis as { window?: unknown }).window
  delete (globalThis as { document?: unknown }).document
})

describe('a failed read is never an empty account (finding 1)', () => {
  const accountPlans = () => [
    plan('plan-base', 5_000, 111_111),
    plan('plan-x', 6_000, 222_222, 'Only in the cloud'),
  ]

  it('S1: a device with local work does not overwrite the account when the store read fails', async () => {
    seedLegacyCloud(accountPlans())
    const before = upstash.data[KEY]

    // Device B has an older edit of its own. Its pulls hit a Redis outage.
    loadDevice(device([plan('plan-base', 1_000, 999_999)]))
    upstash.failNext = Number.POSITIVE_INFINITY
    const phase = await visit(() => editActivePlan(888_888))

    expect(phase).toBe('offline')
    // The route said so instead of answering "empty"…
    expect(api[0]).toMatchObject({ method: 'GET', status: 502 })
    // …and nothing was ever written, not even after a local save.
    expect(upstash.writes).toBe(0)
    expect(upstash.data[KEY]).toBe(before)
    // The device keeps its own work.
    expect(assets(localPlans())).toEqual([888_888])
  })

  it('S1: once the store answers again, both sides are merged and nothing is lost', async () => {
    seedLegacyCloud(accountPlans())
    loadDevice(device([plan('plan-base', 1_000, 999_999)]))
    upstash.failNext = 1
    await visit()

    const phase = await visit()

    expect(phase).toBe('synced')
    // The account's plans are still there, and the device's own starter plan
    // was kept next to them instead of being dropped or dropping theirs.
    expect(assets(cloud()?.plans).sort()).toEqual([111_111, 222_222, 999_999])
    expect(assets(localPlans()).sort()).toEqual([111_111, 222_222, 999_999])
  })

  it('S1b: a new device does not report "synced" over a failed read, and its first save wipes nothing', async () => {
    seedLegacyCloud(accountPlans())
    const before = upstash.data[KEY]
    loadDevice(freshDevice())

    // Every read fails for the whole visit.
    upstash.failNext = Number.POSITIVE_INFINITY
    const phase = await visit(() => {
      // The user, seeing an empty workspace, starts over and saves.
      editActivePlan(5)
    })

    expect(phase).toBe('offline')
    expect(calls('PUT')).toHaveLength(0)
    expect(upstash.writes).toBe(0)
    expect(upstash.data[KEY]).toBe(before)
  })

  it('S1b: an error answer from the store (quota) is handled the same way', async () => {
    seedLegacyCloud(accountPlans())
    const before = upstash.data[KEY]
    loadDevice(freshDevice())

    upstash.errorNext = Number.POSITIVE_INFINITY
    const phase = await visit(() => editActivePlan(5))

    expect(phase).toBe('offline')
    expect(calls('GET').every((call) => call.status === 502)).toBe(true)
    expect(upstash.writes).toBe(0)
    expect(upstash.data[KEY]).toBe(before)
  })

  it('a new device adopts the account when the read works', async () => {
    seedLegacyCloud(accountPlans())
    loadDevice(freshDevice())

    expect(await visit()).toBe('synced')
    expect(ids(localPlans())).toEqual(['plan-base', 'plan-x'])
    expect(assets(localPlans())).toEqual([111_111, 222_222])
    // Adopting writes nothing.
    expect(calls('PUT')).toHaveLength(0)
  })
})

describe('no push without a pull, and every push names a revision (finding 2)', () => {
  it('S4: while the first pull keeps failing, local saves are never pushed', async () => {
    seedLegacyCloud([plan('plan-base', 5_000, 111_111), plan('plan-x', 6_000, 222_222)])
    const before = upstash.data[KEY]
    loadDevice(device([plan('plan-base', 1_000, 999_999)]))

    failClientPulls = Number.POSITIVE_INFINITY
    expect(await startSession()).toBe('offline')

    for (const value of [1, 2, 3]) {
      editActivePlan(value)
      await passDebounce()
    }

    expect(usePlanSyncStore.getState().phase).toBe('offline')
    // A PUT would have gone through — none was sent.
    expect(calls('PUT')).toHaveLength(0)
    expect(api).toHaveLength(0)
    expect(upstash.writes).toBe(0)
    expect(upstash.data[KEY]).toBe(before)
  })

  it('S4: the next change retries the *pull*, merges, and only then pushes', async () => {
    seedLegacyCloud([plan('plan-base', 5_000, 111_111), plan('plan-x', 6_000, 222_222)])
    loadDevice(device([plan('plan-base', 1_000, 999_999)]))

    failClientPulls = 1
    expect(await startSession()).toBe('offline')
    expect(api).toHaveLength(0)

    editActivePlan(777_777)
    await passDebounce()

    expect(trace()).toEqual(['GET 200', 'PUT 200'])
    expect(usePlanSyncStore.getState().phase).toBe('synced')
    // Merged, not replaced: the account kept its plans and gained the device's.
    expect(assets(cloud()?.plans).sort()).toEqual([111_111, 222_222, 777_777])
  })

  it('sends the revision it pulled with every push', async () => {
    loadDevice(device([plan('plan-base', 1_000, 1), plan('plan-b', 2_000, 2)]))

    await startSession()
    editActivePlan(3)
    await passDebounce()
    editActivePlan(4)
    await passDebounce()

    expect(trace()).toEqual(['GET 200', 'PUT 200', 'PUT 200', 'PUT 200'])
    expect(calls('PUT').map((call) => call.rev)).toEqual(['0', '1', '2'])
    expect(upstash.data[META]).toBe(`3:${PLAN_SCHEMA_VERSION}`)
  })

  it('412: when the account moved on, the push is refused, merged and repeated', async () => {
    const shared = [plan('plan-base', 1_000, 1), plan('plan-a', 2_000, 2)]
    loadDevice(device(shared))
    await startSession()
    expect(trace()).toEqual(['GET 200', 'PUT 200'])

    // Meanwhile another device adds a plan (it holds revision 1, like we do).
    const other = await writeAsOtherDevice(1, [...shared, plan('plan-other', 3_000, 3)])
    expect(other.status).toBe(200)

    // We save a change, still believing the account is at revision 1.
    editActivePlan(42)
    await passDebounce()

    expect(trace()).toEqual(['GET 200', 'PUT 200', 'PUT 412', 'GET 200', 'PUT 200'])
    expect(calls('PUT').map((call) => call.rev)).toEqual(['0', '1', '2'])
    expect(usePlanSyncStore.getState().phase).toBe('synced')

    // Converged: the other device's plan and our edit, on both sides.
    expect(ids(cloud()?.plans)).toEqual(['plan-base', 'plan-a', 'plan-other'])
    expect(assets(cloud()?.plans)).toEqual([42, 2, 3])
    expect(ids(localPlans())).toEqual(['plan-base', 'plan-a', 'plan-other'])
    expect(cloud()?.rev).toBe(3)
  })

  it('412 without end: gives up after a few rounds and stays "offline" with everything local', async () => {
    const shared = [plan('plan-base', 1_000, 1), plan('plan-a', 2_000, 2)]
    loadDevice(device(shared))
    await startSession()

    // A server that always claims the account moved on.
    global.fetch = (async (input: unknown, init?: RequestInit) => {
      if (String(input) === '/api/plans' && init?.method === 'PUT') {
        api.push({ method: 'PUT', status: 412, rev: null, keepalive: false })
        return Response.json({ error: 'rev-mismatch', rev: 99 }, { status: 412 })
      }
      return fakeFetch(input, init)
    }) as typeof fetch

    editActivePlan(42)
    await passDebounce()

    expect(calls('PUT').filter((call) => call.status === 412).length).toBeGreaterThan(1)
    expect(calls('PUT').filter((call) => call.status === 412).length).toBeLessThanOrEqual(4)
    expect(usePlanSyncStore.getState().phase).toBe('offline')
    expect(assets(localPlans())).toEqual([42, 2])
  })

  /** Starts a session whose first pull is in flight and not answered yet. */
  const startWithPullInFlight = async (options?: Parameters<typeof startPlanCloudSync>[0]) => {
    let release!: () => void
    apiGate = new Promise<void>((resolve) => {
      release = resolve
    })
    resetCloudProbe()
    usePlanSyncStore.setState({ phase: 'disabled', lastSyncedAt: null })
    stop = startPlanCloudSync(options)
    await settle()
    expect(usePlanSyncStore.getState().phase).toBe('syncing')
    return async () => {
      apiGate = null
      release()
      await settle()
    }
  }

  it('a session that was torn down applies nothing from an answer that arrives late', async () => {
    seedLegacyCloud([plan('plan-base', 5_000, 111_111), plan('plan-x', 6_000, 222_222)])
    loadDevice(device([plan('plan-mine', 1_000, 999_999)]))

    const answer = await startWithPullInFlight()
    endSession()
    await answer()

    // The pull was answered (with two plans to merge) — and ignored.
    expect(trace()).toEqual(['GET 200'])
    expect(ids(localPlans())).toEqual(['plan-mine'])
    expect(usePlanSyncStore.getState().phase).toBe('syncing')
    await passDebounce()
    expect(calls('PUT')).toHaveLength(0)
  })

  it('an answer that arrives after the namespace changed is not merged into the new workspace', async () => {
    seedLegacyCloud([plan('plan-base', 5_000, 111_111), plan('plan-x', 6_000, 222_222)])
    loadDevice(device([plan('plan-mine', 1_000, 999_999)]))
    setActiveAuthUserId(ACCOUNT)

    const answer = await startWithPullInFlight({ userId: ACCOUNT })
    // Signed out while the pull is in flight: the store now holds the
    // anonymous workspace, and the session object has not been torn down yet.
    setActiveAuthUserId(null)
    loadDevice(device([plan('anonymous-plan', 9_000, 123_456)]))
    await answer()
    await passDebounce()

    expect(ids(localPlans())).toEqual(['anonymous-plan'])
    expect(calls('PUT')).toHaveLength(0)
  })

  it('a session never syncs a workspace that belongs to another namespace', async () => {
    loadDevice(device([plan('plan-base', 1_000, 1), plan('plan-b', 2_000, 2)]))
    setActiveAuthUserId(ACCOUNT)
    resetCloudProbe()
    stop = startPlanCloudSync({ userId: ACCOUNT })
    await settle()
    expect(trace()).toEqual(['GET 200', 'PUT 200'])
    const before = upstash.data[KEY]

    // Sign-out: the storage namespace is re-pointed first, then the store is
    // swapped for the anonymous workspace — while this session still exists.
    setActiveAuthUserId(null)
    loadDevice(device([plan('anonymous-plan', 9_000, 123_456)]))
    await passDebounce()
    await flushPlanSync()
    await settle()

    expect(trace()).toEqual(['GET 200', 'PUT 200'])
    expect(upstash.data[KEY]).toBe(before)
  })
})

describe('deleted plans stay deleted (finding 3)', () => {
  const p1 = () => plan('plan-base', 1_000, 1)
  const p2 = () => plan('plan-b', 2_000, 2)

  /** Two devices that both hold plan-base and plan-b, in sync with the account. */
  const twoDevicesInSync = async (): Promise<Device> => {
    loadDevice(device([p1(), p2()]))
    await visit()
    expect(ids(cloud()?.plans)).toEqual(['plan-base', 'plan-b'])
    return snapshotDevice()
  }

  it('S2: a plan deleted on device A is not brought back by device B', async () => {
    const deviceB = await twoDevicesInSync()

    // Device A deletes plan-b; pushed after the debounce.
    await visit(() => useSimulationStore.getState().deletePlan('plan-b'))
    const deviceA = snapshotDevice()
    expect(ids(deviceA.plans)).toEqual(['plan-base'])
    expect(ids(cloud()?.plans)).toEqual(['plan-base'])
    expect(Object.keys(cloud()?.deletedPlans ?? {})).toEqual(['plan-b'])

    // Device B, which still holds plan-b, merely regains focus.
    loadDevice(deviceB)
    const putsBefore = calls('PUT').length
    await visit()
    expect(ids(localPlans())).toEqual(['plan-base'])
    expect(ids(cloud()?.plans)).toEqual(['plan-base'])
    // It dropped its stale copy; it had nothing to write.
    expect(calls('PUT')).toHaveLength(putsBefore)

    // Device A regains focus: still deleted.
    loadDevice(deviceA)
    await visit()
    expect(ids(localPlans())).toEqual(['plan-base'])
    expect(ids(cloud()?.plans)).toEqual(['plan-base'])
  })

  it('S2: a plan edited on device B after device A deleted it survives everywhere', async () => {
    const deviceB = await twoDevicesInSync()

    await visit(() => useSimulationStore.getState().deletePlan('plan-b'))
    const deviceA = snapshotDevice()
    expect(ids(cloud()?.plans)).toEqual(['plan-base'])

    // Device B edits plan-b (it has not heard of the deletion) and then syncs.
    loadDevice({ ...deviceB, activePlanId: 'plan-b' })
    jest.advanceTimersByTime(60_000)
    editActivePlan(77)
    await visit()
    expect(ids(localPlans())).toEqual(['plan-base', 'plan-b'])
    expect(assets(cloud()?.plans)).toEqual([1, 77])
    expect(cloud()?.deletedPlans).toEqual({})

    // Back on device A the plan returns, with B's edit; A's tombstone is cleared.
    loadDevice(deviceA)
    await visit()
    expect(assets(localPlans())).toEqual([1, 77])
    expect(useSimulationStore.getState().deletedPlans).toEqual({})
    expect(assets(cloud()?.plans)).toEqual([1, 77])
  })

  it('a plan with unsaved edits is not deleted from under the user by another device', async () => {
    const deviceB = await twoDevicesInSync()
    await visit(() => useSimulationStore.getState().deletePlan('plan-b'))
    expect(ids(cloud()?.plans)).toEqual(['plan-base'])

    // Device B has plan-b open with an unsaved change when it regains focus.
    loadDevice({ ...deviceB, activePlanId: 'plan-b' })
    useSimulationStore.getState().updateParams({ currentAssets: 31_337 })
    expect(useSimulationStore.getState().isDirty).toBe(true)
    await visit()

    const state = useSimulationStore.getState()
    expect(ids(state.plans)).toEqual(['plan-base', 'plan-b'])
    expect(state.activePlanId).toBe('plan-b')
    expect(state.isDirty).toBe(true)
    expect(state.params.currentAssets).toBe(31_337)
    // The plan is back in the account, so no device deletes it again.
    expect(ids(cloud()?.plans)).toEqual(['plan-base', 'plan-b'])
  })

  it('"undo" after a synced deletion leaves exactly one copy on every device', async () => {
    const deviceB = await twoDevicesInSync()

    await startSession()
    const removed = localPlans()[1]
    useSimulationStore.getState().deletePlan('plan-b')
    await passDebounce()
    expect(ids(cloud()?.plans)).toEqual(['plan-base'])
    // What the toast's "Undo" does: the plan comes back under a new id.
    useSimulationStore.getState().createPlan(removed.name, removed.params)
    await passDebounce()
    endSession()

    expect(assets(cloud()?.plans)).toEqual([1, 2])
    const restoredId = cloud()?.plans[1].id

    loadDevice(deviceB)
    await visit()
    expect(assets(localPlans())).toEqual([1, 2])
    expect(ids(localPlans())).toEqual(['plan-base', restoredId])
    expect(assets(cloud()?.plans)).toEqual([1, 2])
  })
})

describe('two devices, two "plan-base" (finding 4)', () => {
  it('S3: the first sync keeps both starter plans instead of discarding one', async () => {
    seedLegacyCloud([plan('plan-base', 2_000, 111_111, 'Base plan')])
    loadDevice(device([plan('plan-base', 1_000, 999_999, 'Base plan')]))

    await startSession()

    const local = localPlans()
    expect(local).toHaveLength(2)
    expect(assets(local)).toEqual([111_111, 999_999])
    expect(local[0].id).toBe('plan-base')
    expect(local[1].name).toBe('Base plan (copy from this device)')
    // The device keeps looking at its own plan…
    expect(useSimulationStore.getState().activePlanId).toBe(local[1].id)
    expect(useSimulationStore.getState().params.currentAssets).toBe(999_999)
    // …the user is told…
    expect(usePlanSyncStore.getState().conflictCopyNames).toEqual([
      'Base plan (copy from this device)',
    ])
    // …and both plans are in the account.
    expect(assets(cloud()?.plans)).toEqual([111_111, 999_999])

    // A second look changes nothing: no second copy.
    endSession()
    await visit()
    expect(assets(localPlans())).toEqual([111_111, 999_999])
    expect(assets(cloud()?.plans)).toEqual([111_111, 999_999])
  })

  it('keeps both versions when two devices edited the same plan between syncs', async () => {
    loadDevice(device([plan('plan-base', 1_000, 1), plan('plan-x', 2_000, 2)], 'plan-x'))
    await visit()
    const laptop = snapshotDevice()
    const phone = snapshotDevice()

    // Phone edits plan-x and syncs.
    loadDevice(phone)
    jest.advanceTimersByTime(10_000)
    await visit(() => editActivePlan(500))

    // Laptop edited plan-x too, offline, and syncs afterwards.
    loadDevice(laptop)
    editActivePlan(900)
    await visit()

    expect(assets(localPlans())).toEqual([1, 500, 900])
    expect(localPlans()[2].name).toBe('plan-x (copy from this device)')
    expect(assets(cloud()?.plans)).toEqual([1, 500, 900])
  })

  it('never drops a plan to honour the plan limit: both sides keep theirs and the user is told', async () => {
    const accountPlans = Array.from({ length: 4 }, (_, index) =>
      plan(`cloud-${index}`, 5_000 + index, 100 + index)
    )
    seedLegacyCloud(accountPlans)
    const devicePlans = Array.from({ length: MAX_PLANS - 1 }, (_, index) =>
      plan(`device-${index}`, 1_000 + index, 200 + index)
    )
    loadDevice(device(devicePlans))

    expect(await startSession()).toBe('synced')

    // The device still has every one of its plans…
    devicePlans.forEach((entry) => expect(ids(localPlans())).toContain(entry.id))
    expect(localPlans()).toHaveLength(MAX_PLANS)
    // …the account still has every one of its plans…
    accountPlans.forEach((entry) => expect(ids(cloud()?.plans)).toContain(entry.id))
    expect(cloud()?.plans).toHaveLength(MAX_PLANS)
    // …and the status says that not everything is synced.
    expect(usePlanSyncStore.getState().planLimit).toEqual({ unsynced: 3, hidden: 3 })

    // Deleting plans makes room; everything that is left syncs.
    for (const id of ['device-0', 'device-1', 'device-2', 'device-3', 'device-4', 'device-5']) {
      useSimulationStore.getState().deletePlan(id)
    }
    await passDebounce()

    expect(usePlanSyncStore.getState().planLimit).toBeNull()
    expect(ids(localPlans()).sort()).toEqual(ids(cloud()?.plans).sort())
    expect(localPlans()).toHaveLength(MAX_PLANS - 1 - 6 + 4)
    accountPlans.forEach((entry) => expect(ids(localPlans())).toContain(entry.id))
  })
})

describe('clock skew (finding 5)', () => {
  it('S6: a save made later on another device is not reverted by a device whose clock runs ahead', async () => {
    const DAY = 86_400_000
    const now = Date.now()

    // Phone (clock one day ahead) saved the plan "tomorrow", next to another plan.
    loadDevice(device([plan('plan-base', now + DAY, 100_000), plan('plan-b', now - 5_000, 2)]))
    await visit()
    const phone = snapshotDevice()
    // The server did not take the future stamp at face value.
    expect(cloud()?.plans[0].updatedAt).toBeLessThanOrEqual(now)

    // Laptop pulls it, then the user changes and saves the plan (really later).
    loadDevice(freshDevice())
    jest.advanceTimersByTime(60_000)
    await visit(() => editActivePlan(200_000))
    const laptop = snapshotDevice()
    expect(assets(laptop.plans)).toEqual([200_000, 2])
    expect(assets(cloud()?.plans)).toEqual([200_000, 2])

    // Phone regains focus: it takes the laptop's save instead of pushing its
    // future-stamped copy back.
    loadDevice(phone)
    const putsBefore = calls('PUT').length
    await visit()
    expect(assets(localPlans())).toEqual([200_000, 2])
    expect(calls('PUT')).toHaveLength(putsBefore)

    // And the laptop still has what it saved.
    loadDevice(laptop)
    await visit()
    expect(assets(localPlans())).toEqual([200_000, 2])
    expect(assets(cloud()?.plans)).toEqual([200_000, 2])
  })
})

describe('the selection is per device (finding 6)', () => {
  it('S5: two devices that only differ in the selected plan never rewrite the account', async () => {
    const plans = [plan('plan-base', 1_000, 1), plan('plan-b', 2_000, 2)]
    loadDevice(device(plans, 'plan-base'))
    await visit() // seeds
    const deviceA = snapshotDevice()
    const deviceB = { ...snapshotDevice(), activePlanId: 'plan-b' }
    const putsBefore = calls('PUT').length
    const stored = upstash.data[KEY]

    for (let round = 0; round < 3; round += 1) {
      loadDevice(deviceB)
      expect(await visit()).toBe('synced')
      expect(useSimulationStore.getState().activePlanId).toBe('plan-b')
      loadDevice(deviceA)
      expect(await visit()).toBe('synced')
      expect(useSimulationStore.getState().activePlanId).toBe('plan-base')
    }

    expect(calls('PUT')).toHaveLength(putsBefore)
    expect(upstash.data[KEY]).toBe(stored)
  })

  it('selecting another plan does not write either', async () => {
    loadDevice(device([plan('plan-base', 1_000, 1), plan('plan-b', 2_000, 2)]))
    await startSession()
    const putsBefore = calls('PUT').length

    useSimulationStore.getState().setActivePlan('plan-b')
    await passDebounce()

    expect(calls('PUT')).toHaveLength(putsBefore)
  })
})

describe('a pending push is flushed before the page goes away (finding 7)', () => {
  const start = async () => {
    const dom = installDom()
    loadDevice(device([plan('plan-base', 1_000, 1), plan('plan-b', 2_000, 2)]))
    await startSession()
    expect(trace()).toEqual(['GET 200', 'PUT 200'])
    return dom
  }

  it('pushes on pagehide, with keepalive, without waiting for the debounce', async () => {
    const dom = await start()

    editActivePlan(42)
    // No timer has run: the change is still waiting for its debounce.
    expect(calls('PUT')).toHaveLength(1)

    dom.window.dispatchEvent(new Event('pagehide'))
    await settle()

    expect(calls('PUT')).toHaveLength(2)
    expect(calls('PUT')[1]).toMatchObject({ status: 200, rev: '1', keepalive: true })
    expect(assets(cloud()?.plans)).toEqual([42, 2])

    // The debounce that was pending does not push the same thing again.
    await passDebounce()
    expect(calls('PUT')).toHaveLength(2)
  })

  it('pushes when the tab is hidden', async () => {
    const dom = await start()

    editActivePlan(43)
    dom.document.visibilityState = 'hidden'
    dom.document.dispatchEvent(new Event('visibilitychange'))
    await settle()

    expect(calls('PUT')).toHaveLength(2)
    expect(calls('PUT')[1].keepalive).toBe(true)
    expect(assets(cloud()?.plans)).toEqual([43, 2])
  })

  it('does nothing on pagehide when there is nothing to push', async () => {
    const dom = await start()

    dom.window.dispatchEvent(new Event('pagehide'))
    await settle()

    expect(calls('PUT')).toHaveLength(1)
  })

  it('flushPlanSync() pushes a pending change and resolves once it is stored (sign-out)', async () => {
    await start()

    editActivePlan(44)
    const flushed = flushPlanSync()
    await settle()
    await expect(flushed).resolves.toBeUndefined()

    expect(calls('PUT')).toHaveLength(2)
    expect(assets(cloud()?.plans)).toEqual([44, 2])
  })

  it('flushPlanSync() gives up after its timeout instead of blocking sign-out', async () => {
    await start()
    editActivePlan(45)

    // The push never gets an answer.
    global.fetch = (() => new Promise<Response>(() => {})) as typeof fetch
    let resolved = false
    void flushPlanSync(1_500).then(() => {
      resolved = true
    })
    await settle()
    expect(resolved).toBe(false)

    jest.advanceTimersByTime(1_600)
    await settle()
    expect(resolved).toBe(true)
  })

  it('never flushes from a session that has not pulled', async () => {
    const dom = installDom()
    seedLegacyCloud([plan('plan-x', 6_000, 222_222)])
    const before = upstash.data[KEY]
    loadDevice(device([plan('plan-base', 1_000, 999_999)]))
    failClientPulls = Number.POSITIVE_INFINITY
    await startSession()

    editActivePlan(46)
    dom.window.dispatchEvent(new Event('pagehide'))
    await flushPlanSync()
    await settle()

    expect(api).toHaveLength(0)
    expect(upstash.data[KEY]).toBe(before)
  })

  it('is a no-op when no session is running', async () => {
    await expect(flushPlanSync()).resolves.toBeUndefined()
  })
})

describe('focus', () => {
  it('pulls on focus (throttled) and writes nothing when nothing changed', async () => {
    const dom = installDom()
    loadDevice(device([plan('plan-base', 1_000, 1), plan('plan-b', 2_000, 2)]))
    await startSession()
    expect(trace()).toEqual(['GET 200', 'PUT 200'])

    // Right after the reconcile: throttled.
    dom.window.dispatchEvent(new Event('focus'))
    await settle()
    expect(calls('GET')).toHaveLength(1)

    jest.advanceTimersByTime(11_000)
    dom.window.dispatchEvent(new Event('focus'))
    await settle()
    expect(trace()).toEqual(['GET 200', 'PUT 200', 'GET 200'])
  })

  it('picks up what another device wrote, without writing back', async () => {
    const dom = installDom()
    const shared = [plan('plan-base', 1_000, 1), plan('plan-b', 2_000, 2)]
    loadDevice(device(shared))
    await startSession()

    await writeAsOtherDevice(1, [plan('plan-base', 9_000, 99), shared[1]])
    jest.advanceTimersByTime(11_000)
    dom.window.dispatchEvent(new Event('focus'))
    await settle()
    // The debounce a merge-apply may have armed has nothing left to send.
    await passDebounce()

    expect(assets(localPlans())).toEqual([99, 2])
    expect(trace()).toEqual(['GET 200', 'PUT 200', 'GET 200'])
  })

  it('retries when the browser comes back online', async () => {
    const dom = installDom()
    loadDevice(device([plan('plan-base', 1_000, 1), plan('plan-b', 2_000, 2)]))
    failClientPulls = 1
    expect(await startSession()).toBe('offline')

    dom.window.dispatchEvent(new Event('online'))
    await settle()

    expect(usePlanSyncStore.getState().phase).toBe('synced')
    expect(trace()).toEqual(['GET 200', 'PUT 200'])
  })
})

describe('existing data', () => {
  it('a blob from before this protocol keeps working and is upgraded by the first write', async () => {
    const legacy = [plan('plan-base', 5_000, 111_111), plan('plan-x', 6_000, 222_222)]
    seedLegacyCloud(legacy)
    expect(upstash.data[META]).toBeUndefined()

    // A device that synced these very plans under the old protocol: no base, no tombstones.
    loadDevice(device(legacy))
    expect(await startSession()).toBe('synced')
    // Nothing differed, so nothing was written and no copy was made.
    expect(trace()).toEqual(['GET 200'])
    expect(ids(localPlans())).toEqual(['plan-base', 'plan-x'])

    editActivePlan(333_333)
    await passDebounce()

    expect(trace()).toEqual(['GET 200', 'PUT 200'])
    expect(calls('PUT')[0].rev).toBe('0')
    expect(cloud()).toMatchObject({ schemaVersion: PLAN_SCHEMA_VERSION, rev: 1, deletedPlans: {} })
    expect(upstash.data[META]).toBe(`1:${PLAN_SCHEMA_VERSION}`)
    expect(assets(cloud()?.plans)).toEqual([333_333, 222_222])
  })

  it('a stale copy on a device from before this protocol is replaced, not duplicated', async () => {
    // The account moved on (plan-x edited elsewhere) while this device was away.
    seedLegacyCloud([plan('plan-base', 5_000, 111_111), plan('plan-lx9', 9_000, 222_222)])
    loadDevice(device([plan('plan-base', 5_000, 111_111), plan('plan-lx9', 6_000, 200_000)]))

    await visit()

    expect(ids(localPlans())).toEqual(['plan-base', 'plan-lx9'])
    expect(assets(localPlans())).toEqual([111_111, 222_222])
    expect(calls('PUT')).toHaveLength(0)
  })
})
