import {
  createContext,
  createElement,
  useContext,
  useDeferredValue,
  useMemo,
  type ReactNode,
} from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  SimulationParams,
  SimulationResults,
  SimulationStore,
  SavedSetup,
  DEFAULT_PARAMS,
  MAX_PLANS,
  type Plan,
  type PlanSyncMeta,
} from '@/types'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import { canUseWorker, runSimulationInClient } from '@/lib/simulation/workerClient'
import { areSimulationParamsEqual } from '@/lib/simulation/planInsights'
import { CALC_VERSION } from '@/lib/simulation/calcVersion'
import {
  projectCustomExpenses,
  projectOneTimeIncomes,
  reconcileCashFlows,
  sanitizeCashFlows,
  statutoryPensionMonthly,
} from '@/lib/simulation/cashFlows'
import {
  bootstrapPlans,
  createPlanId,
  DEFAULT_PLAN_ID,
  DEFAULT_PLAN_NAME,
  DEFAULT_PLAN_NAME_KEY,
  makePlan,
  mergePlanLists,
  nextPlanStamp,
  normalizePlans,
  sanitizePlanStamps,
  sanitizePlanTombstones,
  uniquePlanName,
  withPlanTombstone,
} from '@/lib/stores/plans'
import {
  BASE_PLANS_IMPORTED_KEY,
  BASE_SAVED_SETUPS_KEY,
  BASE_STORE_KEY,
  storageKey,
} from '@/lib/stores/persistenceKey'
import {
  isRecord,
  normalizePersistedParams,
  sanitizeCustomExpenses,
  sanitizeOneTimeIncomes,
} from '@/lib/stores/normalizeParams'
import { PLAN_SCHEMA_VERSION } from '@/lib/plans/schemaVersion'
import { createPlanStorage, type ForeignChange } from '@/lib/stores/planStorage'
import { usePlanSyncStore } from '@/lib/stores/planSync'

// Re-exported so the many existing importers (and `paramRegistration.test.ts`)
// keep resolving it here; the implementation now lives in a store-free module
// that the server-side plan store can share. See `./normalizeParams`.
export { normalizePersistedParams }

/**
 * v0: params + savedSetups.
 * v1: first-class plans.
 * v2: plans are durable; edits live in a working copy (`draftParams`).
 * v3: unified `cashFlows`; `customExpenses`/`oneTimeIncomes` become projections.
 *
 * Still 3 after `results` left the entry and the plan-schema stamp arrived:
 * neither needs a migration. A v3 entry that still carries results simply has
 * them ignored on load (`hydrateState`), and the stamp sits next to `version`
 * in the entry, outside the state. A bump would buy nothing either — builds
 * from before the guard rewrite any entry at their own version regardless.
 *
 * An entry with a *higher* version (or plan schema) than this build's was
 * written by a newer build. It is never migrated down or written over: see
 * `migrate` below and `./planStorage`.
 */
const STORE_VERSION = 3

/**
 * State that lives in memory only: the run state, the results (recomputed on
 * load — the engine is seeded, so the same plan gives the same numbers) and
 * `isDirty`, which loading derives from the draft.
 *
 * Everything else in the store is persisted, *including fields added later*:
 * a new persisted field needs no change here, only a line in `hydrateState`
 * if what comes back from storage must be sanitized.
 */
const TRANSIENT_FIELDS: ReadonlySet<string> = new Set<keyof SimulationStore>([
  'isDirty',
  'results',
  'resultsComputedAt',
  'isLoading',
  'error',
  'autoRunSuspended',
  'pendingRun',
])

type PersistedState = Partial<SimulationStore>

const toPersistedState = (state: SimulationStore): PersistedState => {
  const persisted: Record<string, unknown> = {}
  for (const [field, value] of Object.entries(state)) {
    if (typeof value !== 'function' && !TRANSIENT_FIELDS.has(field)) persisted[field] = value
  }
  return persisted as PersistedState
}

const normalizeSavedSetups = (value: unknown): SavedSetup[] => {
  if (!Array.isArray(value)) return []

  return value
    .map((entry) => {
      if (!isRecord(entry)) return null

      const { id, name, timestamp, params } = entry
      if (
        typeof id !== 'string' ||
        id.trim() === '' ||
        typeof name !== 'string' ||
        typeof timestamp !== 'number' ||
        !Number.isFinite(timestamp)
      ) {
        return null
      }

      return {
        id,
        name,
        timestamp,
        params: normalizePersistedParams(params),
      }
    })
    .filter((setup): setup is SavedSetup => setup !== null)
}

const normalizeParamsForFingerprint = (params: Partial<SimulationParams>): SimulationParams => ({
  ...DEFAULT_PARAMS,
  ...params,
  oneTimeIncomes: sanitizeOneTimeIncomes(params.oneTimeIncomes),
  customExpenses: sanitizeCustomExpenses(params.customExpenses),
  cashFlows: sanitizeCashFlows(params.cashFlows),
})

const getParamsFingerprint = (params: Partial<SimulationParams>) =>
  JSON.stringify(normalizeParamsForFingerprint(params))

const paramsDiffer = (a: SimulationParams, b: SimulationParams) =>
  getParamsFingerprint(a) !== getParamsFingerprint(b)

