'use client'

import { useEffect } from 'react'
import type { Plan } from '@/types'
import { useSimulationStore } from '@/lib/stores/simulationStore'
import { isPristineWorkspace } from '@/lib/stores/authMigration'
import { getActiveAuthUserId } from '@/lib/stores/persistenceKey'
import {
  baseAfterPush,
  buildCloudSnapshot,
  fetchRemoteSnapshot,
  mergePlanSnapshots,
  pushSnapshot,
  snapshotSignature,
  usePlanSyncStore,
  type LocalSyncState,
} from '@/lib/stores/planSync'

/** How long a change settles before it is written to the account. */
const PUSH_DEBOUNCE_MS = 2000
/** Floor between two focus-triggered pulls, so tab-flipping is not a request storm. */
const PULL_THROTTLE_MS = 10_000
/** Pull → merge → push rounds one sync may take when the account keeps moving. */
const MAX_CONFLICT_ROUNDS = 3
/** How long sign-out waits for the last push before it goes ahead anyway. */
const FLUSH_TIMEOUT_MS = 1500

const readLocal = (): Required<LocalSyncState> => {
  const { plans, activePlanId, deletedPlans, syncedPlanStamps } = useSimulationStore.getState()
  return { plans, activePlanId, deletedPlans, syncedPlanStamps }
}

/**
 * Whether this namespace holds nothing the user would miss.
 *
 * Reuses the pristine check the first-sign-in migration prompt runs, by handing
 * it the live state in the persisted shape — one definition of "untouched
 * workspace" for both features.
 */
const localIsPristine = (): boolean => {
  const { plans, params, draftParams } = useSimulationStore.getState()
  return isPristineWorkspace(JSON.stringify({ state: { plans, params, draftParams } }))
}

const sameStamps = (a: Record<string, number>, b: Record<string, number>): boolean => {
  const keys = Object.keys(a)
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key])
}

export interface PlanCloudSyncOptions {
  /**
   * Account this session syncs. The session ends itself the moment the
   * storage namespace points at anyone else, so it can never read (or write
   * into the account) a workspace that belongs to another namespace.
   */
  userId?: string | null
  /** Name of the copy kept when both sides changed a plan (localized by the UI). */
  conflictCopyName?: (plan: Plan) => string
}

/** Flush of the running session, for `flushPlanSync`; `null` when none runs. */
let activeFlush: (() => Promise<void>) | null = null
let conflictCopyNamer: ((plan: Plan) => string) | null = null

/**
 * Registers how conflict copies are named. Set by `SyncReloadNotice`, which
 * has the translations; this module must stay importable without them.
 */
export function setConflictCopyNamer(namer: ((plan: Plan) => string) | null): void {
  conflictCopyNamer = namer
}

/**
 * Writes a pending change to the account now instead of after the debounce.
 * Resolves when the push has been answered, or after `timeoutMs` — whichever
 * comes first — and never rejects. Sign-out awaits it, because leaving the
 * account ends the session that would otherwise have pushed.
 */
export function flushPlanSync(timeoutMs = FLUSH_TIMEOUT_MS): Promise<void> {
  const flush = activeFlush
  if (!flush) return Promise.resolve()

  return new Promise<void>((resolve) => {
    const timer = setTimeout(resolve, timeoutMs)
    void flush()
      .catch(() => {})
      .then(() => {
        clearTimeout(timer)
        resolve()
      })
  })
}

/**
 * Keeps the signed-in account's plans in sync with the server.
 *
 * Lifecycle, per namespace (protocol: `docs/specs/2026-11-09-sync-protocol.md`):
 *   1. `AuthStorageSync` announces the namespace (after the switch and any
 *      migration prompt) — the anonymous namespace announces `null` and is
 *      never synced.
 *   2. One reconcile: pull, merge (see `planSync`), apply and/or push.
 *   3. Then, until the namespace changes: a debounced push on every plan change
 *      and a throttled pull whenever the tab regains focus.
 *
 * Nothing is pushed before a pull has succeeded in this session: until then a
 * change (and every focus) retries the *reconcile*. A push names the revision
 * it merged against; when the account has moved on (`412`) the session pulls,
 * merges and pushes again.
 *
 * Every failure path degrades to local-only and stays silent; the status line
 * in the account menu is the only thing the user sees — except the schema
 * guard: `409 outdated-client` stops this tab for good (`'outdated'`) and
 * raises the reload notice (`SyncReloadNotice`).
 */
export function usePlanCloudSync(): void {
  const namespaceUserId = usePlanSyncStore((state) => state.namespaceUserId)
  const namespaceReady = usePlanSyncStore((state) => state.namespaceReady)

  useEffect(() => {
    // Signed out, or the namespace has not settled yet: nothing to sync.
    if (!namespaceReady || !namespaceUserId) {
      usePlanSyncStore.getState().setPhase('disabled', null)
      return
    }
    return startPlanCloudSync({ userId: namespaceUserId })
  }, [namespaceReady, namespaceUserId])
}

/**
 * One sync session for the namespace currently in the store; returns its
 * teardown. Plain function (no React) so the loop is unit-testable.
 */
