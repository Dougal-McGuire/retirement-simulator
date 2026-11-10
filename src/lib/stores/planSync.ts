/**
 * Cloud sync for plans: merge policy, transport and status.
 *
 * The browser stays the source of truth. `/api/plans` holds one blob per Google
 * account, and this module reconciles it with the account's local namespace so
 * the same plans show up on every device the user signs in on. The protocol is
 * written down in `docs/specs/2026-11-09-sync-protocol.md`.
 *
 * Hard rules:
 *
 *  1. The signed-out (anonymous) namespace NEVER syncs. Signing out returns the
 *     user to exactly the device-local workspace they had.
 *  2. Without a configured backing store nothing changes: one probe per session
 *     discovers the 501, and the client stays on its per-account localStorage
 *     namespace forever after.
 *  3. Failures degrade silently to local. A request that cannot reach the
 *     server marks the status line "offline" and is retried on the next change
 *     or focus — it never blocks an edit and never raises a toast.
 *  4. Nothing is written to the account that was not merged with what the
 *     account holds: a push needs a successful pull in the same session, and
 *     names the revision it is based on. A failed read is an error, never an
 *     empty account.
 *  5. Only a tombstone deletes. A plan that is merely missing on one side is
 *     copied to it, so a lost or outdated list can never erase anything.
 *
 * MERGE MODEL (`mergePlanSnapshots`): per plan, against the *sync base* — the
 * `updatedAt` the account last held for that plan, as far as this device
 * knows (`syncedPlanStamps`).
 *
 *  - changed on one side only: that side wins, whatever the clocks say;
 *  - changed on both sides with the same parameters: the account's copy;
 *  - changed on both sides with different parameters: both are kept — the
 *    account's version keeps the id, this device's version becomes a conflict
 *    copy ("… (copy from this device)") under a new id;
 *  - deleted on one side: the deletion applies to the revision the deleting
 *    device saw; a revision it never saw (an edit made elsewhere) survives.
 *
 * Without a base (a device that never synced that plan) the two sides are
 * compared by `updatedAt`, except for the starter plan: every device creates
 * its own `plan-base`, so two of them are unrelated plans and both are kept.
 *
 * The selected plan is per device and is not synced.
 *
 * SCHEMA GUARD: every request states this build's `PLAN_SCHEMA_VERSION` (see
 * `src/lib/plans/schemaVersion.ts`). `409 outdated-client` means this build is
 * too old for the account's data; the tab then never syncs again until it is
 * reloaded (`schemaBlocked`, module scope like the 501 probe), and the status
 * store asks for a reload. `409 outdated-server` means the *server* is older
 * (a rollback): nothing to reload, the tab waits and asks again on the next
 * focus. Local edits keep working either way.
 */

import { create } from 'zustand'
import { DEFAULT_PARAMS, MAX_PLANS, type Plan } from '@/types'
import {
  BUILD_ID_HEADER,
  OUTDATED_CLIENT_ERROR,
  OUTDATED_SERVER_ERROR,
  PLAN_REV_HEADER,
  PLAN_SCHEMA_HEADER,
  PLAN_SCHEMA_VERSION,
  isDifferentBuild,
  parsePlanRev,
} from '@/lib/plans/schemaVersion'
import {
  DEFAULT_PLAN_ID,
  DEFAULT_PLAN_NAME,
  DEFAULT_PLAN_NAME_KEY,
  sanitizePlanStamps,
  sanitizePlanTombstones,
  uniquePlanName,
  type PlanStamps,
  type PlanTombstones,
} from '@/lib/stores/plans'
import { normalizePersistedParams } from '@/lib/stores/normalizeParams'

/** A plan list with the plan selected on the device it belongs to. */
export interface PlanSnapshot {
  plans: Plan[]
  activePlanId: string
}

/** Everything a device knows that sync works with. */
export interface LocalSyncState extends PlanSnapshot {
  /** Plans deleted on this device, or known to be deleted elsewhere. */
  deletedPlans?: PlanTombstones
  /** `updatedAt` of each plan as the account last held it (the sync base). */
  syncedPlanStamps?: PlanStamps
}

/** What the account holds, as returned by `GET /api/plans`. */
export interface RemoteSnapshot extends PlanSnapshot {
  schemaVersion: number
  /** Server clock of the last successful write. */
  updatedAt: number
  /** Revision of the blob; a write must name it. */
  rev?: number
  deletedPlans?: PlanTombstones
}

/** The body of a `PUT /api/plans`: what the account should hold. */
export interface CloudSnapshot extends PlanSnapshot {
  deletedPlans: PlanTombstones
  /** Local plans left out because the account is at its plan limit. */
  heldBackIds: string[]
}

