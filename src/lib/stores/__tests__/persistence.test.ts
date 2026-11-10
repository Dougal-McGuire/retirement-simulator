/**
 * Local persistence under the conditions a real browser puts it in: several
 * tabs on one storage entry, entries written by other builds, writes that
 * fail. Each "tab" is a fresh instance of the store module on top of one
 * shared storage, with `storage` events delivered to the *other* tabs the way a
 * browser does it — asynchronously, and only when a value really changed.
 */
import { DEFAULT_PARAMS, type Plan, type SimulationParams } from '@/types'
import { PLAN_SCHEMA_VERSION } from '@/lib/plans/schemaVersion'

type StoreModule = typeof import('../simulationStore')
type StorageModule = typeof import('../planStorage')
type SyncModule = typeof import('../planSync')

const STORE_KEY = 'retirement-simulator-store'
const MARKER = 'retirement-simulator-plans-imported'

interface StorageEventLike {
  key: string | null
  oldValue: string | null
  newValue: string | null
}

interface Tab {
  store: StoreModule['useSimulationStore']
  syncFromOtherTabs: StoreModule['syncFromOtherTabs']
  localSave: StorageModule['useLocalSaveStore']
  planSync: SyncModule['usePlanSyncStore']
}

interface StoredEntry {
  version: number
  planSchema?: number
  state: {
    plans: Array<Plan & { params: SimulationParams & Record<string, unknown> }>
    params: SimulationParams
    draftParams: SimulationParams | null
    activePlanId: string
    planSuccessRates: Record<string, number>
  } & Record<string, unknown>
}

function createBrowser(initial: Record<string, string> = {}) {
  const data: Record<string, string> = { ...initial }
  const tabs: Array<{ listeners: Array<(event: StorageEventLike) => void> }> = []
  const pending: Array<() => void> = []
  const writes: Array<{ tab: number; key: string }> = []
  let failWrites = false

  /** Stores a value as `author` (-1: someone outside the tabs) and queues the events. */
  const put = (author: number, key: string, value: string) => {
    const previous = data[key] ?? null
    data[key] = value
    writes.push({ tab: author, key })
    // A browser fires no event when the value did not change.
    if (previous === value) return
    tabs.forEach((tab, index) => {
      if (index === author) return
      pending.push(() =>
        tab.listeners.forEach((listener) => listener({ key, oldValue: previous, newValue: value }))
      )
    })
  }

  const openTab = ({ blocked = false }: { blocked?: boolean } = {}): Tab => {
    const index = tabs.length
    const listeners: Array<(event: StorageEventLike) => void> = []
    tabs.push({ listeners })

    const storage = {
      getItem: (key: string) => data[key] ?? null,
      setItem: (key: string, value: string) => {
        if (failWrites) {
          const error = new Error('The quota has been exceeded.')
          error.name = 'QuotaExceededError'
          throw error
        }
        put(index, key, String(value))
      },
      removeItem: (key: string) => {
        delete data[key]
      },
    }
    const windowStub = {
      addEventListener: (type: string, listener: (event: StorageEventLike) => void) => {
        if (type === 'storage') listeners.push(listener)
      },
      removeEventListener: () => {},
    }
    // Storage that cannot even be opened (blocked site data) throws on access.
    Object.defineProperty(windowStub, 'localStorage', {
      get: () => {
        if (blocked) throw new DOMException('The operation is insecure.', 'SecurityError')
        return storage
      },
    })
    Object.defineProperty(globalThis, 'localStorage', {
      value: blocked ? undefined : storage,
      configurable: true,
      writable: true,
    })
    Object.defineProperty(globalThis, 'window', {
      value: windowStub,
      configurable: true,
      writable: true,
    })

    let tab!: Tab
    jest.isolateModules(() => {
      const storeModule = require('../simulationStore') as StoreModule
      tab = {
        store: storeModule.useSimulationStore,
        syncFromOtherTabs: storeModule.syncFromOtherTabs,
        localSave: (require('../planStorage') as StorageModule).useLocalSaveStore,
        planSync: (require('../planSync') as SyncModule).usePlanSyncStore,
      }
    })
    // No real Monte Carlo runs unless a test asks for one.
    tab.store.setState({ autoRunSuspended: true })
    return tab
  }

  return {
    data,
    openTab,
    /** Another program (an older build's tab, a test) writing the entry. */
    writeFromOutside: (key: string, value: string) => put(-1, key, value),
    setFailWrites: (value: boolean) => {
      failWrites = value
    },
    /** Delivers queued `storage` events until no tab reacts any more. */
    deliver: (limit = 60): number => {
      let delivered = 0
      while (pending.length > 0) {
        if (delivered >= limit) throw new Error('storage events never settle')
        pending.shift()!()
        delivered += 1
      }
      return delivered
    },
    writesTo: (key: string) => writes.filter((write) => write.key === key).length,
    entry: (key = STORE_KEY) => JSON.parse(data[key]) as StoredEntry,
  }
}

