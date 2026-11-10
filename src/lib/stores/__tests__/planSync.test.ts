import { DEFAULT_PARAMS, MAX_PLANS, type Plan, type SimulationParams } from '@/types'
import {
  DEFAULT_PLAN_ID,
  DEFAULT_PLAN_NAME,
  DEFAULT_PLAN_NAME_KEY,
  PLAN_TOMBSTONE_TTL_MS,
  makePlan,
} from '@/lib/stores/plans'
import { PLAN_REV_HEADER, PLAN_SCHEMA_HEADER, PLAN_SCHEMA_VERSION } from '@/lib/plans/schemaVersion'
import {
  baseAfterPush,
  buildCloudSnapshot,
  cloudProbeState,
  fetchRemoteSnapshot,
  mergePlanSnapshots,
  isSchemaBlocked,
  pushSnapshot,
  resetCloudProbe,
  snapshotSignature,
  usePlanSyncStore,
  markNamespaceReady,
  type LocalSyncState,
  type RemoteSnapshot,
} from '@/lib/stores/planSync'

const params = (overrides: Partial<SimulationParams> = {}): SimulationParams => ({
  ...DEFAULT_PARAMS,
  ...overrides,
})

const plan = (id: string, updatedAt: number, overrides: Partial<Plan> = {}): Plan =>
  makePlan({
    id,
    name: overrides.name ?? id,
    nameKey: overrides.nameKey,
    params: overrides.params ?? params(),
    createdAt: overrides.createdAt ?? 1_000,
    updatedAt,
  })

/** A plan whose parameters differ from every other `assets` value. */
const planWith = (id: string, updatedAt: number, assets: number, name = id): Plan =>
  plan(id, updatedAt, { name, params: params({ currentAssets: assets }) })

const starter = (updatedAt: number, overrides: Partial<Plan> = {}): Plan =>
  plan(DEFAULT_PLAN_ID, updatedAt, {
    name: DEFAULT_PLAN_NAME,
    nameKey: DEFAULT_PLAN_NAME_KEY,
    ...overrides,
  })

const local = (
  plans: Plan[],
  activePlanId = plans[0]?.id ?? '',
  extra: Pick<LocalSyncState, 'deletedPlans' | 'syncedPlanStamps'> = {}
): LocalSyncState => ({ plans, activePlanId, ...extra })

const remote = (
  plans: Plan[],
  activePlanId = plans[0]?.id ?? '',
  extra: Partial<RemoteSnapshot> = {}
): RemoteSnapshot => ({
  schemaVersion: PLAN_SCHEMA_VERSION,
  updatedAt: 5_000,
  rev: 1,
  plans,
  activePlanId,
  ...extra,
})

/** The base a device holds when it last synced exactly `plans`. */
const baseOf = (plans: Plan[]): Record<string, number> =>
  Object.fromEntries(plans.map((entry) => [entry.id, entry.updatedAt]))

const NOW = 1_800_000_000_000
const ids = (plans: readonly Plan[]) => plans.map((entry) => entry.id)
const assets = (entry: Plan | undefined) => entry?.params.currentAssets

describe('mergePlanSnapshots: empty sides', () => {
  it('does nothing when both sides are empty or the device is untouched', () => {
    const result = mergePlanSnapshots({
      local: local([plan('plan-base', 100)]),
      remote: null,
      localPristine: true,
    })

    expect(result.outcome).toBe('idle')
    expect(result.shouldApply).toBe(false)
    expect(result.shouldPush).toBe(false)
  })

  it('seeds an empty account from the first device that has real work', () => {
    const plans = [plan('plan-base', 100), plan('plan-b', 200)]

    const result = mergePlanSnapshots({
      local: local(plans, 'plan-b'),
      remote: null,
      localPristine: false,
    })

    expect(result.outcome).toBe('seed')
    expect(result.shouldPush).toBe(true)
    expect(result.shouldApply).toBe(false)
    expect(result.plans).toEqual(plans)
    expect(result.cloud.plans).toEqual(plans)
    expect(result.activePlanId).toBe('plan-b')
  })

  it('treats an account whose blob holds no plans as empty', () => {
    const result = mergePlanSnapshots({
      local: local([plan('plan-base', 100)]),
      remote: remote([], ''),
      localPristine: false,
    })

    expect(result.outcome).toBe('seed')
    expect(result.shouldPush).toBe(true)
  })

  it('adopts the account on a pristine second device without pushing back', () => {
    const remotePlans = [plan('plan-base', 300), plan('plan-x', 400)]

    const result = mergePlanSnapshots({
      local: local([plan('plan-base', 100)]),
      remote: remote(remotePlans, 'plan-x', { deletedPlans: { gone: NOW - 1 } }),
      localPristine: true,
      now: NOW,
    })

    expect(result.outcome).toBe('adopt')
    expect(result.plans).toEqual(remotePlans)
    // The account's selection is only ever taken here, by a device with none of its own.
    expect(result.activePlanId).toBe('plan-x')
    expect(result.shouldApply).toBe(true)
    expect(result.shouldPush).toBe(false)
    // …and with the plans come what the account knows about them.
    expect(result.deletedPlans).toEqual({ gone: NOW - 1 })
    expect(result.syncedPlanStamps).toEqual({ 'plan-base': 300, 'plan-x': 400 })
  })
})

