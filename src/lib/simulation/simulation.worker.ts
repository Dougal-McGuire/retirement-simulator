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

self.addEventListener('message', (event: MessageEvent<WorkerRequest>) => {
  const { id, params } = event.data

  try {
    const results = runMonteCarloSimulation(params)
    self.postMessage({ id, ok: true, results } satisfies WorkerResponse)
  } catch (error) {
    self.postMessage({
      id,
      ok: false,
      error: error instanceof Error ? error.message : 'Simulation failed',
    } satisfies WorkerResponse)
  }
})

export {}