/** A stored `id → number` map (success rates), minus anything that is not one. */
const sanitizeNumberMap = (value: unknown): Record<string, number> => {
  if (!isRecord(value)) return {}
  const sanitized: Record<string, number> = {}
  Object.entries(value).forEach(([id, entry]) => {
    if (typeof entry === 'number' && Number.isFinite(entry)) sanitized[id] = entry
  })
  return sanitized
}

/**
 * Starts a run and returns its result.
 *
 * On the worker the job is posted before this returns, so the `isLoading`
 * render the caller triggers next overlaps the computation instead of
 * delaying it (the §7 edit → result-bar budget). Without a worker (server,
 * tests, old browsers) the engine runs on the main thread after a macrotask,
 * so the "running" state can paint before the engine blocks.
 */
const startSimulation = (params: SimulationParams): Promise<SimulationResults> => {
  if (canUseWorker()) return runSimulationInClient(params)

  return new Promise<SimulationResults>((resolve, reject) => {
    setTimeout(() => {
      try {
        resolve(runMonteCarloSimulation(params))
      } catch (err) {
        reject(err)
      }
    }, 0)
  })
}

// ---- Persistence ------------------------------------------------------------

/** False while the store is being created; storage callbacks must wait for it. */
let storeReady = false

/**
 * The part of the entry that is one tab's session — which plan is open, and
 * the working copy on it — as opposed to the plans every tab shares. A tab
 * only writes it when it changed in that tab (see `./planStorage`).
 */
const SESSION_FIELDS = ['activePlanId', 'params', 'draftParams'] as const satisfies ReadonlyArray<
  keyof SimulationStore
>

/**
 * Where the store entry lives. Refuses to write over an entry from a newer
 * build, never writes over another tab's entry unseen, and never throws — see
 * `./planStorage`. `undefined` on the server, where nothing is persisted.
 */
const planStorage = createPlanStorage<PersistedState>({
  storeVersion: STORE_VERSION,
  planSchema: PLAN_SCHEMA_VERSION,
  sessionFields: SESSION_FIELDS,
  // The notice the cloud schema guard raises, for the same reason: this tab
  // runs an older build than the data it found, and only a reload fixes that.
  onReadOnly: () => usePlanSyncStore.getState().requestReload('required'),
  onForeignChange: (change) => storeReady && adoptForeignChange(change).changed,
  snapshot: () => toPersistedState(currentState()),
})

/**
 * The store's state. A declared return type, so that code above the store
 * (its own storage options) can read it without the store's type depending
 * on itself.
 */
function currentState(): SimulationStore {
  return useSimulationStore.getState()
}

/** A raw localStorage entry next to the store's own; absent when unreadable. */
const readStorageKey = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

/**
 * Pre-plan saved setups for the one-time import: the standalone legacy key if
 * it holds any, else what a v0 store entry carried. Only ever read — nothing
 * writes setups any more.
 */
const readLegacySetups = (fromEntry: unknown): SavedSetup[] => {
  const stored = readStorageKey(storageKey(BASE_SAVED_SETUPS_KEY))
  if (stored) {
    try {
      return normalizeSavedSetups(JSON.parse(stored) as unknown)
    } catch (error) {
      console.error('Failed to load saved setups:', error)
    }
  }
  return normalizeSavedSetups(fromEntry)
}

/** Set by `migrate`: the entry being loaded was written by an older version. */
let upgradingEntry = false

/** Set when a legacy import created plans that have not reached storage yet. */
let flushAfterHydration = false

/**
 * `persist`'s merge step: turns whatever storage held into the state the store
 * runs on. Runs on every (re)hydration, also when storage is empty.
 */