const planNames = (tab: Tab) => tab.store.getState().plans.map((plan) => plan.name)

/** Moves the (fake) clock on: plan ids and `updatedAt` come from `Date.now()`. */
const tick = () => jest.advanceTimersByTime(7)

beforeEach(() => {
  jest.useFakeTimers()
})

afterEach(() => {
  jest.runOnlyPendingTimers()
  jest.useRealTimers()
  jest.restoreAllMocks()
  delete (globalThis as { localStorage?: unknown }).localStorage
  delete (globalThis as { window?: unknown }).window
})

describe('two tabs on one storage entry', () => {
  const twoTabs = () => {
    const browser = createBrowser({ [MARKER]: '1' })
    const tabA = browser.openTab()
    const tabB = browser.openTab()
    browser.deliver()
    return { browser, tabA, tabB }
  }

  it('a tab that only recalculates does not erase the plan another tab created', () => {
    const { browser, tabA, tabB } = twoTabs()

    tabB.store.getState().updateParams({ currentAssets: 777_777 })
    tabB.store.getState().savePlanDraft()
    tabB.store.getState().createPlan('Second plan')
    browser.deliver()

    // Tab A does something that calls `set()` — a run starting and landing.
    tabA.store.setState({ isLoading: true })
    tabA.store.setState({ isLoading: false })
    tabA.store.getState().clearResults()
    tabA.store.getState().updateParams({ currentAge: DEFAULT_PARAMS.currentAge + 1 })
    browser.deliver()

    const stored = browser.entry().state.plans
    expect(stored.map((plan) => [plan.name, plan.params.currentAssets])).toEqual([
      ['Base plan', 777_777],
      ['Second plan', 777_777],
    ])

    // Tab B is closed and reopened: its work is still there.
    expect(planNames(browser.openTab())).toEqual(['Base plan', 'Second plan'])
  })

  it("shows the other tab's new plan without a reload", () => {
    const { browser, tabA, tabB } = twoTabs()

    tabB.store.getState().createPlan('Made in tab B')
    expect(planNames(tabA)).toEqual(['Base plan'])
    browser.deliver()

    expect(planNames(tabA)).toEqual(['Base plan', 'Made in tab B'])
    // Each tab keeps its own selection.
    expect(tabA.store.getState().activePlanId).toBe('plan-base')
    expect(tabB.store.getState().activePlanId).not.toBe('plan-base')
  })

  it('merges before writing when its own write comes ahead of the storage event', () => {
    const { browser, tabA, tabB } = twoTabs()

    tabB.store.getState().createPlan('Made in tab B')
    // The event has not been delivered yet: tab A still shows one plan.
    expect(planNames(tabA)).toEqual(['Base plan'])

    tabA.store.getState().updateParams({ currentAssets: 123_456 })

    // Tab A wrote, but not over tab B's plan — and it kept its own draft.
    expect(browser.entry().state.plans.map((plan) => plan.name)).toEqual([
      'Base plan',
      'Made in tab B',
    ])
    expect(planNames(tabA)).toEqual(['Base plan', 'Made in tab B'])
    expect(tabA.store.getState().isDirty).toBe(true)
    expect(tabA.store.getState().params.currentAssets).toBe(123_456)

    browser.deliver()
    expect(planNames(tabB)).toEqual(['Base plan', 'Made in tab B'])
  })

  it('keeps both plans when two tabs create one at the same moment', () => {
    const { browser, tabA, tabB } = twoTabs()

    tabA.store.getState().createPlan('From A')
    tick()
    tabB.store.getState().createPlan('From B')
    browser.deliver()

    expect(planNames(tabA).sort()).toEqual(['Base plan', 'From A', 'From B'])
    expect(planNames(tabB).sort()).toEqual(['Base plan', 'From A', 'From B'])
    expect(
      browser
        .entry()
        .state.plans.map((plan) => plan.name)
        .sort()
    ).toEqual(['Base plan', 'From A', 'From B'])
  })

  it('carries a saved edit into a clean tab and re-runs it there', () => {
    const { browser, tabA, tabB } = twoTabs()

    tabB.store.getState().updateParams({ currentAssets: 900_000 })
    tabB.store.getState().savePlanDraft()
    tabA.store.setState({ pendingRun: false })
    browser.deliver()

    const state = tabA.store.getState()
    expect(state.plans[0].params.currentAssets).toBe(900_000)
    expect(state.params.currentAssets).toBe(900_000)
    expect(state.isDirty).toBe(false)
    expect(state.pendingRun).toBe(true)
  })

  it('never takes an unsaved draft away, whatever the other tab saved or deleted', () => {
    const { browser, tabA, tabB } = twoTabs()
    const secondId = tabB.store.getState().createPlan('Second plan') as string
    browser.deliver()

    // Tab A starts editing the second plan and leaves the edit unsaved.
    tabA.store.getState().setActivePlan(secondId)
    tabA.store.getState().updateParams({ currentAssets: 31_337 })
    browser.deliver()

    // Tab B saves other numbers into that plan, then deletes it.
    tabB.store.getState().updateParams({ currentAssets: 500_000 })
    tabB.store.getState().savePlanDraft()
    browser.deliver()
    expect(tabA.store.getState().isDirty).toBe(true)
    expect(tabA.store.getState().params.currentAssets).toBe(31_337)
    expect(
      tabA.store.getState().plans.find((plan) => plan.id === secondId)?.params.currentAssets
    ).toBe(500_000)

    tabB.store.getState().deletePlan(secondId)
    browser.deliver()

    const state = tabA.store.getState()
    expect(state.activePlanId).toBe(secondId)
    expect(state.isDirty).toBe(true)
    expect(state.params.currentAssets).toBe(31_337)
    expect(state.plans.some((plan) => plan.id === secondId)).toBe(true)
  })

  it('carries a delete into a tab that has nothing unsaved on that plan', () => {
    const { browser, tabA, tabB } = twoTabs()
    const secondId = tabB.store.getState().createPlan('Second plan') as string
    browser.deliver()
    expect(planNames(tabA)).toEqual(['Base plan', 'Second plan'])

    tabB.store.getState().deletePlan(secondId)
    browser.deliver()

    expect(planNames(tabA)).toEqual(['Base plan'])
    expect(planNames(tabB)).toEqual(['Base plan'])
  })

  it('carries the deletion tombstone with it, so a later sync cannot bring the plan back', () => {
    const { browser, tabA, tabB } = twoTabs()
    const secondId = tabB.store.getState().createPlan('Second plan') as string
    browser.deliver()

    tabB.store.getState().deletePlan(secondId)
    browser.deliver()

    const deletedAt = tabB.store.getState().deletedPlans[secondId]
    expect(deletedAt).toBeGreaterThan(0)
    expect(tabA.store.getState().deletedPlans).toEqual({ [secondId]: deletedAt })
  })

  it('keeps the later stamp when both tabs hold sync bookkeeping for a plan', () => {
    const { browser, tabA, tabB } = twoTabs()

    tabA.store.setState({ syncedPlanStamps: { 'plan-base': 2_000 } })
    browser.deliver()
    tabB.store.setState({ syncedPlanStamps: { 'plan-base': 1_000 } })
    browser.deliver()

    expect(tabA.store.getState().syncedPlanStamps).toEqual({ 'plan-base': 2_000 })
    expect(tabB.store.getState().syncedPlanStamps).toEqual({ 'plan-base': 2_000 })
  })

  it('shares the success rate of a plan the other tab simulated', () => {
    const { browser, tabA, tabB } = twoTabs()

    tabB.store.setState({ planSuccessRates: { 'plan-base': 87.5 } })
    browser.deliver()

    expect(tabA.store.getState().planSuccessRates).toEqual({ 'plan-base': 87.5 })
  })

  // No echo. A tab that adopts an entry holding everything it has itself
  // writes nothing; one that has something to add writes once, and the other
  // tab then finds nothing missing. Without that the two would trade entries
  // for ever — `deliver` throws if they do.
  it('settles: adopting a complete entry writes nothing at all', () => {
    const { browser, tabA, tabB } = twoTabs()

    tabB.store.getState().updateParams({ currentAssets: 777_777 })
    tabB.store.getState().savePlanDraft()
    tabB.store.getState().createPlan('Second plan')
    tabB.store.setState({ planSuccessRates: { 'plan-base': 61.2 } })
    const afterAction = browser.writesTo(STORE_KEY)
    const entry = browser.data[STORE_KEY]

    expect(browser.deliver()).toBeGreaterThan(0)
    expect(planNames(tabA)).toEqual(['Base plan', 'Second plan'])
    expect(tabA.store.getState().planSuccessRates).toEqual({ 'plan-base': 61.2 })

    // Nothing is left to say: no events, no writes, the same entry.
    expect(browser.deliver()).toBe(0)
    expect(tabA.syncFromOtherTabs()).toBe(false)
    expect(tabB.syncFromOtherTabs()).toBe(false)
    expect(browser.writesTo(STORE_KEY)).toBe(afterAction)
    expect(browser.data[STORE_KEY]).toBe(entry)

    // Not even the adopting tab's next run writes: nothing of its own changed.
    tabA.store.setState({ isLoading: true })
    tabA.store.setState({ isLoading: false, pendingRun: false })
    expect(browser.writesTo(STORE_KEY)).toBe(afterAction)
  })

  it('settles: a tab with something to add writes once, and the other stays quiet', () => {
    const { browser, tabA, tabB } = twoTabs()

    // Both create a plan before either hears of the other's.
    tabA.store.getState().createPlan('From A')
    tick()
    tabB.store.getState().createPlan('From B')
    const afterActions = browser.writesTo(STORE_KEY)

    expect(browser.deliver()).toBeGreaterThan(0)
    expect(browser.writesTo(STORE_KEY) - afterActions).toBeLessThanOrEqual(1)

    const settled = browser.data[STORE_KEY]
    expect(browser.deliver()).toBe(0)
    expect(tabA.syncFromOtherTabs()).toBe(false)
    expect(tabB.syncFromOtherTabs()).toBe(false)
    expect(browser.data[STORE_KEY]).toBe(settled)
    expect(planNames(tabA).sort()).toEqual(planNames(tabB).sort())
  })

  // The entry holds the plans (shared) and one session: the open plan and the
  // draft on it. A tab in the background must not replace the session of the
  // tab being worked in — a reload there would lose the draft.
  it('leaves the session of the tab being edited on disk when another tab writes', () => {
    const { browser, tabA, tabB } = twoTabs()
    const secondId = tabB.store.getState().createPlan('Second plan') as string
    browser.deliver()

    // Tab A works on the base plan and leaves an unsaved edit.
    tabA.store.getState().updateParams({ currentAssets: 31_337 })
    browser.deliver()
    expect(browser.entry().state.activePlanId).toBe('plan-base')

    // Tab B, on the second plan, finishes a run and renames its plan: both
    // are writes, neither is about what tab A has open.
    tick()
    tabB.store.setState({ planSuccessRates: { [secondId]: 55 } })
    tabB.store.getState().renamePlan(secondId, 'Renamed in B')
    browser.deliver()

    const stored = browser.entry().state
    expect(stored.plans.map((plan) => plan.name)).toEqual(['Base plan', 'Renamed in B'])
    expect(stored.planSuccessRates).toEqual({ [secondId]: 55 })
    expect(stored.activePlanId).toBe('plan-base')
    expect(stored.draftParams?.currentAssets).toBe(31_337)

    // Reloading tab A brings its draft back.
    const reloaded = browser.openTab().store.getState()
    expect(reloaded.activePlanId).toBe('plan-base')
    expect(reloaded.isDirty).toBe(true)
    expect(reloaded.params.currentAssets).toBe(31_337)
    expect(planNames(tabA)).toEqual(['Base plan', 'Renamed in B'])
  })

  it('stores the session of the tab where it changed last', () => {
    const { browser, tabA, tabB } = twoTabs()
    const secondId = tabB.store.getState().createPlan('Second plan') as string
    browser.deliver()

    tabA.store.getState().updateParams({ currentAssets: 31_337 })
    browser.deliver()
    tabB.store.getState().updateParams({ currentAssets: 42_000 })
    browser.deliver()

    const stored = browser.entry().state
    expect(stored.activePlanId).toBe(secondId)
    expect(stored.draftParams?.currentAssets).toBe(42_000)
    // Tab A still has its own draft in memory.
    expect(tabA.store.getState().params.currentAssets).toBe(31_337)
  })

  it('settles with three tabs editing in turn', () => {
    const browser = createBrowser({ [MARKER]: '1' })
    const tabs = [browser.openTab(), browser.openTab(), browser.openTab()]
    browser.deliver()

    tabs.forEach((tab, index) => {
      tick()
      tab.store.getState().createPlan(`Plan ${index}`)
      tab.store.getState().updateParams({ currentAssets: 100_000 * (index + 1) })
      tab.store.getState().savePlanDraft()
    })
    browser.deliver()
    expect(browser.deliver()).toBe(0)

    for (const tab of tabs) {
      expect(planNames(tab).sort()).toEqual(['Base plan', 'Plan 0', 'Plan 1', 'Plan 2'])
    }
  })

  // A tab of a build from before this guard has no storage listener: it still
  // writes the list it loaded. What is missing from that list was not deleted.
  it("does not drop its plans on the word of an older build's tab", () => {
    const browser = createBrowser({ [MARKER]: '1' })
    const tab = browser.openTab()
    tab.store.getState().updateParams({ currentAssets: 700_000 })
    tab.store.getState().savePlanDraft()
    // What the old tab loaded, and will write back: one plan, no stamp.
    const staleEntry = browser.entry()
    delete staleEntry.planSchema

    tab.store.getState().createPlan('Made after the old tab loaded')
    browser.writeFromOutside(STORE_KEY, JSON.stringify(staleEntry))
    expect(browser.entry().state.plans).toHaveLength(1)
    browser.deliver()

    // Kept in memory, and put back on disk without waiting for another edit.
    expect(planNames(tab)).toEqual(['Base plan', 'Made after the old tab loaded'])
    expect(browser.entry().state.plans.map((plan) => plan.name)).toEqual([
      'Base plan',
      'Made after the old tab loaded',
    ])
  })
})

