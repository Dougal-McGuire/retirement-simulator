/**
 * `@/auth` is mocked so next-auth (and its ESM/runtime requirements) never
 * loads here: what these tests pin is the *gating* contract of the route —
 * unconfigured store, missing session, oversized or malformed body — not
 * NextAuth itself.
 */

import { DEFAULT_PARAMS, MAX_PLANS, type Plan } from '@/types'
import { makePlan } from '@/lib/stores/plans'
import { PLAN_SCHEMA_HEADER, PLAN_SCHEMA_VERSION } from '@/lib/plans/schemaVersion'

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

const signedIn = (session: Session = { user: { id: 'google-sub-1' } }) => {
  authMock.mockResolvedValue(session)
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

const putRequest = (
  body: unknown,
  version: number | string | null = PLAN_SCHEMA_VERSION
): Request =>
  new Request('https://example.com/api/plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...schemaHeader(version) },
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
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ result: null }),
  }) as unknown as typeof fetch
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

  it('returns an empty account as blob: null', async () => {
    const { GET } = await loadRoute()

    const response = await GET(getRequest())
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      configured: true,
      schemaVersion: PLAN_SCHEMA_VERSION,
      blob: null,
    })
  })

  it('returns the stored blob', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        result: JSON.stringify({ plans: [plan('a')], activePlanId: 'a', updatedAt: 4242 }),
      }),
    }) as unknown as typeof fetch

    const { GET } = await loadRoute()
    const payload = (await (await GET(getRequest())).json()) as {
      blob: { plans: Plan[]; activePlanId: string; updatedAt: number }
    }

    expect(payload.blob.activePlanId).toBe('a')
    expect(payload.blob.updatedAt).toBe(4242)
  })

  it('accepts a valid PUT', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ result: 'OK' }),
    }) as unknown as typeof fetch

    const { PUT } = await loadRoute()
    const response = await PUT(putRequest({ plans: [plan('a')], activePlanId: 'a' }))

    expect(response.status).toBe(200)
    const payload = (await response.json()) as { configured: boolean; updatedAt: number }
    expect(payload.configured).toBe(true)
    expect(typeof payload.updatedAt).toBe('number')
  })

  it('rejects malformed bodies with 400', async () => {
    const { PUT } = await loadRoute()

    expect((await PUT(putRequest('{not json'))).status).toBe(400)
    expect((await PUT(putRequest({}))).status).toBe(400)
    expect((await PUT(putRequest({ plans: [], activePlanId: 'a' }))).status).toBe(400)
    expect((await PUT(putRequest({ plans: [plan('a')] }))).status).toBe(400)
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
})

