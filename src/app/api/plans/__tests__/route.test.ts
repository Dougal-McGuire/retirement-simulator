/**
 * `@/auth` is mocked so next-auth (and its ESM/runtime requirements) never
 * loads here: what these tests pin is the *gating* contract of the route —
 * unconfigured store, missing session, oversized or malformed body — not
 * NextAuth itself.
 */

import { DEFAULT_PARAMS, MAX_PLANS, type Plan } from '@/types'
import { makePlan } from '@/lib/stores/plans'

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

const putRequest = (body: unknown): Request =>
  new Request('https://example.com/api/plans', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
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

    const response = await GET()
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
    const body = JSON.stringify(await (await GET()).json())
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

    const response = await GET()
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

    expect((await GET()).status).toBe(401)
    // Never calls into NextAuth when it cannot be configured.
    expect(authMock).not.toHaveBeenCalled()
  })

  it('treats a thrown session lookup as anonymous', async () => {
    authMock.mockRejectedValue(new Error('jwt decrypt failed'))
    const { GET } = await loadRoute()

    expect((await GET()).status).toBe(401)
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

    const response = await GET()
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({
      configured: true,
      schemaVersion: 1,
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
    const payload = (await (await GET()).json()) as {
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