describe('an entry written by a newer build', () => {
  /** A v3 entry as this build writes it, with one saved edit. */
  const currentEntry = (): StoredEntry => {
    const browser = createBrowser({ [MARKER]: '1' })
    const tab = browser.openTab()
    tab.store.getState().updateParams({ currentAssets: 111_111 })
    tab.store.getState().savePlanDraft()
    return browser.entry()
  }

  const newer = (change: (entry: StoredEntry) => void): string => {
    const entry = currentEntry()
    // Fields this build does not know: on a plan's params, and on a cash flow.
    entry.state.plans[0].params.futureParam = 42
    entry.state.plans[0].params.cashFlows = entry.state.plans[0].params.cashFlows.map((flow) => ({
      ...flow,
      futureField: 'kept-by-the-newer-build',
    }))
    change(entry)
    return JSON.stringify(entry)
  }

  it.each([
    ['a higher store version', (entry: StoredEntry) => void (entry.version += 1)],
    [
      'a higher plan schema',
      (entry: StoredEntry) => void (entry.planSchema = PLAN_SCHEMA_VERSION + 1),
    ],
  ])('is never migrated down or written over: %s', (_label, change) => {
    const raw = newer(change)
    const browser = createBrowser({ [MARKER]: '1', [STORE_KEY]: raw })

    // Merely opening the old build …
    const tab = browser.openTab()
    expect(browser.data[STORE_KEY]).toBe(raw)

    // … which still runs, read-only, from what it could read …
    expect(tab.store.persist.hasHydrated()).toBe(true)
    expect(tab.store.getState().plans[0].params.currentAssets).toBe(111_111)
    expect(tab.planSync.getState().reloadNotice).toBe('required')

    // … and no amount of work in it reaches storage.
    tab.store.getState().updateParams({ currentAssets: 5 })
    tab.store.getState().savePlanDraft()
    tab.store.getState().createPlan('Made in the stale tab')
    tab.store.getState().clearResults()
    expect(browser.data[STORE_KEY]).toBe(raw)
    expect(browser.writesTo(STORE_KEY)).toBe(0)
    expect(tab.localSave.getState().problem).toBe('read-only')

    // The work is still there in memory; saving did not throw or get lost.
    expect(tab.store.getState().plans.map((plan) => plan.name)).toEqual([
      'Base plan',
      'Made in the stale tab',
    ])
  })

  it('stops a tab that is already open when the newer build writes', () => {
    const browser = createBrowser({ [MARKER]: '1' })
    const tab = browser.openTab()
    tab.store.getState().updateParams({ currentAssets: 222_222 })
    expect(tab.planSync.getState().reloadNotice).toBeNull()

    const raw = newer((entry) => void (entry.planSchema = PLAN_SCHEMA_VERSION + 1))
    browser.writeFromOutside(STORE_KEY, raw)

    // Its next write happens before the storage event arrives — and is refused.
    tab.store.getState().savePlanDraft()
    expect(browser.data[STORE_KEY]).toBe(raw)
    expect(tab.planSync.getState().reloadNotice).toBe('required')
    expect(tab.localSave.getState().problem).toBe('read-only')

    browser.deliver()
    tab.store.getState().createPlan('Still not stored')
    expect(browser.data[STORE_KEY]).toBe(raw)
  })

  it('asks for a reload as soon as the storage event arrives', () => {
    const browser = createBrowser({ [MARKER]: '1' })
    const tab = browser.openTab()

    browser.writeFromOutside(
      STORE_KEY,
      newer((entry) => void (entry.version += 1))
    )
    browser.deliver()

    expect(tab.planSync.getState().reloadNotice).toBe('required')
  })

  it('stamps what it writes with its own plan schema', () => {
    const entry = currentEntry()

    expect(entry.version).toBe(3)
    expect(entry.planSchema).toBe(PLAN_SCHEMA_VERSION)
  })
})