const hydrateState = (persisted: unknown, current: SimulationStore): SimulationStore => {
  const currentFields = current as unknown as Record<string, unknown>
  const stored: Record<string, unknown> = {}
  if (isRecord(persisted)) {
    for (const [field, value] of Object.entries(persisted)) {
      // What is not written is not read back either (entries from before
      // results left storage still carry them), and data never replaces an
      // action.
      if (TRANSIENT_FIELDS.has(field) || typeof currentFields[field] === 'function') continue
      stored[field] = value
    }
  }

  // v0 entries kept the saved setups inside the store entry.
  const { savedSetups: setupsInEntry, ...fields } = stored
  const state = { ...current, ...fields } as SimulationStore

  state.params = normalizePersistedParams(state.params)

  // Upgrade any persisted shape to the plan model. Pre-plan state becomes a
  // "Base plan" plus one plan per saved setup; nothing the user stored is
  // discarded. The import runs at most once (guarded by a marker key) so
  // plans deleted later never reappear.
  const importMarker = storageKey(BASE_PLANS_IMPORTED_KEY)
  const legacyImportDone = readStorageKey(importMarker) === '1'

  const bootstrapped = bootstrapPlans(
    {
      plans: state.plans,
      params: state.params,
      savedSetups: legacyImportDone ? [] : readLegacySetups(setupsInEntry),
      activePlanId: state.activePlanId,
      allowLegacyImport: !legacyImportDone,
    },
    normalizePersistedParams
  )

  // An entry from a newer build is read-only, and so is everything around it.
  const entryKey = storageKey(BASE_STORE_KEY)
  const readOnly = planStorage?.isReadOnly(entryKey) ?? false
  if (!legacyImportDone && !readOnly) {
    try {
      localStorage.setItem(importMarker, '1')
    } catch {
      // Storage full or unavailable: the import stays idempotent because
      // imported plans keep their original setup ids.
    }
    // The marker says "imported", so the imported plans have to be stored
    // too — even if nothing else on this page changes the store.
    flushAfterHydration = bootstrapped.migrated
  }

  // A stored draft belongs to the stored active plan. If that plan is gone
  // (another tab deleted it) the draft has no plan to be a working copy of.
  const draftHasItsPlan = state.activePlanId === bootstrapped.activePlanId

  state.plans = bootstrapped.plans
  state.activePlanId = bootstrapped.activePlanId

  const activePlan = bootstrapped.plans.find((plan) => plan.id === bootstrapped.activePlanId)
  // Unsaved edits survive a reload as a visible working copy rather than
  // being silently written into (or dropped from) the plan.
  const draft =
    state.draftParams && draftHasItsPlan ? normalizePersistedParams(state.draftParams) : null
  if (activePlan && draft && paramsDiffer(draft, activePlan.params)) {
    state.params = draft
    state.draftParams = draft
    state.isDirty = true
  } else {
    if (activePlan) state.params = activePlan.params
    state.draftParams = null
    state.isDirty = false
  }

  // Rates of plans that no longer exist (deleted in another tab) go.
  const planIds = new Set(state.plans.map((plan) => plan.id))
  state.planSuccessRates = Object.fromEntries(
    Object.entries(sanitizeNumberMap(state.planSuccessRates)).filter(([id]) => planIds.has(id))
  )

  // Rates remembered by an older calculation are not this engine's numbers:
  // they leave the switcher and wait for the notice that explains the change.
  // An entry without a version is from before versions existed (1), unless it
  // never remembered a rate — then there is nothing to explain.
  const storedCalcVersion =
    typeof stored.calcVersion === 'number' && Number.isFinite(stored.calcVersion)
      ? stored.calcVersion
      : Object.keys(state.planSuccessRates).length > 0
        ? 1
        : CALC_VERSION
  const keptNotice = isRecord(stored.ratesBeforeCalcChange)
    ? sanitizeNumberMap(stored.ratesBeforeCalcChange)
    : null
  if (storedCalcVersion < CALC_VERSION) {
    state.ratesBeforeCalcChange = { ...keptNotice, ...state.planSuccessRates }
    state.planSuccessRates = {}
  } else {
    state.ratesBeforeCalcChange = keptNotice
  }
  state.calcVersion = Math.max(storedCalcVersion, CALC_VERSION)

  state.deletedPlans = sanitizePlanTombstones(state.deletedPlans)
  state.syncedPlanStamps = sanitizePlanStamps(state.syncedPlanStamps)

  // Results are never read from storage, so any present here were computed
  // on this page (before a namespace switch). Keep them only if they describe
  // the params just loaded.
  // `results.params` is the engine's normalised copy, so the comparison has to
  // read both sides the way the engine does (a raw fingerprint never matches).
  if (state.results && !areSimulationParamsEqual(state.params, state.results.params)) {
    state.results = null
    state.resultsComputedAt = null
  }

  // What was just read is what a write would store: nothing needs writing
  // until something changes. An entry that was upgraded, or grew imported
  // plans, is different from what is on disk and gets written.
  if (!upgradingEntry && !flushAfterHydration) {
    planStorage?.remember(entryKey, toPersistedState(state))
  }
  upgradingEntry = false

  return state
}

