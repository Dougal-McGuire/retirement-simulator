import {
  copyAnonymousWorkspace,
  decideMigration,
  isPristineWorkspace,
  markMigrationAnswered,
  migrationMarkerKey,
  readMigrationInputs,
  type KeyValueStorage,
} from '../authMigration'
import {
  BASE_PARAMS_KEY,
  BASE_SAVED_SETUPS_KEY,
  BASE_STORE_KEY,
  namespaceStorageKey,
} from '../persistenceKey'
import { DEFAULT_PLAN_ID, DEFAULT_PLAN_NAME_KEY } from '../plans'
import { DEFAULT_PARAMS } from '@/types'

const USER = 'user-abc'

const blob = (state: Record<string, unknown>) => JSON.stringify({ state, version: 1 })

const pristineBlob = () =>
  blob({
    params: DEFAULT_PARAMS,
    activePlanId: DEFAULT_PLAN_ID,
    plans: [
      {
        id: DEFAULT_PLAN_ID,
        nameKey: DEFAULT_PLAN_NAME_KEY,
        name: 'Base plan',
        params: DEFAULT_PARAMS,
        createdAt: 0,
        updatedAt: 0,
      },
    ],
  })

const editedBlob = () =>
  blob({
    params: { ...DEFAULT_PARAMS, currentAge: DEFAULT_PARAMS.currentAge + 3 },
    activePlanId: DEFAULT_PLAN_ID,
    plans: [
      {
        id: DEFAULT_PLAN_ID,
        nameKey: DEFAULT_PLAN_NAME_KEY,
        name: 'Base plan',
        params: { ...DEFAULT_PARAMS, currentAge: DEFAULT_PARAMS.currentAge + 3 },
        createdAt: 0,
        updatedAt: 1,
      },
    ],
  })

const multiPlanBlob = () =>
  blob({
    params: DEFAULT_PARAMS,
    activePlanId: 'plan-2',
    plans: [
      {
        id: DEFAULT_PLAN_ID,
        nameKey: DEFAULT_PLAN_NAME_KEY,
        name: 'Base plan',
        params: DEFAULT_PARAMS,
      },
      { id: 'plan-2', name: 'Retire earlier', params: DEFAULT_PARAMS },
    ],
  })

function makeStorage(seed: Record<string, string> = {}): KeyValueStorage & {
  map: Map<string, string>
} {
  const map = new Map(Object.entries(seed))
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value)
    },
  }
}

describe('isPristineWorkspace', () => {
  it('treats a missing or unreadable namespace as pristine', () => {
    expect(isPristineWorkspace(null)).toBe(true)
    expect(isPristineWorkspace('')).toBe(true)
    expect(isPristineWorkspace('{not json')).toBe(true)
    expect(isPristineWorkspace('{}')).toBe(true)
  })

  it('treats the untouched starter plan as pristine', () => {
    expect(isPristineWorkspace(pristineBlob())).toBe(true)
  })

  it('detects edited parameters', () => {
    expect(isPristineWorkspace(editedBlob())).toBe(false)
  })

  it('detects extra plans', () => {
    expect(isPristineWorkspace(multiPlanBlob())).toBe(false)
  })

  it('detects a renamed starter plan', () => {
    const renamed = blob({
      params: DEFAULT_PARAMS,
      plans: [{ id: DEFAULT_PLAN_ID, name: 'My plan', params: DEFAULT_PARAMS }],
    })
    expect(isPristineWorkspace(renamed)).toBe(false)
  })

  it('detects unsaved draft edits (store v2 working copy)', () => {
    const draft = blob({
      params: DEFAULT_PARAMS,
      draftParams: { ...DEFAULT_PARAMS, annualSavings: DEFAULT_PARAMS.annualSavings + 5_000 },
      plans: [
        {
          id: DEFAULT_PLAN_ID,
          nameKey: DEFAULT_PLAN_NAME_KEY,
          name: 'Base plan',
          params: DEFAULT_PARAMS,
        },
      ],
    })
    expect(isPristineWorkspace(draft)).toBe(false)
  })

  it('detects added custom expenses', () => {
    const withExpense = blob({
      params: {
        ...DEFAULT_PARAMS,
        customExpenses: [
          ...DEFAULT_PARAMS.customExpenses,
          { id: 'x', name: 'Boat', amount: 400, interval: 'monthly' },
        ],
      },
    })
    expect(isPristineWorkspace(withExpense)).toBe(false)
  })
})

