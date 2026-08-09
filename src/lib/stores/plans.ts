import { MAX_PLANS, type Plan, type SavedSetup, type SimulationParams } from '@/types'

/**
 * Stable id for the plan every user starts with (or gets migrated into). Fixed
 * rather than generated so that server render and client hydration agree.
 */
export const DEFAULT_PLAN_ID = 'plan-base'

/** Translation key used for the built-in "Base plan" name. */
export const DEFAULT_PLAN_NAME_KEY = 'base'

/** Fallback literal used when no translation is available (tests, PDF, mirror). */
export const DEFAULT_PLAN_NAME = 'Base plan'

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

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

/**
 * Legacy view over plans. `savedSetups` predates plans; keeping it as a mirror
 * means the existing "save / load setup" controls operate on real plans instead
 * of a second, competing store of parameter snapshots.
 */
export function plansToSavedSetups(plans: readonly Plan[]): SavedSetup[] {
  return plans.map((plan) => ({
    id: plan.id,
    name: plan.name,
    timestamp: plan.updatedAt,
    params: plan.params,
  }))
}

export interface BootstrapPlansInput {
  plans?: unknown
  params: SimulationParams
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
  /** True when plans had to be created from pre-plan (v0) persisted state. */
  migrated: boolean
}

/**
 * Brings any persisted shape up to the plan-based model.
 *
 * - v1+ state: normalize plans, repair a dangling `activePlanId`.
 * - v0 state (params + savedSetups only): the live params become the "Base
 *   plan" and every saved setup is imported as a plan, preserving ids, names
 *   and timestamps. Nothing is deleted — `savedSetups` keeps mirroring plans.
 * - Empty state: a single default plan holding the current params.
 */
export function bootstrapPlans(
  { plans, params, savedSetups = [], activePlanId, allowLegacyImport = true }: BootstrapPlansInput,
  normalizeParams: ParamsNormalizer
): BootstrapPlansResult {
  const normalized = normalizePlans(plans, normalizeParams)

  // A lone untouched default plan means the store fell back to its initial
  // state, so pre-plan saved setups may still need importing.
  const isPristineDefault = normalized.length === 1 && normalized[0].id === DEFAULT_PLAN_ID
  const needsLegacyImport = allowLegacyImport && savedSetups.length > 0

  if (normalized.length > 0 && !(isPristineDefault && needsLegacyImport)) {
    const active =
      typeof activePlanId === 'string' && normalized.some((plan) => plan.id === activePlanId)
        ? activePlanId
        : normalized[0].id

    return { plans: normalized, activePlanId: active, migrated: false }
  }

  const basePlan = makePlan({
    id: DEFAULT_PLAN_ID,
    name: DEFAULT_PLAN_NAME,
    nameKey: DEFAULT_PLAN_NAME_KEY,
    params,
  })

  const imported = (allowLegacyImport ? savedSetups : [])
    .filter((setup) => setup.id !== DEFAULT_PLAN_ID)
    .slice(0, MAX_PLANS - 1)
    .map((setup) =>
      makePlan({
        id: setup.id,
        name: setup.name.trim() || DEFAULT_PLAN_NAME,
        params: normalizeParams(setup.params),
        createdAt: setup.timestamp,
        updatedAt: setup.timestamp,
      })
    )

  const nextPlans = [basePlan, ...imported]

  return {
    plans: nextPlans,
    activePlanId: DEFAULT_PLAN_ID,
    migrated: imported.length > 0,
  }
}
