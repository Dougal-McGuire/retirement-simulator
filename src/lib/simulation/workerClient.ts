import type { SimulationParams, SimulationResults } from '@/types'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'

type WorkerRequest = {
  id: number
  params: SimulationParams
}

type WorkerResponse =
  | {
      id: number
      ok: true
      results: SimulationResults
    }
  | {
      id: number
      ok: false
      error: string
    }

/** A request that was posted and has not been answered yet. */
type PendingJob = {
  params: SimulationParams
  resolve: (results: SimulationResults) => void
  reject: (error: Error) => void
}

/**
 * How many times in a row the worker may fail — die with an `error` /
 * `messageerror`, or fail to be created at all — before the client stops
 * trying and computes on the main thread instead.
 *
 * One failure can be bad luck (a chunk that did not load, a tab that was
 * starved): the worker is thrown away and the next run builds a new one. A
 * second failure without a single successful answer in between means workers
 * do not work here (a CSP, a broken deploy), and a slow answer on the main
 * thread beats a spinner that never stops.
 */
export const MAX_WORKER_FAILURES = 2

let worker: Worker | null = null
let workerLoading: Promise<Worker> | null = null
let nextRequestId = 0
/** Consecutive failures; any answered request resets it. */
let workerFailures = 0
const pending = new Map<number, PendingJob>()
/** Listeners per live worker, so a discarded one can be detached again. */
const detachByWorker = new WeakMap<Worker, () => void>()

export const canUseWorker = () =>
  typeof window !== 'undefined' && typeof Worker !== 'undefined' && process.env.NODE_ENV !== 'test'

/** True once the client has given up on workers for this page. */
export const isWorkerDisabled = () => workerFailures >= MAX_WORKER_FAILURES

function runOnMainThread(params: SimulationParams): Promise<SimulationResults> {
  try {
    return Promise.resolve(runMonteCarloSimulation(params))
  } catch (error) {
    return Promise.reject(error)
  }
}

const toError = (value: unknown, fallback: string): Error => {
  if (value instanceof Error) return value
  if (typeof value === 'string' && value !== '') return new Error(value)
  return new Error(fallback)
}

/**
 * The worker is gone: an `error` (its script failed to load or it threw
 * outside the message handler) or a `messageerror` (a message could not be
 * deserialised). A dead worker never answers again, so keeping it cached made
 * every later run wait forever.
 *
 * It is detached, terminated and forgotten, so the next run creates a fresh
 * one. Whatever was waiting on it is rejected — or, when this was the failure
 * that exhausts the retries, answered on the main thread.
 */
function handleWorkerFailure(failed: Worker, reason: Error) {
  // A late event from an instance that was already replaced.
  if (worker !== failed) return

  detachByWorker.get(failed)?.()
  detachByWorker.delete(failed)
  try {
    failed.terminate()
  } catch {
    // Already gone.
  }
  worker = null
  workerLoading = null
  workerFailures += 1

  const jobs = [...pending.values()]
  pending.clear()
  if (isWorkerDisabled()) {
    jobs.forEach((job) => runOnMainThread(job.params).then(job.resolve, job.reject))
  } else {
    jobs.forEach((job) => job.reject(reason))
  }
}

/** One set of listeners per worker; answers are routed to their job by id. */
function attach(created: Worker): Worker {
  const handleMessage = (event: MessageEvent<WorkerResponse>) => {
    const id = event.data?.id
    if (typeof id !== 'number') return
    const job = pending.get(id)
    if (!job) return
    pending.delete(id)
    // The worker answered: it works.
    workerFailures = 0

    if (event.data.ok) {
      job.resolve(event.data.results)
    } else {
      // The engine threw inside the worker. That is this job's problem, not
      // the worker's: it stays.
      job.reject(new Error(event.data.error))
    }
  }
  const handleError = (event: ErrorEvent) => {
    handleWorkerFailure(
      created,
      toError(event?.error ?? event?.message, 'Simulation worker failed')
    )
  }
  const handleMessageError = () => {
    handleWorkerFailure(created, new Error('Simulation worker sent an unreadable message'))
  }

  created.addEventListener('message', handleMessage)
  created.addEventListener('error', handleError)
  created.addEventListener('messageerror', handleMessageError)
  detachByWorker.set(created, () => {
    created.removeEventListener('message', handleMessage)
    created.removeEventListener('error', handleError)
    created.removeEventListener('messageerror', handleMessageError)
  })
  return created
}

const getWorker = (): Promise<Worker> => {
  if (!workerLoading) {
    const loading: Promise<Worker> = import('./createSimulationWorker').then(
      ({ createSimulationWorker }) => {
        worker ??= attach(createSimulationWorker())
        return worker
      }
    )
    workerLoading = loading
    // A chunk that did not load, or a constructor that threw: one failure per
    // attempt, however many callers were waiting on it, and the attempt is
    // forgotten so the next call starts a new one. Registered before any
    // caller's own handler, so the count is up to date when they retry.
    loading.catch(() => {
      if (workerLoading === loading) workerLoading = null
      workerFailures += 1
    })
  }
  return workerLoading
}

function post(simulationWorker: Worker, params: SimulationParams): Promise<SimulationResults> {
  const id = nextRequestId++

  return new Promise<SimulationResults>((resolve, reject) => {
    pending.set(id, { params, resolve, reject })
    try {
      simulationWorker.postMessage({ id, params } satisfies WorkerRequest)
    } catch (error) {
      // The request itself could not be sent (not cloneable): this job fails,
      // the worker is fine.
      pending.delete(id)
      reject(toError(error, 'Simulation request could not be sent'))
    }
  })
}

/**
 * Runs one simulation on the shared worker (FIFO), or on the main thread where
 * there is no worker (server, tests) or workers have proven not to work here
 * (see {@link MAX_WORKER_FAILURES}).
 *
 * Once the worker exists the request is posted *synchronously*, inside this
 * call: a caller that updates React state right after calling (the store sets
 * `isLoading`) no longer makes the job wait for that render — the worker
 * computes while the main thread renders.
 *
 * The returned promise always settles: with results, or with an error when
 * the engine threw or the worker died under the request. It never stays
 * pending on a worker that is gone.
 */
export function runSimulationInClient(params: SimulationParams): Promise<SimulationResults> {
  if (!canUseWorker() || isWorkerDisabled()) return runOnMainThread(params)

  if (worker) return post(worker, params)
  return getWorker().then(
    (ready) => post(ready, params),
    // Could not create one. Try again; after the second failure in a row the
    // call above takes the main thread.
    () => runSimulationInClient(params)
  )
}
