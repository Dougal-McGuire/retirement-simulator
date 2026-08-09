/**
 * First-sign-in plan migration.
 *
 * Everything this app stores lives in `localStorage`, and signing in only
 * *namespaces* those keys (see `./persistenceKey`). Without help that means a
 * user who built plans while signed out lands in an empty workspace the moment
 * they sign in — which reads exactly like data loss.
 *
 * So on the first sign-in of an account we look at both namespaces and, when
 * the account is still empty while the anonymous workspace holds real work,
 * offer to copy it across. The anonymous namespace is never modified: signing
 * out always returns the user to exactly what they had.
 */

import { DEFAULT_PARAMS, type SimulationParams } from '@/types'
import { DEFAULT_PLAN_ID, DEFAULT_PLAN_NAME, DEFAULT_PLAN_NAME_KEY } from '@/lib/stores/plans'
import { cashFlowSignature, sanitizeCashFlows } from '@/lib/simulation/cashFlows'
import {
  BASE_PLANS_MIGRATED_KEY,
  BASE_STORE_KEY,
  NAMESPACED_BASE_KEYS,
  namespaceStorageKey,
} from '@/lib/stores/persistenceKey'

/** Minimal read/write surface — `localStorage` in the browser, a map in tests. */
export interface KeyValueStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** What the caller should do once a session resolves. */
export type MigrationDecision =
  /** Nothing to offer — leave the workspace exactly as it is. */
  | 'none'
  /** The account is empty and local work exists: ask before copying. */
  | 'prompt'

interface PersistedShape {
  state?: {
    params?: unknown
    /** Working copy of the active plan's params (store v2+). */
    draftParams?: unknown
    plans?: unknown
    activePlanId?: unknown
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/** Tolerant parse of a Zustand `persist` blob; malformed data reads as absent. */
export function parsePersistedStore(raw: string | null | undefined): PersistedShape | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return isRecord(parsed) ? (parsed as PersistedShape) : null
  } catch {
    return null
  }
}

/** Numeric/array params compared loosely — persisted numbers may be strings. */
function paramsAreDefault(params: unknown): boolean {
  if (!isRecord(params)) return true

  const oneTimeIncomes = params.oneTimeIncomes
  const customExpenses = params.customExpenses
  if (Array.isArray(oneTimeIncomes) && oneTimeIncomes.length !== DEFAULT_PARAMS.oneTimeIncomes.length)
    return false
  if (Array.isArray(customExpenses)) {
    if (customExpenses.length !== DEFAULT_PARAMS.customExpenses.length) return false
    const defaultsById = new Map(DEFAULT_PARAMS.customExpenses.map((e) => [e.id, e]))
    const changed = customExpenses.some((entry) => {
      if (!isRecord(entry)) return true
      const reference = defaultsById.get(String(entry.id))
      if (!reference) return true
      return (
        Number(entry.amount) !== reference.amount ||
        entry.interval !== reference.interval ||
        entry.name !== reference.name
      )
    })
    if (changed) return false
  }

  // Cash flows are the source of truth for both arrays above; a workspace that
  // added a windowed flow is not pristine even when the projections still look
  // like the defaults. Pre-v3 blobs have no `cashFlows` at all — that is the
  // untouched starter too, so only an actually stored list is compared.
  const cashFlows = params.cashFlows
  if (Array.isArray(cashFlows)) {
    const stored = cashFlowSignature(sanitizeCashFlows(cashFlows))
    const reference = cashFlowSignature(DEFAULT_PARAMS.cashFlows)
    if (stored.length !== reference.length) return false
    if (stored.some((value, index) => value !== reference[index])) return false
  }

  return !(Object.keys(DEFAULT_PARAMS) as Array<keyof SimulationParams>).some((key) => {
    if (key === 'oneTimeIncomes' || key === 'customExpenses' || key === 'cashFlows') return false
    const stored = params[key]
    if (stored === undefined) return false
    const reference = DEFAULT_PARAMS[key]
    if (typeof reference === 'number') return Number(stored) !== reference
    return stored !== reference
  })
}

