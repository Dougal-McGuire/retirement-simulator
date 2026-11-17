import type { SimulationParams } from '@/types'
import {
  compareRetirementAges,
  type AgePlannerTargets,
  type RetirementAgeComparison,
} from './retirementFrontier'

export type AgePlannerResponse =
  | { type: 'progress'; done: number; total: number }
  | { type: 'result'; data: RetirementAgeComparison }
  | { type: 'error' }

self.onmessage = (
  event: MessageEvent<{ params: SimulationParams; targets: AgePlannerTargets }>
) => {
  const send = (message: AgePlannerResponse) => self.postMessage(message)
  try {
    const data = compareRetirementAges(event.data.params, event.data.targets, (done, total) =>
      send({ type: 'progress', done, total })
    )
    send({ type: 'result', data })
  } catch {
    send({ type: 'error' })
  }
}
