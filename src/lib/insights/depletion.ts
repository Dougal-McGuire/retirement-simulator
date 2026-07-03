import type { SimulationResults } from '@/types'

export type DepletionAges = {
  p10DepletionAge: number | null
  p50DepletionAge: number | null
}

export function deriveDepletionAges(results: SimulationResults): DepletionAges {
  const findDepletionAge = (series: number[]): number | null => {
    for (let i = 0; i < results.ages.length; i++) {
      if (results.ages[i] >= results.params.retirementAge && series[i] <= 0) {
        return results.ages[i]
      }
    }
    return null
  }

  return {
    p10DepletionAge: findDepletionAge(results.assetPercentiles.p10),
    p50DepletionAge: findDepletionAge(results.assetPercentiles.p50),
  }
}
