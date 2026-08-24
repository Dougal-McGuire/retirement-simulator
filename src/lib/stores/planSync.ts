/**
 * Cloud sync for plans: merge policy, transport and status.
 *
 * The browser stays the source of truth. `/api/plans` holds one blob per Google
 * account, and this module reconciles it with the account's local namespace so
 * the same plans show up on every device the user signs in on.
 *
 * Three hard rules:
 *
 *  1. The signed-out (anonymous) namespace NEVER syncs. Signing out returns the
 *     user to exactly the device-local workspace they had.
 *  2. Without a configured backing store nothing changes: one probe per session
 *     discovers the 501, and the client stays on its per-account localStorage
 *     namespace forever after.
 *  3. Failures degrade silently to local. A background push that cannot reach
 *     the server marks the status line "offline" and is retried on the next
 *     change — it never blocks an edit and never raises a toast.
 *
 * CONFLICT MODEL — deliberately simple, and documented because it is lossy at
 * the edges: reconciliation is *last write wins per plan*, keyed on
 * `plan.updatedAt`. Two devices editing two different plans both keep their
 * work; two devices editing the *same* plan keep the one saved last. There is
 * no field-level merge and no conflict UI.
 */

import { create } from 'zustand'
import { MAX_PLANS, type Plan } from '@/types'

/** What a device knows about its own plans. */
export interface PlanSnapshot {
  plans: Plan[]
  activePlanId: string
}

/** What the account holds, as returned by `GET /api/plans`. */
export interface RemoteSnapshot extends PlanSnapshot {
  schemaVersion: number
  /** Server clock of the last successful write. */
  updatedAt: number
}

export type MergeOutcome =
  /** Nothing to do — both sides are empty or already agree. */
  | 'idle'
  /** The account is empty and this device has real work: first device seeds it. */
  | 'seed'
  /** This namespace is untouched and the account has plans: take them as-is. */
  | 'adopt'
  /** Both sides have work: union by plan id, newest `updatedAt` wins. */
  | 'merge'

export interface MergeResult {
  outcome: MergeOutcome
  plans: Plan[]
  activePlanId: string
  /** Whether the local store should be rewritten with `plans`. */
  shouldApply: boolean
  /** Whether the result should be written back to the account. */
  shouldPush: boolean
}

export interface MergeInput {
  local: PlanSnapshot
  remote: RemoteSnapshot | null
  /**
   * True when this namespace holds nothing a user would miss (a fresh sign-in
   * on a second device). Computed with the same pristine check the first-sign-in
   * migration prompt uses.
   */
  localPristine: boolean
}

/** Stable identity of a plan set — used to skip no-op applies and pushes. */
export function snapshotSignature(snapshot: PlanSnapshot): string {
  return JSON.stringify({
    activePlanId: snapshot.activePlanId,
    plans: snapshot.plans.map((plan) => [plan.id, plan.updatedAt, JSON.stringify(plan.params)]),
  })
}

const latestStamp = (plans: readonly Plan[]): number =>
  plans.reduce((newest, plan) => Math.max(newest, plan.updatedAt), 0)

/**
 * Caps the union at `MAX_PLANS`, dropping the *oldest* plans first — but never
 * the active one, which is the plan the user is looking at right now.
 */
function capPlans(plans: Plan[], activePlanId: string): Plan[] {
  if (plans.length <= MAX_PLANS) return plans

  const byAge = [...plans].sort((a, b) => b.updatedAt - a.updatedAt)
  const kept = byAge.slice(0, MAX_PLANS)

  if (!kept.some((plan) => plan.id === activePlanId)) {
    const active = byAge.find((plan) => plan.id === activePlanId)
    // Swap out the oldest survivor rather than the newest, so the cap always
    // sheds the least recently touched plan.
    if (active) kept[kept.length - 1] = active
  }

  const keptIds = new Set(kept.map((plan) => plan.id))
  // Restore the caller's ordering: the switcher's plan order is meaningful.
  return plans.filter((plan) => keptIds.has(plan.id))
}

/**
 * The whole merge policy, as a pure function.
 *
 * See the module comment for the conflict model. Ordering is "local plans in
 * their local order, then plans only the account knows about", so a device's
 * own switcher never reshuffles just because another device signed in.
 */
