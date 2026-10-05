import { DEFAULT_PARAMS, MAX_PLANS, type Plan } from '@/types'
import { makePlan } from '@/lib/stores/plans'
import { hashUserId } from '@/lib/stores/persistenceKey'
import { PLAN_SCHEMA_VERSION } from '@/lib/plans/schemaVersion'
import {
  MAX_BLOB_BYTES,
  getCloudStoreConfig,
  isCloudStoreConfigured,
  planStoreKey,
  readPlanBlob,
  readStoredSchemaVersion,
  sanitizeCloudBlob,
  writePlanBlob,
} from '@/lib/server/planStore'

const ENV_KEYS = [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
] as const

const originalEnv = { ...process.env }
const originalFetch = global.fetch

const clearEnv = () => {
  ENV_KEYS.forEach((key) => {
    delete process.env[key]
  })
}

const configure = () => {
  process.env.KV_REST_API_URL = 'https://redis.example.com'
  process.env.KV_REST_API_TOKEN = 'token-123'
}

const plan = (id: string, updatedAt = 1_000): Plan =>
  makePlan({ id, name: id, params: DEFAULT_PARAMS, createdAt: 500, updatedAt })

const mockFetch = (impl: jest.Mock) => {
  global.fetch = impl as unknown as typeof fetch
  return impl
}

const jsonResponse = (payload: unknown) => ({
  ok: true,
  status: 200,
  json: async () => payload,
})

beforeEach(() => {
  clearEnv()
  jest.restoreAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  process.env = { ...originalEnv }
  global.fetch = originalFetch
})

describe('configuration', () => {
  it('is unconfigured by default — the degradation contract', () => {
    expect(isCloudStoreConfigured()).toBe(false)
    expect(getCloudStoreConfig()).toBeNull()
  })

  it('accepts the Vercel KV names and the Upstash aliases', () => {
    process.env.KV_REST_API_URL = 'https://a.example.com'
    process.env.KV_REST_API_TOKEN = 'a-token'
    expect(getCloudStoreConfig()).toEqual({ url: 'https://a.example.com', token: 'a-token' })

    clearEnv()
    process.env.UPSTASH_REDIS_REST_URL = 'https://b.example.com/'
    process.env.UPSTASH_REDIS_REST_TOKEN = 'b-token'
    // Trailing slashes would produce `//get/...` request paths.
    expect(getCloudStoreConfig()).toEqual({ url: 'https://b.example.com', token: 'b-token' })
  })

  it('needs both halves', () => {
    process.env.KV_REST_API_URL = 'https://a.example.com'
    expect(isCloudStoreConfigured()).toBe(false)

    process.env.KV_REST_API_TOKEN = '   '
    expect(isCloudStoreConfigured()).toBe(false)
  })

  it('keys on a hash, never on the raw account id', () => {
    const key = planStoreKey('user@example.com')
    expect(key).toBe(`plans:v1:${hashUserId('user@example.com')}`)
    expect(key).not.toContain('user@example.com')
  })
})

