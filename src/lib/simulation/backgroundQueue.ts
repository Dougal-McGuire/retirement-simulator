import type { SimulationParams, SimulationResults } from '@/types'

/**
 * One background job on the shared worker at a time, across everything that
 * measures in the background: the stress levers, the uncertain items and the
 * saved plan's result for the ghost. The worker runs jobs in order, so this
 * is what bounds the wait of the head's next run to a single background job.
 * `wanted` is checked once the slot is free: a job whose gate closed while
 * it waited is never sent.
 */
let backgroundTail: Promise<unknown> = Promise.resolve()

export function runInBackgroundSlot(
  params: SimulationParams,
  wanted: () => boolean
): Promise<SimulationResults | null> {
  const job = backgroundTail.then(async () => {
    if (!wanted()) return null
    const { runSimulationInClient } = await import('@/lib/simulation/workerClient')
    if (!wanted()) return null
    return runSimulationInClient(params)
  })
  backgroundTail = job.catch(() => null)
  return job
}
