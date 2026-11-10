import {
  DEFAULT_PARAMS,
  MAX_PLANS,
  type Plan,
  type SavedSetup,
  type SimulationParams,
} from '@/types'
import { isRecord } from '@/lib/isRecord'

/**
 * Stable id for the plan every user starts with (or gets migrated into). Fixed
 * rather than generated so that server render and client hydration agree.
 */
export const DEFAULT_PLAN_ID = 'plan-base'

/** Translation key used for the built-in "Base plan" name. */
export const DEFAULT_PLAN_NAME_KEY = 'base'

/** Fallback literal used when no translation is available (tests, PDF). */
export const DEFAULT_PLAN_NAME = 'Base plan'

/** Params normalizer injected by the store (avoids a circular import). */
export type ParamsNormalizer = (value: unknown) => SimulationParams

export interface CreatePlanInput {
  id: string
  name: string
  nameKey?: string
  params: SimulationParams
  createdAt?: number
  updatedAt?: number
}

export function makePlan({
  id,
  name,
  nameKey,
  params,
  createdAt,
  updatedAt,
}: CreatePlanInput): Plan {
  const now = Date.now()
  return {
    id,
    name,
    ...(nameKey ? { nameKey } : {}),
    params,
    createdAt: createdAt ?? now,
    updatedAt: updatedAt ?? createdAt ?? now,
  }
}

/**
 * Timestamp for a change to a plan: the device clock, but never at or before
 * the stamp the plan already carries. A plan pulled from a device whose clock
 * runs ahead would otherwise be "saved" into the past here, and the stale copy
 * on that device would keep winning.
 */
export function nextPlanStamp(previous: number, now = Date.now()): number {
  return Number.isFinite(previous) ? Math.max(now, previous + 1) : now
}

// ---- Deletion tombstones ----------------------------------------------------

/** Plan id -> time the plan was deleted. Synced, so a deletion sticks everywhere. */
export type PlanTombstones = Record<string, number>

/** Plan id -> `updatedAt` of the plan as the account last held it (sync base). */
export type PlanStamps = Record<string, number>

/**
 * How long a deletion is remembered. A device that stays offline for longer
 * than this can bring a deleted plan back — the price of not keeping
 * tombstones forever.
 */
export const PLAN_TOMBSTONE_TTL_MS = 180 * 24 * 60 * 60 * 1000

/** Upper bound on remembered deletions; the oldest are forgotten first. */
export const MAX_PLAN_TOMBSTONES = 200

/** Same bound `/api/plans` puts on a plan id. */
const MAX_TRACKED_ID_LENGTH = 64

const isTrackedId = (id: string): boolean => id.trim() !== '' && id.length <= MAX_TRACKED_ID_LENGTH

/**
 * Tombstones as they may be stored or merged: well-formed entries only, none
 * older than `PLAN_TOMBSTONE_TTL_MS`, at most `MAX_PLAN_TOMBSTONES` (newest
 * kept). Anything else — persisted junk, a tampered blob — reads as "none".
 */
export function sanitizePlanTombstones(value: unknown, now = Date.now()): PlanTombstones {
  if (!isRecord(value)) return {}

  const entries = Object.entries(value)
    .filter(
      (entry): entry is [string, number] =>
        isTrackedId(entry[0]) &&
        typeof entry[1] === 'number' &&
        Number.isFinite(entry[1]) &&
        entry[1] > 0 &&
        now - entry[1] <= PLAN_TOMBSTONE_TTL_MS
    )
    // Newest first; the id breaks ties so every device keeps the same ones.
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, MAX_PLAN_TOMBSTONES)

  return Object.fromEntries(entries)
}

/** `tombstones` plus one more deletion (a later deletion of the same id wins). */
export function withPlanTombstone(
  tombstones: unknown,
  id: string,
  deletedAt: number,
  now = Date.now()
): PlanTombstones {
  const current = sanitizePlanTombstones(tombstones, now)
  return sanitizePlanTombstones({ ...current, [id]: Math.max(current[id] ?? 0, deletedAt) }, now)
}

/** Well-formed sync-base stamps; anything else reads as "never synced". */
export function sanitizePlanStamps(value: unknown): PlanStamps {
  if (!isRecord(value)) return {}

  return Object.fromEntries(
    Object.entries(value)
      .filter(
        (entry): entry is [string, number] =>
          isTrackedId(entry[0]) && typeof entry[1] === 'number' && Number.isFinite(entry[1])
      )
      // Far more than an account can hold; only guards against persisted junk.
      .slice(0, MAX_PLAN_TOMBSTONES)
  )
}

/** Collision-free id for a newly created plan. */
export function createPlanId(existing: readonly Plan[], seed = Date.now()): string {
  const taken = new Set(existing.map((plan) => plan.id))
  let candidate = `plan-${seed.toString(36)}`
  let suffix = 1

  while (taken.has(candidate)) {
    candidate = `plan-${seed.toString(36)}-${suffix}`
    suffix += 1
  }

  return candidate
}

