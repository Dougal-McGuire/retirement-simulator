import { DEFAULT_PARAMS, MAX_PLANS, type SimulationParams } from '@/types'
import {
  bootstrapPlans,
  createPlanId,
  DEFAULT_PLAN_ID,
  makePlan,
  normalizePlans,
  plansToSavedSetups,
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
  })

  describe('plansToSavedSetups', () => {
    it('mirrors plans into the legacy setup shape', () => {
      const plans = [plan('a', 'Alpha')]

      expect(plansToSavedSetups(plans)).toEqual([
        {
          id: 'a',
          name: 'Alpha',
          timestamp: plans[0].updatedAt,
          params: plans[0].params,
        },
      ])
    })
  })
})
