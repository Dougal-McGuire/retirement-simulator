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
 * Two keys per account (protocol: `docs/specs/2026-11-09-sync-protocol.md`):
 *
 *   plans:v1:<hash>        ->  { schemaVersion, rev, updatedAt, plans, deletedPlans, activePlanId }
 *   plans:v1:<hash>:meta   ->  "<rev>:<schemaVersion>"
 *
 * `rev` counts the writes to the blob. A write names the revision it is based
 * on and is applied by one Lua script (`COMPARE_AND_SET_SCRIPT`) that compares
 * it with the meta key and replaces blob and meta together — or changes
 * nothing. `schemaVersion` is the highest `PLAN_SCHEMA_VERSION` that ever wrote
 * the blob (see `src/lib/plans/schemaVersion.ts`); the same script refuses to
 * overwrite a blob newer than the writer. A blob from before the meta key
 * existed reads as revision 0 and keeps working; its first write creates the
 * meta key.
 *
 * Outside production the keys carry the deployment environment as a prefix
 * (`preview:plans:v1:…`), so a preview deployment that shares the production
 * credentials can never touch production data.
 *
 * The account id is hashed with the same non-reversible helper the browser uses
 * for its storage namespace, so no e-mail address ever becomes a Redis key.
 */

import { MAX_PLANS, type Plan } from '@/types'
import { hashUserId } from '@/lib/stores/persistenceKey'
import { normalizePlans, sanitizePlanTombstones, type PlanTombstones } from '@/lib/stores/plans'
import { normalizePersistedParams } from '@/lib/stores/normalizeParams'
import {
  LEGACY_PLAN_SCHEMA_VERSION,
  PLAN_SCHEMA_VERSION,
  parsePlanRev,
  parsePlanSchemaVersion,
} from '@/lib/plans/schemaVersion'

/** Refuse anything larger; 12 plans of realistic size stay far below this. */
export const MAX_BLOB_BYTES = 256 * 1024

/** Prefix of the per-account key. Bumping it retires every stored blob. */
export const PLAN_KEY_PREFIX = 'plans:v1:'

/** A request to the store that takes longer than this counts as failed. */
export const UPSTASH_TIMEOUT_MS = 4000

export interface CloudPlanBlob {
  /** Highest plan schema version that wrote this blob (legacy blobs: 1). */
  schemaVersion: number
  /** Number of writes so far; 0 for a blob from before revisions existed. */
  rev: number
  /** Server clock at the moment of the write. Informational only. */
  updatedAt: number
  plans: Plan[]
  /** Deleted plan id -> time of deletion; see `sanitizePlanTombstones`. */
  deletedPlans: PlanTombstones
  /**
   * The plan selected on the device that wrote last. Only a hint for a device
   * that adopts the account wholesale; the selection itself is per device.
   */
  activePlanId: string
}

export interface CloudStoreConfig {
  url: string
  token: string
}

/**
 * Outcome of a read. Only `empty` means "this account has nothing stored":
 * a store that could not be asked, or a value that could not be understood,
 * is an `error` — the caller must never mistake it for an empty account,
 * because a client seeds an empty account from whatever it has locally.
 */
export type ReadResult =
  | { status: 'ok'; blob: CloudPlanBlob; rev: number }
  | { status: 'empty'; rev: number }
  /** Written by a newer deployment than this one (a rollback): hands off. */
  | { status: 'newer'; schemaVersion: number }
  | { status: 'error'; reason: 'unconfigured' | 'unreachable' | 'corrupt' }

export type WriteResult =
  | { status: 'ok'; rev: number; updatedAt: number }
  /** The stored revision is not the one the write was based on. Nothing written. */
  | { status: 'conflict'; rev: number }
  /** The stored blob was written by a newer schema version. Nothing written. */
  | { status: 'newer'; schemaVersion: number }
  | { status: 'invalid' | 'too-large' | 'unconfigured' | 'error' }

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

/**
 * Key prefix of the deployment environment: empty in production (and wherever
 * `VERCEL_ENV` is not set, e.g. a self-hosted server), so data stored before
 * the prefix existed stays where it is; `preview:` / `development:` otherwise.
 */
export function planKeyNamespace(): string {
  const environment = (readEnv(process.env.VERCEL_ENV) ?? '').toLowerCase()
  if (environment === '' || environment === 'production') return ''
  return `${environment.replace(/[^a-z0-9-]/g, '-')}:`
}

/** Redis key holding `accountId`'s plans. The raw id never appears in it. */
export function planStoreKey(accountId: string): string {
  return `${planKeyNamespace()}${PLAN_KEY_PREFIX}${hashUserId(accountId)}`
}