export const useSimulationStore = create<SimulationStore>()(
  persist(
    (set, get) => {
      let scheduledRunTimeout: ReturnType<typeof setTimeout> | null = null

      const clearScheduledRun = () => {
        if (scheduledRunTimeout) {
          clearTimeout(scheduledRunTimeout)
          scheduledRunTimeout = null
        }
      }

      const scheduleSimulation = (delay = 100) => {
        clearScheduledRun()
        set({ pendingRun: true })
        scheduledRunTimeout = setTimeout(() => {
          scheduledRunTimeout = null
          void get().runSimulation()
        }, delay)
      }

      /** Plans are the single source of truth for parameter sets. */
      const commitPlans = (plans: Plan[]) => {
        set({ plans })
      }

      const findPlan = (id: string) => get().plans.find((plan) => plan.id === id)

      /**
       * Writes params into the *working copy* only. The named plan is durable:
       * it changes on `savePlanDraft`, never as a side effect of editing. This
       * is what keeps an abandoned wizard session (or a stray slider drag) from
       * silently rewriting a plan the user considers finished.
       */
      const applyParams = (nextParams: SimulationParams) => {
        const activePlan = findPlan(get().activePlanId)
        const dirty = activePlan ? paramsDiffer(nextParams, activePlan.params) : true

        set({
          params: nextParams,
          draftParams: dirty ? nextParams : null,
          isDirty: dirty,
          error: null,
        })
      }

      /** Drops the working copy and points the store at `plan`'s stored params. */
      const adoptPlanParams = (plan: Plan) => {
        set({
          activePlanId: plan.id,
          params: plan.params,
          draftParams: null,
          isDirty: false,
          error: null,
        })
      }

      /** Remembers a plan's success rate when the current results describe it. */
      const successRateFor = (params: SimulationParams): number | null => {
        const { results } = get()
        if (!results) return null
        return areSimulationParamsEqual(params, results.params) ? results.successRate : null
      }

      const rememberSuccessRate = (planId: string, rate: number | null) => {
        const next = { ...get().planSuccessRates }
        if (rate === null) delete next[planId]
        else next[planId] = rate
        set({ planSuccessRates: next })
      }

      /** Runs (or queues) a simulation after a plan-level change. */
      const requestRun = () => {
        if (get().autoRunSuspended) {
          set({ pendingRun: true })
          return
        }
        scheduleSimulation(0)
      }

      const defaultPlan = makePlan({
        id: DEFAULT_PLAN_ID,
        name: DEFAULT_PLAN_NAME,
        nameKey: DEFAULT_PLAN_NAME_KEY,
        params: DEFAULT_PARAMS,
        createdAt: 0,
      })

      return {
        params: DEFAULT_PARAMS,
        draftParams: null,
        isDirty: false,
        planSuccessRates: {},
        calcVersion: CALC_VERSION,
        ratesBeforeCalcChange: null,
        dismissCalcNotice: () => set({ ratesBeforeCalcChange: null }),
        results: null,
        resultsComputedAt: null,
        isLoading: false,
        error: null,
        plans: [defaultPlan],
        activePlanId: DEFAULT_PLAN_ID,
        // Cloud-sync bookkeeping (see `./planSync`); empty while nothing synced.
        deletedPlans: {},
        syncedPlanStamps: {},
        // Auto-run control
        autoRunSuspended: false,
        pendingRun: false,

        savePlanDraft: () => {
          const { plans, activePlanId, params, isDirty } = get()
          if (!isDirty) return
          if (!plans.some((plan) => plan.id === activePlanId)) return

          // Never at or before the stamp the plan already has: sync compares
          // stamps, and a copy from a device whose clock runs ahead must not
          // make this save look older than what it replaces.
          const nextPlans = plans.map((plan) =>
            plan.id === activePlanId
              ? { ...plan, params, updatedAt: nextPlanStamp(plan.updatedAt) }
              : plan
          )

          commitPlans(nextPlans)
          set({ draftParams: null, isDirty: false, error: null })
          rememberSuccessRate(activePlanId, successRateFor(params))
        },

        revertPlanDraft: () => {
          const { activePlanId, isDirty } = get()
          if (!isDirty) return
          const plan = findPlan(activePlanId)
          if (!plan) return

          adoptPlanParams(plan)
          requestRun()
        },

        saveDraftAsNewPlan: (name: string) => {
          const { plans, activePlanId, isDirty, params } = get()
          if (!isDirty) return null
          const source = findPlan(activePlanId)
          if (!source) return null
          if (plans.length >= MAX_PLANS) {
            set({ error: 'planLimitReached' })
            return null
          }

          const plan = makePlan({
            id: createPlanId(plans),
            name: uniquePlanName(name, plans),
            params: normalizePersistedParams(params),
          })
          commitPlans([...plans, plan])
          // The results on screen describe the draft, i.e. the new plan.
          rememberSuccessRate(plan.id, successRateFor(plan.params))

          // The draft now lives in the new plan; the source goes back to the
          // state it was saved in and stays the plan being worked on.
          adoptPlanParams(source)
          requestRun()
          return plan.id
        },

        createPlan: (
          name: string,
          params?: SimulationParams,
          options?: { activate?: boolean; nameKey?: string }
        ) => {
          const { plans, params: currentParams } = get()
          if (plans.length >= MAX_PLANS) {
            set({ error: 'planLimitReached' })
            return null
          }

          const plan = makePlan({
            id: createPlanId(plans),
            name: uniquePlanName(name, plans),
            // Built-in plans (the demo) carry a key so their name follows the
            // UI language until the user renames them.
            nameKey: options?.nameKey,
            params: normalizePersistedParams(params ?? currentParams),
          })

          commitPlans([...plans, plan])
          rememberSuccessRate(plan.id, successRateFor(plan.params))

          // Background creation (stress levers): the plan is stored but the
          // user keeps editing whatever they were on.
          if (options?.activate === false) return plan.id

          // The new plan owns these params now, so the working copy is clean.
          adoptPlanParams(plan)
          requestRun()

          return plan.id
        },

        duplicatePlan: (id: string, name?: string) => {
          const { plans, activePlanId, isDirty, params } = get()
          const source = plans.find((plan) => plan.id === id)
          if (!source) return null
          if (plans.length >= MAX_PLANS) {
            set({ error: 'planLimitReached' })
            return null
          }

          // Duplicating the plan you are editing copies what is on screen, so
          // "Duplicate" doubles as a save-as for unsaved work.
          const sourceParams = id === activePlanId && isDirty ? params : source.params

          const copy = makePlan({
            id: createPlanId(plans),
            name: uniquePlanName(name ?? source.name, plans),
            params: sourceParams,
          })

          commitPlans([...plans, copy])
          adoptPlanParams(copy)
          const sourceRate = get().planSuccessRates[source.id]
          rememberSuccessRate(copy.id, typeof sourceRate === 'number' ? sourceRate : null)
          requestRun()

          return copy.id
        },

        renamePlan: (id: string, name: string) => {
          const { plans } = get()
          const trimmed = name.trim()
          if (!trimmed) return

          commitPlans(
            plans.map((plan) =>
              plan.id === id
                ? {
                    ...plan,
                    name: uniquePlanName(trimmed, plans, id),
                    nameKey: undefined,
                    updatedAt: nextPlanStamp(plan.updatedAt),
                  }
                : plan
            )
          )
        },

        deletePlan: (id: string) => {
          const { plans, activePlanId } = get()
          if (plans.length <= 1) return
          const removed = plans.find((plan) => plan.id === id)
          if (!removed) return

          const nextPlans = plans.filter((plan) => plan.id !== id)
          // The tombstone travels with the next sync, so a device that still
          // holds this plan drops it instead of pushing it back. Stamped no
          // earlier than the plan itself: this deletion saw that revision.
          set({
            plans: nextPlans,
            deletedPlans: withPlanTombstone(
              get().deletedPlans,
              id,
              Math.max(Date.now(), removed.updatedAt)
            ),
          })
          rememberSuccessRate(id, null)

          if (activePlanId === id) {
            adoptPlanParams(nextPlans[0])
            requestRun()
          }
        },

        /**
         * Activates another plan. Any working copy is dropped — callers that can
         * lose user edits (the plan switcher) prompt first.
         */
        setActivePlan: (id: string) => {
          const { plans, activePlanId, isDirty } = get()
          if (id === activePlanId && !isDirty) return

          const plan = plans.find((entry) => entry.id === id)
          if (!plan) return

          adoptPlanParams(plan)
          requestRun()
        },

        getActivePlan: () => {
          const { plans, activePlanId } = get()
          return plans.find((plan) => plan.id === activePlanId)
        },

        /**
         * Entry point for cloud sync (see `./planSync`). Everything arriving
         * here has been through the same sanitizers the persisted state gets,
         * because it came off a network that a tampered blob could reach.
         *
         * Unsaved work always wins over a remote update: while `isDirty` the
         * user keeps the plan they are editing and the params on screen, and
         * only the surrounding list is reconciled.
         */
        applySyncedPlans: (incoming: Plan[], incomingActiveId: string, sync?: PlanSyncMeta) => {
          const nextPlans = normalizePlans(incoming, normalizePersistedParams)
          if (nextPlans.length === 0) return false

          const { plans, activePlanId, isDirty } = get()

          // Sync bookkeeping is written together with the plans it describes.
          const meta = {
            ...(sync?.deletedPlans
              ? { deletedPlans: sanitizePlanTombstones(sync.deletedPlans) }
              : {}),
            ...(sync?.syncedPlanStamps
              ? { syncedPlanStamps: sanitizePlanStamps(sync.syncedPlanStamps) }
              : {}),
          }

          // A plan this device kept as a conflict copy lives under a new id;
          // the selection (and an unsaved edit on it) goes where the plan went.
          const currentId = sync?.renamedIds?.[activePlanId] ?? activePlanId

          const requestedActive = nextPlans.some((plan) => plan.id === incomingActiveId)
            ? incomingActiveId
            : nextPlans.some((plan) => plan.id === currentId)
              ? currentId
              : nextPlans[0].id

          // A dirty working copy pins the selection: switching plans underneath
          // an unsaved edit would strand it on a plan it does not belong to.
          const keepCurrent = isDirty && nextPlans.some((plan) => plan.id === currentId)
          const nextActiveId = keepCurrent ? currentId : requestedActive

          const unchanged =
            nextActiveId === activePlanId &&
            plans.length === nextPlans.length &&
            plans.every((plan, index) => {
              const candidate = nextPlans[index]
              return (
                plan.id === candidate.id &&
                plan.name === candidate.name &&
                plan.updatedAt === candidate.updatedAt &&
                !paramsDiffer(plan.params, candidate.params)
              )
            })

          if (unchanged) {
            if (Object.keys(meta).length > 0) set(meta)
            return false
          }

          set({ plans: nextPlans, ...meta })

          const activePlan = nextPlans.find((plan) => plan.id === nextActiveId)
          if (activePlan && !keepCurrent) {
            adoptPlanParams(activePlan)
            requestRun()
          } else {
            set({ activePlanId: nextActiveId })
          }

          return true
        },

        updateParams: (partial: Partial<SimulationParams>) => {
          const currentParams = get().params
          const nextOneTimeIncomes =
            partial.oneTimeIncomes !== undefined
              ? sanitizeOneTimeIncomes(partial.oneTimeIncomes)
              : Array.isArray(currentParams.oneTimeIncomes)
                ? currentParams.oneTimeIncomes
                : []
          const merged = {
            ...currentParams,
            ...partial,
            oneTimeIncomes: nextOneTimeIncomes,
          }

          /**
           * The single funnel into the flow list.
           *
           * Writes that name `cashFlows` are the new, complete intent. Writes
           * that only touch a legacy array (the sidebar's expense editor, a
           * stress lever scaling `customExpenses`) are folded into the flows
           * instead of competing with them. Either way the projections are
           * rewritten afterwards, so no consumer ever sees the two disagree.
           */
          const cashFlows =
            partial.cashFlows !== undefined
              ? sanitizeCashFlows(partial.cashFlows)
              : reconcileCashFlows({
                  cashFlows: currentParams.cashFlows,
                  customExpenses: merged.customExpenses,
                  oneTimeIncomes: merged.oneTimeIncomes,
                  // The wizard's pension field is a legacy write into the
                  // statutory pension flow; anything else leaves pensions alone.
                  monthlyPension: partial.monthlyPension,
                  currentAge: merged.currentAge,
                })

          const newParams: SimulationParams = {
            ...merged,
            cashFlows,
            customExpenses: projectCustomExpenses(cashFlows),
            oneTimeIncomes: projectOneTimeIncomes(cashFlows, merged.currentAge),
            monthlyPension: statutoryPensionMonthly(cashFlows),
          }

          applyParams(newParams)

          // Auto-run simulation after parameter update unless suspended
          if (!get().autoRunSuspended) {
            scheduleSimulation()
          } else {
            // Mark that a run is pending for when autoRun resumes
            set({ pendingRun: true })
          }
        },

        runSimulation: async () => {
          if (get().isLoading) {
            set({ pendingRun: true })
            return
          }

          clearScheduledRun()
          const { params } = get()
          const requestFingerprint = getParamsFingerprint(params)

          // Post first, then flag the run: the worker starts computing while
          // React renders the loading state.
          const pendingResults = startSimulation(params)
          set({ isLoading: true, error: null, pendingRun: false })

          try {
            const results = await pendingResults

            const latestFingerprint = getParamsFingerprint(get().params)
            if (latestFingerprint !== requestFingerprint) {
              set({ isLoading: false, error: null })

              if (get().autoRunSuspended) {
                set({ pendingRun: true })
              } else {
                scheduleSimulation(0)
              }
              return
            }

            set((state) => ({
              results,
              resultsComputedAt: Date.now(),
              isLoading: false,
              error: null,
              // A clean run describes the stored plan, so the switcher can show
              // its success rate without re-simulating.
              planSuccessRates: state.isDirty
                ? state.planSuccessRates
                : { ...state.planSuccessRates, [state.activePlanId]: results.successRate },
            }))
          } catch (error) {
            console.error('Simulation error:', error)
            set({
              isLoading: false,
              error: error instanceof Error ? error.message : 'Simulation failed',
            })
          } finally {
            if (!get().autoRunSuspended && get().pendingRun) {
              scheduleSimulation(0)
            }
          }
        },

        // Control auto-run suspension during interactions (e.g., chart brushing)
        setAutoRunSuspended: (suspended: boolean) => {
          const { pendingRun } = get()
          set({ autoRunSuspended: suspended })
          if (suspended) {
            clearScheduledRun()
            return
          }
          if (!suspended && pendingRun) {
            scheduleSimulation()
          }
        },

        clearResults: () => {
          set({
            results: null,
            resultsComputedAt: null,
            error: null,
          })
        },
      }
    },
    {
      name: BASE_STORE_KEY,
      version: STORE_VERSION,
      storage: planStorage,
      migrate: (persistedState, version) => {
        let state = (
          isRecord(persistedState) ? { ...persistedState } : {}
        ) as Partial<SimulationStore>
        // Written by a newer build: there is nothing to migrate *down*. The
        // state is handed on untouched, `hydrateState` reads what this build
        // understands of it, and the tab runs on that in memory only — the
        // storage adapter has made the entry read-only, so the write `persist`
        // does after a migration is refused and the newer data stays on disk
        // exactly as it was.
        if (version > STORE_VERSION) return state
        upgradingEntry = true
        // v0 state has no plans. Clearing the field here stops the merge from
        // keeping the store's default plan around; `hydrateState` then
        // rebuilds plans from the persisted params and saved setups (which may
        // also live in the legacy standalone storage key).
        if (version < 1) {
          state = { ...state, plans: [], activePlanId: '' }
        }
        // v1 mirrored every edit straight into the active plan, so there is no
        // draft to recover: the persisted params already are the plan's params.
        if (version < 2) {
          state = { ...state, draftParams: null, isDirty: false, planSuccessRates: {} }
        }
        // v2 kept spending in `customExpenses` and windfalls in `oneTimeIncomes`.
        // v3 turns both into cash flows — lifetime expenses keep their ids, a
        // windfall becomes a one-off income at the age it was booked for — and
        // regenerates the two arrays as projections. Every parameter set is
        // migrated: the live params, the unsaved working copy, and each plan.
        if (version < 3) {
          state = {
            ...state,
            ...(state.params ? { params: normalizePersistedParams(state.params) } : {}),
            ...(state.draftParams
              ? { draftParams: normalizePersistedParams(state.draftParams) }
              : {}),
            ...(Array.isArray(state.plans)
              ? {
                  plans: state.plans.map((plan) =>
                    isRecord(plan)
                      ? { ...plan, params: normalizePersistedParams(plan.params) }
                      : plan
                  ) as Plan[],
                }
              : {}),
          }
        }
        return state
      },
      partialize: toPersistedState,
      merge: hydrateState,
    }
  )
)