describe('mergePlanSnapshots: one plan on both sides', () => {
  it('unions plans that exist on one side only, local order first', () => {
    const result = mergePlanSnapshots({
      local: local(
        [plan('shared', 900, { name: 'local name' }), plan('only-local', 100)],
        'only-local'
      ),
      remote: remote(
        [plan('shared', 500, { name: 'remote name' }), plan('only-remote', 700)],
        'only-remote'
      ),
      localPristine: false,
    })

    expect(result.outcome).toBe('merge')
    expect(ids(result.plans)).toEqual(['shared', 'only-local', 'only-remote'])
    expect(ids(result.cloud.plans)).toEqual(['shared', 'only-local', 'only-remote'])
    // Same parameters, renamed here later: the later rename wins.
    expect(result.plans[0].name).toBe('local name')
    expect(result.shouldApply).toBe(true)
    expect(result.shouldPush).toBe(true)
  })

  it('takes the account’s copy when only the account changed since the last sync', () => {
    const synced = planWith('shared', 500, 1)
    const result = mergePlanSnapshots({
      local: local([synced], 'shared', { syncedPlanStamps: baseOf([synced]) }),
      remote: remote([planWith('shared', 900, 2)]),
      localPristine: false,
    })

    expect(assets(result.plans[0])).toBe(2)
    expect(result.conflictCopies).toEqual([])
    expect(result.shouldApply).toBe(true)
    expect(result.shouldPush).toBe(false)
    expect(result.syncedPlanStamps).toEqual({ shared: 900 })
  })

  it('keeps the local copy when only this device changed since the last sync', () => {
    const result = mergePlanSnapshots({
      local: local([planWith('shared', 900, 2)], 'shared', { syncedPlanStamps: { shared: 500 } }),
      remote: remote([planWith('shared', 500, 1)]),
      localPristine: false,
    })

    expect(assets(result.plans[0])).toBe(2)
    expect(assets(result.cloud.plans[0])).toBe(2)
    expect(result.conflictCopies).toEqual([])
    expect(result.shouldApply).toBe(false)
    expect(result.shouldPush).toBe(true)
  })

  it('reports no work when a merge reproduces both sides exactly', () => {
    const shared = [plan('a', 100), plan('b', 200)]

    const result = mergePlanSnapshots({
      local: local(shared, 'a', { syncedPlanStamps: baseOf(shared) }),
      remote: remote(shared, 'a'),
      localPristine: false,
    })

    expect(result.outcome).toBe('merge')
    expect(result.shouldApply).toBe(false)
    expect(result.shouldPush).toBe(false)
  })

  it('agrees without writing when both sides changed to the same thing', () => {
    const result = mergePlanSnapshots({
      local: local([planWith('shared', 700, 5)], 'shared', { syncedPlanStamps: { shared: 100 } }),
      remote: remote([planWith('shared', 900, 5)]),
      localPristine: false,
    })

    expect(result.conflictCopies).toEqual([])
    expect(result.plans[0].updatedAt).toBe(900)
    expect(result.shouldPush).toBe(false)
  })

  it('does not mistake a different key order for a different plan', () => {
    const reordered = Object.fromEntries(
      Object.entries(params()).reverse()
    ) as unknown as SimulationParams
    const result = mergePlanSnapshots({
      local: local([plan('shared', 700, { params: reordered })], 'shared'),
      remote: remote([plan('shared', 700)]),
      localPristine: false,
    })

    expect(result.conflictCopies).toEqual([])
    expect(result.shouldPush).toBe(false)
  })
})