export type MergeOutcome =
  /** Nothing to do — both sides are empty or already agree. */
  | 'idle'
  /** The account is empty and this device has real work: first device seeds it. */
  | 'seed'
  /** This namespace is untouched and the account has plans: take them as-is. */
  | 'adopt'
  /** Both sides have work: merged plan by plan, see the module comment. */
  | 'merge'

export interface MergeResult {
  outcome: MergeOutcome
  /** What this device should hold. Never more than `MAX_PLANS`. */
  plans: Plan[]
  activePlanId: string
  /** Tombstones of both sides, minus those of plans that survived. */
  deletedPlans: PlanTombstones
  /** The sync base after this merge. */
  syncedPlanStamps: PlanStamps
  /** What the account should hold. Never more than `MAX_PLANS`. */
  cloud: CloudSnapshot
  /**
   * Account plans a push must carry unchanged although the device does not
   * hold them (in that version): plans that did not fit here, and the
   * account's side of a conflict that could not be resolved for lack of room.
   */
  cloudKept: Plan[]
  /** Local plan id -> the id this device's version lives under now. */
  renamedIds: Record<string, string>
  /** Conflict copies this merge created. */
  conflictCopies: Plan[]
  /** Local plans the account does not hold (in this version): plan limit. */
  unsyncedPlanIds: string[]
  /** Account plans this device has no room for: plan limit. */
  cloudOnlyPlanIds: string[]
  /** Whether the local store should be rewritten with `plans`. */
  shouldApply: boolean
  /** Whether `cloud` should be written to the account. */
  shouldPush: boolean
}

export interface MergeInput {
  local: LocalSyncState
  remote: RemoteSnapshot | null
  /**
   * True when this namespace holds nothing a user would miss (a fresh sign-in
   * on a second device). Computed with the same pristine check the first-sign-in
   * migration prompt uses.
   */
  localPristine: boolean
  /** Device clock; used to expire tombstones and to stamp a kept plan. */
  now?: number
  /** Name of the copy kept when both sides changed a plan. */
  conflictCopyName?: (plan: Plan) => string
  /**
   * The plan the user is editing right now, if it has unsaved changes. A
   * deletion made elsewhere is not applied to it: an edit in progress is an
   * edit, and the plan must not vanish from under it.
   */
  dirtyPlanId?: string | null
}

// ---------------------------------------------------------------------------
// Comparing plans
// ---------------------------------------------------------------------------

/** `JSON.stringify` with sorted keys, so key order never reads as a difference. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const fields = Object.keys(record)
      .filter((key) => record[key] !== undefined)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    return `{${fields.join(',')}}`
  }
  return JSON.stringify(value) ?? 'null'
}

const paramsKeys = new WeakMap<Plan, string>()

/**
 * Canonical text of a plan's parameters. Both sides are normalized first: the
 * account's copy has been through the server's sanitizer, the local one may
 * not have, and that alone must not make two equal plans look different.
 * Cached per plan object — plans are replaced, never mutated.
 */
function paramsKey(plan: Plan): string {
  let key = paramsKeys.get(plan)
  if (key === undefined) {
    key = stableStringify(normalizePersistedParams(plan.params))
    paramsKeys.set(plan, key)
  }
  return key
}

let starterParamsKey: string | null = null

/** The starter plan exactly as every device creates it: nothing of the user's. */
function isUntouchedStarter(plan: Plan): boolean {
  if (plan.id !== DEFAULT_PLAN_ID) return false
  if (plan.nameKey !== DEFAULT_PLAN_NAME_KEY && plan.name !== DEFAULT_PLAN_NAME) return false
  starterParamsKey ??= stableStringify(normalizePersistedParams(DEFAULT_PARAMS))
  return paramsKey(plan) === starterParamsKey
}

const newestFirst = (a: Plan, b: Plan): number =>
  b.updatedAt - a.updatedAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)

const stampsOf = (plans: readonly Plan[]): PlanStamps =>
  Object.fromEntries(plans.map((plan) => [plan.id, plan.updatedAt]))

const sortedEntries = (record: Record<string, number>): Array<[string, number]> =>
  Object.entries(record).sort((a, b) => (a[0] < b[0] ? -1 : 1))

const sameRecord = (a: Record<string, number>, b: Record<string, number>): boolean =>
  JSON.stringify(sortedEntries(a)) === JSON.stringify(sortedEntries(b))

/**
 * Stable identity of what a device would sync — used to skip no-op pushes.
 *
 * The selected plan is deliberately not part of it: the selection is per
 * device, and two devices looking at different plans must not rewrite the
 * account every time one of them gets focus.
 */