describe('sanitizeCloudBlob', () => {
  it('normalizes plans and repairs a dangling activePlanId', () => {
    const blob = sanitizeCloudBlob({
      plans: [{ id: 'a', name: 'A', params: { currentAge: '41' }, createdAt: 1, updatedAt: 2 }],
      activePlanId: 'ghost',
      updatedAt: 99,
    })

    expect(blob).not.toBeNull()
    // No version stated: a blob from before the schema guard.
    expect(blob?.schemaVersion).toBe(1)
    expect(blob?.activePlanId).toBe('a')
    // Persisted strings become numbers and missing fields get defaults.
    expect(blob?.plans[0].params.currentAge).toBe(41)
    expect(blob?.plans[0].params.endAge).toBe(DEFAULT_PARAMS.endAge)
  })

  it('keeps a valid schemaVersion and reads anything else as legacy (1)', () => {
    const base = { plans: [plan('a')], activePlanId: 'a' }
    expect(sanitizeCloudBlob({ ...base, schemaVersion: 2 })?.schemaVersion).toBe(2)
    // A newer version survives, so the route can refuse it instead of serving it.
    expect(sanitizeCloudBlob({ ...base, schemaVersion: 7 })?.schemaVersion).toBe(7)
    expect(sanitizeCloudBlob({ ...base, schemaVersion: 0 })?.schemaVersion).toBe(1)
    expect(sanitizeCloudBlob({ ...base, schemaVersion: 2.5 })?.schemaVersion).toBe(1)
    expect(sanitizeCloudBlob({ ...base, schemaVersion: '<script>' })?.schemaVersion).toBe(1)
  })

  it('rejects a blob with nothing usable in it', () => {
    expect(sanitizeCloudBlob(null)).toBeNull()
    expect(sanitizeCloudBlob({ plans: [] })).toBeNull()
    expect(sanitizeCloudBlob({ plans: [{ id: '', name: '' }] })).toBeNull()
    expect(sanitizeCloudBlob('not an object')).toBeNull()
  })

  it('drops a tampered blob down to MAX_PLANS', () => {
    const blob = sanitizeCloudBlob({
      plans: Array.from({ length: MAX_PLANS + 20 }, (_, index) => plan(`p-${index}`)),
      activePlanId: 'p-0',
    })

    expect(blob?.plans).toHaveLength(MAX_PLANS)
  })

  it('strips an unknown top-level field instead of passing it through', () => {
    const blob = sanitizeCloudBlob({
      plans: [plan('a')],
      activePlanId: 'a',
      evil: '<script>',
    }) as unknown as Record<string, unknown>

    expect(Object.keys(blob).sort()).toEqual(['activePlanId', 'plans', 'schemaVersion', 'updatedAt'])
  })
})

describe('readPlanBlob', () => {
  it('returns null (never throws) when unconfigured', async () => {
    const fetchMock = mockFetch(jest.fn())
    await expect(readPlanBlob('user-1')).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads and sanitizes the stored value', async () => {
    configure()
    const stored = JSON.stringify({
      schemaVersion: 1,
      updatedAt: 4242,
      plans: [plan('a')],
      activePlanId: 'a',
    })
    const fetchMock = mockFetch(jest.fn().mockResolvedValue(jsonResponse({ result: stored })))

    const blob = await readPlanBlob('user-1')
    expect(blob?.updatedAt).toBe(4242)
    expect(blob?.plans).toHaveLength(1)

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(
      `https://redis.example.com/get/${encodeURIComponent(planStoreKey('user-1'))}`
    )
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-123')
  })

  it('reads a missing key as an empty account', async () => {
    configure()
    mockFetch(jest.fn().mockResolvedValue(jsonResponse({ result: null })))
    await expect(readPlanBlob('user-1')).resolves.toBeNull()
  })

  it('reads corrupt JSON and oversized values as an empty account', async () => {
    configure()
    mockFetch(jest.fn().mockResolvedValue(jsonResponse({ result: '{{{' })))
    await expect(readPlanBlob('user-1')).resolves.toBeNull()

    mockFetch(jest.fn().mockResolvedValue(jsonResponse({ result: 'x'.repeat(MAX_BLOB_BYTES + 1) })))
    await expect(readPlanBlob('user-1')).resolves.toBeNull()
  })

  it('swallows transport failures', async () => {
    configure()
    mockFetch(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    await expect(readPlanBlob('user-1')).resolves.toBeNull()

    mockFetch(jest.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }))
    await expect(readPlanBlob('user-1')).resolves.toBeNull()
  })
})

