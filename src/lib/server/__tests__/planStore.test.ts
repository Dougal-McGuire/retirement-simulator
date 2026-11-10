import { DEFAULT_PARAMS, MAX_PLANS, type Plan } from '@/types'
import { MAX_PLAN_TOMBSTONES, PLAN_TOMBSTONE_TTL_MS, makePlan } from '@/lib/stores/plans'
import { hashUserId } from '@/lib/stores/persistenceKey'
import { PLAN_SCHEMA_VERSION } from '@/lib/plans/schemaVersion'
import {
  MAX_BLOB_BYTES,
  UPSTASH_TIMEOUT_MS,
  getCloudStoreConfig,
  isCloudStoreConfigured,
  planMetaKey,
  planStoreKey,
  readPlanBlob,
  sanitizeCloudBlob,
  writePlanBlob,
  type CloudPlanBlob,
} from '@/lib/server/planStore'
import {
  createFakeUpstash,
  FAKE_UPSTASH_URL,
  type FakeUpstash,
} from '@/lib/server/testing/fakeUpstash'

const ENV_KEYS = [
  'KV_REST_API_URL',
  'KV_REST_API_TOKEN',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
  'VERCEL_ENV',
] as const

const originalEnv = { ...process.env }
const originalFetch = global.fetch

const clearEnv = () => {
  ENV_KEYS.forEach((key) => {
    delete process.env[key]
  })
}

const configure = () => {
  process.env.KV_REST_API_URL = FAKE_UPSTASH_URL
  process.env.KV_REST_API_TOKEN = 'token-123'
}

const plan = (id: string, updatedAt = 1_000): Plan =>
  makePlan({ id, name: id, params: DEFAULT_PARAMS, createdAt: 500, updatedAt })

const mockFetch = (impl: jest.Mock) => {
  global.fetch = impl as unknown as typeof fetch
  return impl
}

/** Routes `fetch` to a fresh fake Upstash and returns it. */
const useFake = (): FakeUpstash => {
  const fake = createFakeUpstash()
  mockFetch(jest.fn(fake.fetch))
  return fake
}

const ACCOUNT = 'user-1'
const KEY = () => planStoreKey(ACCOUNT)
const META = () => planMetaKey(ACCOUNT)
const storedBlob = (fake: FakeUpstash) => JSON.parse(fake.data[KEY()]) as CloudPlanBlob

beforeEach(() => {
  clearEnv()
  jest.restoreAllMocks()
  jest.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  jest.useRealTimers()
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
    // The command is POSTed to the URL itself; a trailing slash is dropped.
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
    expect(planMetaKey('user@example.com')).toBe(`${key}:meta`)
  })
})

