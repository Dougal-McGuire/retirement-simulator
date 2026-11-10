import { DEFAULT_PARAMS, type CashFlow, type SimulationParams } from '@/types'
import de from '@/i18n/messages/de.json'
import en from '@/i18n/messages/en.json'
import { isCashFlowEnabled } from '@/lib/simulation/cashFlows'
import {
  DRAFT_FIELD_KEYS,
  buildDraftChanges,
  changedGroups,
  type DraftChange,
} from '@/lib/simulation/draftChanges'

/**
 * The change chips of the workspace: what the working copy changes against
 * the saved plan, and the patch that takes exactly one change back.
 */

const saved: SimulationParams = DEFAULT_PARAMS

const withFlows = (
  params: SimulationParams,
  map: (flows: CashFlow[]) => CashFlow[]
): SimulationParams => ({ ...params, cashFlows: map(params.cashFlows ?? []) })

const editFlow = (params: SimulationParams, id: string, patch: Partial<CashFlow>) =>
  withFlows(params, (flows) => flows.map((flow) => (flow.id === id ? { ...flow, ...patch } : flow)))

/** Applies a change's revert the way the store does: a partial update of the draft. */
const takeBack = (draft: SimulationParams, change: DraftChange): SimulationParams => ({
  ...draft,
  ...change.revert(draft),
})

const ids = (changes: DraftChange[]) => changes.map((change) => change.id)

const flowOf = (params: SimulationParams, id: string) =>
  (params.cashFlows ?? []).find((flow) => flow.id === id)!

const food = flowOf(saved, 'food')

