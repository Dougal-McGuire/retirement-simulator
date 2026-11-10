/**
 * The sync bookkeeping (`deletedPlans`, `syncedPlanStamps`) survives a reload.
 *
 * Both live in the persisted store on purpose: a tombstone that is forgotten
 * when the tab closes lets the next sync bring the deleted plan back, and a
 * sync base that is forgotten turns every stale plan into a "conflict".
 */

import { DEFAULT_PARAMS } from '@/types'

type StoreModule = typeof import('@/lib/stores/simulationStore')

const STORE_KEY = 'retirement-simulator-store'
const MARKER = 'retirement-simulator-plans-imported'

function createStorage(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial }
  return {
    data,
    api: {
      getItem: (key: string) => data[key] ?? null,
      setItem: (key: string, value: string) => {
        data[key] = String(value)
      },
      removeItem: (key: string) => {
        delete data[key]
      },
    },
  }
}

/** A "tab": a fresh module instance of the store on top of a shared storage. */
function openTab(storage: ReturnType<typeof createStorage>): StoreModule {
  Object.defineProperty(globalThis, 'localStorage', {
    value: storage.api,
    configurable: true,
    writable: true,
  })
  Object.defineProperty(globalThis, 'window', {
    value: { localStorage: storage.api },
    configurable: true,
    writable: true,
  })
  let mod!: StoreModule
  jest.isolateModules(() => {
    mod = require('@/lib/stores/simulationStore') as StoreModule
  })
  return mod
}

const persisted = (storage: ReturnType<typeof createStorage>) =>
  (JSON.parse(storage.data[STORE_KEY]) as { state: Record<string, unknown> }).state

beforeEach(() => {
  jest.useFakeTimers()
  jest.spyOn(console, 'log').mockImplementation(() => {})
})

afterEach(() => {
  jest.runOnlyPendingTimers()
  jest.useRealTimers()
  jest.restoreAllMocks()
  delete (globalThis as { localStorage?: unknown }).localStorage
  delete (globalThis as { window?: unknown }).window
})

describe('sync bookkeeping in the persisted store', () => {
  it('writes a deletion to storage and finds it again after a reload', () => {
    jest.setSystemTime(1_800_000_000_000)
    const storage = createStorage({ [MARKER]: '1' })
    const store = openTab(storage).useSimulationStore
    store.setState({ autoRunSuspended: true })

    const secondId = store.getState().createPlan('Second plan', DEFAULT_PARAMS, { activate: false })
    expect(secondId).not.toBeNull()
    store.getState().deletePlan(secondId as string)

    expect(persisted(storage).deletedPlans).toEqual({ [secondId as string]: 1_800_000_000_000 })

    const reopened = openTab(storage).useSimulationStore.getState()
    expect(reopened.plans).toHaveLength(1)
    expect(reopened.deletedPlans).toEqual({ [secondId as string]: 1_800_000_000_000 })
  })

  it('keeps the sync base across a reload', () => {
    const storage = createStorage({ [MARKER]: '1' })
    const store = openTab(storage).useSimulationStore
    store.setState({ autoRunSuspended: true })

    // What the sync loop records after a pull or an acknowledged push.
    store.getState().applySyncedPlans(store.getState().plans, store.getState().activePlanId, {
      syncedPlanStamps: { 'plan-base': 4_242 },
      deletedPlans: { 'plan-gone': Date.now() - 1_000 },
    })

    const reopened = openTab(storage).useSimulationStore.getState()
    expect(reopened.syncedPlanStamps).toEqual({ 'plan-base': 4_242 })
    expect(Object.keys(reopened.deletedPlans)).toEqual(['plan-gone'])
  })

  it('reads a store persisted before the bookkeeping existed as "nothing synced, nothing deleted"', () => {
    const seed = createStorage({ [MARKER]: '1' })
    const first = openTab(seed).useSimulationStore
    first.setState({ autoRunSuspended: true })
    first.getState().updateParams({ currentAssets: 123_456 })
    first.getState().savePlanDraft()

    const old = JSON.parse(seed.data[STORE_KEY]) as { state: Record<string, unknown> }
    delete old.state.deletedPlans
    delete old.state.syncedPlanStamps
    const storage = createStorage({ [MARKER]: '1', [STORE_KEY]: JSON.stringify(old) })

    const reopened = openTab(storage).useSimulationStore.getState()
    expect(reopened.plans[0].params.currentAssets).toBe(123_456)
    expect(reopened.deletedPlans).toEqual({})
    expect(reopened.syncedPlanStamps).toEqual({})
  })
})
