/**
 * The compare-and-set Lua script on a REAL Redis.
 *
 * Every other test runs the plan store against `fakeUpstash`, which mirrors
 * the script in TypeScript — good for the protocol, blind to a mistake in the
 * Lua itself. This suite starts a throwaway `redis-server` and talks to it
 * through the same REST shape Upstash offers. It is skipped where no
 * `redis-server` is installed (CI images without one); run it locally after
 * touching `COMPARE_AND_SET_SCRIPT`.
 */

import { DEFAULT_PARAMS, type Plan } from '@/types'
import { makePlan } from '@/lib/stores/plans'
import { PLAN_SCHEMA_VERSION } from '@/lib/plans/schemaVersion'
import { planMetaKey, planStoreKey, readPlanBlob, writePlanBlob } from '@/lib/server/planStore'
import {
  redisServerAvailable,
  startRedisBridge,
  type RedisBridge,
} from '@/lib/server/testing/redisBridge'
import { createFakeUpstash } from '@/lib/server/testing/fakeUpstash'

const plan = (id: string, updatedAt = 1_000): Plan =>
  makePlan({ id, name: id, params: DEFAULT_PARAMS, createdAt: 500, updatedAt })

const body = (id: string) => ({ plans: [plan(id)], activePlanId: id })

const describeWithRedis = redisServerAvailable() ? describe : describe.skip

describeWithRedis('plan store on a real Redis', () => {
  const originalEnv = { ...process.env }
  let bridge: RedisBridge
  let account = 0

  /** A fresh account per test, so tests do not see each other's keys. */
  const nextAccount = () => `account-${(account += 1)}`

  beforeAll(async () => {
    bridge = await startRedisBridge()
    process.env.KV_REST_API_URL = bridge.url
    process.env.KV_REST_API_TOKEN = 'unused-by-the-bridge'
    delete process.env.VERCEL_ENV
  }, 20_000)

  afterAll(async () => {
    process.env = { ...originalEnv }
    await bridge?.stop()
  })

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    jest.restoreAllMocks()
  })

  it('reads a missing key as empty at revision 0', async () => {
    await expect(readPlanBlob(nextAccount())).resolves.toEqual({ status: 'empty', rev: 0 })
  })

  it('writes on the right revision and refuses every other one, atomically', async () => {
    const id = nextAccount()

    await expect(writePlanBlob(id, body('first'), { expectedRev: 0 })).resolves.toMatchObject({
      status: 'ok',
      rev: 1,
    })
    await expect(writePlanBlob(id, body('stale'), { expectedRev: 0 })).resolves.toEqual({
      status: 'conflict',
      rev: 1,
    })
    await expect(writePlanBlob(id, body('second'), { expectedRev: 1 })).resolves.toMatchObject({
      status: 'ok',
      rev: 2,
    })

    const read = await readPlanBlob(id)
    expect(read.status === 'ok' && read.rev).toBe(2)
    expect(read.status === 'ok' && read.blob.plans.map((entry) => entry.id)).toEqual(['second'])
    await expect(bridge.command('GET', planMetaKey(id))).resolves.toBe(`2:${PLAN_SCHEMA_VERSION}`)
  })

  it('lets exactly one of several concurrent writers win', async () => {
    const id = nextAccount()
    await writePlanBlob(id, body('base'), { expectedRev: 0 })

    const results = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        writePlanBlob(id, body(`writer-${index}`), { expectedRev: 1 })
      )
    )

    expect(results.filter((result) => result.status === 'ok')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'conflict')).toHaveLength(7)
    const read = await readPlanBlob(id)
    expect(read.status === 'ok' && read.rev).toBe(2)
  })

  it('treats a blob from before revisions as revision 0 and upgrades it', async () => {
    const id = nextAccount()
    await bridge.command(
      'SET',
      planStoreKey(id),
      JSON.stringify({
        schemaVersion: 2,
        updatedAt: 1,
        plans: [plan('legacy')],
        activePlanId: 'legacy',
      })
    )

    const before = await readPlanBlob(id)
    expect(before.status === 'ok' && before.rev).toBe(0)

    await expect(writePlanBlob(id, body('next'), { expectedRev: 4 })).resolves.toEqual({
      status: 'conflict',
      rev: 0,
    })
    await expect(writePlanBlob(id, body('next'), { expectedRev: 0 })).resolves.toMatchObject({
      status: 'ok',
      rev: 1,
    })
  })

  it('never overwrites a blob written by a newer schema', async () => {
    const withMeta = nextAccount()
    const newer = JSON.stringify({
      schemaVersion: PLAN_SCHEMA_VERSION + 1,
      plans: [plan('future')],
    })
    await bridge.command('SET', planStoreKey(withMeta), newer)
    await bridge.command('SET', planMetaKey(withMeta), `3:${PLAN_SCHEMA_VERSION + 1}`)

    await expect(writePlanBlob(withMeta, body('old'), { expectedRev: 3 })).resolves.toEqual({
      status: 'newer',
      schemaVersion: PLAN_SCHEMA_VERSION + 1,
    })
    await expect(readPlanBlob(withMeta)).resolves.toEqual({
      status: 'newer',
      schemaVersion: PLAN_SCHEMA_VERSION + 1,
    })

    // No meta key: the version is found in the blob text. A plan *named* like
    // the field must not be mistaken for it.
    const withoutMeta = nextAccount()
    await bridge.command(
      'SET',
      planStoreKey(withoutMeta),
      JSON.stringify({
        schemaVersion: PLAN_SCHEMA_VERSION + 4,
        plans: [{ ...plan('future'), name: '"schemaVersion":1' }],
      })
    )
    await expect(writePlanBlob(withoutMeta, body('old'), { expectedRev: 0 })).resolves.toEqual({
      status: 'newer',
      schemaVersion: PLAN_SCHEMA_VERSION + 4,
    })

    await expect(bridge.command('GET', planStoreKey(withMeta))).resolves.toBe(newer)
  })

  it('refuses to write over a revision key it cannot parse', async () => {
    const id = nextAccount()
    await bridge.command('SET', planMetaKey(id), 'garbage')

    await expect(writePlanBlob(id, body('a'), { expectedRev: 0 })).resolves.toEqual({
      status: 'error',
    })
    await expect(bridge.command('EXISTS', planStoreKey(id))).resolves.toBe(0)
  })

  it('agrees with the in-memory fake the other suites use', async () => {
    const id = nextAccount()
    const fake = createFakeUpstash(bridge.url)
    const steps: Array<[string, number]> = [
      ['a', 0],
      ['b', 0],
      ['c', 1],
      ['d', 5],
      ['e', 2],
    ]

    const real: unknown[] = []
    for (const [name, expectedRev] of steps) {
      real.push(await writePlanBlob(id, body(name), { expectedRev, now: 1_000 }))
    }

    const originalFetch = global.fetch
    global.fetch = fake.fetch as unknown as typeof fetch
    try {
      const faked: unknown[] = []
      for (const [name, expectedRev] of steps) {
        faked.push(await writePlanBlob(id, body(name), { expectedRev, now: 1_000 }))
      }
      expect(faked).toEqual(real)
      await expect(bridge.command('GET', planStoreKey(id))).resolves.toBe(
        fake.data[planStoreKey(id)]
      )
      await expect(bridge.command('GET', planMetaKey(id))).resolves.toBe(fake.data[planMetaKey(id)])
    } finally {
      global.fetch = originalFetch
    }
  })
})