describe('environment prefix', () => {
  const unprefixed = `plans:v1:${hashUserId(ACCOUNT)}`

  it('keeps the existing key in production and where VERCEL_ENV is not set', () => {
    expect(planStoreKey(ACCOUNT)).toBe(unprefixed)

    process.env.VERCEL_ENV = 'production'
    expect(planStoreKey(ACCOUNT)).toBe(unprefixed)
  })

  it('prefixes every other environment, so a preview never touches production data', () => {
    process.env.VERCEL_ENV = 'preview'
    expect(planStoreKey(ACCOUNT)).toBe(`preview:${unprefixed}`)
    expect(planMetaKey(ACCOUNT)).toBe(`preview:${unprefixed}:meta`)

    process.env.VERCEL_ENV = 'development'
    expect(planStoreKey(ACCOUNT)).toBe(`development:${unprefixed}`)

    // Nothing from the environment gets into a key unchecked.
    process.env.VERCEL_ENV = 'Pre View/../x'
    expect(planStoreKey(ACCOUNT)).toBe(`pre-view----x:${unprefixed}`)
  })

  it('reads and writes under the prefixed key only', async () => {
    configure()
    const fake = useFake()
    fake.data[unprefixed] = JSON.stringify({
      plans: [plan('production')],
      activePlanId: 'production',
    })

    process.env.VERCEL_ENV = 'preview'
    await expect(readPlanBlob(ACCOUNT)).resolves.toEqual({ status: 'empty', rev: 0 })

    const write = await writePlanBlob(
      ACCOUNT,
      { plans: [plan('preview')], activePlanId: 'preview' },
      { expectedRev: 0 }
    )
    expect(write.status).toBe('ok')
    expect(Object.keys(fake.data).sort()).toEqual(
      [unprefixed, `preview:${unprefixed}`, `preview:${unprefixed}:meta`].sort()
    )
    expect(fake.data[unprefixed]).toContain('"production"')
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
    // No revision or tombstones stated: a blob from before the v3 protocol.
    expect(blob?.rev).toBe(0)
    expect(blob?.deletedPlans).toEqual({})
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

    expect(Object.keys(blob).sort()).toEqual([
      'activePlanId',
      'deletedPlans',
      'plans',
      'rev',
      'schemaVersion',
      'updatedAt',
    ])
  })

  it('keeps well-formed tombstones and drops the rest', () => {
    const now = 1_000_000_000_000
    const blob = sanitizeCloudBlob(
      {
        plans: [plan('alive')],
        activePlanId: 'alive',
        deletedPlans: {
          gone: now - 1_000,
          // A plan that is in the blob is not deleted.
          alive: now - 500,
          expired: now - PLAN_TOMBSTONE_TTL_MS - 1,
          'not-a-time': 'yesterday',
          negative: -5,
          ['x'.repeat(65)]: now,
        },
      },
      now
    )

    expect(blob?.deletedPlans).toEqual({ gone: now - 1_000 })
  })

  it('caps the number of tombstones, keeping the newest', () => {
    const now = 1_000_000_000_000
    const deletedPlans = Object.fromEntries(
      Array.from({ length: MAX_PLAN_TOMBSTONES + 50 }, (_, index) => [`gone-${index}`, now - index])
    )
    const blob = sanitizeCloudBlob({ plans: [plan('a')], activePlanId: 'a', deletedPlans }, now)

    expect(Object.keys(blob?.deletedPlans ?? {})).toHaveLength(MAX_PLAN_TOMBSTONES)
    expect(blob?.deletedPlans['gone-0']).toBe(now)
    expect(blob?.deletedPlans[`gone-${MAX_PLAN_TOMBSTONES + 49}`]).toBeUndefined()
  })
})