describe('the legacy import marker', () => {
  // The store used to mirror every plan into `savedSetups`. Without the
  // marker, a lone base plan then always counted as "legacy data to import"
  // and was rebuilt from the params on screen: name reset, draft committed.
  it('missing: a renamed plan with an unsaved draft reloads exactly as it was', () => {
    const seed = createBrowser({ [MARKER]: '1' })
    const tab = seed.openTab()
    tab.store.getState().updateParams({ currentAssets: 123_456 })
    tab.store.getState().savePlanDraft()
    tab.store.getState().renamePlan('plan-base', 'Mein Ruhestand')
    tab.store.getState().updateParams({ currentAssets: 654_321 })
    const before = seed.entry().state.plans[0]

    // Same data, but the marker is gone (an older build, or its write failed).
    const browser = createBrowser({ [STORE_KEY]: seed.data[STORE_KEY] })
    const reopened = browser.openTab().store.getState()

    expect(reopened.plans).toHaveLength(1)
    expect(reopened.plans[0]).toMatchObject({
      id: 'plan-base',
      name: 'Mein Ruhestand',
      updatedAt: before.updatedAt,
    })
    expect(reopened.plans[0].nameKey).toBeUndefined()
    expect(reopened.plans[0].params.currentAssets).toBe(123_456)
    expect(reopened.isDirty).toBe(true)
    expect(reopened.params.currentAssets).toBe(654_321)
    expect(browser.data[MARKER]).toBe('1')
  })

  it('missing, with real pre-plan setups: imported once, and stored right away', () => {
    const browser = createBrowser({
      'retirement-simulator-saved-setups': JSON.stringify([
        { id: 'setup-1', name: 'Old setup', timestamp: 1_710_000_000_000, params: DEFAULT_PARAMS },
      ]),
    })

    const tab = browser.openTab()
    expect(planNames(tab)).toEqual(['Base plan', 'Old setup'])
    expect(browser.data[MARKER]).toBe('1')
    // The marker says "imported", so the imported plan is on disk too.
    expect(browser.entry().state.plans.map((plan) => plan.name)).toEqual(['Base plan', 'Old setup'])

    // Deleted afterwards, it stays deleted.
    tab.store.getState().deletePlan('setup-1')
    expect(planNames(browser.openTab())).toEqual(['Base plan'])
  })
})

