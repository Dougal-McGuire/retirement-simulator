/**
 * The sync loop (`startPlanCloudSync`) against the schema guard: once
 * `/api/plans` answers `409 outdated-client`, this tab must never push (or
 * pull) again — while local edits keep landing in the store. A server that is
 * merely *older* (`409 outdated-server`) pauses the tab instead, without a
 * reload notice, until a later focus finds it rolled forward again.
 */

import { DEFAULT_PARAMS, type Plan } from '@/types'
import { makePlan } from '@/lib/stores/plans'
import { useSimulationStore } from '@/lib/stores/simulationStore'
import { isSchemaBlocked, resetCloudProbe, usePlanSyncStore } from '@/lib/stores/planSync'
import { startPlanCloudSync } from '@/components/auth/PlanCloudSync'

const plan = (id: string, updatedAt: number, currentAge = DEFAULT_PARAMS.currentAge): Plan =>
  makePlan({ id, name: id, params: { ...DEFAULT_PARAMS, currentAge }, createdAt: 100, updatedAt })

const pristine = useSimulationStore.getInitialState()

/** Two plans: a workspace with real work in it, so the reconcile seeds (pushes). */
const resetStore = () => {
  const plans = [plan('plan-base', 1_000), plan('plan-b', 2_000)]
  useSimulationStore.setState({
    ...pristine,
    plans,
    activePlanId: 'plan-base',
    params: plans[0].params,
    draftParams: null,
    isDirty: false,
    // Keeps `requestRun()` from starting a real Monte Carlo run in the test.
    autoRunSuspended: true,
  })
}

/** Edits a saved plan, which is what the loop pushes on. */
const editPlans = (currentAge: number) => {
  const { plans } = useSimulationStore.getState()
  useSimulationStore.setState({
    plans: plans.map((entry, index) =>
      index === 0
        ? { ...entry, params: { ...entry.params, currentAge }, updatedAt: entry.updatedAt + 1 }
        : entry
    ),
  })
}

const respond = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

/** An empty account, and writes that count the revision up. */
const healthyServer = () => {
  let rev = 0
  return async (_url: string, init: RequestInit) => {
    if (init.method === 'PUT') {
      rev += 1
      return respond(200, { configured: true, rev, updatedAt: 5 })
    }
    return respond(200, { configured: true, rev, blob: null })
  }
}

/**
 * Lets the loop's promise chain settle. Reading a real `Response` body needs
 * a few event-loop turns, hence `setImmediate` (left unfaked below).
 */
const settle = async () => {
  for (let index = 0; index < 20; index += 1) {
    await new Promise((resolve) => setImmediate(resolve))
  }
}

const originalFetch = global.fetch
let stop: (() => void) | null = null

beforeEach(() => {
  jest.useFakeTimers({ doNotFake: ['setImmediate', 'nextTick', 'queueMicrotask'] })
  jest.spyOn(console, 'warn').mockImplementation(() => {})
  resetCloudProbe()
  usePlanSyncStore.setState({ phase: 'disabled', lastSyncedAt: null, reloadNotice: null })
  resetStore()
})

afterEach(() => {
  stop?.()
  stop = null
  jest.useRealTimers()
  jest.restoreAllMocks()
  global.fetch = originalFetch
  delete (globalThis as { window?: unknown }).window
  delete (globalThis as { document?: unknown }).document
})

const methods = (fetchMock: jest.Mock): string[] =>
  fetchMock.mock.calls.map(([, init]) => String((init as RequestInit).method))