export function snapshotSignature(snapshot: LocalSyncState): string {
  return JSON.stringify({
    plans: snapshot.plans.map((plan) => [
      plan.id,
      plan.updatedAt,
      plan.name,
      plan.nameKey ?? null,
      paramsKey(plan),
    ]),
    // Every stored tombstone counts here, expired or not (`now` = 0 expires
    // none): the signature must not change just because time passed.
    deletedPlans: sortedEntries(sanitizePlanTombstones(snapshot.deletedPlans, 0)),
  })
}

// ---------------------------------------------------------------------------
// What goes to the account
// ---------------------------------------------------------------------------

/**
 * The plan list a push sends, given what this device holds and which account
 * plans it must carry along unchanged (`cloudKept`, from the last merge).
 *
 * A `PUT` replaces the account's whole list, so this is where the plan limit
 * is honoured without losing anything: the account keeps every plan it has,
 * and plans that exist only on this device fill the remaining room, most
 * recently changed first. Whatever does not fit stays on the device
 * (`heldBackIds`) and goes up as soon as there is room.
 */
export function buildCloudSnapshot(
  local: LocalSyncState,
  cloudKept: readonly Plan[] = [],
  now = Date.now()
): CloudSnapshot {
  const base = sanitizePlanStamps(local.syncedPlanStamps)
  const kept = new Map(cloudKept.map((plan) => [plan.id, plan]))

  // Plans the account already holds keep their place; new ones need room.
  const own = local.plans.filter((plan) => !kept.has(plan.id))
  const fresh = own.filter((plan) => base[plan.id] === undefined)
  const room = Math.max(0, MAX_PLANS - kept.size - (own.length - fresh.length))
  const admitted = new Set(
    [...fresh]
      .sort(newestFirst)
      .slice(0, room)
      .map((plan) => plan.id)
  )

  const plans: Plan[] = []
  const placed = new Set<string>()
  local.plans.forEach((plan) => {
    const accountVersion = kept.get(plan.id)
    if (accountVersion) {
      plans.push(accountVersion)
      placed.add(plan.id)
    } else if (base[plan.id] !== undefined || admitted.has(plan.id)) {
      plans.push(plan)
    }
  })
  cloudKept.forEach((plan) => {
    if (!placed.has(plan.id)) plans.push(plan)
  })

  // A plan that is in the list is not deleted.
  const deletedPlans = sanitizePlanTombstones(local.deletedPlans, now)
  plans.forEach((plan) => {
    delete deletedPlans[plan.id]
  })

  return {
    plans,
    deletedPlans,
    // Only a hint for a device that adopts the account wholesale.
    activePlanId: plans.some((plan) => plan.id === local.activePlanId)
      ? local.activePlanId
      : (plans[0]?.id ?? local.activePlanId),
    heldBackIds: fresh.filter((plan) => !admitted.has(plan.id)).map((plan) => plan.id),
  }
}

// ---------------------------------------------------------------------------
// Merge
// ---------------------------------------------------------------------------

/** Same bound `/api/plans` puts on a plan id. */
const MAX_PLAN_ID_LENGTH = 64
/** Leaves room for a " (2)" under the server's 120-character name limit. */
const MAX_COPY_NAME_LENGTH = 110

const defaultConflictCopyName = (plan: Plan): string => `${plan.name} (copy from this device)`

/**
 * Id for this device's version of a plan when the account's version keeps the
 * original id. Derived from the plan and its stamp, so two tabs resolving the
 * same conflict arrive at the same copy instead of two.
 */
function copyIdFor(plan: Plan): string {
  const stamp = Math.max(0, Math.floor(plan.updatedAt)).toString(36)
  const candidate = `${plan.id}-c${stamp}`
  return candidate.length <= MAX_PLAN_ID_LENGTH ? candidate : `plan-c${stamp}`
}

const samePlanList = (a: readonly Plan[], b: readonly Plan[]): boolean =>
  a.length === b.length &&
  a.every(
    (plan, index) =>
      plan === b[index] ||
      (plan.id === b[index].id &&
        plan.updatedAt === b[index].updatedAt &&
        plan.name === b[index].name &&
        plan.nameKey === b[index].nameKey &&
        paramsKey(plan) === paramsKey(b[index]))
  )

/**
 * The whole merge policy, as a pure function. See the module comment for the
 * model and `docs/specs/2026-11-09-sync-protocol.md` for the rules one by one.
 *
 * Ordering is "local plans in their local order (a conflict copy right after
 * its plan), then plans only the account knows about", so a device's own
 * switcher never reshuffles just because another device signed in.
 */