/** Companion key holding `"<rev>:<schemaVersion>"` of the blob next to it. */
export function planMetaKey(accountId: string): string {
  return `${planStoreKey(accountId)}:meta`
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
export function sanitizeCloudBlob(value: unknown, now = Date.now()): CloudPlanBlob | null {
  if (!isRecord(value)) return null

  const plans = normalizePlans(value.plans, normalizePersistedParams).slice(0, MAX_PLANS)
  if (plans.length === 0) return null

  const activePlanId =
    typeof value.activePlanId === 'string' && plans.some((plan) => plan.id === value.activePlanId)
      ? value.activePlanId
      : plans[0].id

  const updatedAt =
    typeof value.updatedAt === 'number' && Number.isFinite(value.updatedAt) && value.updatedAt > 0
      ? value.updatedAt
      : now

  // A plan that is in the blob is not deleted, whatever a tombstone says.
  const deletedPlans = sanitizePlanTombstones(value.deletedPlans, now)
  plans.forEach((plan) => {
    delete deletedPlans[plan.id]
  })

  return {
    schemaVersion: parsePlanSchemaVersion(value.schemaVersion),
    rev: parsePlanRev(value.rev) ?? 0,
    updatedAt,
    plans,
    deletedPlans,
    activePlanId,
  }
}

/**
 * One Redis command, sent the way Upstash's REST API takes any command: the
 * argument list as a JSON array in the body of a `POST` to the database URL.
 * Resolves with the command's result; rejects on a transport failure, a
 * non-2xx status, an error answer (`{ error }`, e.g. an exhausted quota) or a
 * timeout — never resolves with something that merely looks like "no data".
 */
async function upstash(config: CloudStoreConfig, command: readonly string[]): Promise<unknown> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPSTASH_TIMEOUT_MS)

  try {
    const response = await fetch(config.url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(command),
      cache: 'no-store',
      signal: controller.signal,
    })

    if (!response.ok) {
      throw new Error(`Upstash request failed with ${response.status}`)
    }

    const payload = (await response.json()) as unknown
    if (!isRecord(payload) || 'error' in payload || !('result' in payload)) {
      throw new Error('Upstash answered without a result')
    }
    return payload.result
  } finally {
    clearTimeout(timer)
  }
}

interface StoredMeta {
  rev: number
  schemaVersion: number
}

/** Parses the meta key; `null` for a value this code never wrote. */
function parseMeta(raw: string): StoredMeta | null {
  const match = /^(\d+):(\d+)$/.exec(raw)
  if (!match) return null
  const rev = parsePlanRev(match[1])
  const schemaVersion = Number(match[2])
  if (rev === null || !Number.isSafeInteger(schemaVersion)) return null
  return { rev, schemaVersion }
}

const formatMeta = ({ rev, schemaVersion }: StoredMeta): string => `${rev}:${schemaVersion}`

/**
 * Reads `accountId`'s blob and its revision in one command.
 *
 * Only a key that is really absent reads as `empty`. An unreachable store, an
 * error answer, a timeout and a stored value that cannot be parsed are all
 * `error`: what cannot be read must never be reported as "nothing there".
 */
export async function readPlanBlob(accountId: string): Promise<ReadResult> {
  const config = getCloudStoreConfig()
  if (!config) return { status: 'error', reason: 'unconfigured' }

  let rawBlob: unknown
  let rawMeta: unknown
  try {
    const result = await upstash(config, ['MGET', planStoreKey(accountId), planMetaKey(accountId)])
    if (!Array.isArray(result) || result.length !== 2) {
      throw new Error('Upstash answered MGET with an unexpected shape')
    }
    ;[rawBlob, rawMeta] = result as [unknown, unknown]
  } catch (error) {
    console.error('[planStore] read failed:', error)
    return { status: 'error', reason: 'unreachable' }
  }

  const corrupt = (what: string): ReadResult => {
    console.error(`[planStore] stored ${what} is unreadable; refusing to treat it as empty`)
    return { status: 'error', reason: 'corrupt' }
  }

  let meta: StoredMeta | null = null
  if (rawMeta !== null) {
    meta = typeof rawMeta === 'string' ? parseMeta(rawMeta) : null
    if (!meta) return corrupt('revision')
  }
  if (meta && meta.schemaVersion > PLAN_SCHEMA_VERSION) {
    return { status: 'newer', schemaVersion: meta.schemaVersion }
  }

  const rev = meta?.rev ?? 0
  if (rawBlob === null) return { status: 'empty', rev }
  if (typeof rawBlob !== 'string' || byteLength(rawBlob) > MAX_BLOB_BYTES) return corrupt('blob')

  let parsed: unknown
  try {
    parsed = JSON.parse(rawBlob) as unknown
  } catch {
    return corrupt('blob')
  }
  if (!isRecord(parsed)) return corrupt('blob')

  // Checked on the raw value: our sanitizer strips what it does not know, so
  // a newer blob must be refused before it gets anywhere near it.
  const schemaVersion = parsePlanSchemaVersion(parsed.schemaVersion)
  if (schemaVersion > PLAN_SCHEMA_VERSION) return { status: 'newer', schemaVersion }

  const blob = sanitizeCloudBlob(parsed)
  if (!blob) return corrupt('blob')

  return { status: 'ok', blob: { ...blob, rev }, rev }
}