describe('a stored draft whose plan is gone', () => {
  it('is not applied to another plan', () => {
    const seed = createBrowser({ [MARKER]: '1' })
    const tab = seed.openTab()
    const secondId = tab.store.getState().createPlan('Second plan') as string
    tab.store.getState().updateParams({ currentAssets: 31_337 })
    const entry = seed.entry()
    expect(entry.state.activePlanId).toBe(secondId)
    // Another tab deleted the plan; its write left this session part alone.
    entry.state.plans = entry.state.plans.filter((plan) => plan.id !== secondId)

    const browser = createBrowser({ [MARKER]: '1', [STORE_KEY]: JSON.stringify(entry) })
    const reopened = browser.openTab().store.getState()

    expect(reopened.activePlanId).toBe('plan-base')
    expect(reopened.isDirty).toBe(false)
    expect(reopened.params.currentAssets).toBe(DEFAULT_PARAMS.currentAssets)
  })
})

describe('writes that fail', () => {
  it('never throw out of an action, and nothing stays half-done', async () => {
    jest.useRealTimers()
    const browser = createBrowser({ [MARKER]: '1' })
    const tab = browser.openTab()
    const store = tab.store
    store.getState().updateParams({ currentAssets: 5 })

    browser.setFailWrites(true)

    expect(() => store.getState().savePlanDraft()).not.toThrow()
    expect(store.getState().plans[0].params.currentAssets).toBe(5)
    expect(store.getState().isDirty).toBe(false)
    expect(tab.localSave.getState().problem).toBe('write-failed')

    await expect(store.getState().runSimulation()).resolves.toBeUndefined()
    expect(store.getState().isLoading).toBe(false)
    expect(store.getState().results?.params.currentAssets).toBe(5)

    // Storage works again: the next change stores everything, and says so.
    browser.setFailWrites(false)
    store.getState().renamePlan('plan-base', 'Saved after all')
    expect(tab.localSave.getState().problem).toBeNull()
    expect(browser.entry().state.plans[0]).toMatchObject({
      name: 'Saved after all',
      params: { currentAssets: 5 },
    })
    jest.useFakeTimers()
  })

  it('leave the store working in memory when storage cannot even be opened', () => {
    const browser = createBrowser()
    const tab = browser.openTab({ blocked: true })

    expect(tab.store.persist.hasHydrated()).toBe(true)
    expect(() => tab.store.getState().createPlan('In memory only')).not.toThrow()
    expect(planNames(tab)).toEqual(['Base plan', 'In memory only'])
    expect(tab.localSave.getState().problem).toBe('write-failed')
  })
})