/** Appends " (2)", " (3)", … until the name is unique among `existing`. */
export function uniquePlanName(name: string, existing: readonly Plan[], ignoreId?: string): string {
  const trimmed = name.trim() || DEFAULT_PLAN_NAME
  const taken = new Set(
    existing.filter((plan) => plan.id !== ignoreId).map((plan) => plan.name.toLowerCase())
  )

  if (!taken.has(trimmed.toLowerCase())) return trimmed

  let counter = 2
  while (taken.has(`${trimmed} (${counter})`.toLowerCase())) {
    counter += 1
  }

  return `${trimmed} (${counter})`
}

/**
 * Name offered when duplicating a plan.
 *
 * Duplicate used to mint "Base plan (copy)" silently and switch to it, and that
 * parenthetical then turned up in comparison legends and in exported PDFs —
 * places where nobody would have chosen it. The copy is named up front instead,
 * and what we offer is a numbered sibling that reads like a plan.
 *
 * `takenNames` are *display* names (a built-in plan renders from its
 * translation key, not from `plan.name`), so the suggestion is unique against
 * what the user can actually see in the switcher.
 */
export function suggestDuplicateName(baseName: string, takenNames: readonly string[]): string {
  const trimmed = baseName.trim() || DEFAULT_PLAN_NAME
  const taken = new Set(takenNames.map((name) => name.trim().toLowerCase()))

  // Duplicating "Base plan 2" offers "Base plan 3", not "Base plan 2 2" — but
  // only when the un-numbered name is really there, because a trailing number
  // is usually part of the name ("Retire at 60") rather than a copy counter.
  const numbered = trimmed.match(/^(.*\S)\s+\d+$/)
  const stem = numbered && taken.has(numbered[1].toLowerCase()) ? numbered[1] : trimmed

  let counter = 2
  while (taken.has(`${stem} ${counter}`.toLowerCase())) {
    counter += 1
  }

  return `${stem} ${counter}`
}

/** Drops malformed entries and normalizes every plan's params. */
export function normalizePlans(value: unknown, normalizeParams: ParamsNormalizer): Plan[] {
  if (!Array.isArray(value)) return []

  const seen = new Set<string>()

  return value
    .map((entry): Plan | null => {
      if (!isRecord(entry)) return null

      const { id, name, nameKey, params, createdAt, updatedAt } = entry
      if (typeof id !== 'string' || id.trim() === '' || seen.has(id)) return null
      if (typeof name !== 'string' || name.trim() === '') return null

      seen.add(id)

      const createdTimestamp =
        typeof createdAt === 'number' && Number.isFinite(createdAt) ? createdAt : Date.now()
      const updatedTimestamp =
        typeof updatedAt === 'number' && Number.isFinite(updatedAt) ? updatedAt : createdTimestamp

      return makePlan({
        id,
        name: name.trim(),
        nameKey: typeof nameKey === 'string' && nameKey.trim() !== '' ? nameKey : undefined,
        params: normalizeParams(params),
        createdAt: createdTimestamp,
        updatedAt: updatedTimestamp,
      })
    })
    .filter((plan): plan is Plan => plan !== null)
    .slice(0, MAX_PLANS)
}

export interface BootstrapPlansInput {
  plans?: unknown
  params: SimulationParams
  /**
   * Pre-plan saved setups, read from a v0 blob or the standalone legacy key.
   * They are only ever an import source: nothing writes them any more.
   */
  savedSetups?: readonly SavedSetup[]
  activePlanId?: unknown
  /**
   * Whether pre-plan saved setups may still be imported. False once the
   * one-time import has happened, so deleted plans never come back.
   */
  allowLegacyImport?: boolean
}

export interface BootstrapPlansResult {
  plans: Plan[]
  activePlanId: string
  /** True when pre-plan saved setups were imported as plans. */
  migrated: boolean
}

/**
 * Whether `plan` is the starter plan exactly as the store creates it: the
 * default id, still under its built-in name, on default parameters. The same
 * definition the first-sign-in prompt uses (`authMigration.planIsPristine`).
 */
function isUntouchedDefaultPlan(plan: Plan, normalizeParams: ParamsNormalizer): boolean {
  if (plan.id !== DEFAULT_PLAN_ID) return false
  if (plan.nameKey !== DEFAULT_PLAN_NAME_KEY && plan.name !== DEFAULT_PLAN_NAME) return false
  return (
    JSON.stringify(normalizeParams(plan.params)) === JSON.stringify(normalizeParams(DEFAULT_PARAMS))
  )
}

/**
 * Brings any persisted shape up to the plan-based model.
 *
 * - v1+ state: normalize plans, repair a dangling `activePlanId`. Stored plans
 *   are never rebuilt: a renamed or edited plan comes back exactly as stored.
 * - v0 state (params + savedSetups only): the live params become the "Base
 *   plan" and every saved setup is imported as a plan, preserving ids, names
 *   and timestamps.
 * - Only the untouched starter plan, next to pre-plan saved setups (the store
 *   fell back to its initial state while the standalone legacy key still holds
 *   setups): the setups are imported alongside it.
 * - Empty state: a single default plan holding the current params.
 */