/**
 * The whole write, atomically (Redis runs a script without interleaving any
 * other command):
 *
 *   KEYS[1] blob key        ARGV[1] revision the write is based on
 *   KEYS[2] meta key        ARGV[2] schema version of the writer
 *                           ARGV[3] new blob
 *                           ARGV[4] new meta ("<rev + 1>:<schema version>")
 *
 * Answers `{'ok', newRev}`, `{'conflict', storedRev}`, `{'newer', storedRev,
 * storedSchema}` or `{'corrupt'}`; only `ok` has written anything.
 *
 * A blob without a meta key predates revisions: it is revision 0, and its
 * schema version is read from the blob text itself (it is the first field the
 * old writer serialized), so the "never overwrite a newer blob" rule holds for
 * it too.
 */
export const COMPARE_AND_SET_SCRIPT = `
local meta = redis.call('GET', KEYS[2])
local rev = 0
local schema = 0
if meta then
  local r, s = string.match(meta, '^(%d+):(%d+)$')
  if not r then return {'corrupt'} end
  rev = tonumber(r)
  schema = tonumber(s)
else
  local blob = redis.call('GET', KEYS[1])
  if blob then
    schema = tonumber(string.match(blob, '"schemaVersion"%s*:%s*(%d+)')) or ${LEGACY_PLAN_SCHEMA_VERSION}
  end
end
if schema > tonumber(ARGV[2]) then return {'newer', rev, schema} end
if rev ~= tonumber(ARGV[1]) then return {'conflict', rev} end
redis.call('SET', KEYS[1], ARGV[3])
redis.call('SET', KEYS[2], ARGV[4])
return {'ok', rev + 1}
`.trim()

/** A stamp from a device whose clock runs ahead is pulled back to `now`. */
const notAfter = (stamp: number, now: number): number => (stamp > now ? now : stamp)

export interface WriteOptions {
  /** Revision of the blob this write is based on (what the client last read). */
  expectedRev: number
  /** Server clock; injectable for tests. */
  now?: number
}

/**
 * Replaces `accountId`'s blob — if, and only if, the stored revision still is
 * `expectedRev` and the stored blob is not newer than this server's schema.
 *
 * The value is sanitized, stamped with this server's schema version and clock,
 * and every plan `updatedAt` (and deletion time) that lies in the future is
 * clamped to the server clock: plans are merged last-write-wins on those
 * stamps, and a device whose clock runs ahead must not win every later merge.
 */
export async function writePlanBlob(
  accountId: string,
  blob: unknown,
  { expectedRev, now = Date.now() }: WriteOptions
): Promise<WriteResult> {
  const config = getCloudStoreConfig()
  if (!config) return { status: 'unconfigured' }

  const sanitized = sanitizeCloudBlob(blob, now)
  if (!sanitized) return { status: 'invalid' }

  const rev = expectedRev + 1
  const stored: CloudPlanBlob = {
    schemaVersion: PLAN_SCHEMA_VERSION,
    rev,
    updatedAt: now,
    plans: sanitized.plans.map((plan) => ({
      ...plan,
      createdAt: notAfter(plan.createdAt, now),
      updatedAt: notAfter(plan.updatedAt, now),
    })),
    deletedPlans: Object.fromEntries(
      Object.entries(sanitized.deletedPlans).map(([id, deletedAt]) => [
        id,
        notAfter(deletedAt, now),
      ])
    ),
    activePlanId: sanitized.activePlanId,
  }
  const serialized = JSON.stringify(stored)

  if (byteLength(serialized) > MAX_BLOB_BYTES) return { status: 'too-large' }

  let result: unknown
  try {
    result = await upstash(config, [
      'EVAL',
      COMPARE_AND_SET_SCRIPT,
      '2',
      planStoreKey(accountId),
      planMetaKey(accountId),
      String(expectedRev),
      String(PLAN_SCHEMA_VERSION),
      serialized,
      formatMeta({ rev, schemaVersion: PLAN_SCHEMA_VERSION }),
    ])
  } catch (error) {
    console.error('[planStore] write failed:', error)
    return { status: 'error' }
  }

  const [verdict, storedRev, storedSchema] = Array.isArray(result) ? (result as unknown[]) : []
  if (verdict === 'ok' && parsePlanRev(storedRev) === rev) {
    return { status: 'ok', rev, updatedAt: now }
  }
  if (verdict === 'conflict') {
    return { status: 'conflict', rev: parsePlanRev(storedRev) ?? 0 }
  }
  if (verdict === 'newer') {
    return { status: 'newer', schemaVersion: parsePlanSchemaVersion(storedSchema) }
  }

  console.error('[planStore] write refused by the store:', verdict)
  return { status: 'error' }
}