describe('what is stored', () => {
  it('keeps results out of storage and writes once per edit', async () => {
    jest.useRealTimers()
    const browser = createBrowser({ [MARKER]: '1' })
    const { store } = browser.openTab()
    store.setState({ autoRunSuspended: false })

    await store.getState().runSimulation()
    expect(store.getState().results).not.toBeNull()
    expect(browser.entry().state).not.toHaveProperty('results')
    // Results alone were 56 KB of a 62 KB entry.
    expect(browser.data[STORE_KEY].length).toBeLessThan(8_000)

    const before = browser.writesTo(STORE_KEY)
    store.getState().updateParams({ currentAssets: 640_000 })
    await new Promise((resolve) => setTimeout(resolve, 150))
    while (store.getState().isLoading || store.getState().pendingRun) {
      await new Promise((resolve) => setTimeout(resolve, 20))
    }

    expect(store.getState().results?.params.currentAssets).toBe(640_000)
    // The edit itself. The run starting and landing change nothing stored.
    expect(browser.writesTo(STORE_KEY) - before).toBe(1)
    jest.useFakeTimers()
  })

  it('writes nothing for opening a page and running it', () => {
    const seed = createBrowser({ [MARKER]: '1' })
    seed.openTab().store.getState().updateParams({ currentAssets: 640_000 })

    const browser = createBrowser({ [MARKER]: '1', [STORE_KEY]: seed.data[STORE_KEY] })
    const { store } = browser.openTab()
    store.setState({ isLoading: true, error: null, pendingRun: false })
    store.setState({ isLoading: false, resultsComputedAt: Date.now() })

    expect(browser.writesTo(STORE_KEY)).toBe(0)
    expect(browser.data[STORE_KEY]).toBe(seed.data[STORE_KEY])
  })

  it('recomputes on load instead of reading results back', () => {
    const browser = createBrowser({ [MARKER]: '1' })
    browser.openTab().store.getState().updateParams({ currentAssets: 640_000 })
    const entry = browser.entry()
    // An entry from before results left storage.
    entry.state.results = { successRate: 12, params: entry.state.params }
    browser.data[STORE_KEY] = JSON.stringify(entry)

    expect(browser.openTab().store.getState().results).toBeNull()
  })

  // The contract the sync lane builds on: a field added to the store is
  // persisted and restored without being listed anywhere.
  it('stores and restores a field the store gains later', () => {
    const browser = createBrowser({ [MARKER]: '1' })
    const tab = browser.openTab()

    // Recent, because hydration drops tombstones past their retention.
    const deletedAt = Date.now() - 60_000
    tab.store.setState({ deletedPlans: { 'plan-gone': deletedAt } })

    expect(browser.entry().state.deletedPlans).toEqual({ 'plan-gone': deletedAt })
    expect(browser.openTab().store.getState().deletedPlans).toEqual({ 'plan-gone': deletedAt })
  })

  it('stores neither run state nor actions', () => {
    const browser = createBrowser({ [MARKER]: '1' })
    browser.openTab().store.getState().updateParams({ currentAssets: 640_000 })

    expect(Object.keys(browser.entry().state).sort()).toEqual([
      'activePlanId',
      'calcVersion',
      'deletedPlans',
      'draftParams',
      'params',
      'planSuccessRates',
      'plans',
      'ratesBeforeCalcChange',
      'syncedPlanStamps',
    ])
  })
})

