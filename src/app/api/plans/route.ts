/**
 * Account-scoped plan storage.
 *
 *   GET  /api/plans -> { configured: true, blob: CloudPlanBlob | null }
 *   PUT  /api/plans -> { configured: true, updatedAt: number }
 *
 * Both require a signed-in Google account (401 otherwise) and a configured
 * backing store (501 otherwise). The 501 answer is a *contract*, not a failure:
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
  CLOUD_SCHEMA_VERSION,
} from '@/lib/server/planStore'
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

const unconfigured = () =>
  Response.json({ configured: false, error: 'cloud-sync-unconfigured' }, { status: 501 })

const unauthorized = () => Response.json({ error: 'unauthorized' }, { status: 401 })

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

export async function GET() {
  if (!isCloudStoreConfigured()) return unconfigured()

  const accountId = await currentAccountId()
  if (!accountId) return unauthorized()

  // A missing key is not an error: a brand-new account simply has no blob yet,
  // and the client's merge policy reads that as "seed me from this device".
  const blob = await readPlanBlob(accountId)

  return Response.json(
    { configured: true, schemaVersion: CLOUD_SCHEMA_VERSION, blob },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}

export async function PUT(request: Request) {
  if (!isCloudStoreConfigured()) return unconfigured()

  const accountId = await currentAccountId()
  if (!accountId) return unauthorized()

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid-json' }, { status: 400 })
  }

  const parsed = PlanBlobSchema.safeParse(body)
  if (!parsed.success) {
    return Response.json({ error: 'invalid-body' }, { status: 400 })
  }

  const result = await writePlanBlob(accountId, parsed.data)
  if (!result.ok) {
    if (result.reason === 'too-large') return Response.json({ error: 'too-large' }, { status: 413 })
    if (result.reason === 'unconfigured') return unconfigured()
    return Response.json({ error: 'write-failed' }, { status: 502 })
  }

  return Response.json(
    { configured: true, updatedAt: result.updatedAt },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
