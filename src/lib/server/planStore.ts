/**
 * Server-only backing store for account-scoped plans ("cloud sync").
 *
 * SERVER ONLY — this module reads credentials from `process.env` and must never
 * be imported from a client component. Nothing here is exported to the browser;
 * `/api/plans` is the only surface the client sees.
 *
 * Storage is an Upstash Redis instance addressed over its REST API with plain
 * `fetch`, so the feature adds no runtime dependency. Like Google sign-in it is
 * entirely optional: with no credentials `isCloudStoreConfigured()` is false,
 * `/api/plans` answers "unconfigured" and the app keeps its per-account
 * localStorage namespace, exactly as before.
 *
 * One key per account holds one JSON blob:
 *
 *   plans:v1:<hashUserId(accountId)>  ->  { schemaVersion, updatedAt, plans, activePlanId }
 *
 * The account id is hashed with the same non-reversible helper the browser uses
 * for its storage namespace, so no e-mail address ever becomes a Redis key.
 */

import { MAX_PLANS, type Plan } from '@/types'
import { hashUserId } from '@/lib/stores/persistenceKey'
import { normalizePlans } from '@/lib/stores/plans'
import { normalizePersistedParams } from '@/lib/stores/normalizeParams'

/** Version of the *blob* envelope (independent of the client's STORE_VERSION). */
export const CLOUD_SCHEMA_VERSION = 1

/** Refuse anything larger; 12 plans of realistic size stay far below this. */
export const MAX_BLOB_BYTES = 256 * 1024

/** Prefix of the per-account key. Bumping it retires every stored blob. */
export const PLAN_KEY_PREFIX = 'plans:v1:'

export interface CloudPlanBlob {
  schemaVersion: number
  /** Server clock at the moment of the write; drives pull-on-focus. */
  updatedAt: number
  plans: Plan[]
  activePlanId: string
}

export interface CloudStoreConfig {
  url: string
  token: string
}

export type WriteResult =
  | { ok: true; updatedAt: number }
  | { ok: false; reason: 'unconfigured' | 'too-large' | 'error' }

const readEnv = (value: string | undefined): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

/**
 * Credentials, or `null` when either half is missing.
 *
 * `KV_REST_API_*` is what the Vercel Marketplace integration injects;
 * `UPSTASH_REDIS_REST_*` is Upstash's own naming for the same pair, accepted so
 * a database created outside Vercel works without renaming anything.
 */
export function getCloudStoreConfig(): CloudStoreConfig | null {
  const url = readEnv(process.env.KV_REST_API_URL) ?? readEnv(process.env.UPSTASH_REDIS_REST_URL)
  const token =
    readEnv(process.env.KV_REST_API_TOKEN) ?? readEnv(process.env.UPSTASH_REDIS_REST_TOKEN)

  if (!url || !token) return null
  return { url: url.replace(/\/+$/, ''), token }
}

/** True only when a blob can actually be read and written. */
export function isCloudStoreConfigured(): boolean {
  return getCloudStoreConfig() !== null
}

/** Names of the env vars still missing — used for a dev-only console hint. */
export function missingCloudStoreEnvVars(): string[] {
  if (isCloudStoreConfigured()) return []
  return ['KV_REST_API_URL', 'KV_REST_API_TOKEN']
}

/** Redis key holding `accountId`'s plans. The raw id never appears in it. */
export function planStoreKey(accountId: string): string {
  return `${PLAN_KEY_PREFIX}${hashUserId(accountId)}`
}

const byteLength = (value: string): number => new TextEncoder().encode(value).length

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

/**
 * Turns anything that came back from Redis (or arrived in a `PUT` body) into a
 * blob the client can trust.
 *
 * Runs the *same* plan and parameter sanitizers the browser store uses on its
 * own persisted state, so a hand-edited or corrupted blob can never inject an
 * unexpected shape into a client. Returns `null` when nothing usable is left.
 */
export function sanitizeCloudBlob(value: unknown): CloudPlanBlob | null {
  if (!isRecord(value)) return null

  const plans = normalizePlans(value.plans, normalizePersistedParams)
  if (plans.length === 0) return null

  const activePlanId =
    typeof value.activePlanId === 'string' && plans.some((plan) => plan.id === value.activePlanId)
      ? value.activePlanId
      : plans[0].id

  const updatedAt =
    typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) && value.updatedAt > 0
      ? value.updatedAt
      : Date.now()

  return {
    schemaVersion: CLOUD_SCHEMA_VERSION,
    updatedAt,
    plans: plans.slice(0, MAX_PLANS),
    activePlanId,
  }
}

/** Parses the JSON string Redis returned; unparseable data reads as empty. */
function parseStoredBlob(raw: unknown): CloudPlanBlob | null {
  if (typeof raw !== 'string' || raw.trim() === '') return null
  if (byteLength(raw) > MAX_BLOB_BYTES) return null

  try {
    return sanitizeCloudBlob(JSON.parse(raw) as unknown)
  } catch {
    return null
  }
}

async function upstash(
  config: CloudStoreConfig,
  path: string,
  init?: RequestInit
): Promise<unknown> {
  const response = await fetch(`${config.url}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.token}`,
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  })

  if (!response.ok) {
    throw new Error(`Upstash request failed with ${response.status}`)
  }

  return (await response.json()) as unknown
}

/**
 * Reads `accountId`'s blob. A missing key, an unreachable store and a corrupt
 * value all read as `null` — the caller treats every one of them as "this
 * account has nothing stored yet", which degrades to local-only behaviour.
 */
export async function readPlanBlob(accountId: string): Promise<CloudPlanBlob | null> {
  const config = getCloudStoreConfig()
  if (!config) return null

  try {
    const payload = await upstash(config, `get/${encodeURIComponent(planStoreKey(accountId))}`)
    if (!isRecord(payload)) return null
    return parseStoredBlob(payload.result)
  } catch (error) {
    console.error('[planStore] read failed:', error)
    return null
  }
}

/**
 * Upserts `accountId`'s blob. The value is sanitized and re-stamped with the
 * server clock, so a client cannot store a future `updatedAt` and win every
 * later merge.
 */
export async function writePlanBlob(
  accountId: string,
  blob: unknown
): Promise<WriteResult> {
  const config = getCloudStoreConfig()
  if (!config) return { ok: false, reason: 'unconfigured' }

  const sanitized = sanitizeCloudBlob(blob)
  if (!sanitized) return { ok: false, reason: 'error' }

  const updatedAt = Date.now()
  const serialized = JSON.stringify({ ...sanitized, updatedAt })

  if (byteLength(serialized) > MAX_BLOB_BYTES) return { ok: false, reason: 'too-large' }

  try {
    await upstash(config, `set/${encodeURIComponent(planStoreKey(accountId))}`, {
      method: 'POST',
      body: serialized,
    })
    return { ok: true, updatedAt }
  } catch (error) {
    console.error('[planStore] write failed:', error)
    return { ok: false, reason: 'error' }
  }
}
