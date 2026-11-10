import { DEFAULT_PARAMS, type SimulationParams, type SimulationResults } from '@/types'

/**
 * The worker client with a fake Worker.
 *
 * What is being pinned down: a worker that dies must not take every later run
 * with it. Before this suite existed the dead instance stayed cached, later
 * requests were posted into the void, and the dashboard showed "calculating"
 * until the tab was reloaded.
 */

type Listener = (event: unknown) => void
type Behaviour = 'answer' | 'error' | 'messageerror' | 'silent' | 'engine-error'

const PARAMS: SimulationParams = { ...DEFAULT_PARAMS, simulationRuns: 3 }

/** What the fake worker "computes": recognisable, and not what the engine returns. */
const fakeResults = (params: SimulationParams): SimulationResults =>
  ({ successRate: -1, params }) as unknown as SimulationResults

class FakeWorker {
  static instances: FakeWorker[] = []
  /** Behaviour of the next instances, in creation order; the last one repeats. */
  static script: Behaviour[] = ['answer']

  readonly behaviour: Behaviour
  terminated = false
  posted: { id: number; params: SimulationParams }[] = []
  private listeners: Record<string, Set<Listener>> = {
    message: new Set(),
    error: new Set(),
    messageerror: new Set(),
  }

  constructor() {
    const index = FakeWorker.instances.length
    this.behaviour = FakeWorker.script[Math.min(index, FakeWorker.script.length - 1)]
    FakeWorker.instances.push(this)
  }

  addEventListener(type: string, listener: Listener) {
    this.listeners[type]?.add(listener)
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners[type]?.delete(listener)
  }

  listenerCount() {
    return Object.values(this.listeners).reduce((total, set) => total + set.size, 0)
  }

  emit(type: string, event: unknown) {
    ;[...(this.listeners[type] ?? [])].forEach((listener) => listener(event))
  }

  terminate() {
    this.terminated = true
  }

  postMessage(message: { id: number; params: SimulationParams }) {
    this.posted.push(message)
    if (this.terminated || this.behaviour === 'silent') return
    setTimeout(() => {
      if (this.behaviour === 'answer') {
        this.emit('message', {
          data: { id: message.id, ok: true, results: fakeResults(message.params) },
        })
      } else if (this.behaviour === 'engine-error') {
        this.emit('message', { data: { id: message.id, ok: false, error: 'engine threw' } })
      } else if (this.behaviour === 'error') {
        // A worker whose script failed to load: one `error`, then silence.
        this.emit('error', { message: 'Failed to load worker script' })
      } else {
        this.emit('messageerror', {})
      }
    }, 0)
  }
}

/** What `createSimulationWorker` does on each call: return a worker, or throw. */
let createBehaviour: Array<'create' | 'throw'> = ['create']
let createCalls = 0

jest.mock('@/lib/simulation/createSimulationWorker', () => ({
  createSimulationWorker: () => {
    const behaviour = createBehaviour[Math.min(createCalls, createBehaviour.length - 1)]
    createCalls += 1
    if (behaviour === 'throw') throw new Error('Worker constructor blocked')
    return new FakeWorker()
  },
}))

type Client = typeof import('@/lib/simulation/workerClient')

const settle = (promise: Promise<SimulationResults>) =>
  promise.then(
    (results) => ({ status: 'resolved' as const, results }),
    (error: Error) => ({ status: 'rejected' as const, message: error.message })
  )

/** Resolves to 'pending' if the promise has not settled after a few timer turns. */
const orPending = <T>(promise: Promise<T>) =>
  Promise.race([
    promise,
    new Promise<'pending'>((resolve) => setTimeout(() => resolve('pending'), 50)),
  ])

