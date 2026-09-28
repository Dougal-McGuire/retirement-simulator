import { DEFAULT_PARAMS, type SimulationParams } from '@/types'
import {
  buildScenarioParams,
  buildScenarioPatch,
  isScenarioId,
  pickScenarioKeys,
  SCENARIO_APPLY_KEYS,
  type ScenarioId,
} from '../planInsights'

const ids = buildScenarioParams(DEFAULT_PARAMS).map((scenario) => scenario.id)

describe('stress lever "Übernehmen": apply keys, patch and undo snapshot', () => {
  it('names exactly the keys each lever changes (spec §5.5)', () => {
    expect(SCENARIO_APPLY_KEYS).toEqual({
      laterRetirement: ['retirementAge'],
      moreSavings: ['annualSavings'],
      lowerSpending: ['customExpenses', 'cashFlows'],
    })
    // Every lever the scenario builder produces has an entry, in the same order.
    expect(Object.keys(SCENARIO_APPLY_KEYS)).toEqual(ids)
  })

  it('recognises lever ids', () => {
    for (const id of ids) expect(isScenarioId(id)).toBe(true)
    expect(isScenarioId('glidePath')).toBe(false)
    expect(isScenarioId('toString')).toBe(false)
    expect(isScenarioId(undefined)).toBe(false)
  })

  it('patches only the changed keys, with the scenario’s values', () => {
    for (const id of ids) {
      const patch = buildScenarioPatch(id, DEFAULT_PARAMS)
      expect(Object.keys(patch).sort()).toEqual([...SCENARIO_APPLY_KEYS[id]].sort())
      const scenario = buildScenarioParams(DEFAULT_PARAMS).find((entry) => entry.id === id)!
      for (const key of SCENARIO_APPLY_KEYS[id]) {
        expect(patch[key]).toEqual(scenario.params[key])
      }
      // Never the run count or anything else the scenario carries.
      expect(patch).not.toHaveProperty('simulationRuns')
    }
  })

  it('moves the numbers the levers promise', () => {
    const later = buildScenarioPatch('laterRetirement', DEFAULT_PARAMS)
    expect(later.retirementAge).toBe(DEFAULT_PARAMS.retirementAge + 2)

    const savings = buildScenarioPatch('moreSavings', DEFAULT_PARAMS)
    expect(savings.annualSavings).toBe(Math.round(DEFAULT_PARAMS.annualSavings * 1.1))

    const spending = buildScenarioPatch('lowerSpending', DEFAULT_PARAMS)
    expect(spending.customExpenses?.map((expense) => expense.amount)).toEqual(
      DEFAULT_PARAMS.customExpenses.map((expense) => Math.max(0, Math.round(expense.amount * 0.9)))
    )
    // Recurring expense flows scale; one-offs and incomes do not.
    DEFAULT_PARAMS.cashFlows.forEach((flow, index) => {
      const next = spending.cashFlows![index]
      const scaled = flow.kind === 'expense' && flow.frequency !== 'once'
      expect(next.amount).toBe(scaled ? Math.max(0, Math.round(flow.amount * 0.9)) : flow.amount)
    })
  })

  it('keeps later retirement inside the horizon', () => {
    const late: SimulationParams = { ...DEFAULT_PARAMS, retirementAge: 89, endAge: 90 }
    expect(buildScenarioPatch('laterRetirement', late).retirementAge).toBe(89)
  })

  it('snapshots the draft’s current values for undo, detached from the draft', () => {
    const draft: SimulationParams = {
      ...DEFAULT_PARAMS,
      customExpenses: DEFAULT_PARAMS.customExpenses.map((expense) => ({ ...expense })),
      cashFlows: DEFAULT_PARAMS.cashFlows.map((flow) => ({ ...flow })),
    }
    const snapshot = pickScenarioKeys('lowerSpending', draft)
    expect(snapshot).toEqual({ customExpenses: draft.customExpenses, cashFlows: draft.cashFlows })
    expect(snapshot.customExpenses).not.toBe(draft.customExpenses)
    expect(snapshot.cashFlows).not.toBe(draft.cashFlows)

    // A later edit of the draft cannot reach into the snapshot.
    draft.customExpenses[0].amount += 999
    draft.cashFlows[0].amount += 999
    expect(snapshot.customExpenses![0].amount).toBe(DEFAULT_PARAMS.customExpenses[0].amount)
    expect(snapshot.cashFlows![0].amount).toBe(DEFAULT_PARAMS.cashFlows[0].amount)
  })

  it('undo restores exactly what apply changed and leaves other edits alone', () => {
    for (const id of ids as ScenarioId[]) {
      // The reader had also moved the return before applying the lever.
      const before: SimulationParams = { ...DEFAULT_PARAMS, averageROI: 0.05 }
      const snapshot = pickScenarioKeys(id, before)
      const applied = { ...before, ...buildScenarioPatch(id, before) }
      expect(applied).not.toEqual(before)
      const undone = { ...applied, ...snapshot }
      expect(undone).toEqual(before)
      expect(undone.averageROI).toBe(0.05)
    }
  })
})
