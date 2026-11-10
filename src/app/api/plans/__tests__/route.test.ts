/**
 * `@/auth` is mocked so next-auth (and its ESM/runtime requirements) never
 * loads here: what these tests pin is the *gating* contract of the route —
 * unconfigured store, missing session, oversized or malformed body — not
 * NextAuth itself.
 */

import { DEFAULT_PARAMS, MAX_PLANS, type Plan } from '@/types'
import { makePlan } from '@/lib/stores/plans'
import { PLAN_REV_HEADER, PLAN_SCHEMA_HEADER, PLAN_SCHEMA_VERSION } from '@/lib/plans/schemaVersion'
import { planMetaKey, planStoreKey } from '@/lib/server/planStore'
import { createFakeUpstash, type FakeUpstash } from '@/lib/server/testing/fakeUpstash'

const authMock = jest.fn()

jest.mock('@/auth', () => ({
  auth: () => authMock(),
}))

type Session = { user?: { id?: string; email?: string } } | null

const ENV_KEYS = [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'AUTH_SECRET',
  'NEXTAUTH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'AUTH_GOOGLE_ID',
  'AUTH_GOOGLE_SECRET',
  'VERCEL_ENV',
] as const

const originalEnv = { ...process.env }
const originalFetch = global.fetch

const configureAuth = () => {
  process.env.AUTH_SECRET = 'test-secret'
  process.env.GOOGLE_CLIENT_ID = 'client-id'
  process.env.GOOGLE_CLIENT_SECRET = 'client-secret'
}

const configureStore = () => {
  process.env.KV_REST_API_URL = 'https://redis.example.com'
  process.env.KV_REST_API_TOKEN = 'token-123'
}

const ACCOUNT = 'google-sub-1'

const signedIn = (session: Session = { user: { id: ACCOUNT } }) => {
  authMock.mockResolvedValue(session)
}

/** The in-memory store behind the route in these tests. */
let store: FakeUpstash

const seedStore = (blob: Record<string, unknown>, meta?: string) => {
  store.data[planStoreKey(ACCOUNT)] = JSON.stringify(blob)
  if (meta !== undefined) store.data[planMetaKey(ACCOUNT)] = meta
}

const plan = (id: string): Plan =>
  makePlan({ id, name: id, params: DEFAULT_PARAMS, createdAt: 1, updatedAt: 2 })

/** `version: null` sends no schema header — every build from before the guard. */
const schemaHeader = (version: number | string | null): Record<string, string> =>
  version === null ? {} : { [PLAN_SCHEMA_HEADER]: String(version) }

const getRequest = (version: number | string | null = PLAN_SCHEMA_VERSION): Request =>
  new Request('https://example.com/api/plans', {
    method: 'GET',
    headers: schemaHeader(version),
  })

/** `rev: null` sends no `x-plan-rev` — a writer that names no revision. */
const putRequest = (
  body: unknown,
  version: number | string | null = PLAN_SCHEMA_VERSION,
  rev: number | string | null = 0
): Request =>
  new Request('https://example.com/api/plans', {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...schemaHeader(version),
      ...(rev === null ? {} : { [PLAN_REV_HEADER]: String(rev) }),
    },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })

// The route reads env at call time, so a plain import is enough.
const loadRoute = async () => import('@/app/api/plans/route')

beforeEach(() => {
  ENV_KEYS.forEach((key) => {
    delete process.env[key]
  })
  authMock.mockReset()
  authMock.mockResolvedValue(null)
  jest.spyOn(console, 'error').mockImplementation(() => {})
  store = createFakeUpstash()
  global.fetch = jest.fn(store.fetch) as unknown as typeof fetch
})

afterEach(() => {
  process.env = { ...originalEnv }
  global.fetch = originalFetch
  jest.restoreAllMocks()
})