describe('simulation worker client', () => {
  const env = process.env as Record<string, string | undefined>
  const previousEnv = env.NODE_ENV
  const globals = globalThis as Record<string, unknown>
  let client: Client

  beforeEach(async () => {
    // A browser, as far as `canUseWorker` can tell.
    globals.window = {}
    globals.Worker = FakeWorker
    env.NODE_ENV = 'production'
    FakeWorker.instances = []
    FakeWorker.script = ['answer']
    createBehaviour = ['create']
    createCalls = 0
    // Fresh module state (cached worker, failure count) for every test.
    jest.resetModules()
    client = await import('@/lib/simulation/workerClient')
  })

  afterEach(() => {
    env.NODE_ENV = previousEnv
    delete globals.window
    delete globals.Worker
  })

  it('answers through one shared worker, routing each answer to its request', async () => {
    const first = client.runSimulationInClient(PARAMS)
    const second = client.runSimulationInClient({ ...PARAMS, currentAssets: 1 })
    const [a, b] = await Promise.all([first, second])

    expect(a.successRate).toBe(-1)
    expect(a.params.currentAssets).toBe(PARAMS.currentAssets)
    expect(b.params.currentAssets).toBe(1)
    expect(FakeWorker.instances).toHaveLength(1)
    // One set of listeners for the worker, not one per request.
    expect(FakeWorker.instances[0].listenerCount()).toBe(3)

    await client.runSimulationInClient(PARAMS)
    expect(FakeWorker.instances).toHaveLength(1)
    expect(FakeWorker.instances[0].listenerCount()).toBe(3)
  })

  it('rejects what was waiting when the worker dies, and throws the worker away', async () => {
    FakeWorker.script = ['error', 'answer']

    const first = await settle(client.runSimulationInClient(PARAMS))
    expect(first).toEqual({ status: 'rejected', message: 'Failed to load worker script' })

    const dead = FakeWorker.instances[0]
    expect(dead.terminated).toBe(true)
    expect(dead.listenerCount()).toBe(0)
  })

  it('recovers: the run after a failure gets a new worker and an answer', async () => {
    // This is the regression: the second run used to stay pending forever.
    FakeWorker.script = ['error', 'answer']

    await settle(client.runSimulationInClient(PARAMS))
    const second = await orPending(settle(client.runSimulationInClient(PARAMS)))

    expect(second).not.toBe('pending')
    expect(second).toMatchObject({ status: 'resolved' })
    expect(FakeWorker.instances).toHaveLength(2)
    expect(FakeWorker.instances[1].posted).toHaveLength(1)
    expect(client.isWorkerDisabled()).toBe(false)
  })

  it('rejects every job that was in flight, not only the first', async () => {
    FakeWorker.script = ['silent']
    const first = settle(client.runSimulationInClient(PARAMS))
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
    const second = settle(client.runSimulationInClient(PARAMS))
    expect(FakeWorker.instances[0].posted).toHaveLength(2)

    FakeWorker.instances[0].emit('error', { error: new Error('out of memory') })

    expect(await first).toEqual({ status: 'rejected', message: 'out of memory' })
    expect(await second).toEqual({ status: 'rejected', message: 'out of memory' })
  })

  it('treats an unreadable message like a dead worker', async () => {
    FakeWorker.script = ['messageerror', 'answer']

    const first = await settle(client.runSimulationInClient(PARAMS))
    expect(first.status).toBe('rejected')
    expect(FakeWorker.instances[0].terminated).toBe(true)

    expect(await settle(client.runSimulationInClient(PARAMS))).toMatchObject({
      status: 'resolved',
    })
  })

  it('falls back to the main thread when the worker fails twice in a row', async () => {
    FakeWorker.script = ['error']

    // First failure: rejected, as above.
    expect((await settle(client.runSimulationInClient(PARAMS))).status).toBe('rejected')
    // Second failure: the job that was waiting is answered by the engine.
    const second = await orPending(settle(client.runSimulationInClient(PARAMS)))
    expect(second).toMatchObject({ status: 'resolved' })
    if (second === 'pending' || second.status !== 'resolved') throw new Error('unreachable')
    // The real engine, not the fake worker's marker.
    expect(second.results.successRate).toBeGreaterThanOrEqual(0)
    expect(second.results.ages).toHaveLength(PARAMS.endAge - PARAMS.currentAge + 1)
    expect(client.isWorkerDisabled()).toBe(true)

    // From here on no further worker is created.
    const third = await client.runSimulationInClient(PARAMS)
    expect(third.successRate).toBe(second.results.successRate)
    expect(FakeWorker.instances).toHaveLength(2)
    expect(FakeWorker.instances.every((instance) => instance.terminated)).toBe(true)
  })

  it('does not count failures that had a working answer in between', async () => {
    FakeWorker.script = ['error', 'answer', 'answer']

    await settle(client.runSimulationInClient(PARAMS))
    await client.runSimulationInClient(PARAMS)
    // The healthy worker dies much later: that is a first failure again.
    FakeWorker.instances[1].emit('error', { message: 'crashed' })
    expect(client.isWorkerDisabled()).toBe(false)

    const after = await client.runSimulationInClient(PARAMS)
    expect(after.successRate).toBe(-1)
    expect(FakeWorker.instances).toHaveLength(3)
  })

  it('falls back when the worker cannot even be created, without rejecting anything', async () => {
    createBehaviour = ['throw']

    const results = await client.runSimulationInClient(PARAMS)

    expect(results.successRate).toBeGreaterThanOrEqual(0)
    // Tried twice, then stopped trying.
    expect(createCalls).toBe(2)
    expect(client.isWorkerDisabled()).toBe(true)
    await client.runSimulationInClient(PARAMS)
    expect(createCalls).toBe(2)
  })

  it('retries a creation that failed once', async () => {
    createBehaviour = ['throw', 'create']

    const results = await client.runSimulationInClient(PARAMS)

    expect(results.successRate).toBe(-1)
    expect(createCalls).toBe(2)
    expect(client.isWorkerDisabled()).toBe(false)
  })

  it('keeps the worker when the engine inside it throws', async () => {
    FakeWorker.script = ['engine-error']

    expect(await settle(client.runSimulationInClient(PARAMS))).toEqual({
      status: 'rejected',
      message: 'engine threw',
    })
    expect(FakeWorker.instances[0].terminated).toBe(false)
    expect(client.isWorkerDisabled()).toBe(false)
  })

  it('ignores a late event from a worker that was already replaced', async () => {
    FakeWorker.script = ['error', 'answer']
    await settle(client.runSimulationInClient(PARAMS))
    await client.runSimulationInClient(PARAMS)

    // Listeners are gone, so this reaches nobody — and must not break anything.
    FakeWorker.instances[0].emit('error', { message: 'again' })

    expect(client.isWorkerDisabled()).toBe(false)
    expect((await client.runSimulationInClient(PARAMS)).successRate).toBe(-1)
    expect(FakeWorker.instances).toHaveLength(2)
  })

  it('runs on the main thread where there is no worker at all', async () => {
    delete globals.Worker

    const results = await client.runSimulationInClient(PARAMS)

    expect(results.successRate).toBeGreaterThanOrEqual(0)
    expect(createCalls).toBe(0)
  })
})