describe('mergePlanSnapshots: conflict copies', () => {
  it('keeps both versions when both sides changed a plan since the last sync', () => {
    const mine = planWith('plan-x', 800, 111, 'Retire at 60')
    const theirs = planWith('plan-x', 900, 222, 'Retire at 60')

    const result = mergePlanSnapshots({
      local: local([mine, plan('other', 50)], 'plan-x', {
        syncedPlanStamps: { 'plan-x': 500, other: 50 },
      }),
      remote: remote([theirs, plan('other', 50)]),
      localPristine: false,
    })

    // The account's version keeps the id; this device's version is the copy.
    expect(result.plans).toHaveLength(3)
    const [kept, copy] = result.plans
    expect(kept.id).toBe('plan-x')
    expect(assets(kept)).toBe(222)
    expect(copy.id).not.toBe('plan-x')
    expect(assets(copy)).toBe(111)
    expect(copy.name).toBe('Retire at 60 (copy from this device)')
    expect(copy.nameKey).toBeUndefined()
    expect(result.conflictCopies).toEqual([copy])

    // What the user was looking at stays what they are looking at.
    expect(result.activePlanId).toBe(copy.id)
    expect(result.renamedIds).toEqual({ 'plan-x': copy.id })

    // The copy goes to the account as a new plan; nothing there is replaced.
    expect(ids(result.cloud.plans)).toEqual(['plan-x', copy.id, 'other'])
    expect(assets(result.cloud.plans[0])).toBe(222)
    expect(result.shouldPush).toBe(true)
    expect(result.shouldApply).toBe(true)
    expect(result.syncedPlanStamps).toEqual({ 'plan-x': 900, other: 50 })
  })

  it('makes the copy even when this device’s version is the newer one', () => {
    const result = mergePlanSnapshots({
      local: local([planWith('plan-x', 999, 111)], 'plan-x', {
        syncedPlanStamps: { 'plan-x': 500 },
      }),
      remote: remote([planWith('plan-x', 600, 222)]),
      localPristine: false,
    })

    expect(result.plans.map(assets)).toEqual([222, 111])
  })

  it('names the copy with the function it is given and keeps names unique', () => {
    const result = mergePlanSnapshots({
      local: local(
        [
          planWith('plan-x', 800, 111, 'Plan'),
          plan('taken', 10, { name: 'Plan (Kopie von diesem Gerät)' }),
        ],
        'plan-x',
        { syncedPlanStamps: { 'plan-x': 500, taken: 10 } }
      ),
      remote: remote([
        planWith('plan-x', 900, 222, 'Plan'),
        plan('taken', 10, { name: 'Plan (Kopie von diesem Gerät)' }),
      ]),
      localPristine: false,
      conflictCopyName: (entry) => `${entry.name} (Kopie von diesem Gerät)`,
    })

    expect(result.conflictCopies[0].name).toBe('Plan (Kopie von diesem Gerät) (2)')
  })

  it('arrives at the same copy from two tabs, and does not copy a copy', () => {
    const input = {
      local: local([planWith('plan-x', 800, 111)], 'plan-x', {
        syncedPlanStamps: { 'plan-x': 500 },
      }),
      remote: remote([planWith('plan-x', 900, 222)]),
      localPristine: false,
    }
    const first = mergePlanSnapshots(input)
    const second = mergePlanSnapshots(input)
    expect(second.conflictCopies[0].id).toBe(first.conflictCopies[0].id)

    // The other tab pushed its copy already: this tab finds it in the account.
    const afterOtherTab = mergePlanSnapshots({
      ...input,
      remote: remote([planWith('plan-x', 900, 222), first.conflictCopies[0]]),
    })
    expect(afterOtherTab.conflictCopies).toEqual([])
    expect(ids(afterOtherTab.plans)).toEqual(['plan-x', first.conflictCopies[0].id])
  })

  describe('the starter plan: every device has its own "plan-base"', () => {
    it('keeps both when two devices each worked in theirs (first sync, no base)', () => {
      const result = mergePlanSnapshots({
        local: local([starter(1_000, { params: params({ currentAssets: 999_999 }) })]),
        remote: remote([starter(2_000, { params: params({ currentAssets: 111_111 }) })]),
        localPristine: false,
        conflictCopyName: () => 'Base plan (copy from this device)',
      })

      expect(result.plans).toHaveLength(2)
      expect(assets(result.plans[0])).toBe(111_111)
      expect(result.plans[0].id).toBe(DEFAULT_PLAN_ID)
      expect(assets(result.plans[1])).toBe(999_999)
      expect(result.plans[1].name).toBe('Base plan (copy from this device)')
      // Both end up in the account: nothing is dropped anywhere.
      expect(result.cloud.plans.map(assets)).toEqual([111_111, 999_999])
      expect(result.shouldPush).toBe(true)
    })

    it('keeps both whichever of the two is newer', () => {
      const result = mergePlanSnapshots({
        local: local([starter(9_000, { params: params({ currentAssets: 999_999 }) })]),
        remote: remote([starter(2_000, { params: params({ currentAssets: 111_111 }) })]),
        localPristine: false,
      })

      expect(result.plans.map(assets)).toEqual([111_111, 999_999])
    })

    it('makes no copy of a starter plan nobody touched', () => {
      // Not a pristine *workspace* (there is a second plan), but the starter is.
      const mine = mergePlanSnapshots({
        local: local([starter(0), plan('plan-mine', 500)]),
        remote: remote([starter(2_000, { params: params({ currentAssets: 111_111 }) })]),
        localPristine: false,
      })
      expect(mine.conflictCopies).toEqual([])
      expect(assets(mine.plans[0])).toBe(111_111)

      const theirs = mergePlanSnapshots({
        local: local([starter(1_000, { params: params({ currentAssets: 999_999 }) })]),
        remote: remote([starter(0), plan('plan-theirs', 500)]),
        localPristine: false,
      })
      expect(theirs.conflictCopies).toEqual([])
      expect(assets(theirs.plans[0])).toBe(999_999)
      expect(assets(theirs.cloud.plans[0])).toBe(999_999)
    })
  })

  describe('a device that synced under the old protocol (it shares a generated id with the account)', () => {
    const shared = plan('plan-lx1', 100)

    it('takes its stale starter plan for what it is, and makes no copy', () => {
      const result = mergePlanSnapshots({
        local: local([starter(1_000, { params: params({ currentAssets: 999_999 }) }), shared]),
        remote: remote([starter(2_000, { params: params({ currentAssets: 111_111 }) }), shared]),
        localPristine: false,
      })

      expect(result.conflictCopies).toEqual([])
      expect(result.plans.map(assets)).toEqual([111_111, DEFAULT_PARAMS.currentAssets])
      expect(result.shouldPush).toBe(false)
    })

    it('still keeps both when its starter plan claims to be the newer one', () => {
      const result = mergePlanSnapshots({
        local: local([starter(9_000, { params: params({ currentAssets: 999_999 }) }), shared]),
        remote: remote([starter(2_000, { params: params({ currentAssets: 111_111 }) }), shared]),
        localPristine: false,
      })

      expect(result.plans.map(assets)).toEqual([111_111, 999_999, DEFAULT_PARAMS.currentAssets])
    })

    it('applies a deletion of the starter plan to its stale copy', () => {
      const result = mergePlanSnapshots({
        local: local([starter(1_000, { params: params({ currentAssets: 999_999 }) }), shared]),
        remote: remote([shared], shared.id, { deletedPlans: { [DEFAULT_PLAN_ID]: NOW - 1_000 } }),
        localPristine: false,
        now: NOW,
      })

      expect(ids(result.plans)).toEqual([shared.id])
      expect(result.renamedIds).toEqual({})
    })
  })

  describe('a generated id without a base (a device that last synced before bases existed)', () => {
    it('treats an older local copy as stale, as before', () => {
      const result = mergePlanSnapshots({
        local: local([planWith('plan-lx1', 500, 1)]),
        remote: remote([planWith('plan-lx1', 900, 2)]),
        localPristine: false,
      })

      expect(result.conflictCopies).toEqual([])
      expect(result.plans.map(assets)).toEqual([2])
      expect(result.shouldPush).toBe(false)
    })

    it('keeps both when the local copy claims to be newer', () => {
      const result = mergePlanSnapshots({
        local: local([planWith('plan-lx1', 900, 1)]),
        remote: remote([planWith('plan-lx1', 500, 2)]),
        localPristine: false,
      })

      expect(result.plans.map(assets)).toEqual([2, 1])
    })
  })
})

describe('mergePlanSnapshots: clock skew', () => {
  const DAY = 86_400_000

  it('lets a later save elsewhere win over a copy stamped by a clock that runs ahead', () => {
    // This device saved "tomorrow" (its clock is a day ahead) and synced that.
    const mine = planWith('plan-x', NOW + DAY, 100_000)
    // Another device, correct clock, saved really later.
    const theirs = planWith('plan-x', NOW + 5_000, 200_000)

    const result = mergePlanSnapshots({
      local: local([mine], 'plan-x', { syncedPlanStamps: { 'plan-x': NOW + DAY } }),
      remote: remote([theirs]),
      localPristine: false,
      now: NOW + DAY + 60_000,
    })

    expect(assets(result.plans[0])).toBe(200_000)
    expect(result.conflictCopies).toEqual([])
    expect(result.shouldPush).toBe(false)
  })

  it('takes over the stamp the server clamped, without pushing again', () => {
    // Pushed with a future stamp; the server stored it with its own clock.
    const mine = planWith('plan-x', NOW + DAY, 100_000)
    const stored = planWith('plan-x', NOW, 100_000)

    const result = mergePlanSnapshots({
      local: local([mine], 'plan-x', { syncedPlanStamps: { 'plan-x': NOW + DAY } }),
      remote: remote([stored]),
      localPristine: false,
    })

    expect(result.plans[0].updatedAt).toBe(NOW)
    expect(result.shouldPush).toBe(false)
  })
})

