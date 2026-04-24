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
let nextRequestId = 0

const canUseWorker = () =>
  typeof window !== 'undefined' && typeof Worker !== 'undefined' && process.env.NODE_ENV !== 'test'

const getWorker = () => {
  if (!worker) {
    worker = new Worker(new URL('./simulation.worker.ts', import.meta.url), {
      type: 'module',
    })
  }

  return worker
}

export async function runSimulationInClient(params: SimulationParams): Promise<SimulationResults> {
  if (!canUseWorker()) {
    return runMonteCarloSimulation(params)
  }

  const simulationWorker = getWorker()
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