describe('schema guard', () => {
  /** Upstash stub: `get` answers with `stored` (a blob or null), `set` with OK. */
  const upstash = (stored: Record<string, unknown> | null) =>
    jest.fn(async (url: string) => ({
      ok: true,
      status: 200,
      json: async () =>
        url.includes('/set/')
          ? { result: 'OK' }
          : { result: stored === null ? null : JSON.stringify(stored) },
    }))

  const storedBlob = (schemaVersion?: number) => ({
    ...(schemaVersion === undefined ? {} : { schemaVersion }),
    updatedAt: 4242,
    plans: [plan('a')],
    activePlanId: 'a',
  })

  const setCalls = (fetchMock: jest.Mock) =>
    fetchMock.mock.calls.filter(([url]) => String(url).includes('/set/'))

  beforeEach(() => {
    configureStore()
    configureAuth()
    signedIn()
  })

  it('answers 409 outdated-client to a GET without the header, and reads nothing', async () => {
    const fetchMock = upstash(storedBlob(PLAN_SCHEMA_VERSION))
    global.fetch = fetchMock as unknown as typeof fetch
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
    global.fetch = fetchMock as unknown as typeof fetch
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
    global.fetch = upstash(null) as unknown as typeof fetch
    const { GET, PUT } = await loadRoute()

    expect((await GET(getRequest(PLAN_SCHEMA_VERSION - 1))).status).toBe(409)
    expect((await GET(getRequest('banana'))).status).toBe(409)
    expect((await PUT(putRequest({ plans: [plan('a')], activePlanId: 'a' }, '1'))).status).toBe(409)
  })

  it('refuses a client newer than the server as outdated-server', async () => {
    const fetchMock = upstash(null)
    global.fetch = fetchMock as unknown as typeof fetch
    const { GET, PUT } = await loadRoute()

    const get = await GET(getRequest(PLAN_SCHEMA_VERSION + 1))
    expect(get.status).toBe(409)
    expect((await get.json()).error).toBe('outdated-server')

    const put = await PUT(putRequest({ plans: [plan('a')], activePlanId: 'a' }, PLAN_SCHEMA_VERSION + 1))
    expect(put.status).toBe(409)
    expect(setCalls(fetchMock)).toHaveLength(0)
  })

  it('serves an equal-version GET with 200 and the server version header', async () => {
    global.fetch = upstash(storedBlob(PLAN_SCHEMA_VERSION)) as unknown as typeof fetch
    const { GET } = await loadRoute()

    const response = await GET(getRequest())
    expect(response.status).toBe(200)
    expect(response.headers.get(PLAN_SCHEMA_HEADER)).toBe(String(PLAN_SCHEMA_VERSION))
    const payload = (await response.json()) as { blob: { schemaVersion: number } }
    expect(payload.blob.schemaVersion).toBe(PLAN_SCHEMA_VERSION)
  })

  it('serves a legacy blob (no version, i.e. 1) to a current client', async () => {
    global.fetch = upstash(storedBlob()) as unknown as typeof fetch
    const { GET } = await loadRoute()

    const response = await GET(getRequest())
    expect(response.status).toBe(200)
    expect(((await response.json()) as { blob: { schemaVersion: number } }).blob.schemaVersion).toBe(1)
  })

  it('never serves a blob written by a newer deployment (rollback)', async () => {
    global.fetch = upstash(storedBlob(PLAN_SCHEMA_VERSION + 1)) as unknown as typeof fetch
    const { GET } = await loadRoute()

    const response = await GET(getRequest())
    expect(response.status).toBe(409)
    const payload = (await response.json()) as Record<string, unknown>
    expect(payload.error).toBe('outdated-server')
    expect(payload).not.toHaveProperty('blob')
  })

  it('never overwrites a blob written by a newer deployment (rollback)', async () => {
    const fetchMock = upstash(storedBlob(PLAN_SCHEMA_VERSION + 1))
    global.fetch = fetchMock as unknown as typeof fetch
    const { PUT } = await loadRoute()

    const response = await PUT(putRequest({ plans: [plan('a')], activePlanId: 'a' }))
    expect(response.status).toBe(409)
    expect((await response.json()).error).toBe('outdated-server')
    expect(setCalls(fetchMock)).toHaveLength(0)
  })

  it('stores the writer version in the blob, upgrading a legacy blob', async () => {
    const fetchMock = upstash(storedBlob())
    global.fetch = fetchMock as unknown as typeof fetch
    const { PUT } = await loadRoute()

    // A client-sent body version is not trusted: the server stamps its own.
    const response = await PUT(
      putRequest({ schemaVersion: 99, plans: [plan('a')], activePlanId: 'a' })
    )
    expect(response.status).toBe(200)

    const [[, init]] = setCalls(fetchMock) as [[string, RequestInit]]
    const written = JSON.parse(String(init.body)) as { schemaVersion: number }
    expect(written.schemaVersion).toBe(PLAN_SCHEMA_VERSION)
  })

  it('refuses to write when the guard cannot read the stored version', async () => {
    const fetchMock = jest.fn(async (url: string) =>
      url.includes('/get/')
        ? { ok: false, status: 500, json: async () => ({}) }
        : { ok: true, status: 200, json: async () => ({ result: 'OK' }) }
    )
    global.fetch = fetchMock as unknown as typeof fetch
    const { PUT } = await loadRoute()

    const response = await PUT(putRequest({ plans: [plan('a')], activePlanId: 'a' }))
    expect(response.status).toBe(502)
    expect(setCalls(fetchMock)).toHaveLength(0)
  })

  it('reports its build id when it has one', async () => {
    global.fetch = upstash(null) as unknown as typeof fetch
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