describe('mergePlanSnapshots: deletions', () => {
  const kept = plan('plan-keep', 100)
  const victim = planWith('plan-b', 200, 7)
  const synced = baseOf([kept, victim])

  it('removes a plan deleted here from the account, and remembers the deletion', () => {
    const result = mergePlanSnapshots({
      local: local([kept], 'plan-keep', {
        deletedPlans: { 'plan-b': NOW - 1_000 },
        syncedPlanStamps: synced,
      }),
      remote: remote([kept, victim]),
      localPristine: false,
      now: NOW,
    })

    expect(ids(result.plans)).toEqual(['plan-keep'])
    expect(ids(result.cloud.plans)).toEqual(['plan-keep'])
    expect(result.cloud.deletedPlans).toEqual({ 'plan-b': NOW - 1_000 })
    expect(result.shouldPush).toBe(true)
    expect(result.shouldApply).toBe(false)
  })

  it('drops a stale copy on another device instead of pushing it back', () => {
    const result = mergePlanSnapshots({
      local: local([kept, victim], 'plan-b', { syncedPlanStamps: synced }),
      remote: remote([kept], 'plan-keep', { deletedPlans: { 'plan-b': NOW - 1_000 } }),
      localPristine: false,
      now: NOW,
    })

    expect(ids(result.plans)).toEqual(['plan-keep'])
    expect(result.activePlanId).toBe('plan-keep')
    expect(ids(result.cloud.plans)).toEqual(['plan-keep'])
    expect(result.deletedPlans).toEqual({ 'plan-b': NOW - 1_000 })
    expect(result.shouldApply).toBe(true)
    // Nothing to tell the account: it already knows.
    expect(result.shouldPush).toBe(false)
  })

  it('does not delete the plan the user is editing right now from under them', () => {
    const result = mergePlanSnapshots({
      local: local([kept, victim], 'plan-b', { syncedPlanStamps: synced }),
      remote: remote([kept], 'plan-keep', { deletedPlans: { 'plan-b': NOW - 1_000 } }),
      localPristine: false,
      now: NOW,
      dirtyPlanId: 'plan-b',
    })

    expect(ids(result.plans)).toEqual(['plan-keep', 'plan-b'])
    expect(result.activePlanId).toBe('plan-b')
    // Stamped as changed now, so the deleting device sees a revision it has
    // not seen and keeps the plan instead of deleting it again.
    expect(result.plans[1].updatedAt).toBe(NOW)
    expect(ids(result.cloud.plans)).toEqual(['plan-keep', 'plan-b'])
    expect(result.deletedPlans).toEqual({})
    expect(result.shouldPush).toBe(true)

    // Back on the device that deleted it: an unseen revision, so it returns.
    const deleter = mergePlanSnapshots({
      local: local([kept], 'plan-keep', {
        deletedPlans: { 'plan-b': NOW - 1_000 },
        syncedPlanStamps: synced,
      }),
      remote: remote(result.cloud.plans),
      localPristine: false,
      now: NOW,
    })
    expect(ids(deleter.plans)).toEqual(['plan-keep', 'plan-b'])
    expect(deleter.shouldPush).toBe(false)
  })

  it('lets an edit made elsewhere after the deletion survive, and clears the tombstone', () => {
    const edited = planWith('plan-b', NOW, 8)
    const result = mergePlanSnapshots({
      local: local([kept, edited], 'plan-b', { syncedPlanStamps: synced }),
      remote: remote([kept], 'plan-keep', { deletedPlans: { 'plan-b': NOW - 1_000 } }),
      localPristine: false,
      now: NOW,
    })

    expect(ids(result.plans)).toEqual(['plan-keep', 'plan-b'])
    expect(ids(result.cloud.plans)).toEqual(['plan-keep', 'plan-b'])
    expect(result.deletedPlans).toEqual({})
    expect(result.cloud.deletedPlans).toEqual({})
    expect(result.shouldPush).toBe(true)
  })

  it('lets such an edit survive whatever the clocks say (edited offline before the deletion)', () => {
    // Stamped *before* the deletion, but the deleting device never saw it.
    const edited = planWith('plan-b', NOW - 50_000, 8)
    const result = mergePlanSnapshots({
      local: local([kept, edited], 'plan-b', { syncedPlanStamps: synced }),
      remote: remote([kept], 'plan-keep', { deletedPlans: { 'plan-b': NOW - 1_000 } }),
      localPristine: false,
      now: NOW,
    })

    expect(ids(result.plans)).toEqual(['plan-keep', 'plan-b'])
    expect(result.deletedPlans).toEqual({})
  })

  it('brings a plan back to the device that deleted it when it was edited elsewhere meanwhile', () => {
    const edited = planWith('plan-b', 900, 8)
    const result = mergePlanSnapshots({
      local: local([kept], 'plan-keep', {
        deletedPlans: { 'plan-b': NOW - 1_000 },
        syncedPlanStamps: synced,
      }),
      remote: remote([kept, edited]),
      localPristine: false,
      now: NOW,
    })

    expect(ids(result.plans)).toEqual(['plan-keep', 'plan-b'])
    expect(assets(result.plans[1])).toBe(8)
    expect(result.deletedPlans).toEqual({})
    expect(result.shouldPush).toBe(false)
  })

  it('keeps the base of a deleted plan as long as its tombstone', () => {
    const result = mergePlanSnapshots({
      local: local([kept], 'plan-keep', {
        deletedPlans: { 'plan-b': NOW - 1_000 },
        syncedPlanStamps: synced,
      }),
      remote: remote([kept], 'plan-keep', { deletedPlans: { 'plan-b': NOW - 1_000 } }),
      localPristine: false,
      now: NOW,
    })

    expect(result.syncedPlanStamps).toEqual(synced)
    expect(result.shouldPush).toBe(false)
  })

  it('falls back to the timestamps when a generated id was never synced from this device', () => {
    const tombstone = { 'plan-b': 5_000 }

    const older = mergePlanSnapshots({
      local: local([kept, planWith('plan-b', 4_000, 7)]),
      remote: remote([kept], 'plan-keep', { deletedPlans: tombstone }),
      localPristine: false,
      now: 6_000,
    })
    expect(ids(older.plans)).toEqual(['plan-keep'])

    const newer = mergePlanSnapshots({
      local: local([kept, planWith('plan-b', 5_500, 7)]),
      remote: remote([kept], 'plan-keep', { deletedPlans: tombstone }),
      localPristine: false,
      now: 6_000,
    })
    expect(ids(newer.plans)).toEqual(['plan-keep', 'plan-b'])
    expect(newer.deletedPlans).toEqual({})
  })

  it('never applies another device’s starter-plan tombstone to this device’s own starter plan', () => {
    const worked = starter(1_000, { params: params({ currentAssets: 424_242 }) })
    const result = mergePlanSnapshots({
      local: local([worked, plan('plan-mine', 50)]),
      remote: remote([plan('plan-theirs', 60)], 'plan-theirs', {
        deletedPlans: { [DEFAULT_PLAN_ID]: NOW - 1_000 },
      }),
      localPristine: false,
      now: NOW,
    })

    // Kept — under an id the tombstone does not apply to.
    const moved = result.plans.find((entry) => assets(entry) === 424_242)
    expect(moved).toBeDefined()
    expect(moved?.id).not.toBe(DEFAULT_PLAN_ID)
    expect(result.renamedIds).toEqual({ [DEFAULT_PLAN_ID]: moved?.id })
    expect(result.activePlanId).toBe(moved?.id)
    expect(ids(result.cloud.plans)).toContain(moved?.id)
    expect(result.deletedPlans).toEqual({ [DEFAULT_PLAN_ID]: NOW - 1_000 })

    // An untouched starter plan holds nothing: it simply goes.
    const untouched = mergePlanSnapshots({
      local: local([starter(0), plan('plan-mine', 50)]),
      remote: remote([plan('plan-theirs', 60)], 'plan-theirs', {
        deletedPlans: { [DEFAULT_PLAN_ID]: NOW - 1_000 },
      }),
      localPristine: false,
      now: NOW,
    })
    expect(ids(untouched.plans)).toEqual(['plan-mine', 'plan-theirs'])
  })

  it('never applies this device’s starter-plan tombstone to another device’s starter plan', () => {
    const theirs = starter(1_000, { params: params({ currentAssets: 111_111 }) })
    const result = mergePlanSnapshots({
      // Deleted its own starter plan before it ever synced.
      local: local([plan('plan-mine', 50)], 'plan-mine', {
        deletedPlans: { [DEFAULT_PLAN_ID]: NOW - 1_000 },
      }),
      remote: remote([theirs]),
      localPristine: false,
      now: NOW,
    })

    expect(ids(result.plans)).toEqual(['plan-mine', DEFAULT_PLAN_ID])
    expect(ids(result.cloud.plans)).toContain(DEFAULT_PLAN_ID)
    expect(result.deletedPlans).toEqual({})
  })

  it('reads a missing plan as missing, not as deleted: without a tombstone it goes back up', () => {
    const result = mergePlanSnapshots({
      local: local([kept, victim], 'plan-keep', { syncedPlanStamps: synced }),
      // e.g. a tombstone that expired, or an account that was reset
      remote: remote([kept]),
      localPristine: false,
    })

    expect(ids(result.plans)).toEqual(['plan-keep', 'plan-b'])
    expect(ids(result.cloud.plans)).toEqual(['plan-keep', 'plan-b'])
    expect(result.shouldPush).toBe(true)
  })

  it('forgets tombstones after their lifetime', () => {
    const expired = NOW - PLAN_TOMBSTONE_TTL_MS - 1
    const result = mergePlanSnapshots({
      local: local([kept], 'plan-keep', {
        deletedPlans: { 'plan-b': expired },
        syncedPlanStamps: synced,
      }),
      remote: remote([kept, victim], 'plan-keep', { deletedPlans: { 'plan-z': expired } }),
      localPristine: false,
      now: NOW,
    })

    expect(ids(result.plans)).toEqual(['plan-keep', 'plan-b'])
    expect(result.deletedPlans).toEqual({})
  })

  it('never leaves a workspace empty: two devices that deleted each other’s last plan', () => {
    const mine = plan('plan-mine', 100)
    const theirs = plan('plan-theirs', 100)
    const result = mergePlanSnapshots({
      local: local([mine], 'plan-mine', {
        deletedPlans: { 'plan-theirs': NOW - 10 },
        syncedPlanStamps: baseOf([mine, theirs]),
      }),
      remote: remote([theirs], 'plan-theirs', { deletedPlans: { 'plan-mine': NOW - 10 } }),
      localPristine: false,
      now: NOW,
    })

    expect(ids(result.plans)).toEqual(['plan-mine'])
    expect(ids(result.cloud.plans)).toEqual(['plan-mine'])
  })
})