describe('readPlanBlob', () => {
  it('never reports "empty" when unconfigured, and makes no request', async () => {
    const fetchMock = mockFetch(jest.fn())
    await expect(readPlanBlob(ACCOUNT)).resolves.toEqual({
      status: 'error',
      reason: 'unconfigured',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads blob and revision in one authorized command', async () => {
    configure()
    const fake = useFake()
    fake.data[KEY()] = JSON.stringify({
      schemaVersion: 3,
      rev: 7,
      updatedAt: 4242,
      plans: [plan('a')],
      deletedPlans: { gone: Date.now() - 1000 },
      activePlanId: 'a',
    })
    fake.data[META()] = '7:3'

    const result = await readPlanBlob(ACCOUNT)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.rev).toBe(7)
    expect(result.blob.rev).toBe(7)
    expect(result.blob.updatedAt).toBe(4242)
    expect(result.blob.plans).toHaveLength(1)
    expect(Object.keys(result.blob.deletedPlans)).toEqual(['gone'])

    expect(fake.commands).toEqual([['MGET', KEY(), META()]])
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
    expect(url).toBe(FAKE_UPSTASH_URL)
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer token-123')
  })

  it('reads a missing key — and only that — as an empty account', async () => {
    configure()
    useFake()
    await expect(readPlanBlob(ACCOUNT)).resolves.toEqual({ status: 'empty', rev: 0 })
  })

  it('reads a blob from before revisions as revision 0', async () => {
    configure()
    const fake = useFake()
    fake.data[KEY()] = JSON.stringify({
      schemaVersion: 2,
      updatedAt: 4242,
      plans: [plan('a')],
      activePlanId: 'a',
    })

    const result = await readPlanBlob(ACCOUNT)
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.rev).toBe(0)
    expect(result.blob.schemaVersion).toBe(2)
    expect(result.blob.deletedPlans).toEqual({})
  })

  it('reports an unreachable store as an error, never as empty', async () => {
    configure()

    mockFetch(jest.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    await expect(readPlanBlob(ACCOUNT)).resolves.toEqual({ status: 'error', reason: 'unreachable' })

    const fake = useFake()
    fake.data[KEY()] = JSON.stringify({ plans: [plan('a')], activePlanId: 'a' })
    fake.failNext = 1
    await expect(readPlanBlob(ACCOUNT)).resolves.toEqual({ status: 'error', reason: 'unreachable' })
  })

  it('reports an error answer (quota, auth) as an error, never as empty', async () => {
    configure()
    const fake = useFake()
    fake.errorNext = 1
    await expect(readPlanBlob(ACCOUNT)).resolves.toEqual({ status: 'error', reason: 'unreachable' })

    // An answer with neither result nor error is not "no data" either.
    mockFetch(jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }))
    await expect(readPlanBlob(ACCOUNT)).resolves.toEqual({ status: 'error', reason: 'unreachable' })
  })

  it('gives up after the timeout and reports an error', async () => {
    jest.useFakeTimers()
    configure()
    const fake = useFake()
    fake.hang = true

    const pending = readPlanBlob(ACCOUNT)
    await jest.advanceTimersByTimeAsync(UPSTASH_TIMEOUT_MS + 1)

    await expect(pending).resolves.toEqual({ status: 'error', reason: 'unreachable' })
    const [, init] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit]
    expect(init.signal?.aborted).toBe(true)
  })

  it('reports a stored value it cannot read as an error, never as empty', async () => {
    configure()
    const fake = useFake()

    fake.data[KEY()] = '{{{'
    await expect(readPlanBlob(ACCOUNT)).resolves.toEqual({ status: 'error', reason: 'corrupt' })

    fake.data[KEY()] = 'x'.repeat(MAX_BLOB_BYTES + 1)
    await expect(readPlanBlob(ACCOUNT)).resolves.toEqual({ status: 'error', reason: 'corrupt' })

    // Valid JSON, but no usable plan in it.
    fake.data[KEY()] = JSON.stringify({ plans: [] })
    await expect(readPlanBlob(ACCOUNT)).resolves.toEqual({ status: 'error', reason: 'corrupt' })

    fake.data[KEY()] = JSON.stringify({ plans: [plan('a')], activePlanId: 'a' })
    fake.data[META()] = 'not-a-revision'
    await expect(readPlanBlob(ACCOUNT)).resolves.toEqual({ status: 'error', reason: 'corrupt' })
  })

  it('refuses a blob written by a newer schema before sanitizing it', async () => {
    configure()
    const fake = useFake()

    // Stated in the blob (shape unknown to this build: nothing usable for us).
    fake.data[KEY()] = JSON.stringify({ schemaVersion: PLAN_SCHEMA_VERSION + 1, planTree: {} })
    await expect(readPlanBlob(ACCOUNT)).resolves.toEqual({
      status: 'newer',
      schemaVersion: PLAN_SCHEMA_VERSION + 1,
    })

    // Stated in the meta key.
    fake.data[KEY()] = JSON.stringify({ plans: [plan('a')], activePlanId: 'a' })
    fake.data[META()] = `4:${PLAN_SCHEMA_VERSION + 2}`
    await expect(readPlanBlob(ACCOUNT)).resolves.toEqual({
      status: 'newer',
      schemaVersion: PLAN_SCHEMA_VERSION + 2,
    })
  })
})