function planIsPristine(plan: unknown): boolean {
  if (!isRecord(plan)) return false
  const isDefaultIdentity =
    plan.id === DEFAULT_PLAN_ID &&
    (plan.nameKey === DEFAULT_PLAN_NAME_KEY || plan.name === DEFAULT_PLAN_NAME)
  return isDefaultIdentity && paramsAreDefault(plan.params)
}

/**
 * True when a namespace holds nothing a user would miss: absent, unparseable,
 * or just the untouched starter plan on default parameters.
 */
export function isPristineWorkspace(raw: string | null | undefined): boolean {
  const parsed = parsePersistedStore(raw)
  if (!parsed?.state) return true

  const { plans, params, draftParams } = parsed.state

  // Unsaved slider edits live in `draftParams` (store v2+) and are just as
  // much "work the user would miss" as a saved plan.
  if (draftParams !== undefined && !paramsAreDefault(draftParams)) return false

  if (Array.isArray(plans) && plans.length > 0) {
    if (plans.length > 1) return false
    return planIsPristine(plans[0]) && paramsAreDefault(params)
  }

  return paramsAreDefault(params)
}

export interface MigrationInputs {
  /** Raw persisted blob of the signed-in namespace. */
  userRaw: string | null
  /** Raw persisted blob of the anonymous (base-key) namespace. */
  anonymousRaw: string | null
  /** Whether this account already answered the prompt. */
  alreadyAnswered: boolean
}

/**
 * Pure decision: offer the copy only when the account is still pristine, the
 * anonymous workspace is not, and the user has not answered before.
 */
export function decideMigration({
  userRaw,
  anonymousRaw,
  alreadyAnswered,
}: MigrationInputs): MigrationDecision {
  if (alreadyAnswered) return 'none'
  if (isPristineWorkspace(anonymousRaw)) return 'none'
  if (!isPristineWorkspace(userRaw)) return 'none'
  return 'prompt'
}

/** Key holding the one-shot "already answered" marker for `userId`. */
export function migrationMarkerKey(userId: string): string {
  return namespaceStorageKey(BASE_PLANS_MIGRATED_KEY, userId)
}

/** Reads the decision inputs for `userId` out of `storage`. */
export function readMigrationInputs(userId: string, storage: KeyValueStorage): MigrationInputs {
  const safeGet = (key: string): string | null => {
    try {
      return storage.getItem(key)
    } catch {
      return null
    }
  }

  return {
    userRaw: safeGet(namespaceStorageKey(BASE_STORE_KEY, userId)),
    anonymousRaw: safeGet(BASE_STORE_KEY),
    alreadyAnswered: safeGet(migrationMarkerKey(userId)) === '1',
  }
}

/** Records that `userId` answered the prompt (either way). */
export function markMigrationAnswered(userId: string, storage: KeyValueStorage): void {
  try {
    storage.setItem(migrationMarkerKey(userId), '1')
  } catch {
    // Storage full or unavailable: worst case the prompt appears again, which
    // is still safe — copying is idempotent and never touches anonymous data.
  }
}

/**
 * Copies every namespaced key of the anonymous workspace into `userId`'s
 * namespace. Source keys are only ever read, so signing out restores the
 * original workspace untouched. Returns the number of keys copied.
 */
export function copyAnonymousWorkspace(userId: string, storage: KeyValueStorage): number {
  let copied = 0

  for (const baseKey of NAMESPACED_BASE_KEYS) {
    const target = namespaceStorageKey(baseKey, userId)
    if (target === baseKey) continue

    let value: string | null = null
    try {
      value = storage.getItem(baseKey)
    } catch {
      value = null
    }
    if (value === null) continue

    try {
      storage.setItem(target, value)
      copied += 1
    } catch {
      // Ignore quota errors on individual keys; a partial copy still leaves the
      // anonymous workspace intact and the store falls back to defaults.
    }
  }

  return copied
}