describe('mergePlanSnapshots: the plan limit', () => {
  const many = (prefix: string, count: number, from: number) =>
    Array.from({ length: count }, (_, index) => plan(`${prefix}-${index}`, from + index))

  it('never drops a plan to fit: each side keeps its own, and they exchange what fits', () => {
    const localPlans = many('local', MAX_PLANS - 2, 1_000)
    const remotePlans = many('remote', 6, 5_000)

    const result = mergePlanSnapshots({
      local: local(localPlans, 'local-0'),
      remote: remote(remotePlans, 'remote-0'),
      localPristine: false,
    })

    // The device keeps every plan it had and takes the two newest of the account.
    expect(result.plans).toHaveLength(MAX_PLANS)
    expect(ids(result.plans).slice(0, MAX_PLANS - 2)).toEqual(ids(localPlans))
    expect(ids(result.plans).slice(-2)).toEqual(['remote-4', 'remote-5'])
    expect(result.cloudOnlyPlanIds).toEqual(['remote-0', 'remote-1', 'remote-2', 'remote-3'])

    // The account keeps every plan it had and takes the newest local ones.
    expect(result.cloud.plans).toHaveLength(MAX_PLANS)
    remotePlans.forEach((entry) => expect(ids(result.cloud.plans)).toContain(entry.id))
    expect(result.unsyncedPlanIds).toEqual(['local-0', 'local-1', 'local-2', 'local-3'])
    expect(ids(result.cloud.plans)).toContain(`local-${MAX_PLANS - 3}`)

    // Nothing exists nowhere.
    const everywhere = new Set([...ids(result.plans), ...ids(result.cloud.plans)])
    ;[...localPlans, ...remotePlans].forEach((entry) => expect(everywhere.has(entry.id)).toBe(true))
    expect(result.activePlanId).toBe('local-0')
  })

  it('leaves a conflict unresolved rather than drop a plan to make room for the copy', () => {
    const others = many('local', MAX_PLANS - 1, 1_000)
    const mine = planWith('plan-x', 800, 111)
    const theirs = planWith('plan-x', 900, 222)

    const result = mergePlanSnapshots({
      local: local([mine, ...others], 'plan-x', {
        syncedPlanStamps: { ...baseOf(others), 'plan-x': 500 },
      }),
      remote: remote([theirs, ...others]),
      localPristine: false,
    })

    expect(result.conflictCopies).toEqual([])
    // Each side keeps its version…
    expect(assets(result.plans[0])).toBe(111)
    expect(assets(result.cloud.plans.find((entry) => entry.id === 'plan-x'))).toBe(222)
    expect(result.cloudKept).toEqual([theirs])
    expect(result.unsyncedPlanIds).toEqual(['plan-x'])
    // …the account is not touched…
    expect(result.shouldPush).toBe(false)
    // …and the base does not move, so the conflict is found again next time.
    expect(result.syncedPlanStamps['plan-x']).toBe(500)
  })

  it('resolves that conflict as soon as there is room', () => {
    const others = many('local', MAX_PLANS - 2, 1_000)
    const result = mergePlanSnapshots({
      local: local([planWith('plan-x', 800, 111), ...others], 'plan-x', {
        syncedPlanStamps: { ...baseOf(others), 'plan-x': 500 },
      }),
      remote: remote([planWith('plan-x', 900, 222), ...others]),
      localPristine: false,
    })

    expect(result.conflictCopies).toHaveLength(1)
    expect(result.plans).toHaveLength(MAX_PLANS)
    expect(result.unsyncedPlanIds).toEqual([])
  })
})

