import { DEFAULT_PARAMS, type CashFlow, type SimulationParams } from '@/types'
import { applyCashFlows, withCashFlowEnabled } from '@/lib/simulation/cashFlows'
import {
  addOneOffIncome,
  oneOffIncomeEntries,
  removeFlow,
  toggleFlow,
  updateOneOffIncome,
} from '../oneOffIncomeFlows'

const inheritance: CashFlow = {
  id: 'inheritance',
  kind: 'income',
  name: 'Erbschaft',
  amount: 80000,
  frequency: 'once',
  startAge: 62,
  taxTreatment: 'oneFifth',
  note: 'Tante Erna',
}
const bonus: CashFlow = {
  id: 'bonus',
  kind: 'income',
  name: 'Bonus',
  amount: 20000,
  frequency: 'once',
  startAge: 60,
}
const rent: CashFlow = {
  id: 'rent',
  kind: 'income',
  name: 'Miete',
  amount: 900,
  frequency: 'monthly',
}

/** The store's write path: flows first, projections rebuilt from them. */
const write = (cashFlows: CashFlow[]): SimulationParams =>
  applyCashFlows({ ...DEFAULT_PARAMS, cashFlows })

describe('setup wizard one-off income list', () => {
  const flows = [...DEFAULT_PARAMS.cashFlows, inheritance, rent, bonus]

  it('lists every one-off income, a switched-off one too', () => {
    const off = flows.map((flow) =>
      flow.id === 'inheritance' ? withCashFlowEnabled(flow, false) : flow
    )
    // The legacy projection the list used to read drops it…
    expect(write(off).oneTimeIncomes.map((income) => income.name)).toEqual(['Bonus'])
    // …the flow-backed list keeps it, marked off.
    expect(oneOffIncomeEntries(off, 55)).toEqual([
      { id: 'inheritance', name: 'Erbschaft', age: 62, amount: 80000, enabled: false },
      { id: 'bonus', name: 'Bonus', age: 60, amount: 20000, enabled: true },
    ])
  })

  it('reads a one-off without an age as paid at the current age', () => {
    const { startAge: _unused, ...withoutAge } = bonus
    void _unused
    expect(oneOffIncomeEntries([withoutAge], 55)[0].age).toBe(55)
  })

  it('switches a one-off off and back on from the list, byte-identical', () => {
    const off = toggleFlow(flows, 'inheritance')
    expect(off.find((flow) => flow.id === 'inheritance')).toMatchObject({ enabled: false })
    const on = toggleFlow(off, 'inheritance')
    expect(on).toEqual(flows)
    expect(write(on).oneTimeIncomes.map((income) => income.name)).toEqual(['Erbschaft', 'Bonus'])
  })

  it('keeps a switched-off one-off switched off, with its other attributes, when edited', () => {
    const off = toggleFlow(flows, 'inheritance')
    const edited = updateOneOffIncome(off, 'inheritance', {
      name: 'Erbschaft',
      age: 64,
      amount: 90000,
    })
    expect(edited.find((flow) => flow.id === 'inheritance')).toEqual({
      ...inheritance,
      enabled: false,
      startAge: 64,
      amount: 90000,
    })
    // Nothing else moved, and the projection still leaves it out.
    expect(edited.filter((flow) => flow.id !== 'inheritance')).toEqual(
      flows.filter((flow) => flow.id !== 'inheritance')
    )
    expect(write(edited).oneTimeIncomes.map((income) => income.name)).toEqual(['Bonus'])
  })

  it('drops a seeded name key only when the name is edited', () => {
    const seeded: CashFlow = { ...inheritance, name: 'Inheritance', nameKey: 'demoInheritance' }
    const german = () => 'Erbschaft'
    const kept = updateOneOffIncome(
      [seeded],
      'inheritance',
      { name: 'Erbschaft', age: 62, amount: 1 },
      german
    )
    expect(kept[0]).toMatchObject({ name: 'Inheritance', nameKey: 'demoInheritance', amount: 1 })
    const renamed = updateOneOffIncome(
      [seeded],
      'inheritance',
      { name: 'Erbe', age: 62, amount: 1 },
      german
    )
    expect(renamed[0].name).toBe('Erbe')
    expect(renamed[0].nameKey).toBeUndefined()
  })

  it('keeps a payment month only while its age stays', () => {
    const dated: CashFlow = { ...bonus, startDate: '2031-05' }
    expect(
      updateOneOffIncome([dated], 'bonus', { name: 'Bonus', age: 60, amount: 5 })[0].startDate
    ).toBe('2031-05')
    expect(
      updateOneOffIncome([dated], 'bonus', { name: 'Bonus', age: 61, amount: 5 })[0].startDate
    ).toBeUndefined()
  })

  it('adds a switched-on one-off and removes by id, leaving every other flow alone', () => {
    const off = toggleFlow(flows, 'inheritance')
    const added = addOneOffIncome(off, { name: 'Erbschaft', age: 62, amount: 80000 }, 'flow-new')
    // Same value as the switched-off one, but a new flow of its own.
    expect(added.slice(0, off.length)).toEqual(off)
    expect(added.at(-1)).toEqual({
      id: 'flow-new',
      kind: 'income',
      name: 'Erbschaft',
      amount: 80000,
      frequency: 'once',
      startAge: 62,
    })
    expect(write(added).cashFlows.filter((flow) => flow.name === 'Erbschaft')).toHaveLength(2)

    const removed = removeFlow(added, 'bonus')
    expect(removed.map((flow) => flow.id)).not.toContain('bonus')
    expect(removed.find((flow) => flow.id === 'inheritance')).toMatchObject({ enabled: false })
  })

  it('ignores ids that are not one-off incomes', () => {
    expect(updateOneOffIncome(flows, 'rent', { name: 'x', age: 1, amount: 1 })).toEqual(flows)
  })
})