describe('writePlanBlob', () => {
  it('refuses when unconfigured', async () => {
    await expect(writePlanBlob('user-1', { plans: [plan('a')], activePlanId: 'a' })).resolves.toEqual(
      { ok: false, reason: 'unconfigured' }
    )
  })

  it('stamps the server clock and stores the sanitized blob', async () => {
    configure()
    const fetchMock = mockFetch(jest.fn().mockResolvedValue(jsonResponse({ result: 'OK' })))

    const result = await writePlanBlob('user-1', {
      plans: [plan('a')],
      activePlanId: 'a',
      // A client cannot claim a future timestamp and win every later merge.
      updatedAt: 9_999_999_999_999,
    })

    expect(result.ok).toBe(true)
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/set/')
    expect(init.method).toBe('POST')

    const written = JSON.parse(String(init.body)) as { updatedAt: number }
    expect(written.updatedAt).toBeLessThan(9_999_999_999_999)
    expect(result.ok && result.updatedAt).toBe(written.updatedAt)
  })

  it('stamps the given schema version, never the one in the body', async () => {
    configure()
    const fetchMock = mockFetch(jest.fn().mockResolvedValue(jsonResponse({ result: 'OK' })))

    await writePlanBlob('user-1', { schemaVersion: 99, plans: [plan('a')], activePlanId: 'a' })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect((JSON.parse(String(init.body)) as { schemaVersion: number }).schemaVersion).toBe(
      PLAN_SCHEMA_VERSION
    )
  })

  it('rejects an unusable blob without touching the network', async () => {
    configure()
    const fetchMock = mockFetch(jest.fn())

    await expect(writePlanBlob('user-1', { plans: [] })).resolves.toEqual({
      ok: false,
      reason: 'error',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a blob larger than the size guard', async () => {
    configure()
    // Succeeds if the guard is ever removed, so this test cannot pass by accident.
    const fetchMock = mockFetch(jest.fn().mockResolvedValue(jsonResponse({ result: 'OK' })))

    const fat = Array.from({ length: MAX_PLANS }, (_, index) =>
      makePlan({
        id: `fat-${index}`,
        name: 'x'.repeat(30_000),
        params: DEFAULT_PARAMS,
        createdAt: 1,
        updatedAt: 2,
      })
    )

    await expect(writePlanBlob('user-1', { plans: fat, activePlanId: 'fat-0' })).resolves.toEqual({
      ok: false,
      reason: 'too-large',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reports transport failures instead of throwing', async () => {
    configure()
    mockFetch(jest.fn().mockRejectedValue(new Error('boom')))

    await expect(writePlanBlob('user-1', { plans: [plan('a')], activePlanId: 'a' })).resolves.toEqual(
      { ok: false, reason: 'error' }
    )
  })
})

describe('readStoredSchemaVersion', () => {
  it('reads the stored version without sanitizing the plans', async () => {
    configure()
    mockFetch(
      jest
        .fn()
        .mockResolvedValue(jsonResponse({ result: JSON.stringify({ schemaVersion: 5, plans: 'junk' }) }))
    )
    await expect(readStoredSchemaVersion('user-1')).resolves.toEqual({ ok: true, version: 5 })
  })

  it('reads a legacy blob as 1 and a missing or corrupt one as empty', async () => {
    configure()
    mockFetch(jest.fn().mockResolvedValue(jsonResponse({ result: JSON.stringify({ plans: [] }) })))
    await expect(readStoredSchemaVersion('user-1')).resolves.toEqual({ ok: true, version: 1 })

    mockFetch(jest.fn().mockResolvedValue(jsonResponse({ result: null })))
    await expect(readStoredSchemaVersion('user-1')).resolves.toEqual({ ok: true, version: null })

    mockFetch(jest.fn().mockResolvedValue(jsonResponse({ result: '{{{' })))
    await expect(readStoredSchemaVersion('user-1')).resolves.toEqual({ ok: true, version: null })
  })

  it('reports an unreachable store instead of reading it as empty', async () => {
    configure()
    mockFetch(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    await expect(readStoredSchemaVersion('user-1')).resolves.toEqual({ ok: false })

    clearEnv()
    await expect(readStoredSchemaVersion('user-1')).resolves.toEqual({ ok: false })
  })
})

describe('persistence round trip', () => {
  it('survives write -> read unchanged', async () => {
    configure()
    let stored: string | null = null

    mockFetch(
      jest.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (String(url).includes('/set/')) {
          stored = String(init?.body)
          return jsonResponse({ result: 'OK' })
        }
        return jsonResponse({ result: stored })
      })
    )

    const plans = [plan('plan-base', 1_000), plan('plan-two', 2_000)]
    const write = await writePlanBlob('user-1', { plans, activePlanId: 'plan-two' })
    expect(write.ok).toBe(true)

    const blob = await readPlanBlob('user-1')
    expect(blob?.activePlanId).toBe('plan-two')
    expect(blob?.plans.map((entry) => entry.id)).toEqual(['plan-base', 'plan-two'])
    expect(blob?.plans[0].params).toEqual(DEFAULT_PARAMS)
    expect(blob?.updatedAt).toBe(write.ok && write.updatedAt)
  })
})