describe('writePlanBlob', () => {
  const body = (plans: Plan[] = [plan('a')]) => ({ plans, activePlanId: plans[0].id })

  it('refuses when unconfigured', async () => {
    await expect(writePlanBlob(ACCOUNT, body(), { expectedRev: 0 })).resolves.toEqual({
      status: 'unconfigured',
    })
  })

  it('writes blob and revision in one atomic script, stamped by the server', async () => {
    configure()
    const fake = useFake()

    const result = await writePlanBlob(
      ACCOUNT,
      { ...body(), schemaVersion: 99, rev: 500, updatedAt: 9_999_999_999_999 },
      { expectedRev: 0, now: 5_000 }
    )

    expect(result).toEqual({ status: 'ok', rev: 1, updatedAt: 5_000 })
    // One request, and it is the script: there is no separate read to race with.
    expect(fake.commands).toHaveLength(1)
    expect(fake.commands[0][0]).toBe('EVAL')
    expect(fake.commands[0].slice(2, 5)).toEqual(['2', KEY(), META()])

    // Nothing the client claimed about version, revision or time is stored.
    expect(storedBlob(fake)).toMatchObject({
      schemaVersion: PLAN_SCHEMA_VERSION,
      rev: 1,
      updatedAt: 5_000,
    })
    expect(fake.data[META()]).toBe(`1:${PLAN_SCHEMA_VERSION}`)
  })

  it('writes only on the revision it was based on', async () => {
    configure()
    const fake = useFake()

    await writePlanBlob(ACCOUNT, body([plan('first')]), { expectedRev: 0 })
    await expect(
      writePlanBlob(ACCOUNT, body([plan('second')]), { expectedRev: 1 })
    ).resolves.toMatchObject({ status: 'ok', rev: 2 })

    // A writer that last saw revision 1 comes too late.
    const stale = await writePlanBlob(ACCOUNT, body([plan('stale')]), { expectedRev: 1 })
    expect(stale).toEqual({ status: 'conflict', rev: 2 })
    expect(storedBlob(fake).plans.map((entry) => entry.id)).toEqual(['second'])
    expect(fake.data[META()]).toBe(`2:${PLAN_SCHEMA_VERSION}`)
    expect(fake.writes).toBe(2)
  })

  it('refuses a writer that never read: revision 0 against a stored blob', async () => {
    configure()
    const fake = useFake()
    await writePlanBlob(ACCOUNT, body([plan('theirs')]), { expectedRev: 0 })

    await expect(writePlanBlob(ACCOUNT, body([plan('mine')]), { expectedRev: 0 })).resolves.toEqual(
      {
        status: 'conflict',
        rev: 1,
      }
    )
    expect(storedBlob(fake).plans.map((entry) => entry.id)).toEqual(['theirs'])
  })

  it('upgrades a blob from before revisions on its first write', async () => {
    configure()
    const fake = useFake()
    fake.data[KEY()] = JSON.stringify({
      schemaVersion: 2,
      updatedAt: 1,
      plans: [plan('legacy')],
      activePlanId: 'legacy',
    })

    // Its revision is 0 — any other expectation is a conflict.
    await expect(writePlanBlob(ACCOUNT, body(), { expectedRev: 3 })).resolves.toEqual({
      status: 'conflict',
      rev: 0,
    })
    await expect(writePlanBlob(ACCOUNT, body(), { expectedRev: 0 })).resolves.toMatchObject({
      status: 'ok',
      rev: 1,
    })
    expect(storedBlob(fake).schemaVersion).toBe(PLAN_SCHEMA_VERSION)
    expect(fake.data[META()]).toBe(`1:${PLAN_SCHEMA_VERSION}`)
  })

  it('never overwrites a blob written by a newer schema (rollback)', async () => {
    configure()
    const fake = useFake()
    const newer = JSON.stringify({
      schemaVersion: PLAN_SCHEMA_VERSION + 1,
      plans: [plan('future')],
    })

    fake.data[KEY()] = newer
    await expect(writePlanBlob(ACCOUNT, body(), { expectedRev: 0 })).resolves.toEqual({
      status: 'newer',
      schemaVersion: PLAN_SCHEMA_VERSION + 1,
    })

    fake.data[META()] = `6:${PLAN_SCHEMA_VERSION + 1}`
    await expect(writePlanBlob(ACCOUNT, body(), { expectedRev: 6 })).resolves.toEqual({
      status: 'newer',
      schemaVersion: PLAN_SCHEMA_VERSION + 1,
    })

    expect(fake.data[KEY()]).toBe(newer)
    expect(fake.writes).toBe(0)
  })

  it('clamps plan stamps and deletion times that lie in the future to the server clock', async () => {
    configure()
    const fake = useFake()
    const now = 1_700_000_000_000
    const DAY = 86_400_000

    await writePlanBlob(
      ACCOUNT,
      {
        plans: [plan('ahead', now + DAY), plan('fine', now - DAY)],
        activePlanId: 'ahead',
        deletedPlans: { 'gone-ahead': now + DAY, 'gone-fine': now - DAY },
      },
      { expectedRev: 0, now }
    )

    const stored = storedBlob(fake)
    expect(stored.plans.map((entry) => entry.updatedAt)).toEqual([now, now - DAY])
    expect(stored.deletedPlans).toEqual({ 'gone-ahead': now, 'gone-fine': now - DAY })
  })

  it('rejects an unusable blob without touching the network', async () => {
    configure()
    const fetchMock = mockFetch(jest.fn())

    await expect(writePlanBlob(ACCOUNT, { plans: [] }, { expectedRev: 0 })).resolves.toEqual({
      status: 'invalid',
    })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects a blob larger than the size guard', async () => {
    configure()
    // Succeeds if the guard is ever removed, so this test cannot pass by accident.
    const fake = useFake()

    const fat = Array.from({ length: MAX_PLANS }, (_, index) =>
      makePlan({
        id: `fat-${index}`,
        name: 'x'.repeat(30_000),
        params: DEFAULT_PARAMS,
        createdAt: 1,
        updatedAt: 2,
      })
    )

    await expect(
      writePlanBlob(ACCOUNT, { plans: fat, activePlanId: 'fat-0' }, { expectedRev: 0 })
    ).resolves.toEqual({ status: 'too-large' })
    expect(fake.commands).toHaveLength(0)
  })

  it('reports transport failures, error answers and timeouts instead of throwing', async () => {
    configure()
    mockFetch(jest.fn().mockRejectedValue(new Error('boom')))
    await expect(writePlanBlob(ACCOUNT, body(), { expectedRev: 0 })).resolves.toEqual({
      status: 'error',
    })

    const fake = useFake()
    fake.errorNext = 1
    await expect(writePlanBlob(ACCOUNT, body(), { expectedRev: 0 })).resolves.toEqual({
      status: 'error',
    })
    expect(fake.writes).toBe(0)

    jest.useFakeTimers()
    fake.hang = true
    const pending = writePlanBlob(ACCOUNT, body(), { expectedRev: 0 })
    await jest.advanceTimersByTimeAsync(UPSTASH_TIMEOUT_MS + 1)
    await expect(pending).resolves.toEqual({ status: 'error' })
    expect(fake.writes).toBe(0)
  })

  it('refuses to write over a revision key it cannot read', async () => {
    configure()
    const fake = useFake()
    fake.data[META()] = 'garbage'

    await expect(writePlanBlob(ACCOUNT, body(), { expectedRev: 0 })).resolves.toEqual({
      status: 'error',
    })
    expect(fake.writes).toBe(0)
  })
})

describe('persistence round trip', () => {
  it('survives write -> read unchanged', async () => {
    configure()
    useFake()

    const now = Date.now()
    const plans = [plan('plan-base', 1_000), plan('plan-two', 2_000)]
    const write = await writePlanBlob(
      ACCOUNT,
      { plans, activePlanId: 'plan-two', deletedPlans: { 'plan-gone': now - 5_000 } },
      { expectedRev: 0, now }
    )
    expect(write).toEqual({ status: 'ok', rev: 1, updatedAt: now })

    const read = await readPlanBlob(ACCOUNT)
    expect(read.status).toBe('ok')
    if (read.status !== 'ok') return
    expect(read.rev).toBe(1)
    expect(read.blob.activePlanId).toBe('plan-two')
    expect(read.blob.plans.map((entry) => entry.id)).toEqual(['plan-base', 'plan-two'])
    expect(read.blob.plans[0].params).toEqual(DEFAULT_PARAMS)
    expect(read.blob.deletedPlans).toEqual({ 'plan-gone': now - 5_000 })
    expect(read.blob.updatedAt).toBe(now)
  })
})