storeReady = true

// A legacy import that ran while the store hydrated: store its plans now.
const flushLegacyImport = () => {
  if (!flushAfterHydration) return
  flushAfterHydration = false
  useSimulationStore.setState({})
}

// `persist` is absent on the server, where the store has no storage.
if (useSimulationStore.persist) {
  if (useSimulationStore.persist.hasHydrated()) flushLegacyImport()
  useSimulationStore.persist.onFinishHydration(flushLegacyImport)
}

/** Runs `fn` with the store's writes to storage switched off (memory-only changes). */
export function withoutPersisting<T>(fn: () => T): T {
  return planStorage ? planStorage.withoutWriting(fn) : fn()
}

// ---- Other tabs -------------------------------------------------------------

const isSamePlan = (a: Plan, b: Plan): boolean =>
  a.name === b.name &&
  a.nameKey === b.nameKey &&
  a.updatedAt === b.updatedAt &&
  !paramsDiffer(a.params, b.params)

/**
 * Persisted id-keyed number maps that every tab of a namespace has to agree
 * on. They are unioned when another tab's entry is adopted (the other tab's
 * value wins per key), so one tab's write never drops what another recorded.
 * A new map of that kind is one more name in this list.
 */
const SHARED_MAP_FIELDS = [
  'planSuccessRates',
  // Sync bookkeeping (see `docs/specs/2026-11-09-sync-protocol.md`): a plan
  // deleted or synced in one tab is deleted or synced in every tab.
  'deletedPlans',
  'syncedPlanStamps',
] as const satisfies ReadonlyArray<keyof SimulationStore>