describe('startPlanCloudSync and the schema guard', () => {
  it('control: with a current server, a plan edit is pushed after the debounce', async () => {
    const fetchMock = jest.fn().mockImplementation(healthyServer())
    global.fetch = fetchMock as unknown as typeof fetch

    stop = startPlanCloudSync()
    await settle()
    expect(methods(fetchMock)).toEqual(['GET', 'PUT'])
    expect(usePlanSyncStore.getState().phase).toBe('synced')

    editPlans(50)
    await jest.advanceTimersByTimeAsync(5_000)
    await settle()
    expect(methods(fetchMock)).toEqual(['GET', 'PUT', 'PUT'])
  })

  it('stops pushing for good after a 409 on PUT', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation(async (_url: string, init: RequestInit) =>
        init.method === 'PUT'
          ? respond(409, { error: 'outdated-client', schemaVersion: 99 })
          : respond(200, { configured: true, rev: 0, blob: null })
      )
    global.fetch = fetchMock as unknown as typeof fetch

    stop = startPlanCloudSync()
    await settle()
    expect(methods(fetchMock)).toEqual(['GET', 'PUT'])
    expect(usePlanSyncStore.getState().phase).toBe('outdated')
    expect(usePlanSyncStore.getState().reloadNotice).toBe('required')

    // Local edits still land in the store …
    editPlans(51)
    editPlans(52)
    expect(useSimulationStore.getState().plans[0].params.currentAge).toBe(52)
    await jest.advanceTimersByTimeAsync(60_000)
    await settle()

    // … but never reach the server again, not even from a fresh sync session
    // (a namespace switch in the same tab).
    stop()
    stop = startPlanCloudSync()
    await settle()
    editPlans(53)
    await jest.advanceTimersByTimeAsync(60_000)
    await settle()

    expect(methods(fetchMock)).toEqual(['GET', 'PUT'])
    expect(usePlanSyncStore.getState().phase).toBe('outdated')
  })

  it('never merges or applies a blob after a 409 on GET', async () => {
    const remotePlans = [plan('from-newer-build', 9_000, 61)]
    const fetchMock = jest
      .fn()
      .mockImplementation(async (_url: string, init: RequestInit) =>
        init.method === 'GET'
          ? respond(409, { error: 'outdated-client', blob: { plans: remotePlans } })
          : respond(200, { configured: true, rev: 1, updatedAt: 5 })
      )
    global.fetch = fetchMock as unknown as typeof fetch

    stop = startPlanCloudSync()
    await settle()

    editPlans(54)
    await jest.advanceTimersByTimeAsync(60_000)
    await settle()

    expect(methods(fetchMock)).toEqual(['GET'])
    expect(useSimulationStore.getState().plans.map((entry) => entry.id)).toEqual([
      'plan-base',
      'plan-b',
    ])
    expect(usePlanSyncStore.getState().phase).toBe('outdated')
  })
})

