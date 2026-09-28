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

let worker: Worker | null = null
let workerLoading: Promise<Worker> | null = null
let nextRequestId = 0

export const canUseWorker = () =>
  typeof window !== 'undefined' && typeof Worker !== 'undefined' && process.env.NODE_ENV !== 'test'

const getWorker = (): Promise<Worker> => {
  workerLoading ??= import('./createSimulationWorker').then(
    ({ createSimulationWorker }) => {
      worker ??= createSimulationWorker()
      return worker
    },
    (error: unknown) => {
      // A failed chunk load is retried by the next run.
      workerLoading = null
      throw error
    }
  )
  return workerLoading
}

function post(simulationWorker: Worker, params: SimulationParams): Promise<SimulationResults> {
  const id = nextRequestId++

  return new Promise<SimulationResults>((resolve, reject) => {
    const cleanup = () => {
      simulationWorker.removeEventListener('message', handleMessage)
      simulationWorker.removeEventListener('error', handleError)
    }

    const handleError = (event: ErrorEvent) => {
      cleanup()
      reject(event.error instanceof Error ? event.error : new Error(event.message))
    }

    const handleMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.id !== id) return

      cleanup()

      if (event.data.ok) {
        resolve(event.data.results)
      } else {
        reject(new Error(event.data.error))
      }
    }

    simulationWorker.addEventListener('message', handleMessage)
    simulationWorker.addEventListener('error', handleError)
    simulationWorker.postMessage({ id, params } satisfies WorkerRequest)
  })
}

/**
 * Runs one simulation on the shared worker (FIFO), or on the main thread where
 * there is no worker (server, tests).
 *
 * Once the worker exists the request is posted *synchronously*, inside this
 * call: a caller that updates React state right after calling (the store sets
 * `isLoading`) no longer makes the job wait for that render — the worker
 * computes while the main thread renders.
 */
export function runSimulationInClient(params: SimulationParams): Promise<SimulationResults> {
  if (!canUseWorker()) {
    try {
      return Promise.resolve(runMonteCarloSimulation(params))
    } catch (error) {
      return Promise.reject(error)
    }
  }

  if (worker) return post(worker, params)
  return getWorker().then((ready) => post(ready, params))
}