describe('unconfigured deployment', () => {
  it('answers 501 on GET without ever looking at the session', async () => {
    configureAuth()
    signedIn()
    const { GET } = await loadRoute()

    const response = await GET(getRequest())
    expect(response.status).toBe(501)
    await expect(response.json()).resolves.toEqual({
      configured: false,
      error: 'cloud-sync-unconfigured',
    })
    expect(authMock).not.toHaveBeenCalled()
  })

  it('answers 501 on PUT', async () => {
    const { PUT } = await loadRoute()

    const response = await PUT(putRequest({ plans: [plan('a')], activePlanId: 'a' }))
    expect(response.status).toBe(501)
    expect((await response.json()).configured).toBe(false)
  })

  it('leaks no credential in the unconfigured answer', async () => {
    configureStore()
    const { GET } = await loadRoute()
    const body = JSON.stringify(await (await GET(getRequest())).json())
    expect(body).not.toContain('token-123')
    expect(body).not.toContain('redis.example.com')
  })
})

describe('authentication gating', () => {
  beforeEach(() => {
    configureStore()
    configureAuth()
  })

  it('rejects an anonymous GET with 401', async () => {
    authMock.mockResolvedValue(null)
    const { GET } = await loadRoute()

    const response = await GET(getRequest())
    expect(response.status).toBe(401)
    await expect(response.json()).resolves.toEqual({ error: 'unauthorized' })
  })

  it('rejects an anonymous PUT with 401 before touching the store', async () => {
    authMock.mockResolvedValue({ user: {} })
    const { PUT } = await loadRoute()

    const response = await PUT(putRequest({ plans: [plan('a')], activePlanId: 'a' }))
    expect(response.status).toBe(401)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('rejects every request when auth itself is unconfigured', async () => {
    delete process.env.AUTH_SECRET
    delete process.env.GOOGLE_CLIENT_ID
    delete process.env.GOOGLE_CLIENT_SECRET
    signedIn()
    const { GET } = await loadRoute()

    expect((await GET(getRequest())).status).toBe(401)
    // Never calls into NextAuth when it cannot be configured.
    expect(authMock).not.toHaveBeenCalled()
  })

  it('treats a thrown session lookup as anonymous', async () => {
    authMock.mockRejectedValue(new Error('jwt decrypt failed'))
    const { GET } = await loadRoute()

    expect((await GET(getRequest())).status).toBe(401)
  })
})

describe('signed-in requests', () => {
  beforeEach(() => {
    configureStore()
    configureAuth()
    signedIn()
  })

  it('returns an empty account as blob: null at revision 0', async () => {
    const { GET } = await loadRoute()

    const response = await GET(getRequest())
    expect(response.status).toBe(200)
    expect(response.headers.get(PLAN_REV_HEADER)).toBe('0')
    await expect(response.json()).resolves.toEqual({
      configured: true,
      schemaVersion: PLAN_SCHEMA_VERSION,
      rev: 0,
      blob: null,
    })
  })

  it('returns the stored blob with its revision', async () => {
    seedStore(
      { schemaVersion: PLAN_SCHEMA_VERSION, plans: [plan('a')], activePlanId: 'a', updatedAt: 4242 },
      `9:${PLAN_SCHEMA_VERSION}`
    )

    const { GET } = await loadRoute()
    const response = await GET(getRequest())
    const payload = (await response.json()) as {
      rev: number
      blob: { plans: Plan[]; activePlanId: string; updatedAt: number; rev: number }
    }

    expect(payload.rev).toBe(9)
    expect(response.headers.get(PLAN_REV_HEADER)).toBe('9')
    expect(payload.blob.activePlanId).toBe('a')
    expect(payload.blob.updatedAt).toBe(4242)
    expect(payload.blob.rev).toBe(9)
  })

  it('accepts a valid PUT and answers with the new revision', async () => {
    const { PUT } = await loadRoute()
    const response = await PUT(putRequest({ plans: [plan('a')], activePlanId: 'a' }))

    expect(response.status).toBe(200)
    expect(response.headers.get(PLAN_REV_HEADER)).toBe('1')
    const payload = (await response.json()) as { configured: boolean; rev: number; updatedAt: number }
    expect(payload.configured).toBe(true)
    expect(payload.rev).toBe(1)
    expect(typeof payload.updatedAt).toBe('number')
    expect(store.data[planMetaKey(ACCOUNT)]).toBe(`1:${PLAN_SCHEMA_VERSION}`)
  })

  it('rejects malformed bodies with 400', async () => {
    const { PUT } = await loadRoute()

    expect((await PUT(putRequest('{not json'))).status).toBe(400)
    expect((await PUT(putRequest({}))).status).toBe(400)
    expect((await PUT(putRequest({ plans: [], activePlanId: 'a' }))).status).toBe(400)
    expect((await PUT(putRequest({ plans: [plan('a')] }))).status).toBe(400)
    expect(
      (await PUT(putRequest({ plans: [plan('a')], activePlanId: 'a', deletedPlans: { gone: 'soon' } })))
        .status
    ).toBe(400)
    expect(store.commands).toHaveLength(0)
  })

  it('rejects more plans than MAX_PLANS', async () => {
    const { PUT } = await loadRoute()
    const tooMany = Array.from({ length: MAX_PLANS + 1 }, (_, index) => plan(`p-${index}`))

    const response = await PUT(putRequest({ plans: tooMany, activePlanId: 'p-0' }))
    expect(response.status).toBe(400)
    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('rejects an over-long plan name', async () => {
    const { PUT } = await loadRoute()
    const long = makePlan({
      id: 'a',
      name: 'x'.repeat(400),
      params: DEFAULT_PARAMS,
      createdAt: 1,
      updatedAt: 2,
    })

    expect((await PUT(putRequest({ plans: [long], activePlanId: 'a' }))).status).toBe(400)
  })

  it('reports a failed write as 502 rather than pretending it stored', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('redis down')) as unknown as typeof fetch

    const { PUT } = await loadRoute()
    const response = await PUT(putRequest({ plans: [plan('a')], activePlanId: 'a' }))

    expect(response.status).toBe(502)
  })

  it('stores deletion tombstones and serves them back', async () => {
    const { GET, PUT } = await loadRoute()
    const deletedAt = Date.now() - 1_000

    const put = await PUT(
      putRequest({ plans: [plan('a')], activePlanId: 'a', deletedPlans: { 'plan-gone': deletedAt } })
    )
    expect(put.status).toBe(200)

    const payload = (await (await GET(getRequest())).json()) as {
      blob: { deletedPlans: Record<string, number> }
    }
    expect(payload.blob.deletedPlans).toEqual({ 'plan-gone': deletedAt })
  })

  it('clamps a plan stamp from a clock that runs ahead to the server clock', async () => {
    const { PUT } = await loadRoute()
    const before = Date.now()
    const ahead = makePlan({
      id: 'a',
      name: 'a',
      params: DEFAULT_PARAMS,
      createdAt: 1,
      updatedAt: before + 86_400_000,
    })

    expect((await PUT(putRequest({ plans: [ahead], activePlanId: 'a' }))).status).toBe(200)

    const stored = JSON.parse(store.data[planStoreKey(ACCOUNT)]) as { plans: Plan[] }
    expect(stored.plans[0].updatedAt).toBeGreaterThanOrEqual(before)
    expect(stored.plans[0].updatedAt).toBeLessThanOrEqual(Date.now())
  })
})

describe('a store that cannot be read is not an empty account', () => {
  beforeEach(() => {
    configureStore()
    configureAuth()
    signedIn()
    seedStore(
      { schemaVersion: PLAN_SCHEMA_VERSION, plans: [plan('precious')], activePlanId: 'precious' },
      `4:${PLAN_SCHEMA_VERSION}`
    )
  })

  const expectReadFailure = async () => {
    const { GET } = await loadRoute()
    const response = await GET(getRequest())

    expect(response.status).toBe(502)
    const payload = (await response.json()) as Record<string, unknown>
    expect(payload).toEqual({ error: 'read-failed' })
    // Above all: nothing that a client could read as "this account is empty".
    expect(payload).not.toHaveProperty('blob')
    expect(payload).not.toHaveProperty('configured')
    expect(store.writes).toBe(0)
  }

  it('answers 502 when the store answers with a failure status', async () => {
    store.failNext = 1
    await expectReadFailure()
  })

  it('answers 502 when the store answers with an error (quota)', async () => {
    store.errorNext = 1
    await expectReadFailure()
  })

  it('answers 502 when the store cannot be reached at all', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET')) as unknown as typeof fetch
    await expectReadFailure()
  })

  it('answers 502 when the stored value is unreadable', async () => {
    store.data[planStoreKey(ACCOUNT)] = '{{{'
    await expectReadFailure()
  })

  it('serves the blob again once the store is back', async () => {
    store.failNext = 1
    const { GET } = await loadRoute()
    expect((await GET(getRequest())).status).toBe(502)

    const response = await GET(getRequest())
    expect(response.status).toBe(200)
    const payload = (await response.json()) as { rev: number; blob: { plans: Plan[] } }
    expect(payload.rev).toBe(4)
    expect(payload.blob.plans[0].id).toBe('precious')
  })
})

describe('revisions: a write names what it is based on', () => {
  beforeEach(() => {
    configureStore()
    configureAuth()
    signedIn()
  })

  const storedIds = () =>
    (JSON.parse(store.data[planStoreKey(ACCOUNT)]) as { plans: Plan[] }).plans.map((entry) => entry.id)

  it('answers 428 to a PUT without a revision, and writes nothing', async () => {
    const { PUT } = await loadRoute()

    for (const rev of [null, '', 'abc', '-1', '1.5']) {
      const response = await PUT(putRequest({ plans: [plan('a')], activePlanId: 'a' }, PLAN_SCHEMA_VERSION, rev))
      expect(response.status).toBe(428)
      await expect(response.json()).resolves.toEqual({ error: 'rev-required' })
    }
    expect(store.commands).toHaveLength(0)
  })

  it('answers 412 with the stored revision when the account has moved on', async () => {
    seedStore(
      { schemaVersion: PLAN_SCHEMA_VERSION, plans: [plan('theirs')], activePlanId: 'theirs' },
      `5:${PLAN_SCHEMA_VERSION}`
    )
    const { PUT } = await loadRoute()

    const response = await PUT(putRequest({ plans: [plan('mine')], activePlanId: 'mine' }, PLAN_SCHEMA_VERSION, 4))
    expect(response.status).toBe(412)
    expect(response.headers.get(PLAN_REV_HEADER)).toBe('5')
    await expect(response.json()).resolves.toEqual({ error: 'rev-mismatch', rev: 5 })
    expect(storedIds()).toEqual(['theirs'])
    expect(store.writes).toBe(0)
  })

  it('refuses a client that never pulled: revision 0 against an existing blob', async () => {
    seedStore(
      { schemaVersion: PLAN_SCHEMA_VERSION, plans: [plan('theirs')], activePlanId: 'theirs' },
      `1:${PLAN_SCHEMA_VERSION}`
    )
    const { PUT } = await loadRoute()

    const response = await PUT(putRequest({ plans: [plan('mine')], activePlanId: 'mine' }))
    expect(response.status).toBe(412)
    expect(storedIds()).toEqual(['theirs'])
  })

  it('accepts the matching revision and counts on from it', async () => {
    const { GET, PUT } = await loadRoute()

    const first = await PUT(putRequest({ plans: [plan('one')], activePlanId: 'one' }, PLAN_SCHEMA_VERSION, 0))
    expect(((await first.json()) as { rev: number }).rev).toBe(1)

    const second = await PUT(putRequest({ plans: [plan('two')], activePlanId: 'two' }, PLAN_SCHEMA_VERSION, 1))
    expect(((await second.json()) as { rev: number }).rev).toBe(2)

    expect(((await (await GET(getRequest())).json()) as { rev: number }).rev).toBe(2)
    expect(storedIds()).toEqual(['two'])
  })

  it('does it in one store request: no read that a second writer could slip behind', async () => {
    const { PUT } = await loadRoute()
    await PUT(putRequest({ plans: [plan('a')], activePlanId: 'a' }))

    expect(store.commands).toHaveLength(1)
    expect(store.commands[0][0]).toBe('EVAL')
  })

  it('keeps a legacy blob (no revision) writable at revision 0', async () => {
    seedStore({ schemaVersion: 2, updatedAt: 1, plans: [plan('legacy')], activePlanId: 'legacy' })
    const { GET, PUT } = await loadRoute()

    const pulled = (await (await GET(getRequest())).json()) as { rev: number }
    expect(pulled.rev).toBe(0)

    const response = await PUT(putRequest({ plans: [plan('next')], activePlanId: 'next' }, PLAN_SCHEMA_VERSION, 0))
    expect(response.status).toBe(200)
    expect(storedIds()).toEqual(['next'])
  })
})

describe('schema guard', () => {
  /** Puts `stored` (a blob, or nothing) into the store and returns the fetch mock. */
  const upstash = (stored: Record<string, unknown> | null) => {
    if (stored !== null) seedStore(stored)
    return global.fetch as unknown as jest.Mock
  }

  const storedBlob = (schemaVersion?: number) => ({
    ...(schemaVersion === undefined ? {} : { schemaVersion }),
    updatedAt: 4242,
    plans: [plan('a')],
    activePlanId: 'a',
  })

  /** Store requests that changed something. */
  const setCalls = (_fetchMock: jest.Mock) => Array.from({ length: store.writes })

  beforeEach(() => {
    configureStore()
    configureAuth()
    signedIn()
  })

  it('answers 409 outdated-client to a GET without the header, and reads nothing', async () => {
    const fetchMock = upstash(storedBlob(PLAN_SCHEMA_VERSION))
    const { GET } = await loadRoute()

    const response = await GET(getRequest(null))
    expect(response.status).toBe(409)
    await expect(response.json()).resolves.toEqual({
      error: 'outdated-client',
      schemaVersion: PLAN_SCHEMA_VERSION,
    })
    expect(response.headers.get(PLAN_SCHEMA_HEADER)).toBe(String(PLAN_SCHEMA_VERSION))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('answers 409 outdated-client to a PUT without the header, and writes nothing', async () => {
    const fetchMock = upstash(null)
    const { PUT } = await loadRoute()

    // Exactly what the build before the guard sends: body version 1, no header.
    const response = await PUT(
      putRequest({ schemaVersion: 1, plans: [plan('a')], activePlanId: 'a' }, null)
    )
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('outdated-client')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('treats an older or unparseable header as outdated', async () => {
    upstash(null)
    const { GET, PUT } = await loadRoute()

    expect((await GET(getRequest(PLAN_SCHEMA_VERSION - 1))).status).toBe(409)
    expect((await GET(getRequest('banana'))).status).toBe(409)
    expect((await PUT(putRequest({ plans: [plan('a')], activePlanId: 'a' }, '1'))).status).toBe(409)
  })

  it('refuses a client newer than the server as outdated-server', async () => {
    const fetchMock = upstash(null)
    const { GET, PUT } = await loadRoute()

    const get = await GET(getRequest(PLAN_SCHEMA_VERSION + 1))
    expect(get.status).toBe(409)
    expect((await get.json()).error).toBe('outdated-server')

    const put = await PUT(putRequest({ plans: [plan('a')], activePlanId: 'a' }, PLAN_SCHEMA_VERSION + 1))
    expect(put.status).toBe(409)
    expect(setCalls(fetchMock)).toHaveLength(0)
  })

  it('serves an equal-version GET with 200 and the server version header', async () => {
    upstash(storedBlob(PLAN_SCHEMA_VERSION))
    const { GET } = await loadRoute()

    const response = await GET(getRequest())
    expect(response.status).toBe(200)
    expect(response.headers.get(PLAN_SCHEMA_HEADER)).toBe(String(PLAN_SCHEMA_VERSION))
    const payload = (await response.json()) as { blob: { schemaVersion: number } }
    expect(payload.blob.schemaVersion).toBe(PLAN_SCHEMA_VERSION)
  })

  it('serves a legacy blob (no version, i.e. 1) to a current client', async () => {
    upstash(storedBlob())
    const { GET } = await loadRoute()

    const response = await GET(getRequest())
    expect(response.status).toBe(200)
    expect(((await response.json()) as { blob: { schemaVersion: number } }).blob.schemaVersion).toBe(1)
  })

  it('never serves a blob written by a newer deployment (rollback)', async () => {
    upstash(storedBlob(PLAN_SCHEMA_VERSION + 1))
    const { GET } = await loadRoute()

    const response = await GET(getRequest())
    expect(response.status).toBe(409)
    const payload = (await response.json()) as Record<string, unknown>
    expect(payload.error).toBe('outdated-server')
    expect(payload).not.toHaveProperty('blob')
  })

  it('never overwrites a blob written by a newer deployment (rollback)', async () => {
    const fetchMock = upstash(storedBlob(PLAN_SCHEMA_VERSION + 1))
    const { PUT } = await loadRoute()

    const response = await PUT(putRequest({ plans: [plan('a')], activePlanId: 'a' }))
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('outdated-server')
    expect(setCalls(fetchMock)).toHaveLength(0)
  })

  it('stores the writer version in the blob, upgrading a legacy blob', async () => {
    const fetchMock = upstash(storedBlob())
    const { PUT } = await loadRoute()

    // A client-sent body version is not trusted: the server stamps its own.
    const response = await PUT(
      putRequest({ schemaVersion: 99, plans: [plan('a')], activePlanId: 'a' })
    )
    expect(response.status).toBe(200)

    expect(setCalls(fetchMock)).toHaveLength(1)
    const written = JSON.parse(store.data[planStoreKey(ACCOUNT)]) as { schemaVersion: number }
    expect(written.schemaVersion).toBe(PLAN_SCHEMA_VERSION)
    expect(store.data[planMetaKey(ACCOUNT)]).toBe(`1:${PLAN_SCHEMA_VERSION}`)
  })

  it('refuses to write when the store cannot check what is stored', async () => {
    const fetchMock = upstash(storedBlob(PLAN_SCHEMA_VERSION))
    store.failNext = 1
    const { PUT } = await loadRoute()

    const response = await PUT(putRequest({ plans: [plan('a')], activePlanId: 'a' }))
    expect(response.status).toBe(502)
    expect(setCalls(fetchMock)).toHaveLength(0)
  })

  it('refuses the previous protocol version (2) outright — it can neither read nor write', async () => {
    const fetchMock = upstash(storedBlob(2))
    const { GET, PUT } = await loadRoute()

    const get = await GET(getRequest(2))
    expect(get.status).toBe(409)
    expect((await get.json()).error).toBe('outdated-client')

    // Exactly what a v2 tab sends: its version header, no revision.
    const put = await PUT(
      putRequest({ schemaVersion: 2, plans: [plan('resurrected')], activePlanId: 'resurrected' }, 2, null)
    )
    expect(put.status).toBe(409)
    expect((await put.json()).error).toBe('outdated-client')

    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports its build id when it has one', async () => {
    upstash(null)
    jest.resetModules()
    process.env.NEXT_PUBLIC_BUILD_ID = 'build-abc'
    try {
      const { GET } = await loadRoute()
      expect((await GET(getRequest())).headers.get('x-build-id')).toBe('build-abc')
      // Even on the 409, so an outdated tab learns about the new build too.
      expect((await GET(getRequest(null))).headers.get('x-build-id')).toBe('build-abc')
    } finally {
      delete process.env.NEXT_PUBLIC_BUILD_ID
      jest.resetModules()
    }
  })
})
