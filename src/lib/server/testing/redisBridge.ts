/**
 * TEST SUPPORT — a real `redis-server` behind the one piece of the Upstash REST
 * API that `planStore.ts` uses: a command `POST`ed as a JSON array, answered
 * with `{ result }` (or `400 { error }`).
 *
 * Exists so the compare-and-set Lua script runs on an actual Redis at least
 * where one is installed (`__tests__/planStoreRedis.test.ts`); everywhere else
 * the in-memory `fakeUpstash` stands in for it.
 */

import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { connect, createServer as createTcpServer, type AddressInfo } from 'node:net'

export const redisServerAvailable = (): boolean => {
  try {
    return spawnSync('redis-server', ['--version'], { stdio: 'ignore' }).status === 0
  } catch {
    return false
  }
}

const freePort = (): Promise<number> =>
  new Promise((resolve, reject) => {
    const probe = createTcpServer()
    probe.once('error', reject)
    probe.listen(0, '127.0.0.1', () => {
      const { port } = probe.address() as AddressInfo
      probe.close(() => resolve(port))
    })
  })

/** A command as a RESP array of bulk strings. */
const encode = (command: string[]): Buffer =>
  Buffer.concat([
    Buffer.from(`*${command.length}\r\n`),
    ...command.map((part) => {
      const bytes = Buffer.from(part)
      return Buffer.concat([Buffer.from(`$${bytes.length}\r\n`), bytes, Buffer.from('\r\n')])
    }),
  ])

class RedisError extends Error {}

type Parsed = { value: unknown; next: number } | null

/** One RESP reply starting at `offset`; `null` while it is still incomplete. */
function parse(buffer: Buffer, offset = 0): Parsed {
  const lineEnd = buffer.indexOf('\r\n', offset)
  if (lineEnd === -1) return null

  const type = String.fromCharCode(buffer[offset])
  const line = buffer.toString('utf8', offset + 1, lineEnd)
  const next = lineEnd + 2

  if (type === '+') return { value: line, next }
  if (type === '-') return { value: new RedisError(line), next }
  if (type === ':') return { value: Number(line), next }
  if (type === '$') {
    const length = Number(line)
    if (length < 0) return { value: null, next }
    if (buffer.length < next + length + 2) return null
    return { value: buffer.toString('utf8', next, next + length), next: next + length + 2 }
  }
  if (type === '*') {
    const count = Number(line)
    if (count < 0) return { value: null, next }
    const items: unknown[] = []
    let cursor = next
    for (let index = 0; index < count; index += 1) {
      const item = parse(buffer, cursor)
      if (!item) return null
      items.push(item.value)
      cursor = item.next
    }
    return { value: items, next: cursor }
  }
  throw new Error(`unexpected RESP type ${type}`)
}

const runCommand = (port: number, command: string[]): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const socket = connect(port, '127.0.0.1')
    let received = Buffer.alloc(0)
    socket.once('error', reject)
    socket.on('data', (chunk) => {
      received = Buffer.concat([received, chunk])
      const reply = parse(received)
      if (!reply) return
      socket.destroy()
      if (reply.value instanceof RedisError) reject(reply.value)
      else resolve(reply.value)
    })
    socket.write(encode(command))
  })

export interface RedisBridge {
  /** Use as `KV_REST_API_URL`. */
  url: string
  /** Runs one command directly, for seeding and inspecting. */
  command: (...parts: string[]) => Promise<unknown>
  stop: () => Promise<void>
}

export async function startRedisBridge(): Promise<RedisBridge> {
  const redisPort = await freePort()
  const redis: ChildProcess = spawn(
    'redis-server',
    ['--port', String(redisPort), '--bind', '127.0.0.1', '--save', '', '--appendonly', 'no'],
    { stdio: 'ignore' }
  )

  // Wait until it answers.
  for (let attempt = 0; ; attempt += 1) {
    try {
      await runCommand(redisPort, ['PING'])
      break
    } catch (error) {
      if (attempt >= 100) {
        redis.kill()
        throw error
      }
      await new Promise((resolve) => setTimeout(resolve, 50))
    }
  }

  const http: Server = createServer((request, response) => {
    const chunks: Buffer[] = []
    request.on('data', (chunk: Buffer) => chunks.push(chunk))
    request.on('end', () => {
      const answer = (status: number, body: unknown) => {
        response.writeHead(status, { 'Content-Type': 'application/json' })
        response.end(JSON.stringify(body))
      }
      let command: string[]
      try {
        command = JSON.parse(Buffer.concat(chunks).toString('utf8')) as string[]
      } catch {
        answer(400, { error: 'ERR failed to parse command' })
        return
      }
      runCommand(redisPort, command).then(
        (result) => answer(200, { result }),
        (error: Error) => answer(400, { error: error.message })
      )
    })
  })
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve))
  const { port } = http.address() as AddressInfo

  return {
    url: `http://127.0.0.1:${port}`,
    command: (...parts) => runCommand(redisPort, parts),
    stop: async () => {
      await new Promise<void>((resolve) => http.close(() => resolve()))
      redis.kill()
    },
  }
}