/** Stamps only move forward: for these maps the later value wins per key. */
const LATEST_WINS_FIELDS: ReadonlySet<string> = new Set(['deletedPlans', 'syncedPlanStamps'])

const sameNumberMap = (a: Record<string, number>, b: Record<string, number>): boolean =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(([id, value]) => b[id] === value)

const samePlanList = (a: readonly Plan[], b: readonly Plan[]): boolean =>
  a.length === b.length &&
  a.every((plan, index) => plan.id === b[index].id && isSamePlan(plan, b[index]))

/**
 * Brings what another tab stored into this tab's state.
 *
 * The plan lists are merged per plan against the entry this tab last knew
 * (`mergePlanLists`) and handed to `applySyncedPlans` — the cloud-sync entry
 * point, which sanitizes them, keeps an unsaved working copy where it is and
 * changes nothing when the lists already agree.
 *
 * Everything else in the entry — the active plan, the params on screen, the
 * draft — is the other tab's own session and is left alone.
 *
 * `contributes` says whether this tab now holds something their entry lacks
 * (a plan the other tab's build knew nothing about, the plan this tab is
 * editing, a newer save) and therefore has to write.
 */
function adoptForeignChange({ theirs, base }: ForeignChange): {
  changed: boolean
  contributes: boolean
} {
  const state = useSimulationStore.getState()

  const theirPlans = normalizePlans(theirs.state.plans, normalizePersistedParams)
  // A pre-plan entry, or nothing this build can read: there is nothing to
  // adopt, and this tab's next write replaces it.
  if (theirPlans.length === 0) return { changed: false, contributes: true }

  // An entry without the schema stamp comes from a build that predates this
  // guard — and the storage listener. Such a tab never saw this tab's plans,
  // so a plan missing from its list was not deleted there: without a base the
  // merge is a union and nothing is dropped on that tab's word.
  const basePlans =
    base && theirs.planSchema !== null
      ? normalizePlans(base.state.plans, normalizePersistedParams)
      : []

  const merged = mergePlanLists({
    base: basePlans,
    mine: state.plans,
    theirs: theirPlans,
    isSame: isSamePlan,
    // Unsaved work always wins: the plan being edited stays, even if the
    // other tab deleted it.
    keepId: state.isDirty ? state.activePlanId : null,
  })
  let changed = state.applySyncedPlans(merged, state.activePlanId)
  let contributes = !samePlanList(useSimulationStore.getState().plans, theirPlans)

  const planIds = new Set(useSimulationStore.getState().plans.map((plan) => plan.id))
  const patch: Partial<SimulationStore> = {}
  const sameCalc = theirs.state.calcVersion === CALC_VERSION
  // Dismissing the "calculation corrected" notice dismisses it in every tab.
  if (
    sameCalc &&
    !isRecord(theirs.state.ratesBeforeCalcChange) &&
    useSimulationStore.getState().ratesBeforeCalcChange !== null
  ) {
    patch.ratesBeforeCalcChange = null
  }
  for (const field of SHARED_MAP_FIELDS) {
    // Rates another calculation produced (a tab on an older build) are not
    // adopted; that tab's entry is replaced by this tab's next write anyway.
    if (field === 'planSuccessRates' && !sameCalc) {
      contributes = true
      continue
    }
    const mine = useSimulationStore.getState()[field]
    const their = sanitizeNumberMap(theirs.state[field])
    let union: Record<string, number> = { ...mine, ...their }
    if (LATEST_WINS_FIELDS.has(field)) {
      for (const [id, stamp] of Object.entries(mine)) {
        if (stamp > (union[id] ?? 0)) union[id] = stamp
      }
    }
    // A success rate describes a plan that exists.
    if (field === 'planSuccessRates') {
      union = Object.fromEntries(Object.entries(union).filter(([id]) => planIds.has(id)))
    }
    if (!sameNumberMap(union, mine)) patch[field] = union
    if (!sameNumberMap(union, their)) contributes = true
  }
  if (Object.keys(patch).length > 0) {
    useSimulationStore.setState(patch)
    changed = true
  }

  return { changed, contributes }
}