describe('mergePlanSnapshots: the selection is per device', () => {
  const plans = [plan('plan-base', 1_000), plan('plan-b', 2_000)]

  it('keeps this device’s selection, whichever side was edited last', () => {
    const result = mergePlanSnapshots({
      local: local([plan('a', 100), plan('b', 200)], 'a'),
      remote: remote([plan('c', 900)], 'c'),
      localPristine: false,
    })

    expect(result.activePlanId).toBe('a')
  })

  it('does not write to the account when two devices only differ in the selected plan', () => {
    const result = mergePlanSnapshots({
      local: local(plans, 'plan-base', { syncedPlanStamps: baseOf(plans) }),
      remote: remote(plans, 'plan-b'),
      localPristine: false,
    })

    expect(result.activePlanId).toBe('plan-base')
    expect(result.shouldPush).toBe(false)
    expect(result.shouldApply).toBe(false)
  })

  it('falls back to the first plan when the selected one was deleted elsewhere', () => {
    const result = mergePlanSnapshots({
      local: local(plans, 'plan-b', { syncedPlanStamps: baseOf(plans) }),
      remote: remote([plans[0]], 'plan-base', { deletedPlans: { 'plan-b': NOW } }),
      localPristine: false,
      now: NOW,
    })

    expect(result.activePlanId).toBe('plan-base')
  })
})

describe('snapshotSignature', () => {
  it('ignores everything that is not a plan', () => {
    const plans = [plan('a', 100)]
    expect(snapshotSignature({ plans, activePlanId: 'a' })).toBe(
      snapshotSignature({ plans: [...plans], activePlanId: 'a' })
    )
  })

  it('ignores which plan is selected', () => {
    const plans = [plan('a', 100), plan('b', 200)]
    expect(snapshotSignature({ plans, activePlanId: 'a' })).toBe(
      snapshotSignature({ plans, activePlanId: 'b' })
    )
  })

  it('changes when a plan is saved with new params', () => {
    const before = snapshotSignature({ plans: [plan('a', 100)], activePlanId: 'a' })
    const after = snapshotSignature({
      plans: [plan('a', 200, { params: params({ currentAge: 44 }) })],
      activePlanId: 'a',
    })

    expect(before).not.toBe(after)
  })

  it('changes when a plan is renamed or deleted', () => {
    const plans = [plan('a', 100), plan('b', 200)]
    const before = snapshotSignature({ plans, activePlanId: 'a' })

    expect(
      snapshotSignature({
        plans: [plan('a', 100, { name: 'renamed' }), plans[1]],
        activePlanId: 'a',
      })
    ).not.toBe(before)
    expect(
      snapshotSignature({ plans: [plans[0]], activePlanId: 'a', deletedPlans: { b: 5 } })
    ).not.toBe(snapshotSignature({ plans: [plans[0]], activePlanId: 'a' }))
  })
})