export function bootstrapPlans(
  { plans, params, savedSetups = [], activePlanId, allowLegacyImport = true }: BootstrapPlansInput,
  normalizeParams: ParamsNormalizer
): BootstrapPlansResult {
  const normalized = normalizePlans(plans, normalizeParams)
  const knownIds = new Set(normalized.map((plan) => plan.id))

  // Setups that are not plans yet. An entry carrying a plan's id *is* that
  // plan (the store used to mirror every plan into `savedSetups`), not legacy
  // data waiting to be imported.
  const importable = (allowLegacyImport ? savedSetups : []).filter(
    (setup) => setup.id !== DEFAULT_PLAN_ID && !knownIds.has(setup.id)
  )
  const importSetups = (room: number): Plan[] =>
    importable.slice(0, Math.max(0, room)).map((setup) =>
      makePlan({
        id: setup.id,
        name: setup.name.trim() || DEFAULT_PLAN_NAME,
        params: normalizeParams(setup.params),
        createdAt: setup.timestamp,
        updatedAt: setup.timestamp,
      })
    )

  if (normalized.length > 0) {
    // Plans exist. Pre-plan setups are only brought in next to the untouched
    // starter plan: anything the user has worked on means the import already
    // ran, or would resurrect plans they deleted since.
    const untouched =
      normalized.length === 1 && isUntouchedDefaultPlan(normalized[0], normalizeParams)
    const imported = untouched ? importSetups(MAX_PLANS - normalized.length) : []
    const nextPlans = [...normalized, ...imported]
    const active =
      typeof activePlanId === 'string' && nextPlans.some((plan) => plan.id === activePlanId)
        ? activePlanId
        : nextPlans[0].id

    return { plans: nextPlans, activePlanId: active, migrated: imported.length > 0 }
  }

  const basePlan = makePlan({
    id: DEFAULT_PLAN_ID,
    name: DEFAULT_PLAN_NAME,
    nameKey: DEFAULT_PLAN_NAME_KEY,
    params,
  })
  const imported = importSetups(MAX_PLANS - 1)

  return {
    plans: [basePlan, ...imported],
    activePlanId: DEFAULT_PLAN_ID,
    migrated: imported.length > 0,
  }
}

export interface MergePlanListsInput {
  /**
   * The list both sides started from: what this tab last read from, or wrote
   * to, storage. Empty when unknown — then nothing counts as deleted and the
   * result is the union of both lists.
   */
  base: readonly Plan[]
  /** This tab's list, in memory. */
  mine: readonly Plan[]
  /** The list another tab wrote. */
  theirs: readonly Plan[]
  /** Whether two versions of one plan are the same (name, timestamps, params). */
  isSame: (a: Plan, b: Plan) => boolean
  /** A plan of this tab that must survive: the one carrying unsaved edits. */
  keepId?: string | null
}

/**
 * Three-way merge of two tabs' plan lists, per plan.
 *
 * Two tabs of one browser share one localStorage entry and each writes its
 * whole list. Merging against the common base keeps both tabs' work: a plan
 * only one side changed (or created, or deleted) follows that side; a plan
 * both sides saved keeps the newer save; an edit beats a delete.
 *
 * When this tab changed nothing since the base, the other tab's list is
 * returned as it is, order included — the ordinary case of a tab that sat in
 * the background while the other one was used.
 */
export function mergePlanLists({
  base,
  mine,
  theirs,
  isSame,
  keepId,
}: MergePlanListsInput): Plan[] {
  const baseById = new Map(base.map((plan) => [plan.id, plan]))
  const mineById = new Map(mine.map((plan) => [plan.id, plan]))
  const theirsById = new Map(theirs.map((plan) => [plan.id, plan]))

  /** In the base, and still exactly as it was there. */
  const untouched = (plan: Plan): boolean => {
    const origin = baseById.get(plan.id)
    return origin !== undefined && isSame(plan, origin)
  }

  const mineUnchanged =
    mine.length === base.length &&
    mine.every((plan, index) => plan.id === base[index].id && isSame(plan, base[index]))
  if (mineUnchanged && (!keepId || theirsById.has(keepId))) return [...theirs]

  const merged: Plan[] = []

  for (const plan of mine) {
    const rival = theirsById.get(plan.id)
    if (!rival) {
      // Gone from their list: they deleted it — unless it is new here, was
      // changed here since, or carries this tab's unsaved edits.
      if (!untouched(plan) || plan.id === keepId) merged.push(plan)
      continue
    }
    if (isSame(plan, rival) || untouched(rival)) merged.push(plan)
    else if (untouched(plan)) merged.push(rival)
    // Both sides saved it (or there is no base to tell): the newer save wins,
    // a tie goes to the copy this tab is showing.
    else merged.push(rival.updatedAt > plan.updatedAt ? rival : plan)
  }

  for (const plan of theirs) {
    // Not in this tab's list: deleted here — unless it is new there, or they
    // changed it since.
    if (!mineById.has(plan.id) && !untouched(plan)) merged.push(plan)
  }

  return merged
}