describe('buildDraftChanges', () => {
  it('is empty for the same plan, and for a copy of it', () => {
    expect(buildDraftChanges(saved, saved)).toEqual([])
    expect(buildDraftChanges(saved, structuredClone(saved))).toEqual([])
  })

  it('reports one plan field with its group, kind and both values', () => {
    const draft = { ...saved, retirementAge: saved.retirementAge + 2 }
    const [change, ...rest] = buildDraftChanges(saved, draft)
    expect(rest).toEqual([])
    expect(change).toMatchObject({
      type: 'field',
      id: 'field:retirementAge',
      group: 'person',
      key: 'retirementAge',
      kind: 'age',
      from: saved.retirementAge,
      to: saved.retirementAge + 2,
    })
    expect(change.revert(draft)).toEqual({ retirementAge: saved.retirementAge })
    expect(buildDraftChanges(saved, takeBack(draft, change))).toEqual([])
  })

  it('lists fields in the order of the column, then flows', () => {
    const draft = editFlow(
      {
        ...saved,
        averageROI: saved.averageROI + 0.01,
        withdrawalStrategy: 'guytonKlinger',
        annualSavings: saved.annualSavings + 1000,
        endAge: saved.endAge + 1,
      },
      'food',
      { amount: food.amount + 100 }
    )
    expect(ids(buildDraftChanges(saved, draft))).toEqual([
      'field:endAge',
      'field:annualSavings',
      'field:withdrawalStrategy',
      'field:averageROI',
      'flow:food:terms',
    ])
  })

  it('ignores float noise in rates and reads a toggle as on / off', () => {
    const noisy = { ...saved, dsWithdrawalRate: saved.dsWithdrawalRate + 1e-12 }
    expect(buildDraftChanges(saved, noisy)).toEqual([])

    const toggled = { ...saved, glidePathEnabled: !saved.glidePathEnabled }
    const [change] = buildDraftChanges(saved, toggled)
    expect(change).toMatchObject({
      id: 'field:glidePathEnabled',
      kind: 'toggle',
      from: saved.glidePathEnabled ? 'on' : 'off',
      to: saved.glidePathEnabled ? 'off' : 'on',
    })
    // The revert writes the stored boolean back, not its label.
    expect(change.revert(toggled)).toEqual({ glidePathEnabled: saved.glidePathEnabled })
  })

  it('does not report the projections of the flow list as fields of their own', () => {
    // `customExpenses`, `oneTimeIncomes` and `monthlyPension` are rewritten
    // from `cashFlows` on every edit: a changed expense is one change, not two.
    const draft = {
      ...editFlow(saved, 'food', { amount: food.amount + 100 }),
      customExpenses: [],
      monthlyPension: 1,
    }
    expect(ids(buildDraftChanges(saved, draft))).toEqual(['flow:food:terms'])
    for (const key of ['cashFlows', 'customExpenses', 'oneTimeIncomes', 'monthlyPension']) {
      expect(DRAFT_FIELD_KEYS).not.toContain(key)
    }
  })

  describe('flows', () => {
    it('a switched-off flow is a switch change; taking it back restores the flow as saved', () => {
      const draft = editFlow(saved, 'food', { enabled: false })
      const [change, ...rest] = buildDraftChanges(saved, draft)
      expect(rest).toEqual([])
      expect(change).toMatchObject({
        type: 'flowSwitch',
        id: 'flow:food:switch',
        group: 'flows',
        from: 'on',
        to: 'off',
        flow: { id: 'food', kind: 'expense' },
      })
      const back = takeBack(draft, change)
      expect(isCashFlowEnabled(flowOf(back, 'food'))).toBe(true)
      expect(buildDraftChanges(saved, back)).toEqual([])
      // Every other flow is the same object as before: nothing else was touched.
      for (const flow of back.cashFlows ?? []) {
        if (flow.id !== 'food') expect(flow).toBe(flowOf(draft, flow.id))
      }
    })

    it('a changed amount carries both amounts and the frequency', () => {
      const draft = editFlow(saved, 'food', { amount: food.amount + 100 })
      const [change] = buildDraftChanges(saved, draft)
      expect(change).toMatchObject({
        type: 'flowTerms',
        id: 'flow:food:terms',
        frequency: food.frequency,
        amount: { from: food.amount, to: food.amount + 100 },
      })
      expect(flowOf(takeBack(draft, change), 'food')).toEqual(food)
    })

    it('any other change of terms reads "changed", without amounts', () => {
      const window = editFlow(saved, 'food', { startAge: 70 })
      expect(buildDraftChanges(saved, window)[0]).toMatchObject({ type: 'flowTerms' })
      expect(buildDraftChanges(saved, window)[0]).not.toHaveProperty('amount')

      const both = editFlow(saved, 'food', { amount: food.amount + 100, startAge: 70 })
      expect(buildDraftChanges(saved, both)[0]).not.toHaveProperty('amount')
      // Named as the reader knew it before a rename.
      const renamed = editFlow(saved, 'food', { name: 'Wocheneinkauf', nameKey: undefined })
      expect(buildDraftChanges(saved, renamed)[0]).toMatchObject({
        flow: { name: food.name, nameKey: food.nameKey },
      })
    })

    it('a switch and an amount on one flow are two changes that go back separately', () => {
      const draft = editFlow(saved, 'food', { enabled: false, amount: food.amount + 100 })
      const changes = buildDraftChanges(saved, draft)
      expect(ids(changes)).toEqual(['flow:food:switch', 'flow:food:terms'])
      const [toggle, terms] = changes

      // The amount goes back; the flow stays switched off.
      const amountBack = takeBack(draft, terms)
      expect(flowOf(amountBack, 'food').amount).toBe(food.amount)
      expect(isCashFlowEnabled(flowOf(amountBack, 'food'))).toBe(false)
      expect(ids(buildDraftChanges(saved, amountBack))).toEqual(['flow:food:switch'])

      // The switch goes back; the new amount stays.
      const switchBack = takeBack(draft, toggle)
      expect(flowOf(switchBack, 'food').amount).toBe(food.amount + 100)
      expect(isCashFlowEnabled(flowOf(switchBack, 'food'))).toBe(true)
      expect(ids(buildDraftChanges(saved, switchBack))).toEqual(['flow:food:terms'])
    })

    it('an added flow goes away again; a removed one comes back where it was', () => {
      const pension: CashFlow = {
        id: 'company-pension',
        kind: 'pension',
        name: 'Betriebsrente',
        amount: 600,
        frequency: 'monthly',
        startAge: 65,
      }
      const added = withFlows(saved, (flows) => [...flows, pension])
      const [addition] = buildDraftChanges(saved, added)
      expect(addition).toMatchObject({
        type: 'flowAdded',
        id: 'flow:company-pension:added',
        amount: 600,
        frequency: 'monthly',
        flow: { name: 'Betriebsrente', kind: 'pension' },
      })
      expect(takeBack(added, addition).cashFlows).toEqual(saved.cashFlows)

      const index = (saved.cashFlows ?? []).findIndex((flow) => flow.id === 'food')
      const removed = withFlows(saved, (flows) => flows.filter((flow) => flow.id !== 'food'))
      const [removal] = buildDraftChanges(saved, removed)
      expect(removal).toMatchObject({ type: 'flowRemoved', id: 'flow:food:removed' })
      const restored = takeBack(removed, removal)
      expect(restored.cashFlows?.[index]).toEqual(food)
      expect(restored.cashFlows).toEqual(saved.cashFlows)

      // Into a list that has since become shorter: at its end, never past it.
      const emptied = withFlows(removed, () => [])
      expect(takeBack(emptied, removal).cashFlows).toEqual([food])
    })
  })

  it('taking every change back, in any order, gives the saved plan', () => {
    const draft = withFlows(
      editFlow(
        editFlow(
          { ...saved, retirementAge: 63, currentAssets: 700000, marketModel: 'historical' },
          'food',
          { amount: 950 }
        ),
        'vacations',
        { enabled: false }
      ),
      (flows) => [
        ...flows.filter((flow) => flow.id !== 'health'),
        { id: 'new', kind: 'income', name: 'Miete', amount: 500, frequency: 'monthly' },
      ]
    )
    const changes = buildDraftChanges(saved, draft)
    expect(changes).toHaveLength(7)
    for (const order of [changes, [...changes].reverse()]) {
      const back = order.reduce((current, change) => takeBack(current, change), draft)
      expect(buildDraftChanges(saved, back)).toEqual([])
      expect(back.cashFlows).toEqual(saved.cashFlows)
    }
  })
})

describe('changedGroups', () => {
  it('names the column groups that hold a change', () => {
    const draft = editFlow({ ...saved, endAge: saved.endAge + 1, dsFloorRate: -0.02 }, 'food', {
      enabled: false,
    })
    expect([...changedGroups(buildDraftChanges(saved, draft))].sort()).toEqual([
      'flows',
      'person',
      'rule',
    ])
    expect(changedGroups([]).size).toBe(0)
  })
})

describe('labels', () => {
  it('every field a chip can name has a label in both languages', () => {
    for (const messages of [de, en]) {
      const labels = messages.workspace.changes.fields as Record<string, string>
      for (const key of DRAFT_FIELD_KEYS) expect(labels[key]).toEqual(expect.any(String))
      // …and no label is left over for a field that no longer exists.
      expect(Object.keys(labels).sort()).toEqual([...DRAFT_FIELD_KEYS].sort())
    }
  })
})