export function mergePlanSnapshots(input: MergeInput): MergeResult {
  const now = input.now ?? Date.now()
  const { local, localPristine } = input
  const copyName = input.conflictCopyName ?? defaultConflictCopyName

  const remote = input.remote && input.remote.plans.length > 0 ? input.remote : null
  const localTombs = sanitizePlanTombstones(local.deletedPlans, now)
  const remoteTombs = sanitizePlanTombstones(remote?.deletedPlans, now)
  const base = sanitizePlanStamps(local.syncedPlanStamps)

  const compose = (
    outcome: MergeOutcome,
    state: Required<LocalSyncState>,
    extra: {
      cloudKept?: Plan[]
      renamedIds?: Record<string, string>
      conflictCopies?: Plan[]
      unresolvedIds?: string[]
      cloudOnlyPlanIds?: string[]
    } = {}
  ): MergeResult => {
    const cloudKept = extra.cloudKept ?? []
    const cloud = buildCloudSnapshot(state, cloudKept, now)

    // Tombstones are compared by id only: the same deletion may carry another
    // time here than in the account (the server clamps a clock that runs
    // ahead), and that alone is no reason to write.
    const accountDiffers =
      !remote ||
      !sameRecord(stampsOf(cloud.plans), stampsOf(remote.plans)) ||
      Object.keys(cloud.deletedPlans).sort().join('\n') !==
        Object.keys(remoteTombs).sort().join('\n')

    return {
      outcome,
      ...state,
      cloud,
      cloudKept,
      renamedIds: extra.renamedIds ?? {},
      conflictCopies: extra.conflictCopies ?? [],
      unsyncedPlanIds: [...(extra.unresolvedIds ?? []), ...cloud.heldBackIds],
      cloudOnlyPlanIds: extra.cloudOnlyPlanIds ?? [],
      shouldApply: !samePlanList(local.plans, state.plans),
      // An untouched device has nothing to say to the account ('idle',
      // 'adopt'): the first real edit pushes instead.
      shouldPush: outcome !== 'idle' && outcome !== 'adopt' && accountDiffers,
    }
  }

  // ---- The account holds nothing -------------------------------------------
  if (!remote) {
    const state = {
      plans: local.plans,
      activePlanId: local.activePlanId,
      deletedPlans: localTombs,
      // Nothing is in the account, so nothing is "already synced".
      syncedPlanStamps: {},
    }
    // A pristine namespace has nothing worth seeding with (an untouched
    // starter plan is not the user's work); the first real edit pushes.
    return compose(localPristine || local.plans.length === 0 ? 'idle' : 'seed', state)
  }

  // ---- This device holds nothing of its own --------------------------------
  if (localPristine || local.plans.length === 0) {
    return compose('adopt', {
      plans: remote.plans,
      activePlanId: remote.plans.some((plan) => plan.id === remote.activePlanId)
        ? remote.activePlanId
        : remote.plans[0].id,
      deletedPlans: remoteTombs,
      syncedPlanStamps: stampsOf(remote.plans),
    })
  }

  // ---- Both sides have work -------------------------------------------------
  const remoteById = new Map(remote.plans.map((plan) => [plan.id, plan]))
  const localById = new Map(local.plans.map((plan) => [plan.id, plan]))
  const usedIds = new Set([...localById.keys(), ...remoteById.keys()])

  const nextBase: PlanStamps = {}
  const renamedIds: Record<string, string> = {}

  /**
   * Whether a `plan-base` on both sides, with no base to go by, is two devices'
   * own starter plans rather than one plan. It is — unless this device shares
   * a *generated* id with the account: such an id cannot arise twice, so the
   * device has synced with this account before (under the old protocol, which
   * kept no base), and its starter plan is the account's, merely out of date.
   */
  const syncedBefore = local.plans.some(
    (plan) => plan.id !== DEFAULT_PLAN_ID && remoteById.has(plan.id)
  )
  const isForeignStarter = (id: string): boolean => id === DEFAULT_PLAN_ID && !syncedBefore

  /** One local plan after the merge, or a conflict still waiting for room. */
  type Slot = { plan: Plan } | { mine: Plan; theirs: Plan }
  const slots: Slot[] = []
  /** Local plans a deletion made elsewhere removes. */
  const dropped: Plan[] = []

  /**
   * Applies a deletion made elsewhere to a local plan — unless the user is in
   * the middle of editing it. Then the plan stays, stamped as changed now, so
   * the device that deleted it sees a revision it has not seen and keeps it too.
   */
  const dropUnlessBeingEdited = (plan: Plan) => {
    if (plan.id !== input.dirtyPlanId) {
      dropped.push(plan)
      return
    }
    slots.push({ plan: { ...plan, updatedAt: Math.max(now, plan.updatedAt + 1) } })
  }

  const freshId = (plan: Plan): string => {
    let candidate = copyIdFor(plan)
    let counter = 2
    while (usedIds.has(candidate)) {
      candidate = `${copyIdFor(plan)}-${counter}`
      counter += 1
    }
    usedIds.add(candidate)
    return candidate
  }

  local.plans.forEach((mine) => {
    const theirs = remoteById.get(mine.id)
    const known = base[mine.id]

    if (!theirs) {
      const deletedAt = remoteTombs[mine.id]
      // New here, or the account lost it without a tombstone: it goes up.
      if (deletedAt === undefined) {
        slots.push({ plan: mine })
        return
      }

      // Deleted on another device.
      if (known !== undefined) {
        // Unchanged since the last sync: this is the plan that was deleted.
        // Edited here since: the deleting device never saw this revision.
        if (mine.updatedAt === known) dropUnlessBeingEdited(mine)
        else slots.push({ plan: mine })
        return
      }

      // Never synced from this device.
      if (isForeignStarter(mine.id)) {
        // The tombstone is for *another* device's starter plan. An untouched
        // one here holds nothing; one the user worked in is their plan and
        // stays — under an id the tombstone does not apply to.
        if (isUntouchedStarter(mine) && mine.id !== input.dirtyPlanId) {
          dropped.push(mine)
          return
        }
        const moved = { ...mine, id: freshId(mine) }
        renamedIds[mine.id] = moved.id
        slots.push({ plan: moved })
        return
      }
      if (mine.updatedAt > deletedAt) slots.push({ plan: mine })
      else dropUnlessBeingEdited(mine)
      return
    }

    // Both sides hold the plan.
    const takeTheirs = () => {
      slots.push({ plan: theirs })
      nextBase[mine.id] = theirs.updatedAt
    }
    const keepMine = () => {
      slots.push({ plan: mine })
      nextBase[mine.id] = theirs.updatedAt
    }

    const mineChanged = known === undefined || mine.updatedAt !== known
    const theirsChanged = known === undefined || theirs.updatedAt !== known

    if (!mineChanged) return theirsChanged ? takeTheirs() : keepMine()
    if (!theirsChanged) return keepMine()

    // Changed on both sides since the last sync — or never synced here.
    if (paramsKey(mine) === paramsKey(theirs)) {
      // Same plan; at most the name differs, and then the later rename wins.
      const renamedHere =
        (mine.name !== theirs.name || mine.nameKey !== theirs.nameKey) &&
        mine.updatedAt > theirs.updatedAt
      return renamedHere ? keepMine() : takeTheirs()
    }

    if (known === undefined) {
      if (isForeignStarter(mine.id)) {
        // Two devices' starter plans: unrelated unless one is still untouched.
        if (isUntouchedStarter(mine)) return takeTheirs()
        if (isUntouchedStarter(theirs)) return keepMine()
      } else if (theirs.updatedAt > mine.updatedAt) {
        // One plan's lineage. With no base (a device that last synced before
        // bases existed) an older copy here is a stale one.
        return takeTheirs()
      }
    }

    slots.push({ mine, theirs })
  })

  // Plans only the account holds.
  const incoming: Plan[] = []
  remote.plans.forEach((theirs) => {
    if (localById.has(theirs.id)) return

    const deletedAt = localTombs[theirs.id]
    const known = base[theirs.id]
    const deletedHere =
      deletedAt !== undefined &&
      (known !== undefined
        ? // The revision this device deleted — not one edited elsewhere since.
          theirs.updatedAt === known
        : // Never synced from here: a foreign starter plan is not this one.
          !isForeignStarter(theirs.id) && theirs.updatedAt <= deletedAt)

    // Remembered until the deletion has reached the account.
    if (deletedHere) nextBase[theirs.id] = theirs.updatedAt
    else incoming.push(theirs)
  })

  // ---- Room: a device never holds more than MAX_PLANS -----------------------
  let room = MAX_PLANS - slots.length
  const plans: Plan[] = []
  const cloudKept: Plan[] = []
  const conflictCopies: Plan[] = []
  const unresolvedIds: string[] = []
  const cloudOnlyPlanIds: string[] = []

  slots.forEach((slot) => {
    if ('plan' in slot) {
      plans.push(slot.plan)
      return
    }

    const { mine, theirs } = slot
    const twinId = copyIdFor(mine)
    const twin = remoteById.get(twinId) ?? localById.get(twinId)

    if (twin && paramsKey(twin) === paramsKey(mine)) {
      // Another tab of this device already made the copy.
      plans.push(theirs)
      nextBase[mine.id] = theirs.updatedAt
      renamedIds[mine.id] = twin.id
    } else if (room > 0) {
      room -= 1
      const copy: Plan = {
        id: freshId(mine),
        name: uniquePlanName(copyName(mine).slice(0, MAX_COPY_NAME_LENGTH), [
          ...local.plans,
          ...remote.plans,
          ...conflictCopies,
        ]),
        params: mine.params,
        createdAt: mine.createdAt,
        updatedAt: mine.updatedAt,
      }
      plans.push(theirs, copy)
      conflictCopies.push(copy)
      nextBase[mine.id] = theirs.updatedAt
      renamedIds[mine.id] = copy.id
    } else {
      // No room for a copy: each side keeps its version until there is. The
      // base does not move, so the conflict is found again next time.
      plans.push(mine)
      cloudKept.push(theirs)
      unresolvedIds.push(mine.id)
      const known = base[mine.id]
      if (known !== undefined) nextBase[mine.id] = known
    }
  })

  const admitted = new Set(
    [...incoming]
      .sort(newestFirst)
      .slice(0, Math.max(0, room))
      .map((plan) => plan.id)
  )
  incoming.forEach((theirs) => {
    if (admitted.has(theirs.id)) {
      plans.push(theirs)
      nextBase[theirs.id] = theirs.updatedAt
    } else {
      cloudKept.push(theirs)
      cloudOnlyPlanIds.push(theirs.id)
    }
  })

  // Two devices that deleted each other's last plan: a workspace is never
  // left empty, so the deletions that would do that are not applied.
  if (plans.length === 0) plans.push(...dropped)

  // ---- Tombstones: both sides', minus every plan that is still alive --------
  const deletedPlans: PlanTombstones = { ...remoteTombs }
  Object.entries(localTombs).forEach(([id, deletedAt]) => {
    deletedPlans[id] = Math.max(deletedPlans[id] ?? 0, deletedAt)
  })
  ;[...plans, ...cloudKept].forEach((plan) => {
    delete deletedPlans[plan.id]
  })
  // The base of a deleted plan is kept as long as its tombstone: it is how
  // this device recognises a revision it has never seen, should one turn up.
  Object.keys(deletedPlans).forEach((id) => {
    if (nextBase[id] === undefined && base[id] !== undefined) nextBase[id] = base[id]
  })

  const wantedActive = renamedIds[local.activePlanId] ?? local.activePlanId

  return compose(
    'merge',
    {
      plans,
      activePlanId: plans.some((plan) => plan.id === wantedActive) ? wantedActive : plans[0].id,
      deletedPlans,
      syncedPlanStamps: nextBase,
    },
    { cloudKept, renamedIds, conflictCopies, unresolvedIds, cloudOnlyPlanIds }
  )
}