/**
 * Picks up what another tab wrote to this tab's store entry. Cheap when
 * nothing changed (one string comparison), and safe to call at any time.
 * Returns whether this tab's state changed.
 *
 * The exchange ends by itself: a tab that adopts writes only if it holds
 * something the other entry lacks, and what it writes then contains
 * everything the other tab has — so that tab adopts, finds nothing missing,
 * and stays quiet.
 */
export function syncFromOtherTabs(): boolean {
  if (!planStorage || !storeReady) return false
  const name = useSimulationStore.persist.getOptions().name ?? BASE_STORE_KEY
  const change = planStorage.takeForeignChange(name)
  if (!change) return false

  // In memory only: what was adopted is on disk already.
  const { changed, contributes } = planStorage.withoutWriting(() => adoptForeignChange(change))
  planStorage.remember(name, toPersistedState(useSimulationStore.getState()))
  if (contributes) {
    planStorage.markStale(name)
    useSimulationStore.setState({})
  }
  return changed
}

/**
 * Two tabs share one localStorage entry. Without this listener each tab kept
 * the plan list it loaded and wrote it back whole on its next `set()`, so the
 * last tab to do anything erased what the other had saved.
 *
 * The `storage` event only tells us *that* the entry changed: what is adopted
 * is always what is on disk now, never the event's payload. Replaying payloads
 * in arrival order would let two tabs that wrote at the same moment undo each
 * other for ever; reading the entry makes every tab converge on it.
 */
