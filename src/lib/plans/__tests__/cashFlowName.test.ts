import { DEFAULT_PARAMS } from '@/types'
import {
  cashFlowDisplayName,
  DEFAULT_CASH_FLOW_NAME_KEYS,
  legacySeededExpenseNameKey,
  localizeCashFlowName,
} from '../cashFlowName'
import { buildDemoPlanParams, DEMO_PLAN_NAME_KEY } from '../demoPlan'
import { reconcileCashFlows, withCashFlowProjections } from '@/lib/simulation/cashFlows'
import { normalizePersistedParams } from '@/lib/stores/normalizeParams'

const upper = (key: string) => key.toUpperCase()

describe('cashFlowDisplayName', () => {
  it('translates a seeded flow and leaves the stored name alone', () => {
    const groceries = DEFAULT_PARAMS.cashFlows.find((flow) => flow.id === 'food')!
    expect(groceries.nameKey).toBe('food')
    expect(groceries.name).toBe('Groceries')
    expect(cashFlowDisplayName(groceries, upper)).toBe('FOOD')
  })

  it('renders a user-named flow verbatim in every language', () => {
    const mine = { name: 'Segelboot', nameKey: undefined }
    expect(cashFlowDisplayName(mine, upper)).toBe('Segelboot')
    expect(localizeCashFlowName(mine, 'de-DE')).toBe('Segelboot')
    expect(localizeCashFlowName(mine, 'en-US')).toBe('Segelboot')
  })

  it('ignores a key that is not one the app seeds', () => {
    const spoofed = { name: 'Rent', nameKey: 'plans.dialogs.delete.title' }
    expect(cashFlowDisplayName(spoofed, upper)).toBe('Rent')
    expect(localizeCashFlowName(spoofed, 'de-DE')).toBe('Rent')
  })

  it('localises the seeded defaults for the report pipeline', () => {
    const health = DEFAULT_PARAMS.customExpenses.find((expense) => expense.id === 'health')!
    expect(localizeCashFlowName(health, 'de-DE')).toBe('Krankenversicherung')
    expect(localizeCashFlowName(health, 'en-US')).toBe('Health insurance')
  })
})

describe('nameKey round trips', () => {
  it('survives the flows -> legacy projection -> flows round trip', () => {
    const projected = withCashFlowProjections({ ...DEFAULT_PARAMS })
    expect(projected.customExpenses.find((e) => e.id === 'food')?.nameKey).toBe('food')

    const back = reconcileCashFlows(projected)
    expect(back.find((flow) => flow.id === 'food')?.nameKey).toBe('food')
  })

  it('is dropped when a stress lever rewrites the legacy array without it', () => {
    // How a rename reaches the flow list: the projection loses the key, and the
    // reconciliation must not resurrect it from the flow it replaces.
    const renamed = withCashFlowProjections({ ...DEFAULT_PARAMS })
    const customExpenses = renamed.customExpenses.map((expense) =>
      expense.id === 'food'
        ? {
            id: expense.id,
            name: 'Wocheneinkauf',
            amount: expense.amount,
            interval: expense.interval,
          }
        : expense
    )

    const back = reconcileCashFlows({ ...renamed, customExpenses })
    const food = back.find((flow) => flow.id === 'food')!
    expect(food.name).toBe('Wocheneinkauf')
    expect(food.nameKey).toBeUndefined()
    expect(cashFlowDisplayName(food, upper)).toBe('Wocheneinkauf')
  })
})