/**
 * The sync base once a push has been acknowledged: the account now holds
 * exactly `sent`. Plans carried along for the account (`cloudKept`) keep the
 * base they had, and so do deleted plans for as long as their tombstone lives.
 */
export function baseAfterPush(
  previous: PlanStamps,
  sent: CloudSnapshot,
  cloudKept: readonly Plan[] = []
): PlanStamps {
  const kept = new Set(cloudKept.map((plan) => plan.id))
  const next: PlanStamps = {}

  sent.plans.forEach((plan) => {
    if (!kept.has(plan.id)) next[plan.id] = plan.updatedAt
    else if (previous[plan.id] !== undefined) next[plan.id] = previous[plan.id]
  })
  Object.keys(sent.deletedPlans).forEach((id) => {
    if (previous[id] !== undefined) next[id] = previous[id]
  })

  return next
}

// ---------------------------------------------------------------------------
// Transport
// ---------------------------------------------------------------------------

export const PLANS_ENDPOINT = '/api/plans'

/** The server refused this tab's plan schema as too old: never sync again here. */
export type OutdatedOutcome = { status: 'outdated' }

/** The server runs an older schema than this tab (a rollback): wait, retry later. */
export type ServerOutdatedOutcome = { status: 'server-outdated' }

export type FetchOutcome =
  /** `blob: null` means exactly "this account holds nothing". */
  | { status: 'ok'; blob: RemoteSnapshot | null; rev: number }
  | { status: 'unconfigured' }
  | { status: 'unauthorized' }
  /** Could not be read. Never to be treated as an empty account. */
  | { status: 'error' }
  | OutdatedOutcome
  | ServerOutdatedOutcome