if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  const registry = window as unknown as { __planStorageSync?: () => void }
  // A previous instance of this module (dev hot reload) must stop listening.
  registry.__planStorageSync?.()

  const onStorage = (event: StorageEvent) => {
    // `key` is null when the whole storage area was cleared.
    if (event.key !== null && event.key !== useSimulationStore.persist.getOptions().name) return
    syncFromOtherTabs()
  }
  // A page restored from the back/forward cache, or a tab the browser froze,
  // never received the events it missed.
  const onPageShow = (event: PageTransitionEvent) => {
    if (event.persisted) syncFromOtherTabs()
  }
  const onVisibility = () => {
    if (document.visibilityState === 'visible') syncFromOtherTabs()
  }

  window.addEventListener('storage', onStorage)
  window.addEventListener('pageshow', onPageShow)
  if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)

  registry.__planStorageSync = () => {
    window.removeEventListener('storage', onStorage)
    window.removeEventListener('pageshow', onPageShow)
    if (typeof document !== 'undefined')
      document.removeEventListener('visibilitychange', onVisibility)
  }
}

// ---- Results, with an optional deferred scope -------------------------------

const ResultsScopeContext = createContext<{ results: SimulationResults | null } | null>(null)

/**
 * The results on screen.
 *
 * Outside a `DeferredResultsScope` this is a plain store subscription: it
 * updates in the same (synchronous) render as the run's completion. Inside a
 * scope it is the scope's deferred copy and there is no store subscription at
 * all, so a landing run does not re-render the component in that urgent pass;
 * it re-renders in the interruptible pass that follows. That is how the
 * result bar (outside every scope) commits first while the charts below it
 * catch up a frame later (§7 of the one-page workspace spec).
 */
export const useSimulationResults = () => {
  const scope = useContext(ResultsScopeContext)
  const live = useSimulationStore((state) => (scope ? null : state.results))
  return scope ? scope.results : live
}

/**
 * Hands `useSimulationResults()` a deferred copy of the results to everything
 * below it. Wrap surfaces that are expensive to render and not the headline
 * (charts, the Sankey, the withdrawal planner, the lever list). The copy lags
 * only while a newer result is being rendered; it never shows a result the
 * store has not had.
 */
export function DeferredResultsScope({ children }: { children?: ReactNode }) {
  const results = useSimulationStore((state) => state.results)
  const deferred = useDeferredValue(results)
  const value = useMemo(() => ({ results: deferred }), [deferred])
  return createElement(ResultsScopeContext.Provider, { value }, children)
}

// Helper hooks for specific parts of the store
export const useSimulationParams = () => useSimulationStore((state) => state.params)
export const useSimulationLoading = () => useSimulationStore((state) => state.isLoading)
export const useSimulationError = () => useSimulationStore((state) => state.error)

// Helper hooks for individual actions
export const useUpdateParams = () => useSimulationStore((state) => state.updateParams)
export const useRunSimulation = () => useSimulationStore((state) => state.runSimulation)
export const useClearResults = () => useSimulationStore((state) => state.clearResults)
export const useSetAutoRunSuspended = () => useSimulationStore((state) => state.setAutoRunSuspended)

// Plan helpers
export const usePlans = () => useSimulationStore((state) => state.plans)
export const useActivePlanId = () => useSimulationStore((state) => state.activePlanId)
export const useCreatePlan = () => useSimulationStore((state) => state.createPlan)
export const useRenamePlan = () => useSimulationStore((state) => state.renamePlan)
export const useDuplicatePlan = () => useSimulationStore((state) => state.duplicatePlan)
export const useDeletePlan = () => useSimulationStore((state) => state.deletePlan)
export const useSetActivePlan = () => useSimulationStore((state) => state.setActivePlan)

// Working-copy (draft) helpers
export const usePlanIsDirty = () => useSimulationStore((state) => state.isDirty)
export const useSavePlanDraft = () => useSimulationStore((state) => state.savePlanDraft)
export const useRevertPlanDraft = () => useSimulationStore((state) => state.revertPlanDraft)
export const useSaveDraftAsNewPlan = () => useSimulationStore((state) => state.saveDraftAsNewPlan)
export const usePlanSuccessRates = () => useSimulationStore((state) => state.planSuccessRates)
export const useActivePlan = () =>
  useSimulationStore((state) => state.plans.find((plan) => plan.id === state.activePlanId))
