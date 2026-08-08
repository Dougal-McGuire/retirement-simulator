import { DEFAULT_PARAMS, type SimulationParams } from '@/types'
import { hashSimulationParams } from '@/lib/simulation/engine'
import { areSimulationParamsEqual } from '@/lib/simulation/planInsights'
import { normalizePersistedParams } from '@/lib/stores/simulationStore'

/**
 * Adding a field to `SimulationParams` means registering it in five places:
 *
 *   1. `numericParamKeys` in the store (so it is sanitized on load)
 *   2. the `Omit<...>` union behind `NumericParamKey` (numeric fields only)
 *   3. `normalizePersistedParams` (so it survives a reload)
 *   4. `hashSimulationParams` (so it participates in the plan identity hash)
 *   5. `comparableNumericParamKeys` in `planInsights` (so results go stale)
 *
 * Miss one and the failure is quiet and nasty: the new slider works until you
 * reload, or the dashboard keeps showing results computed without it. This
 * suite derives its cases from `Object.keys(DEFAULT_PARAMS)`, so a new field is
 * covered the moment it exists — no checklist to remember.
 */

/** A value that is definitely different from the default, per field. */
const mutate = (key: keyof SimulationParams, params: SimulationParams): SimulationParams => {
  switch (key) {
    case 'withdrawalStrategy':
      return {
        ...params,
        withdrawalStrategy:
          params.withdrawalStrategy === 'vanguardDynamic' ? 'fixedReal' : 'vanguardDynamic',
      }
    case 'customExpenses':
      return {
        ...params,
        customExpenses: [
          ...params.customExpenses,
          { id: 'guard-expense', name: 'Guard', amount: 1234, interval: 'monthly' },
        ],
      }
    case 'oneTimeIncomes':
      return {
        ...params,
        oneTimeIncomes: [...params.oneTimeIncomes, { name: 'Guard', age: 68, amount: 4321 }],
      }
    default: {
      const current = params[key]
      if (typeof current !== 'number') {
        throw new Error(
          `paramRegistration: no mutation strategy for non-numeric param "${key}". ` +
            'Add one to `mutate` when introducing a new parameter shape.'
        )
      }
      // Ages are integers in a bounded range; rates and counts are not. Nudging
      // by one either way stays inside every clamp the engine applies.
      return { ...params, [key]: nudge(key, current) }
    }
  }
}

const RATE_KEYS = new Set<keyof SimulationParams>([
  'annualSavingsGrowthRate',
  'averageROI',
  'roiVolatility',
  'averageInflation',
  'inflationVolatility',
  'dsWithdrawalRate',
  'dsCeilingRate',
  'dsFloorRate',
])

const nudge = (key: keyof SimulationParams, value: number): number => {
  if (RATE_KEYS.has(key)) return Math.round((value + 0.005) * 1000) / 1000
  if (key === 'endAge') return value - 1
  return value + 1
}

const paramKeys = Object.keys(DEFAULT_PARAMS) as (keyof SimulationParams)[]

describe('simulation parameter registration', () => {
  it('covers every field of SimulationParams', () => {
    expect(paramKeys.length).toBeGreaterThan(0)
    // Guards against the suite silently shrinking if DEFAULT_PARAMS is rebuilt.
    expect(paramKeys).toEqual(expect.arrayContaining(['currentAge', 'simulationRuns']))
  })

  describe.each(paramKeys.map((key) => [key] as const))('%s', (key) => {
    const mutated = mutate(key, DEFAULT_PARAMS)

    it('is actually changed by the test mutation', () => {
      expect(mutated[key]).not.toEqual(DEFAULT_PARAMS[key])
    })

    it('survives the persisted-params round-trip', () => {
      const restored = normalizePersistedParams(JSON.parse(JSON.stringify(mutated)))

      expect(restored[key]).toEqual(mutated[key])
      // ...and does not damage anything else on the way through.
      expect(restored).toEqual(mutated)
    })

    it('changes the plan identity hash', () => {
      expect(hashSimulationParams(mutated)).not.toBe(hashSimulationParams(DEFAULT_PARAMS))
    })

    it('marks existing results as stale', () => {
      expect(areSimulationParamsEqual(mutated, DEFAULT_PARAMS)).toBe(false)
      expect(areSimulationParamsEqual(DEFAULT_PARAMS, mutated)).toBe(false)
    })
  })

  it('treats an unchanged parameter set as equal and identically hashed', () => {
    const copy = normalizePersistedParams(JSON.parse(JSON.stringify(DEFAULT_PARAMS)))

    expect(areSimulationParamsEqual(copy, DEFAULT_PARAMS)).toBe(true)
    expect(hashSimulationParams(copy)).toBe(hashSimulationParams(DEFAULT_PARAMS))
  })
})