export type PushOutcome =
  | { status: 'ok'; rev: number; updatedAt: number }
  /** `412`: the account moved on since the revision this push named. */
  | { status: 'conflict' }
  | { status: 'unconfigured' }
  | { status: 'unauthorized' }
  | { status: 'error' }
  | OutdatedOutcome
  | ServerOutdatedOutcome

/**
 * `null` = not probed yet, `false` = this deployment has no store (never ask
 * again this session). Module scope, so a full page load re-probes exactly once.
 */
let cloudAvailable: boolean | null = null

/**
 * Set once the server refused this build's schema as too old. A property of
 * the *build*, not of the account, so it survives namespace switches and only
 * a reload (a new module instance, ideally a new build) clears it. A server
 * that is merely *older* does not set it: that passes without a reload.
 */
let schemaBlocked = false

export function cloudProbeState(): boolean | null {
  return cloudAvailable
}

export function isSchemaBlocked(): boolean {
  return schemaBlocked
}

/** Test seam — resets the once-per-session probe and the schema block. */
export function resetCloudProbe(): void {
  cloudAvailable = null
  schemaBlocked = false
}

/** Headers every `/api/plans` request carries. */
const schemaHeaders = (): Record<string, string> => ({
  [PLAN_SCHEMA_HEADER]: String(PLAN_SCHEMA_VERSION),
})

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** A newer deployment is serving the API: offer a reload, keep syncing. */
function noteServerBuild(response: Response): void {
  const serverBuild = response.headers?.get?.(BUILD_ID_HEADER) ?? null
  if (isDifferentBuild(serverBuild)) usePlanSyncStore.getState().requestReload('suggested')
}