export function startPlanCloudSync(options: PlanCloudSyncOptions = {}): () => void {
  const sync = usePlanSyncStore.getState()
  const { setPhase } = sync
  // Normalized the way `setActiveAuthUserId` stores it, so the two compare.
  const owner =
    options.userId === undefined ? getActiveAuthUserId() : options.userId?.trim() || null

  let cancelled = false
  let stopped = false
  /**
   * Revision of the account as this session last saw it. `null` until one pull
   * has succeeded — and while it is `null`, nothing can be pushed.
   */
  let rev: number | null = null
  /** Account plans a push must carry unchanged (see `MergeResult.cloudKept`). */
  let cloudKept: Plan[] = []
  /** The plan limit holds something back: every sync is a full reconcile. */
  let limited = false
  /** The server runs an older schema: only a focus asks again. */
  let waitingForServer = false
  /** Signature of the local state the account is known to match. */
  let syncedSignature: string | null = null
  /** Signature last seen by the store subscription. */
  let observedSignature = snapshotSignature(readLocal())
  let lastPullAt = 0
  let pushTimer: ReturnType<typeof setTimeout> | null = null
  let unsubscribe: (() => void) | null = null
  /** Requests run one at a time, so a revision is never used twice. */
  let queue: Promise<void> = Promise.resolve()

  /**
   * False once the session is over — torn down, switched off, or the storage
   * namespace no longer belongs to the account it was started for. Checked
   * after every `await`: an answer that arrives late must not merge, apply,
   * push or change the status any more.
   */
  const alive = () => !cancelled && !stopped && getActiveAuthUserId() === owner

  const clearPushTimer = () => {
    if (pushTimer) clearTimeout(pushTimer)
    pushTimer = null
  }

  const halt = () => {
    stopped = true
    clearPushTimer()
    unsubscribe?.()
    unsubscribe = null
  }

  /** Turns the store off for this session: no store here, or no session. */
  const disable = () => {
    halt()
    setPhase('disabled', null)
  }

  /**
   * The server refused this build's plan schema as too old. Nothing is pushed
   * or pulled again in this tab — local edits keep working, the cloud copy
   * stays as the newer build left it — and the notice asks for a reload.
   */
  const pauseOutdated = () => {
    halt()
    setPhase('outdated')
  }

  /**
   * The server is the older one (a rollback). Nothing to reload: the session
   * stays, pushes nothing, and asks again the next time the tab gets focus.
   */
  const waitForServer = () => {
    waitingForServer = true
    rev = null
    clearPushTimer()
    setPhase('server-outdated')
  }

  /** Records what the account now holds, as far as this device can tell. */
  const writeBase = (next: Record<string, number>) => {
    if (sameStamps(next, useSimulationStore.getState().syncedPlanStamps)) return
    useSimulationStore.setState({ syncedPlanStamps: next })
  }

  const push = async (round = 0, keepalive = false): Promise<void> => {
    if (rev === null) return

    const local = readLocal()
    const body = buildCloudSnapshot(local, cloudKept)
    const signature = snapshotSignature(local)
    const kept = cloudKept
    setPhase('syncing')

    const result = await pushSnapshot(body, rev, { keepalive })
    if (!alive()) return

    if (result.status === 'ok') {
      rev = result.rev
      syncedSignature = signature
      writeBase(baseAfterPush(useSimulationStore.getState().syncedPlanStamps, body, kept))
      setPhase('synced', Date.now())
      return
    }
    if (result.status === 'conflict') {
      // The account moved on since this session last looked: merge with what
      // it holds now, then push the result against the new revision.
      if (round >= MAX_CONFLICT_ROUNDS) {
        lastPullAt = 0
        setPhase('offline')
        return
      }
      await reconcile(round + 1)
      return
    }
    if (result.status === 'error') {
      setPhase('offline')
      return
    }
    if (result.status === 'outdated') {
      pauseOutdated()
      return
    }
    if (result.status === 'server-outdated') {
      waitForServer()
      return
    }
    disable()
  }

  const reconcile = async (round = 0): Promise<void> => {
    lastPullAt = Date.now()
    setPhase('syncing')

    const remote = await fetchRemoteSnapshot()
    if (!alive()) return

    if (remote.status === 'outdated') {
      // Never merge, never apply: an outdated build must not even ingest
      // newer-shaped data into its own normalizers and localStorage.
      pauseOutdated()
      return
    }
    if (remote.status === 'server-outdated') {
      waitForServer()
      return
    }
    if (remote.status === 'unconfigured' || remote.status === 'unauthorized') {
      disable()
      return
    }
    if (remote.status === 'error') {
      // Could not read the account. That is NOT an empty account: nothing is
      // merged, and `rev` stays as it was — `null` if no pull ever succeeded,
      // which keeps every push from happening.
      setPhase('offline')
      return
    }

    waitingForServer = false
    const { isDirty, activePlanId: editedPlanId } = useSimulationStore.getState()
    const merged = mergePlanSnapshots({
      local: readLocal(),
      remote: remote.blob,
      localPristine: localIsPristine(),
      conflictCopyName: options.conflictCopyName ?? conflictCopyNamer ?? undefined,
      // Unsaved work wins over a deletion made elsewhere, as over any update.
      dirtyPlanId: isDirty ? editedPlanId : null,
    })

    rev = remote.rev
    cloudKept = merged.cloudKept
    limited = merged.unsyncedPlanIds.length > 0 || merged.cloudOnlyPlanIds.length > 0

    // Plans and the bookkeeping that describes them are written together —
    // and not at all when the pull changed nothing, which is the usual case
    // on focus. `applySyncedPlans` may pin the active plan (unsaved edits win).
    const before = useSimulationStore.getState()
    if (
      merged.shouldApply ||
      merged.activePlanId !== before.activePlanId ||
      !sameStamps(merged.deletedPlans, before.deletedPlans) ||
      !sameStamps(merged.syncedPlanStamps, before.syncedPlanStamps)
    ) {
      before.applySyncedPlans(merged.plans, merged.activePlanId, {
        deletedPlans: merged.deletedPlans,
        syncedPlanStamps: merged.syncedPlanStamps,
        renamedIds: merged.renamedIds,
      })
    }

    sync.setPlanLimit({
      unsynced: merged.unsyncedPlanIds.length,
      hidden: merged.cloudOnlyPlanIds.length,
    })
    sync.announceConflictCopies(merged.conflictCopies.map((plan) => plan.name))

    if (merged.shouldPush) {
      await push(round)
      return
    }

    syncedSignature = snapshotSignature(readLocal())
    setPhase('synced', Date.now())
  }

  /** Runs `task` after whatever is in flight; skipped once the session is over. */
  const enqueue = (task: () => Promise<void>): Promise<void> => {
    queue = queue.then(() => (alive() ? task() : undefined)).catch(() => {})
    return queue
  }

  const hasUnsyncedChange = (): boolean => snapshotSignature(readLocal()) !== syncedSignature

  /** What a local change (after the debounce) or a flush amounts to. */
  const syncNow = async (keepalive = false): Promise<void> => {
    if (waitingForServer) return
    // No successful pull yet — or the plan limit is juggling plans: only a
    // full reconcile may write. This is what makes "push before pull" impossible.
    if (rev === null || limited) {
      await reconcile()
      return
    }
    if (!hasUnsyncedChange()) return
    await push(0, keepalive)
  }

  const schedulePush = () => {
    clearPushTimer()
    pushTimer = setTimeout(() => {
      pushTimer = null
      void enqueue(() => syncNow())
    }, PUSH_DEBOUNCE_MS)
  }

  // Only plan-shaped state is compared, so a simulation finishing, a
  // comparison recomputing, a chart brushing or another plan being selected
  // never causes a write — while a saved parameter change does, because
  // params live in plans.
  unsubscribe = useSimulationStore.subscribe(() => {
    if (!alive()) return
    const signature = snapshotSignature(readLocal())
    if (signature === observedSignature) return
    observedSignature = signature
    if (signature === syncedSignature) {
      clearPushTimer()
      return
    }
    schedulePush()
  })

  /**
   * Sends a change that is still waiting for its debounce, because the page
   * may not live that long (tab hidden or closed, sign-out). `keepalive` lets
   * the request finish after the page is gone. Only a session that has pulled
   * can do this; anything else stays on the device and is merged next time.
   */
  const flush = (): Promise<void> => {
    if (!alive() || rev === null || waitingForServer || limited) return Promise.resolve()
    if (!hasUnsyncedChange()) return Promise.resolve()
    clearPushTimer()
    // Queued like every request: one in flight is answered first, so the
    // revision this push names is the current one.
    return enqueue(() => syncNow(true))
  }

  const onFocus = () => {
    if (!alive()) return
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return
    if (Date.now() - lastPullAt < PULL_THROTTLE_MS) return
    // The merge is a no-op when the account has not moved on, so an
    // unnecessary pull costs one request and changes nothing.
    void enqueue(() => reconcile())
  }

  const onVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      void flush()
      return
    }
    onFocus()
  }

  const onPageHide = () => {
    void flush()
  }

  /** Back online after a failed attempt: do not wait for the next focus. */
  const onOnline = () => {
    if (!alive() || usePlanSyncStore.getState().phase !== 'offline') return
    void enqueue(() => reconcile())
  }

  void enqueue(() => reconcile())
  activeFlush = flush

  const hasDom = typeof window !== 'undefined' && typeof document !== 'undefined'
  if (hasDom) {
    window.addEventListener('focus', onFocus)
    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('online', onOnline)
    document.addEventListener('visibilitychange', onVisibilityChange)
  }

  return () => {
    cancelled = true
    clearPushTimer()
    unsubscribe?.()
    unsubscribe = null
    if (activeFlush === flush) activeFlush = null
    if (hasDom) {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('online', onOnline)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }
}

/** Mount-only companion to `AuthStorageSync`; renders nothing. */
export function PlanCloudSync() {
  usePlanCloudSync()
  return null
}