describe('buildCloudSnapshot / baseAfterPush', () => {
  it('sends the local plans, the tombstones of plans that are gone, and the selection as a hint', () => {
    const plans = [plan('a', 100), plan('b', 200)]
    const sent = buildCloudSnapshot(
      {
        plans,
        activePlanId: 'b',
        deletedPlans: { gone: NOW - 5, a: NOW - 5 },
        syncedPlanStamps: {},
      },
      [],
      NOW
    )

    expect(sent.plans).toEqual(plans)
    expect(sent.activePlanId).toBe('b')
    // A plan that is in the list is not deleted.
    expect(sent.deletedPlans).toEqual({ gone: NOW - 5 })
    expect(sent.heldBackIds).toEqual([])
  })

  it('carries the account’s kept plans along and holds back what does not fit', () => {
    const kept = Array.from({ length: MAX_PLANS - 1 }, (_, index) =>
      plan(`cloud-${index}`, 10 + index)
    )
    const sent = buildCloudSnapshot(
      { plans: [plan('new-old', 100), plan('new-recent', 200)], activePlanId: 'new-old' },
      kept
    )

    expect(sent.plans).toHaveLength(MAX_PLANS)
    expect(ids(sent.plans)).toContain('new-recent')
    expect(sent.heldBackIds).toEqual(['new-old'])
  })

  it('never sends this device’s side of an unresolved conflict over the account’s', () => {
    const theirs = planWith('plan-x', 900, 222)
    const sent = buildCloudSnapshot(
      {
        plans: [planWith('plan-x', 950, 111)],
        activePlanId: 'plan-x',
        syncedPlanStamps: { 'plan-x': 500 },
      },
      [theirs]
    )

    expect(sent.plans).toEqual([theirs])
  })

  it('moves the base to what was sent, except for plans carried for the account', () => {
    const theirs = planWith('plan-x', 900, 222)
    const sent = buildCloudSnapshot(
      {
        plans: [planWith('plan-x', 950, 111), plan('mine', 300)],
        activePlanId: 'mine',
        deletedPlans: { gone: NOW },
        syncedPlanStamps: { 'plan-x': 500, gone: 42, forgotten: 7 },
      },
      [theirs],
      NOW
    )

    expect(baseAfterPush({ 'plan-x': 500, gone: 42, forgotten: 7 }, sent, [theirs])).toEqual({
      'plan-x': 500,
      mine: 300,
      gone: 42,
    })
  })
})

describe('transport', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    resetCloudProbe()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  const mockFetch = (impl: jest.Mock) => {
    global.fetch = impl as unknown as typeof fetch
    return impl
  }

  const snapshot = { plans: [plan('a', 1)], activePlanId: 'a' }

  it('probes once per session and never asks again after a 501', async () => {
    const fetchMock = mockFetch(
      jest.fn().mockResolvedValue({ ok: false, status: 501, json: async () => ({}) })
    )

    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'unconfigured' })
    expect(cloudProbeState()).toBe(false)

    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'unconfigured' })
    await expect(pushSnapshot(snapshot, 0)).resolves.toEqual({ status: 'unconfigured' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reads an account blob with its revision and tombstones', async () => {
    const deletedAt = Date.now() - 1_000
    mockFetch(
      jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          configured: true,
          rev: 12,
          blob: {
            schemaVersion: 3,
            updatedAt: 42,
            plans: [plan('a', 5)],
            activePlanId: 'a',
            deletedPlans: { gone: deletedAt, junk: 'x' },
          },
        }),
      })
    )

    const result = await fetchRemoteSnapshot()
    expect(result.status).toBe('ok')
    if (result.status !== 'ok') return
    expect(result.rev).toBe(12)
    expect(result.blob?.rev).toBe(12)
    expect(result.blob?.updatedAt).toBe(42)
    expect(result.blob?.plans).toHaveLength(1)
    expect(result.blob?.deletedPlans).toEqual({ gone: deletedAt })
  })

  it('reads an empty account as null without disabling sync', async () => {
    mockFetch(
      jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ configured: true, rev: 0, blob: null }),
      })
    )

    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'ok', blob: null, rev: 0 })
    expect(cloudProbeState()).toBe(true)
  })

  it('never reads a failed answer as an empty account', async () => {
    // The store behind the API could not be read.
    mockFetch(
      jest
        .fn()
        .mockResolvedValue({ ok: false, status: 502, json: async () => ({ error: 'read-failed' }) })
    )
    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'error' })

    // A 200 that is not the API's answer (a proxy page, a captive portal).
    mockFetch(jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }))
    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'error' })
    mockFetch(jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => null }))
    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'error' })
  })

  it('degrades to an error (never a throw) when the network is gone', async () => {
    mockFetch(jest.fn().mockRejectedValue(new Error('offline')))

    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'error' })
    await expect(pushSnapshot(snapshot, 0)).resolves.toEqual({ status: 'error' })
    // An error is not a verdict about the deployment: it stays probe-able.
    expect(cloudProbeState()).toBeNull()
  })

  it('reports a lost session as unauthorized', async () => {
    mockFetch(jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) }))

    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'unauthorized' })
  })

  it('sends plans, tombstones and the revision it is based on with a PUT', async () => {
    const fetchMock = mockFetch(
      jest.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ configured: true, rev: 8, updatedAt: 777 }),
      })
    )

    await expect(pushSnapshot({ ...snapshot, deletedPlans: { gone: 5 } }, 7)).resolves.toEqual({
      status: 'ok',
      rev: 8,
      updatedAt: 777,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.method).toBe('PUT')
    expect((init.headers as Record<string, string>)[PLAN_REV_HEADER]).toBe('7')
    expect(init.keepalive).toBeUndefined()
    const body = JSON.parse(String(init.body)) as {
      plans: Plan[]
      activePlanId: string
      deletedPlans: Record<string, number>
    }
    expect(body.activePlanId).toBe('a')
    expect(body.plans).toHaveLength(1)
    expect(body.deletedPlans).toEqual({ gone: 5 })
  })

  it('reports a 412 as a conflict, not as a failure', async () => {
    mockFetch(
      jest.fn().mockResolvedValue({
        ok: false,
        status: 412,
        json: async () => ({ error: 'rev-mismatch', rev: 9 }),
      })
    )

    await expect(pushSnapshot(snapshot, 7)).resolves.toEqual({ status: 'conflict' })
  })

  it('can ask for a request that outlives the page', async () => {
    const fetchMock = mockFetch(
      jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ rev: 1 }) })
    )

    await pushSnapshot(snapshot, 0, { keepalive: true })
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].keepalive).toBe(true)

    // Browsers reject a keepalive body above 64 KiB: a big one goes out as an
    // ordinary request instead of not at all. Bytes count, not characters.
    const big = { plans: [plan('a', 1, { name: 'ä'.repeat(31_000) })], activePlanId: 'a' }
    await pushSnapshot(big, 0, { keepalive: true })
    expect((fetchMock.mock.calls[1] as [string, RequestInit])[1].keepalive).toBeUndefined()
  })
})