/**
 * Which side of the schema guard a `409` is — or `null` for any other `409`,
 * which stays a plain error so an unrelated conflict can never pause sync.
 */
async function schemaConflictOf(response: Response): Promise<'client' | 'server' | null> {
  if (response.status !== 409) return null
  try {
    const payload = (await response.json()) as unknown
    if (!isRecord(payload)) return null
    if (payload.error === OUTDATED_CLIENT_ERROR) return 'client'
    if (payload.error === OUTDATED_SERVER_ERROR) return 'server'
    return null
  } catch {
    return null
  }
}

function refuseSchema(side: 'client' | 'server'): OutdatedOutcome | ServerOutdatedOutcome {
  // The server is the older one: a reload would load the same build again.
  if (side === 'server') return { status: 'server-outdated' }

  schemaBlocked = true
  usePlanSyncStore.getState().requestReload('required')
  return { status: 'outdated' }
}

function toRemoteSnapshot(value: unknown, rev: number): RemoteSnapshot | null {
  if (!isRecord(value) || !Array.isArray(value.plans) || value.plans.length === 0) return null

  const plans = value.plans.filter(
    (plan): plan is Plan => isRecord(plan) && typeof plan.id === 'string'
  )
  if (plans.length === 0) return null

  const activePlanId =
    typeof value.activePlanId === 'string' && plans.some((plan) => plan.id === value.activePlanId)
      ? value.activePlanId
      : plans[0].id

  return {
    schemaVersion: typeof value.schemaVersion === 'number' ? value.schemaVersion : 1,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : 0,
    rev,
    plans,
    deletedPlans: sanitizePlanTombstones(value.deletedPlans),
    activePlanId,
  }
}

const revOf = (payload: unknown, response: Response): number | null =>
  (isRecord(payload) ? parsePlanRev(payload.rev) : null) ??
  parsePlanRev(response.headers?.get?.(PLAN_REV_HEADER) ?? null)

/**
 * Reads the account's blob and its revision. `blob: null` means "this account
 * is empty" and nothing else: every answer that is not a clean `200` — a
 * failed store read (`502`) included — is `error`, and the caller must then
 * neither merge nor push.
 */
export async function fetchRemoteSnapshot(): Promise<FetchOutcome> {
  if (schemaBlocked) return { status: 'outdated' }
  if (cloudAvailable === false) return { status: 'unconfigured' }

  try {
    const response = await fetch(PLANS_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json', ...schemaHeaders() },
      cache: 'no-store',
    })

    noteServerBuild(response)
    const refused = await schemaConflictOf(response)
    if (refused) return refuseSchema(refused)
    if (response.status === 501) {
      cloudAvailable = false
      return { status: 'unconfigured' }
    }
    if (response.status === 401) return { status: 'unauthorized' }
    if (!response.ok) return { status: 'error' }

    const payload = (await response.json()) as unknown
    // An answer that does not even look like the API's is not an empty account.
    if (!isRecord(payload) || !('blob' in payload)) return { status: 'error' }

    cloudAvailable = true
    const rev = revOf(payload, response) ?? 0
    return { status: 'ok', blob: toRemoteSnapshot(payload.blob, rev), rev }
  } catch {
    // Offline, blocked, aborted — indistinguishable and all handled the same.
    return { status: 'error' }
  }
}

export interface PushOptions {
  /**
   * Lets the request outlive the page (tab closing, sign-out redirect). Only
   * honoured for a body within `KEEPALIVE_BODY_LIMIT`: a larger one is sent
   * as an ordinary request, which is better than one the browser rejects.
   */
  keepalive?: boolean
}

