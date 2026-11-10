/**
 * TEST SUPPORT — an in-memory stand-in for the Upstash REST API as
 * `planStore.ts` uses it: one Redis command per `POST`, sent as a JSON array.
 *
 * `EVAL` does not run Lua. It accepts exactly `COMPARE_AND_SET_SCRIPT` and
 * mirrors its logic in TypeScript, so a test fails loudly when the script
 * changes without this mirror following. The script itself is exercised
 * against a real Redis in `__tests__/planStoreRedis.test.ts`.
 */

import { COMPARE_AND_SET_SCRIPT } from '@/lib/server/planStore'

export const FAKE_UPSTASH_URL = 'https://redis.example.com'

export interface FakeUpstash {
  /** The keyspace. Seed and inspect it directly. */
  data: Record<string, string>
  /** Every command received, in order (also the ones answered with a failure). */
  commands: string[][]
  /** Number of commands that changed `data`. */
  writes: number
  /** The next N commands answer `500`. */
  failNext: number
  /** The next N commands answer `200 { error }` (how Upstash reports e.g. a quota). */
  errorNext: number
  /** While true, commands never answer; they reject when the request is aborted. */
  hang: boolean
  handles: (url: string) => boolean
  fetch: (input: unknown, init?: RequestInit) => Promise<Response>
}

function compareAndSet(data: Record<string, string>, args: string[]): unknown[] {
  const [blobKey, metaKey, expectedRev, writerSchema, blob, meta] = args

  let rev = 0
  let schema = 0
  const storedMeta = data[metaKey]
  if (storedMeta !== undefined) {
    const match = /^(\d+):(\d+)$/.exec(storedMeta)
    if (!match) return ['corrupt']
    rev = Number(match[1])
    schema = Number(match[2])
  } else if (data[blobKey] !== undefined) {
    const match = /"schemaVersion"\s*:\s*(\d+)/.exec(data[blobKey])
    schema = match ? Number(match[1]) : 1
  }

  if (schema > Number(writerSchema)) return ['newer', rev, schema]
  if (rev !== Number(expectedRev)) return ['conflict', rev]

  data[blobKey] = blob
  data[metaKey] = meta
  return ['ok', rev + 1]
}

export function createFakeUpstash(url: string = FAKE_UPSTASH_URL): FakeUpstash {
  const fake: FakeUpstash = {
    data: {},
    commands: [],
    writes: 0,
    failNext: 0,
    errorNext: 0,
    hang: false,
    handles: (candidate) => candidate === url || candidate === `${url}/`,
    fetch: async (input, init) => {
      if (!fake.handles(String(input)))
        throw new Error(`fake Upstash: unexpected url ${String(input)}`)
      if (init?.method !== 'POST') throw new Error('fake Upstash: commands are POSTed')

      const command = JSON.parse(String(init.body)) as string[]
      fake.commands.push(command)

      if (fake.hang) {
        return new Promise<Response>((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => {
            const error = new Error('The operation was aborted')
            error.name = 'AbortError'
            reject(error)
          })
        })
      }
      if (fake.failNext > 0) {
        fake.failNext -= 1
        return new Response('upstream timeout', { status: 500 })
      }
      if (fake.errorNext > 0) {
        fake.errorNext -= 1
        return Response.json({ error: 'ERR max daily request limit exceeded' })
      }

      const [name, ...args] = command
      switch (name.toUpperCase()) {
        case 'GET':
          return Response.json({ result: fake.data[args[0]] ?? null })
        case 'MGET':
          return Response.json({ result: args.map((key) => fake.data[key] ?? null) })
        case 'SET':
          fake.data[args[0]] = args[1]
          fake.writes += 1
          return Response.json({ result: 'OK' })
        case 'EVAL': {
          const [script, keyCount, ...rest] = args
          if (script !== COMPARE_AND_SET_SCRIPT || keyCount !== '2') {
            throw new Error('fake Upstash: only the compare-and-set script is emulated')
          }
          const result = compareAndSet(fake.data, rest)
          if (result[0] === 'ok') fake.writes += 1
          return Response.json({ result })
        }
        default:
          throw new Error(`fake Upstash: unsupported command ${name}`)
      }
    },
  }
  return fake
}