describe('namespace signal', () => {
  beforeEach(() => {
    usePlanSyncStore.setState({
      phase: 'disabled',
      lastSyncedAt: null,
      namespaceUserId: null,
      namespaceReady: false,
      planLimit: null,
      conflictCopyNames: [],
    })
  })

  it('publishes the signed-in account and clears status on sign-out', () => {
    markNamespaceReady('user-1')
    expect(usePlanSyncStore.getState().namespaceUserId).toBe('user-1')
    expect(usePlanSyncStore.getState().namespaceReady).toBe(true)

    usePlanSyncStore.getState().setPhase('synced', 1234)
    usePlanSyncStore.getState().setPlanLimit({ unsynced: 2, hidden: 0 })
    markNamespaceReady(null)

    // The anonymous namespace never syncs, and must not inherit a stale status.
    expect(usePlanSyncStore.getState().namespaceUserId).toBeNull()
    expect(usePlanSyncStore.getState().phase).toBe('disabled')
    expect(usePlanSyncStore.getState().lastSyncedAt).toBeNull()
    expect(usePlanSyncStore.getState().planLimit).toBeNull()
  })

  it('reports the plan limit only while something is held back', () => {
    const { setPlanLimit } = usePlanSyncStore.getState()
    setPlanLimit({ unsynced: 0, hidden: 0 })
    expect(usePlanSyncStore.getState().planLimit).toBeNull()
    setPlanLimit({ unsynced: 1, hidden: 2 })
    expect(usePlanSyncStore.getState().planLimit).toEqual({ unsynced: 1, hidden: 2 })
    setPlanLimit(null)
    expect(usePlanSyncStore.getState().planLimit).toBeNull()
  })
})

describe('schema guard transport', () => {
  const originalFetch = global.fetch

  const respond = (status: number, body: unknown, headers: Record<string, string> = {}) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json', ...headers },
    })

  const snapshot = { plans: [plan('a', 1)], activePlanId: 'a' }

  beforeEach(() => {
    resetCloudProbe()
    usePlanSyncStore.setState({ phase: 'disabled', reloadNotice: null })
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('sends the plan schema version on every GET and PUT', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation(async () => respond(200, { configured: true, blob: null, updatedAt: 1 }))
    global.fetch = fetchMock as unknown as typeof fetch

    await fetchRemoteSnapshot()
    await pushSnapshot(snapshot, 0)

    for (const [, init] of fetchMock.mock.calls as [string, RequestInit][]) {
      expect((init.headers as Record<string, string>)[PLAN_SCHEMA_HEADER]).toBe(
        String(PLAN_SCHEMA_VERSION)
      )
    }
    const [, putInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect((JSON.parse(String(putInit.body)) as { schemaVersion: number }).schemaVersion).toBe(
      PLAN_SCHEMA_VERSION
    )
  })

  it('reads the revision from the header when the body does not state it', async () => {
    global.fetch = jest
      .fn()
      .mockImplementation(async () =>
        respond(200, { configured: true, blob: null }, { [PLAN_REV_HEADER]: '31' })
      ) as unknown as typeof fetch

    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'ok', blob: null, rev: 31 })
  })

  it('turns a 409 outdated-client into "outdated", asks for a reload and never calls again', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementation(async () => respond(409, { error: 'outdated-client' }))
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(pushSnapshot(snapshot, 0)).resolves.toEqual({ status: 'outdated' })
    expect(isSchemaBlocked()).toBe(true)
    expect(usePlanSyncStore.getState().reloadNotice).toBe('required')

    // Sticky for the page life: no request reaches the server any more.
    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'outdated' })
    await expect(pushSnapshot({ plans: [plan('a', 2)], activePlanId: 'a' }, 0)).resolves.toEqual({
      status: 'outdated',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('treats a 409 outdated-server as a pause: no reload, no permanent block, asks again', async () => {
    let rolledBack = true
    const fetchMock = jest
      .fn()
      .mockImplementation(async () =>
        rolledBack
          ? respond(409, { error: 'outdated-server', schemaVersion: PLAN_SCHEMA_VERSION - 1 })
          : respond(200, { configured: true, rev: 4, blob: null })
      )
    global.fetch = fetchMock as unknown as typeof fetch

    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'server-outdated' })
    await expect(pushSnapshot(snapshot, 0)).resolves.toEqual({ status: 'server-outdated' })
    // A reload would load the very same build: nothing to ask the user for.
    expect(usePlanSyncStore.getState().reloadNotice).toBeNull()
    expect(isSchemaBlocked()).toBe(false)

    // The server is rolled forward again: the same tab simply carries on.
    rolledBack = false
    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'ok', blob: null, rev: 4 })
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('treats a 409 outdated-client from the GET the same way as from the PUT', async () => {
    global.fetch = jest
      .fn()
      .mockImplementation(async () =>
        respond(409, { error: 'outdated-client', schemaVersion: PLAN_SCHEMA_VERSION + 1 })
      ) as unknown as typeof fetch

    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'outdated' })
    expect(isSchemaBlocked()).toBe(true)
  })

  it('keeps any other 409 a plain, retryable error', async () => {
    global.fetch = jest
      .fn()
      .mockImplementation(async () =>
        respond(409, { error: 'something-else' })
      ) as unknown as typeof fetch

    await expect(fetchRemoteSnapshot()).resolves.toEqual({ status: 'error' })
    expect(isSchemaBlocked()).toBe(false)
    expect(usePlanSyncStore.getState().reloadNotice).toBeNull()
  })

  it('only escalates the reload notice', () => {
    const { requestReload } = usePlanSyncStore.getState()
    requestReload('suggested')
    expect(usePlanSyncStore.getState().reloadNotice).toBe('suggested')
    requestReload('required')
    requestReload('suggested')
    expect(usePlanSyncStore.getState().reloadNotice).toBe('required')
  })
})