/** Browsers cap the body of a `keepalive` request at 64 KiB; stay clear of it. */
export const KEEPALIVE_BODY_LIMIT = 60_000

/**
 * Replaces the account's blob with `snapshot` — if the account still is at
 * revision `rev`, the one this client merged against. `conflict` means it is
 * not, and nothing was written: pull, merge and push again.
 */
export async function pushSnapshot(
  snapshot: PlanSnapshot & { deletedPlans?: PlanTombstones },
  rev: number,
  options: PushOptions = {}
): Promise<PushOutcome> {
  if (schemaBlocked) return { status: 'outdated' }
  if (cloudAvailable === false) return { status: 'unconfigured' }

  try {
    const body = JSON.stringify({
      // Informational: the server trusts the header, and stamps the blob.
      schemaVersion: PLAN_SCHEMA_VERSION,
      updatedAt: Date.now(),
      plans: snapshot.plans,
      activePlanId: snapshot.activePlanId,
      deletedPlans: snapshot.deletedPlans ?? {},
    })
    const keepalive =
      options.keepalive === true && new TextEncoder().encode(body).length <= KEEPALIVE_BODY_LIMIT

    const response = await fetch(PLANS_ENDPOINT, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        ...schemaHeaders(),
        [PLAN_REV_HEADER]: String(rev),
      },
      cache: 'no-store',
      ...(keepalive ? { keepalive: true } : {}),
      body,
    })

    noteServerBuild(response)
    const refused = await schemaConflictOf(response)
    if (refused) return refuseSchema(refused)
    if (response.status === 501) {
      cloudAvailable = false
      return { status: 'unconfigured' }
    }
    if (response.status === 401) return { status: 'unauthorized' }
    if (response.status === 412) return { status: 'conflict' }
    if (!response.ok) return { status: 'error' }

    cloudAvailable = true
    const payload = (await response.json()) as unknown
    const updatedAt =
      isRecord(payload) && typeof payload.updatedAt === 'number' ? payload.updatedAt : Date.now()
    return { status: 'ok', rev: revOf(payload, response) ?? rev + 1, updatedAt }
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
  /** The server refused this build's plan schema as too old: paused until a reload. */
  | 'outdated'
  /** The server runs an older version (rollback): paused, retried on focus. */
  | 'server-outdated'

/**
 * Whether the user should reload: `required` — this tab stopped syncing (schema
 * guard); `suggested` — a newer build serves the API but sync still works.
 */
export type ReloadNotice = 'required' | 'suggested' | null

/** Plans that cannot sync because of the plan limit; `null` when all fit. */
export interface PlanLimitStatus {
  /** Plans on this device the account does not hold (in this version). */
  unsynced: number
  /** Plans in the account this device has no room to show. */
  hidden: number
}

interface PlanSyncState {
  phase: SyncPhase
  lastSyncedAt: number | null
  reloadNotice: ReloadNotice
  /** Set while the plan limit keeps some plans from syncing. */
  planLimit: PlanLimitStatus | null
  /** Names of conflict copies not yet announced to the user. */
  conflictCopyNames: string[]
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
  /** Raises the reload notice; it only ever escalates (`suggested` → `required`). */
  requestReload: (notice: Exclude<ReloadNotice, null>) => void
  setPlanLimit: (status: PlanLimitStatus | null) => void
  announceConflictCopies: (names: string[]) => void
  clearConflictCopies: () => void
}

export const usePlanSyncStore = create<PlanSyncState>()((set) => ({
  phase: 'disabled',
  lastSyncedAt: null,
  reloadNotice: null,
  planLimit: null,
  conflictCopyNames: [],
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
      // Both describe the account that was just left.
      planLimit: userId === state.namespaceUserId ? state.planLimit : null,
      conflictCopyNames: userId === state.namespaceUserId ? state.conflictCopyNames : [],
    })),
  requestReload: (notice) =>
    set((state) =>
      state.reloadNotice === 'required' || state.reloadNotice === notice
        ? state
        : { reloadNotice: notice }
    ),
  setPlanLimit: (status) =>
    set((state) => {
      const next = status && status.unsynced + status.hidden > 0 ? status : null
      const same =
        next === state.planLimit ||
        (next !== null &&
          state.planLimit !== null &&
          next.unsynced === state.planLimit.unsynced &&
          next.hidden === state.planLimit.hidden)
      return same ? state : { planLimit: next }
    }),
  announceConflictCopies: (names) =>
    set((state) =>
      names.length === 0 ? state : { conflictCopyNames: [...state.conflictCopyNames, ...names] }
    ),
  clearConflictCopies: () =>
    set((state) => (state.conflictCopyNames.length === 0 ? state : { conflictCopyNames: [] })),
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
