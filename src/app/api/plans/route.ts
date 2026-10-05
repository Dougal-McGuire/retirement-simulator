/**
 * Account-scoped plan storage.
 *
 *   GET  /api/plans -> { configured: true, schemaVersion, blob: CloudPlanBlob | null }
 *   PUT  /api/plans -> { configured: true, updatedAt: number }
 *
 * Both require a signed-in Google account (401 otherwise) and a configured
 * backing store (501 otherwise).
 *
 * SCHEMA GUARD (see `src/lib/plans/schemaVersion.ts`): every request states the
 * client's `PLAN_SCHEMA_VERSION` in the `x-plan-schema` header (missing = 1,
 * i.e. every build from before the guard). Both methods answer
 *
 *   409 { error: 'outdated-client', schemaVersion }   client older than this server
 *   409 { error: 'outdated-server', schemaVersion }   client, or stored blob, newer
 *
 * and neither read nor write — an old client must not even *ingest* newer-shaped
 * data, because its own normalizers would drop what they do not know and its
 * next push would write the loss back. Every answer carries the server's
 * version in `x-plan-schema` and, when known, its build id in `x-build-id`. The 501 answer is a *contract*, not a failure:
 * the client treats it as "no cloud store on this deployment", stops probing
 * for the rest of the session and keeps every plan in its per-account
 * localStorage namespace — the same graceful degradation Google sign-in has.
 *
 * No credential ever reaches the client; the response only ever says whether a
 * store exists at all.
 */

import { z } from 'zod'
import { auth } from '@/auth'
import { isAuthConfigured } from '@/lib/auth/env'
import {
  isCloudStoreConfigured,
  readPlanBlob,
  writePlanBlob,
  readStoredSchemaVersion,
} from '@/lib/server/planStore'
import {
  BUILD_ID,
  BUILD_ID_HEADER,
  OUTDATED_CLIENT_ERROR,
  OUTDATED_SERVER_ERROR,
  PLAN_SCHEMA_HEADER,
  PLAN_SCHEMA_VERSION,
  parsePlanSchemaVersion,
} from '@/lib/plans/schemaVersion'
import { MAX_PLANS } from '@/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Generous next to the 60-char input cap; leaves room for " (2)" suffixes. */
const MAX_PLAN_NAME_LENGTH = 120
const MAX_PLAN_ID_LENGTH = 64

/**
 * `params` is intentionally opaque here: `normalizePersistedParams` on the
 * server is the authority on parameter shape (it is the very same function the
 * browser runs on its persisted state), so duplicating the field list in Zod
 * would only create a second thing to keep in sync.
 */
const PlanSchema = z.object({
  id: z.string().min(1).max(MAX_PLAN_ID_LENGTH),
  name: z.string().min(1).max(MAX_PLAN_NAME_LENGTH),
  nameKey: z.string().max(64).optional(),
  params: z.unknown(),
  createdAt: z.number().finite().optional(),
  updatedAt: z.number().finite().optional(),
})

const PlanBlobSchema = z.object({
  schemaVersion: z.number().finite().optional(),
  updatedAt: z.number().finite().optional(),
  plans: z.array(PlanSchema).min(1).max(MAX_PLANS),
  activePlanId: z.string().min(1).max(MAX_PLAN_ID_LENGTH),
})

/** Headers on every answer: no caching, the server's schema and build. */
function responseHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    'Cache-Control': 'no-store',
    [PLAN_SCHEMA_HEADER]: String(PLAN_SCHEMA_VERSION),
  }
  if (BUILD_ID) headers[BUILD_ID_HEADER] = BUILD_ID
  return headers
}

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: responseHeaders() })

const unconfigured = () => json({ configured: false, error: 'cloud-sync-unconfigured' }, 501)

const unauthorized = () => json({ error: 'unauthorized' }, 401)

const schemaConflict = (error: typeof OUTDATED_CLIENT_ERROR | typeof OUTDATED_SERVER_ERROR) =>
  json({ error, schemaVersion: PLAN_SCHEMA_VERSION }, 409)

/** The client's plan schema version; a request without the header is legacy (1). */
const clientSchemaVersion = (request: Request): number =>
  parsePlanSchemaVersion(request.headers.get(PLAN_SCHEMA_HEADER))

/** `null` when the client may proceed, else the 409 to answer with. */
function checkClientVersion(request: Request): Response | null {
  const version = clientSchemaVersion(request)
  if (version < PLAN_SCHEMA_VERSION) return schemaConflict(OUTDATED_CLIENT_ERROR)
  // A *newer* client against this server: our sanitizer would strip what it
  // does not know before storing, or hand it data it would think incomplete.
  if (version > PLAN_SCHEMA_VERSION) return schemaConflict(OUTDATED_SERVER_ERROR)
  return null
}

/**
 * Resolves the signed-in account id, or `null`.
 *
 * Prefers Google's opaque `sub` and falls back to the e-mail, matching how the
 * browser picks its storage namespace, so both sides key on the same value.
 */
async function currentAccountId(): Promise<string | null> {
  if (!isAuthConfigured()) return null

  try {
    const session = await auth()
    const id = session?.user?.id ?? session?.user?.email ?? null
    return typeof id === 'string' && id.trim() !== '' ? id.trim() : null
  } catch (error) {
    console.error('[api/plans] session lookup failed:', error)
    return null
  }
}

export async function GET(request: Request) {
  if (!isCloudStoreConfigured()) return unconfigured()

  const accountId = await currentAccountId()
  if (!accountId) return unauthorized()

  const conflict = checkClientVersion(request)
  if (conflict) return conflict

  // A missing key is not an error: a brand-new account simply has no blob yet,
  // and the client's merge policy reads that as "seed me from this device".
  const blob = await readPlanBlob(accountId)

  // Written by a newer deployment (this one is a rollback): our sanitizer has
  // already stripped what it does not know, so the blob must not leave here.
  if (blob && blob.schemaVersion > PLAN_SCHEMA_VERSION) return schemaConflict(OUTDATED_SERVER_ERROR)

  return json({ configured: true, schemaVersion: PLAN_SCHEMA_VERSION, blob })
}

export async function PUT(request: Request) {
  if (!isCloudStoreConfigured()) return unconfigured()

  const accountId = await currentAccountId()
  if (!accountId) return unauthorized()

  // Before the body is even parsed: nothing an outdated client sends is stored.
  const conflict = checkClientVersion(request)
  if (conflict) return conflict

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json({ error: 'invalid-json' }, 400)
  }

  const parsed = PlanBlobSchema.safeParse(body)
  if (!parsed.success) {
    return json({ error: 'invalid-body' }, 400)
  }

  // Never overwrite a blob a newer deployment wrote (rollback), and refuse
  // when the guard cannot see what is stored. A check-then-write race only
  // matters during a rollback with newer tabs still writing — accepted.
  const stored = await readStoredSchemaVersion(accountId)
  if (!stored.ok) return json({ error: 'write-failed' }, 502)
  if (stored.version !== null && stored.version > PLAN_SCHEMA_VERSION) {
    return schemaConflict(OUTDATED_SERVER_ERROR)
  }

  // The blob records the highest version that ever wrote it — with both
  // guards passed, that is this server's (= the writer's) version.
  const result = await writePlanBlob(accountId, parsed.data, PLAN_SCHEMA_VERSION)
  if (!result.ok) {
    if (result.reason === 'too-large') return json({ error: 'too-large' }, 413)
    if (result.reason === 'unconfigured') return unconfigured()
    return json({ error: 'write-failed' }, 502)
  }

  return json({ configured: true, updatedAt: result.updatedAt })
}