describe('decideMigration', () => {
  it('prompts when the account is empty and local work exists', () => {
    expect(
      decideMigration({ userRaw: null, anonymousRaw: editedBlob(), alreadyAnswered: false })
    ).toBe('prompt')
  })

  it('stays silent when the anonymous workspace is untouched', () => {
    expect(
      decideMigration({ userRaw: null, anonymousRaw: pristineBlob(), alreadyAnswered: false })
    ).toBe('none')
    expect(decideMigration({ userRaw: null, anonymousRaw: null, alreadyAnswered: false })).toBe(
      'none'
    )
  })

  it('never overwrites an account that already has plans', () => {
    expect(
      decideMigration({
        userRaw: multiPlanBlob(),
        anonymousRaw: editedBlob(),
        alreadyAnswered: false,
      })
    ).toBe('none')
  })

  it('asks only once per account', () => {
    expect(
      decideMigration({ userRaw: null, anonymousRaw: editedBlob(), alreadyAnswered: true })
    ).toBe('none')
  })
})

describe('storage helpers', () => {
  it('reads both namespaces and the marker', () => {
    const storage = makeStorage({
      [BASE_STORE_KEY]: editedBlob(),
      [migrationMarkerKey(USER)]: '1',
    })

    const inputs = readMigrationInputs(USER, storage)

    expect(inputs.anonymousRaw).toBe(editedBlob())
    expect(inputs.userRaw).toBeNull()
    expect(inputs.alreadyAnswered).toBe(true)
  })

  it('survives a storage that throws', () => {
    const throwing: KeyValueStorage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {
        throw new Error('denied')
      },
    }

    expect(readMigrationInputs(USER, throwing)).toEqual({
      userRaw: null,
      anonymousRaw: null,
      alreadyAnswered: false,
    })
    expect(() => markMigrationAnswered(USER, throwing)).not.toThrow()
    expect(() => copyAnonymousWorkspace(USER, throwing)).not.toThrow()
  })

  it('copies every namespaced key without touching the anonymous ones', () => {
    const storage = makeStorage({
      [BASE_STORE_KEY]: multiPlanBlob(),
      [BASE_PARAMS_KEY]: JSON.stringify(DEFAULT_PARAMS),
      [BASE_SAVED_SETUPS_KEY]: '[]',
    })

    const copied = copyAnonymousWorkspace(USER, storage)

    expect(copied).toBe(3)
    expect(storage.getItem(namespaceStorageKey(BASE_STORE_KEY, USER))).toBe(multiPlanBlob())
    expect(storage.getItem(namespaceStorageKey(BASE_SAVED_SETUPS_KEY, USER))).toBe('[]')
    // Anonymous data stays exactly as it was, so signing out restores it.
    expect(storage.getItem(BASE_STORE_KEY)).toBe(multiPlanBlob())
    expect(storage.getItem(BASE_PARAMS_KEY)).toBe(JSON.stringify(DEFAULT_PARAMS))
  })

  it('marks an account as answered so the prompt never repeats', () => {
    const storage = makeStorage({ [BASE_STORE_KEY]: editedBlob() })

    expect(decideMigration(readMigrationInputs(USER, storage))).toBe('prompt')
    markMigrationAnswered(USER, storage)
    expect(decideMigration(readMigrationInputs(USER, storage))).toBe('none')
  })

  it('keeps accounts independent', () => {
    const storage = makeStorage({ [BASE_STORE_KEY]: editedBlob() })
    markMigrationAnswered(USER, storage)

    expect(decideMigration(readMigrationInputs('other-user', storage))).toBe('prompt')
  })
})