describe('expenses seeded before keys existed', () => {
  // How such a plan sits in storage: flows and their projection, both keyless.
  const stripKeys = <T extends { nameKey?: string }>(entries: readonly T[]) =>
    entries.map(({ nameKey: _dropped, ...rest }) => rest)
  const keyless = () => {
    const projected = withCashFlowProjections({ ...DEFAULT_PARAMS })
    return {
      ...projected,
      cashFlows: stripKeys(projected.cashFlows),
      customExpenses: stripKeys(projected.customExpenses),
    }
  }

  it('recognises every seeded English name, ignoring case', () => {
    expect(legacySeededExpenseNameKey('Health Insurance')).toBe('health')
    expect(legacySeededExpenseNameKey(' home repairs ')).toBe('repairs')
    expect(legacySeededExpenseNameKey('Car Maintenance')).toBe('carMaintenance')
    expect(legacySeededExpenseNameKey('Wocheneinkauf')).toBeUndefined()
    expect(legacySeededExpenseNameKey('toString')).toBeUndefined()
  })

  it('get their key back, so a German plan shows German names', () => {
    const params = normalizePersistedParams(keyless())
    const expenses = params.cashFlows.filter((flow) => flow.kind === 'expense')
    expect(expenses).toHaveLength(8)
    expenses.forEach((flow) => expect(flow.nameKey).toBeDefined())
    const food = params.cashFlows.find((flow) => flow.id === 'food')!
    expect(localizeCashFlowName(food, 'de-DE')).toBe('Lebensmittel')
    expect(params.customExpenses.find((e) => e.id === 'health')?.nameKey).toBe('health')
  })

  it('leave renamed flows and non-expenses alone', () => {
    const stored = keyless()
    const params = normalizePersistedParams({
      ...stored,
      cashFlows: [
        ...stored.cashFlows.map((flow) =>
          flow.id === 'food' ? { ...flow, name: 'Wocheneinkauf' } : flow
        ),
        { id: 'gift', kind: 'income', name: 'Groceries', amount: 100, frequency: 'once' },
      ],
      customExpenses: stored.customExpenses.map((expense) =>
        expense.id === 'food' ? { ...expense, name: 'Wocheneinkauf' } : expense
      ),
    })
    expect(params.cashFlows.find((flow) => flow.id === 'food')?.nameKey).toBeUndefined()
    expect(params.cashFlows.find((flow) => flow.id === 'gift')?.nameKey).toBeUndefined()
  })

  it('come out of the pre-v3 migration with keys', () => {
    const params = normalizePersistedParams({
      monthlyExpenses: { health: 400, food: 900 },
      annualExpenses: { repairs: 3000 },
    })
    const keys = params.cashFlows
      .filter((flow) => flow.kind === 'expense')
      .map((flow) => flow.nameKey)
      .sort()
    expect(keys).toEqual(['food', 'health', 'repairs'])
  })
})

describe('buildDemoPlanParams', () => {
  const demo = buildDemoPlanParams()

  it('exercises the features a plain default plan cannot show', () => {
    const ids = demo.cashFlows.map((flow) => flow.id)
    expect(ids).toEqual(expect.arrayContaining(['demo-parttime', 'demo-roof', 'demo-care']))

    // An income with a window, a one-off payment, and extra real growth.
    const partTime = demo.cashFlows.find((flow) => flow.id === 'demo-parttime')!
    expect(partTime.kind).toBe('income')
    expect(partTime.startAge).toBe(62)
    expect(partTime.endAge).toBe(66)

    const roof = demo.cashFlows.find((flow) => flow.id === 'demo-roof')!
    expect(roof.frequency).toBe('once')

    const care = demo.cashFlows.find((flow) => flow.id === 'demo-care')!
    expect(care.growthRate).toBeGreaterThan(0)

    expect(demo.legacyTargetReal).toBeGreaterThan(0)
    expect(demo.glidePathEnabled).toBe(true)
  })

  it('keeps the legacy projections in sync with the flow list', () => {
    // Windowed and one-off flows are *not* lifetime expenses, so they must not
    // appear in `customExpenses` — otherwise the engine would double-count.
    const projectedIds = demo.customExpenses.map((expense) => expense.id)
    expect(projectedIds).not.toContain('demo-care')
    expect(projectedIds).not.toContain('demo-roof')
    expect(projectedIds).toContain('food')

    expect(demo.oneTimeIncomes).toHaveLength(1)
    expect(demo.oneTimeIncomes[0].age).toBe(70)
  })

  it('names its own flows through the same key mechanism', () => {
    const care = demo.cashFlows.find((flow) => flow.id === 'demo-care')!
    expect(localizeCashFlowName(care, 'de-DE')).toBe('Pflegekosten')
    expect(localizeCashFlowName(care, 'en-US')).toBe('Care costs')
  })

  it('is labelled as the example rather than as the user’s own plan', () => {
    expect(DEMO_PLAN_NAME_KEY).toBe('demo')
  })
})

describe('allow-listed cash-flow name keys', () => {
  it('has a UI translation for every key in both locales', () => {
    const catalogs = {
      en: require('@/i18n/messages/en.json'),
      de: require('@/i18n/messages/de.json'),
    }
    for (const [locale, messages] of Object.entries(catalogs)) {
      const defaults = messages.setup.cashFlows.defaults as Record<string, unknown>
      for (const key of DEFAULT_CASH_FLOW_NAME_KEYS) {
        expect([locale, key, typeof defaults[key]]).toEqual([locale, key, 'string'])
      }
    }
  })
})