describe('startPlanCloudSync and a server that runs an older version', () => {
  const installDom = () => {
    const windowTarget = new EventTarget()
    Object.defineProperty(globalThis, 'window', { value: windowTarget, configurable: true })
    Object.defineProperty(globalThis, 'document', {
      value: Object.assign(new EventTarget(), { visibilityState: 'visible' }),
      configurable: true,
    })
    return windowTarget
  }

  it('pauses without a reload notice, pushes nothing, and resumes on a later focus', async () => {
    const page = installDom()
    let rolledBack = true
    const healthy = healthyServer()
    const fetchMock = jest
      .fn()
      .mockImplementation(async (url: string, init: RequestInit) =>
        rolledBack
          ? respond(409, {
              error: 'outdated-server',
              schemaVersion: 2,
              blob: { plans: [plan('x', 1)] },
            })
          : healthy(url, init)
      )
    global.fetch = fetchMock as unknown as typeof fetch

    stop = startPlanCloudSync()
    await settle()

    expect(methods(fetchMock)).toEqual(['GET'])
    expect(usePlanSyncStore.getState().phase).toBe('server-outdated')
    // Reloading would load the same build again: the user is not asked to.
    expect(usePlanSyncStore.getState().reloadNotice).toBeNull()
    // And the block is not for the life of the page.
    expect(isSchemaBlocked()).toBe(false)

    // Local edits keep working, and cause no request while the server is behind.
    editPlans(51)
    editPlans(52)
    await jest.advanceTimersByTimeAsync(60_000)
    await settle()
    expect(methods(fetchMock)).toEqual(['GET'])
    expect(useSimulationStore.getState().plans.map((entry) => entry.id)).toEqual([
      'plan-base',
      'plan-b',
    ])

    // Still rolled back at the next focus: asked once, still paused.
    page.dispatchEvent(new Event('focus'))
    await settle()
    expect(methods(fetchMock)).toEqual(['GET', 'GET'])
    expect(usePlanSyncStore.getState().phase).toBe('server-outdated')

    // Rolled forward again: the focus after that pulls, merges and pushes.
    rolledBack = false
    await jest.advanceTimersByTimeAsync(11_000)
    page.dispatchEvent(new Event('focus'))
    await settle()
    expect(methods(fetchMock)).toEqual(['GET', 'GET', 'GET', 'PUT'])
    expect(usePlanSyncStore.getState().phase).toBe('synced')
  })

  it('pauses the same way when the rollback is discovered by a push', async () => {
    installDom()
    let rolledBack = false
    const healthy = healthyServer()
    const fetchMock = jest
      .fn()
      .mockImplementation(async (url: string, init: RequestInit) =>
        rolledBack
          ? respond(409, { error: 'outdated-server', schemaVersion: 2 })
          : healthy(url, init)
      )
    global.fetch = fetchMock as unknown as typeof fetch

    stop = startPlanCloudSync()
    await settle()
    expect(usePlanSyncStore.getState().phase).toBe('synced')

    rolledBack = true
    editPlans(60)
    await jest.advanceTimersByTimeAsync(5_000)
    await settle()
    expect(methods(fetchMock)).toEqual(['GET', 'PUT', 'PUT'])
    expect(usePlanSyncStore.getState().phase).toBe('server-outdated')
    expect(usePlanSyncStore.getState().reloadNotice).toBeNull()

    editPlans(61)
    await jest.advanceTimersByTimeAsync(60_000)
    await settle()
    expect(methods(fetchMock)).toEqual(['GET', 'PUT', 'PUT'])
  })
})

describe('build id hint', () => {
  it('suggests a reload when the server reports another build, and keeps syncing', async () => {
    const previous = process.env.NEXT_PUBLIC_BUILD_ID
    process.env.NEXT_PUBLIC_BUILD_ID = 'client-build'
    try {
      await jest.isolateModulesAsync(async () => {
        const sync = await import('@/lib/stores/planSync')
        const fetchMock = jest.fn().mockImplementation(
          async () =>
            new Response(JSON.stringify({ configured: true, rev: 0, blob: null }), {
              status: 200,
              headers: { 'Content-Type': 'application/json', 'x-build-id': 'server-build' },
            })
        )
        global.fetch = fetchMock as unknown as typeof fetch

        await expect(sync.fetchRemoteSnapshot()).resolves.toEqual({
          status: 'ok',
          blob: null,
          rev: 0,
        })
        expect(sync.usePlanSyncStore.getState().reloadNotice).toBe('suggested')
        expect(sync.isSchemaBlocked()).toBe(false)
        await sync.fetchRemoteSnapshot()
        expect(fetchMock).toHaveBeenCalledTimes(2)
      })
    } finally {
      if (previous === undefined) delete process.env.NEXT_PUBLIC_BUILD_ID
      else process.env.NEXT_PUBLIC_BUILD_ID = previous
    }
  })

  it('stays quiet when the builds match or either id is unknown', async () => {
    const { isDifferentBuild } = await import('@/lib/plans/schemaVersion')
    expect(isDifferentBuild('abc', 'abc')).toBe(false)
    expect(isDifferentBuild(null, 'abc')).toBe(false)
    expect(isDifferentBuild('abc', '')).toBe(false)
    expect(isDifferentBuild('abc', 'def')).toBe(true)
  })
})