export function mergePlanSnapshots({ local, remote, localPristine }: MergeInput): MergeResult {
  const localHasPlans = local.plans.length > 0
  const remoteHasPlans = Boolean(remote && remote.plans.length > 0)

  if (!remoteHasPlans) {
    // Nothing stored for this account yet. A pristine namespace has nothing
    // worth seeding with (an untouched starter plan is not the user's work);
    // the first real edit pushes instead.
    if (localPristine || !localHasPlans) {
      return {
        outcome: 'idle',
        plans: local.plans,
        activePlanId: local.activePlanId,
        shouldApply: false,
        shouldPush: false,
      }
    }

    return {
      outcome: 'seed',
      plans: local.plans,
      activePlanId: local.activePlanId,
      shouldApply: false,
      shouldPush: true,
    }
  }

  const remoteSnapshot = remote as RemoteSnapshot

  if (localPristine || !localHasPlans) {
    return {
      outcome: 'adopt',
      plans: remoteSnapshot.plans,
      activePlanId: remoteSnapshot.activePlanId,
      shouldApply: true,
      // The account already holds exactly this; writing it straight back would
      // only bump `updatedAt` and make every other device re-pull for nothing.
      shouldPush: false,
    }
  }

  const merged = new Map<string, Plan>()
  remoteSnapshot.plans.forEach((plan) => merged.set(plan.id, plan))
  local.plans.forEach((plan) => {
    const rival = merged.get(plan.id)
    // Ties go to the local copy: it is the one the user can see.
    if (!rival || plan.updatedAt >= rival.updatedAt) merged.set(plan.id, plan)
  })

  const orderedIds = [
    ...local.plans.map((plan) => plan.id),
    ...remoteSnapshot.plans
      .map((plan) => plan.id)
      .filter((id) => !local.plans.some((plan) => plan.id === id)),
  ]

  const union = orderedIds
    .map((id) => merged.get(id))
    .filter((plan): plan is Plan => plan !== undefined)

  // "Which device was edited last" decides which plan is selected, so switching
  // devices lands on the plan the user actually left off in.
  const preferRemote = latestStamp(remoteSnapshot.plans) > latestStamp(local.plans)
  const preferredActive = preferRemote ? remoteSnapshot.activePlanId : local.activePlanId
  const fallbackActive = preferRemote ? local.activePlanId : remoteSnapshot.activePlanId
  const activePlanId = union.some((plan) => plan.id === preferredActive)
    ? preferredActive
    : union.some((plan) => plan.id === fallbackActive)
      ? fallbackActive
      : union[0].id

  const plans = capPlans(union, activePlanId)
  const result: PlanSnapshot = { plans, activePlanId }
  const signature = snapshotSignature(result)

  return {
    outcome: 'merge',
    plans,
    activePlanId,
    shouldApply: signature !== snapshotSignature(local),
    shouldPush: signature !== snapshotSignature(remoteSnapshot),
  }
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export const PLANS_ENDPOINT = '/api/plans'

export type FetchOutcome =
  | { status: 'ok'; blob: RemoteSnapshot | null }
  | { status: 'unconfigured' }
  | { status: 'unauthorized' }
  | { status: 'error' }

export type PushOutcome =
  | { status: 'ok'; updatedAt: number }
  | { status: 'unconfigured' }
  | { status: 'unauthorized' }
  | { status: 'error' }

/**
 * `null` = not probed yet, `false` = this deployment has no store (never ask
 * again this session). Module scope, so a full page load re-probes exactly once.
 */
let cloudAvailable: boolean | null = null

export function cloudProbeState(): boolean | null {
  return cloudAvailable
}

/** Test seam — resets the once-per-session probe. */
export function resetCloudProbe(): void {
  cloudAvailable = null
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

function toRemoteSnapshot(value: unknown): RemoteSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.plans) || value.plans.length === 0) return null

  const plans = value.plans.filter((plan): plan is Plan => isRecord(plan) && typeof plan.id === 'string')
  if (plans.length === 0) return null

  const activePlanId =
    typeof value.activePlanId === 'string' && plans.some((plan) => plan.id === value.activePlanId)
      ? value.activePlanId
      : plans[0].id

  return {
    schemaVersion: typeof value.schemaVersion === 'number' ? value.schemaVersion : 1,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
    plans,
    activePlanId,
  }
}