describe('rates remembered by an older calculation', () => {
  /** An entry as a build from before `calcVersion` left it. */
  const oldEntry = (rates: Record<string, number>) => {
    const browser = createBrowser({ [MARKER]: '1' })
    const first = browser.openTab()
    first.store.getState().updateParams({ currentAssets: 640_000 })
    first.store.getState().savePlanDraft()
    const entry = browser.entry()
    delete entry.state.calcVersion
    delete entry.state.ratesBeforeCalcChange
    entry.state.planSuccessRates = rates
    browser.data[STORE_KEY] = JSON.stringify(entry)
    return { browser, planId: entry.state.activePlanId }
  }

  it('are set aside for the notice instead of being shown as current', () => {
    const { browser, planId } = oldEntry({})
    const withRates = browser.entry()
    withRates.state.planSuccessRates = { [planId]: 95 }
    browser.data[STORE_KEY] = JSON.stringify(withRates)

    const state = browser.openTab().store.getState()
    expect(state.planSuccessRates).toEqual({})
    expect(state.ratesBeforeCalcChange).toEqual({ [planId]: 95 })
  })

  it('raise no notice when the entry never remembered a rate', () => {
    const { browser } = oldEntry({})
    expect(browser.openTab().store.getState().ratesBeforeCalcChange).toBeNull()
  })

  it('stay set aside over a reload until the notice is dismissed, then stay gone', () => {
    const { browser, planId } = oldEntry({})
    const withRates = browser.entry()
    withRates.state.planSuccessRates = { [planId]: 95 }
    browser.data[STORE_KEY] = JSON.stringify(withRates)

    const tab = browser.openTab()
    // The engine's number for the plan arrives and is stored with the version.
    tab.store.setState({ planSuccessRates: { [planId]: 82 } })
    expect(browser.entry().state.calcVersion).toBe(2)

    const reloaded = browser.openTab()
    expect(reloaded.store.getState().planSuccessRates).toEqual({ [planId]: 82 })
    expect(reloaded.store.getState().ratesBeforeCalcChange).toEqual({ [planId]: 95 })

    reloaded.store.getState().dismissCalcNotice()
    browser.deliver()
    expect(browser.openTab().store.getState().ratesBeforeCalcChange).toBeNull()
    // Dismissed in one tab is dismissed in the others.
    expect(tab.store.getState().ratesBeforeCalcChange).toBeNull()
    expect(tab.store.getState().planSuccessRates).toEqual({ [planId]: 82 })
  })

  it('are not adopted from a tab that still runs the older build', () => {
    const browser = createBrowser({ [MARKER]: '1' })
    const tab = browser.openTab()
    tab.store.getState().updateParams({ currentAssets: 640_000 })
    tab.store.getState().savePlanDraft()
    const planId = tab.store.getState().activePlanId
    tab.store.setState({ planSuccessRates: { [planId]: 82 } })

    const theirs = browser.entry()
    delete theirs.state.calcVersion
    delete theirs.state.ratesBeforeCalcChange
    theirs.state.planSuccessRates = { [planId]: 95 }
    browser.writeFromOutside(STORE_KEY, JSON.stringify(theirs))
    browser.deliver()

    expect(tab.store.getState().planSuccessRates).toEqual({ [planId]: 82 })
    expect(browser.entry().state.planSuccessRates).toEqual({ [planId]: 82 })
  })
})
