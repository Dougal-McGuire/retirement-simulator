import { DEFAULT_PARAMS, MAX_PLANS, type SimulationParams } from '@/types'
import {
  bootstrapPlans,
  createPlanId,
  DEFAULT_PLAN_ID,
  makePlan,
  mergePlanLists,
  normalizePlans,
  suggestDuplicateName,
  uniquePlanName,
} from '../plans'

const normalizeParams = (value: unknown): SimulationParams => ({
  ...DEFAULT_PARAMS,
  ...(typeof value === 'object' && value !== null ? (value as Partial<SimulationParams>) : {}),
})

const plan = (id: string, name: string, params: SimulationParams = DEFAULT_PARAMS) =>
  makePlan({ id, name, params, createdAt: 1_700_000_000_000 })

describe('plan helpers', () => {
  describe('normalizePlans', () => {
    it('drops malformed entries, duplicates and normalizes params', () => {
      const plans = normalizePlans(
        [
          { id: 'a', name: 'Alpha', params: { currentAge: 44 }, createdAt: 1, updatedAt: 2 },
          { id: 'a', name: 'Duplicate id', params: {} },
          { id: '', name: 'No id', params: {} },
          { id: 'c', name: '   ', params: {} },
          'nonsense',
          null,
        ],
        normalizeParams
      )

      expect(plans).toHaveLength(1)
      expect(plans[0]).toMatchObject({ id: 'a', name: 'Alpha', createdAt: 1, updatedAt: 2 })
      expect(plans[0].params.currentAge).toBe(44)
      expect(plans[0].params.endAge).toBe(DEFAULT_PARAMS.endAge)
    })

    it('caps the stored plan count', () => {
      const many = Array.from({ length: MAX_PLANS + 4 }, (_, index) => ({
        id: `plan-${index}`,
        name: `Plan ${index}`,
        params: {},
      }))

      expect(normalizePlans(many, normalizeParams)).toHaveLength(MAX_PLANS)
    })
  })

  describe('uniquePlanName', () => {
    it('suffixes colliding names and ignores the plan being renamed', () => {
      const plans = [plan('a', 'Base plan'), plan('b', 'Base plan (2)')]

      expect(uniquePlanName('Base plan', plans)).toBe('Base plan (3)')
      expect(uniquePlanName('Barista FIRE', plans)).toBe('Barista FIRE')
      expect(uniquePlanName('Base plan', plans, 'a')).toBe('Base plan')
    })

    it('falls back to a default when the name is blank', () => {
      expect(uniquePlanName('   ', [])).toBe('Base plan')
    })
  })

  describe('suggestDuplicateName', () => {
    it('offers a numbered sibling rather than a "(copy)" name', () => {
      expect(suggestDuplicateName('Base plan', ['Base plan'])).toBe('Base plan 2')
    })

    it('skips names already in use', () => {
      expect(suggestDuplicateName('Base plan', ['Base plan', 'Base plan 2', 'BASE PLAN 3'])).toBe(
        'Base plan 4'
      )
    })

    it('re-uses the stem when duplicating an already numbered copy', () => {
      expect(suggestDuplicateName('Base plan 2', ['Base plan', 'Base plan 2'])).toBe('Base plan 3')
    })

    it('keeps a trailing number that is part of the name, not a copy counter', () => {
      expect(suggestDuplicateName('Retire at 60', ['Base plan', 'Retire at 60'])).toBe(
        'Retire at 60 2'
      )
    })

    it('falls back to a default when the source name is blank', () => {
      expect(suggestDuplicateName('   ', [])).toBe('Base plan 2')
    })
  })

  describe('createPlanId', () => {
    it('never collides with existing ids', () => {
      const existing = [plan('plan-x', 'X')]
      const first = createPlanId(existing, 42)
      const second = createPlanId([...existing, plan(first, 'First')], 42)

      expect(first).not.toBe(second)
    })
  })

  describe('bootstrapPlans (storage migration)', () => {
    it('creates a base plan from params when nothing is stored', () => {
      const params = { ...DEFAULT_PARAMS, retirementAge: 62 }
      const result = bootstrapPlans({ plans: undefined, params }, normalizeParams)

      expect(result.migrated).toBe(false)
      expect(result.plans).toHaveLength(1)
      expect(result.plans[0].id).toBe(DEFAULT_PLAN_ID)
      expect(result.plans[0].nameKey).toBe('base')
      expect(result.plans[0].params.retirementAge).toBe(62)
      expect(result.activePlanId).toBe(DEFAULT_PLAN_ID)
    })

    it('imports pre-plan saved setups as plans, preserving ids and timestamps', () => {
      const result = bootstrapPlans(
        {
          plans: [],
          params: { ...DEFAULT_PARAMS, currentAge: 51 },
          savedSetups: [
            {
              id: 'setup-1',
              name: 'Retire at 60',
              timestamp: 1_710_000_000_000,
              params: { ...DEFAULT_PARAMS, retirementAge: 60 },
            },
            {
              id: 'setup-2',
              name: 'Barista FIRE',
              timestamp: 1_710_000_000_001,
              params: { ...DEFAULT_PARAMS, annualSavings: 12000 },
            },
          ],
        },
        normalizeParams
      )

      expect(result.migrated).toBe(true)
      expect(result.plans.map((entry) => entry.id)).toEqual([DEFAULT_PLAN_ID, 'setup-1', 'setup-2'])
      expect(result.plans[0].params.currentAge).toBe(51)
      expect(result.plans[1]).toMatchObject({ name: 'Retire at 60', updatedAt: 1_710_000_000_000 })
      expect(result.plans[2].params.annualSavings).toBe(12000)
      expect(result.activePlanId).toBe(DEFAULT_PLAN_ID)
    })

    it('re-imports setups when only the pristine default plan exists', () => {
      const result = bootstrapPlans(
        {
          plans: [plan(DEFAULT_PLAN_ID, 'Base plan')],
          params: DEFAULT_PARAMS,
          savedSetups: [
            { id: 'setup-1', name: 'Legacy', timestamp: 5, params: DEFAULT_PARAMS },
          ],
        },
        normalizeParams
      )

      expect(result.plans.map((entry) => entry.id)).toEqual([DEFAULT_PLAN_ID, 'setup-1'])
    })

    it('skips the legacy import once it has already run', () => {
      const result = bootstrapPlans(
        {
          plans: [plan(DEFAULT_PLAN_ID, 'Base plan')],
          params: DEFAULT_PARAMS,
          savedSetups: [
            { id: 'setup-1', name: 'Deleted later', timestamp: 5, params: DEFAULT_PARAMS },
          ],
          allowLegacyImport: false,
        },
        normalizeParams
      )

      expect(result.plans.map((entry) => entry.id)).toEqual([DEFAULT_PLAN_ID])
      expect(result.migrated).toBe(false)
    })

    it('keeps existing plans and repairs a dangling active plan id', () => {
      const result = bootstrapPlans(
        {
          plans: [plan('a', 'Alpha'), plan('b', 'Beta')],
          params: DEFAULT_PARAMS,
          activePlanId: 'gone',
        },
        normalizeParams
      )

      expect(result.plans.map((entry) => entry.id)).toEqual(['a', 'b'])
      expect(result.activePlanId).toBe('a')
      expect(result.migrated).toBe(false)
    })

    it('caps imported setups at the plan limit', () => {
      const setups = Array.from({ length: MAX_PLANS + 3 }, (_, index) => ({
        id: `setup-${index}`,
        name: `Setup ${index}`,
        timestamp: index,
        params: DEFAULT_PARAMS,
      }))

      const result = bootstrapPlans({ plans: [], params: DEFAULT_PARAMS, savedSetups: setups }, normalizeParams)

      expect(result.plans).toHaveLength(MAX_PLANS)
    })

    // Regression: the store used to mirror every plan into `savedSetups`, so
    // without the import marker a lone base plan always looked like "legacy
    // data to import" and was rebuilt — name reset, unsaved draft committed.
    describe('a lone base plan without the import marker', () => {
      const legacy = [{ id: 'setup-1', name: 'Legacy', timestamp: 5, params: DEFAULT_PARAMS }]

      it('is not rebuilt because a setup carries its own id', () => {
        const renamed = makePlan({
          id: DEFAULT_PLAN_ID,
          name: 'Mein Ruhestand',
          params: { ...DEFAULT_PARAMS, currentAssets: 123_456 },
          createdAt: 10,
          updatedAt: 20,
        })
        const result = bootstrapPlans(
          {
            plans: [renamed],
            // The working copy on screen: an unsaved draft, not the plan.
            params: { ...DEFAULT_PARAMS, currentAssets: 654_321 },
            savedSetups: [
              { id: DEFAULT_PLAN_ID, name: 'Mein Ruhestand', timestamp: 20, params: renamed.params },
            ],
          },
          normalizeParams
        )

        expect(result.plans).toEqual([renamed])
        expect(result.migrated).toBe(false)
      })

      it('keeps a renamed plan as stored and imports nothing next to it', () => {
        const renamed = makePlan({
          id: DEFAULT_PLAN_ID,
          name: 'Mein Ruhestand',
          params: DEFAULT_PARAMS,
          createdAt: 10,
          updatedAt: 20,
        })
        const result = bootstrapPlans(
          { plans: [renamed], params: DEFAULT_PARAMS, savedSetups: legacy },
          normalizeParams
        )

        expect(result.plans).toEqual([renamed])
      })

      it('keeps an edited plan as stored and imports nothing next to it', () => {
        const edited = makePlan({
          id: DEFAULT_PLAN_ID,
          name: 'Base plan',
          nameKey: 'base',
          params: { ...DEFAULT_PARAMS, currentAssets: 123_456 },
          createdAt: 10,
          updatedAt: 20,
        })
        const result = bootstrapPlans(
          { plans: [edited], params: edited.params, savedSetups: legacy },
          normalizeParams
        )

        expect(result.plans).toEqual([edited])
      })

      it('imports next to the untouched starter plan without rebuilding it', () => {
        const starter = makePlan({
          id: DEFAULT_PLAN_ID,
          name: 'Base plan',
          nameKey: 'base',
          params: DEFAULT_PARAMS,
          createdAt: 0,
        })
        const result = bootstrapPlans(
          {
            plans: [starter],
            // An unsaved draft on the starter plan must not end up in it.
            params: { ...DEFAULT_PARAMS, currentAssets: 654_321 },
            savedSetups: legacy,
            activePlanId: DEFAULT_PLAN_ID,
          },
          normalizeParams
        )

        expect(result.plans.map((entry) => entry.id)).toEqual([DEFAULT_PLAN_ID, 'setup-1'])
        expect(result.plans[0]).toEqual(starter)
        expect(result.activePlanId).toBe(DEFAULT_PLAN_ID)
        expect(result.migrated).toBe(true)
      })
    })
  })

  describe('mergePlanLists (two tabs, one storage entry)', () => {
    const at = (id: string, updatedAt: number, name = id) =>
      makePlan({ id, name, params: DEFAULT_PARAMS, createdAt: 1, updatedAt })
    const isSame = (a: ReturnType<typeof at>, b: ReturnType<typeof at>) =>
      a.name === b.name && a.updatedAt === b.updatedAt
    const ids = (plans: ReturnType<typeof at>[]) => plans.map((entry) => entry.id)

    it('takes the other tab’s list as it is when this tab changed nothing', () => {
      const base = [at('a', 1), at('b', 1)]
      const theirs = [at('b', 5, 'B renamed'), at('c', 3)]

      expect(mergePlanLists({ base, mine: base, theirs, isSame })).toEqual(theirs)
    })

    it('keeps a plan each tab created', () => {
      const base = [at('a', 1)]
      const merged = mergePlanLists({
        base,
        mine: [at('a', 1), at('mine', 2)],
        theirs: [at('a', 1), at('theirs', 3)],
        isSame,
      })

      expect(ids(merged)).toEqual(['a', 'mine', 'theirs'])
    })

    it('follows the side that changed a plan, and the newer save when both did', () => {
      const base = [at('a', 1), at('b', 1), at('c', 1)]
      const merged = mergePlanLists({
        base,
        mine: [at('a', 4, 'mine'), at('b', 1), at('c', 5, 'mine')],
        theirs: [at('a', 1), at('b', 6, 'theirs'), at('c', 9, 'theirs')],
        isSame,
      })

      expect(merged.map((entry) => entry.name)).toEqual(['mine', 'theirs', 'theirs'])
    })

    it('honours a delete on either side, unless the other side changed the plan', () => {
      const base = [at('a', 1), at('b', 1), at('c', 1), at('d', 1)]
      const merged = mergePlanLists({
        base,
        // Deleted here: a (untouched there) and b (edited there).
        mine: [at('c', 1), at('d', 7, 'edited here')],
        // Deleted there: c (untouched here) and d (edited here).
        theirs: [at('a', 1), at('b', 8, 'edited there')],
        isSame,
      })

      expect(merged.map((entry) => entry.name)).toEqual(['edited here', 'edited there'])
    })

    it('never drops the plan this tab is editing', () => {
      const base = [at('a', 1), at('b', 1)]
      const theirs = [at('a', 1)]

      expect(ids(mergePlanLists({ base, mine: base, theirs, isSame }))).toEqual(['a'])
      expect(ids(mergePlanLists({ base, mine: base, theirs, isSame, keepId: 'b' }))).toEqual([
        'a',
        'b',
      ])
    })

    it('is a union when there is no common base: nothing counts as deleted', () => {
      const merged = mergePlanLists({
        base: [],
        mine: [at('a', 1), at('mine', 2)],
        theirs: [at('a', 3, 'newer'), at('theirs', 1)],
        isSame,
      })

      expect(merged.map((entry) => entry.name)).toEqual(['newer', 'mine', 'theirs'])
    })
  })
})