/** Reads the account's blob. `blob: null` means "this account is empty". */
export async function fetchRemoteSnapshot(): Promise<FetchOutcome> {
  if (cloudAvailable === false) return { status: 'unconfigured' }

  try {
    const response = await fetch(PLANS_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    })

    if (response.status === 501) {
      cloudAvailable = false
      return { status: 'unconfigured' }
    }
    if (response.status === 401) return { status: 'unauthorized' }
    if (!response.ok) return { status: 'error' }

    cloudAvailable = true
    const payload = (await response.json()) as unknown
    const blob = isRecord(payload) ? toRemoteSnapshot(payload.blob) : null
    return { status: 'ok', blob }
  } catch {
    // Offline, blocked, aborted — indistinguishable and all handled the same.
    return { status: 'error' }
  }
}

/** Upserts the account's blob. */
export async function pushSnapshot(snapshot: PlanSnapshot): Promise<PushOutcome> {
  if (cloudAvailable === false) return { status: 'unconfigured' }

  try {
    const response = await fetch(PLANS_ENDPOINT, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({
        schemaVersion: 1,
        updatedAt: Date.now(),
        plans: snapshot.plans,
        activePlanId: snapshot.activePlanId,
      }),
    })

    if (response.status === 501) {
      cloudAvailable = false
      return { status: 'unconfigured' }
    }
    if (response.status === 401) return { status: 'unauthorized' }
    if (!response.ok) return { status: 'error' }

    cloudAvailable = true
    const payload = (await response.json()) as unknown
    const updatedAt = isRecord(payload) && typeof payload.updatedAt === 'number' ? payload.updatedAt : Date.now()
    return { status: 'ok', updatedAt }
  } catch {
    return { status: 'error' }
  }
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

export type SyncPhase =
  /** No account, no store, or the anonymous namespace: sync is not running. */
  | 'disabled'
  /** Signed in and configured, nothing in flight yet. */
  | 'idle'
  | 'syncing'
  | 'synced'
  /** Reachable in principle, but the last attempt failed. */
  | 'offline'

interface PlanSyncState {
  phase: SyncPhase
  lastSyncedAt: number | null
  /**
   * Account whose namespace the store is currently pointed at, published by
   * `AuthStorageSync` once the switch (and any migration prompt) has settled.
   * `null` = signed out, which never syncs.
   */
  namespaceUserId: string | null
  /** False until the namespace has been resolved at least once. */
  namespaceReady: boolean
  setPhase: (phase: SyncPhase, lastSyncedAt?: number | null) => void
  setNamespace: (userId: string | null) => void
}

export const usePlanSyncStore = create<PlanSyncState>()((set) => ({
  phase: 'disabled',
  lastSyncedAt: null,
  namespaceUserId: null,
  namespaceReady: false,
  setPhase: (phase, lastSyncedAt) =>
    set((state) => ({
      phase,
      lastSyncedAt: lastSyncedAt === undefined ? state.lastSyncedAt : lastSyncedAt,
    })),
  setNamespace: (userId) =>
    set((state) => ({
      namespaceUserId: userId,
      namespaceReady: true,
      // Leaving an account (or arriving in the anonymous one) must not leave a
      // stale "Synced 2 minutes ago" behind.
      phase: userId === null ? 'disabled' : state.phase,
      lastSyncedAt: userId === null ? null : state.lastSyncedAt,
    })),
}))

/**
 * Announces which namespace the persisted store now points at.
 *
 * Called by `AuthStorageSync` *after* the namespace switch and the first
 * sign-in migration prompt have settled, so cloud sync never reads a workspace
 * that is about to be replaced.
 */
export function markNamespaceReady(userId: string | null): void {
  const state = usePlanSyncStore.getState()
  if (state.namespaceReady && state.namespaceUserId === userId) return
  state.setNamespace(userId)
}
