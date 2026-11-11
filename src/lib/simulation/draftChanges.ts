import type { CashFlow, CashFlowFrequency, SimulationParams } from '@/types'
import { isCashFlowEnabled, withCashFlowEnabled } from '@/lib/simulation/cashFlows'
import {
  matchFlowsAcrossPlans,
  type AssumptionKind,
  type FlowSwitchState,
} from '@/lib/simulation/planDiff'

/**
 * What the working copy changes against the saved plan, one entry per change
 * the reader made — each with the patch that takes exactly that change back.
 *
 * The comparison's assumption rows (`planDiff.buildAssumptionRows`, which the
 * save-as-variant dialog lists) answer "how do two plans differ" and fold the
 * flows into sums: one changed expense moves "monthly spending", a second one
 * moves it again. A sum cannot be taken back, so the changes here go one
 * level down: every plan field on its own, and every flow on its own — lined
 * up by the comparison's one matcher (`matchFlowsAcrossPlans`), with the same
 * value kinds, so a chip and a comparison row format a value the same way.
 *
 * Pure: no React, no store. The UI turns `key` and `flow` into words.
 */

/** The group of the control column a change belongs to (`ColumnGroup`). */
export type DraftChangeGroup = 'person' | 'savings' | 'flows' | 'rule' | 'market'

interface DraftChangeBase {
  /** Stable while the change exists: `field:retirementAge`, `flow:health:terms`. */
  id: string
  group: DraftChangeGroup
  /** The partial update that undoes exactly this change on the current draft. */
  revert: (draft: SimulationParams) => Partial<SimulationParams>
}

/** One plan field: "Ruhestart 62 → 64". */
export interface FieldChange extends DraftChangeBase {
  type: 'field'
  /** The parameter name; also the label key. */
  key: string
  kind: AssumptionKind
  from: number | string
  to: number | string
}

export interface FlowIdentity {
  id: string
  name: string
  nameKey?: string
  kind: CashFlow['kind']
}

/** One flow switched on or off: "Kapitaloption aus". */
export interface FlowSwitchChange extends DraftChangeBase {
  type: 'flowSwitch'
  flow: FlowIdentity
  from: FlowSwitchState
  to: FlowSwitchState
}

/** A flow the draft adds or drops. */
export interface FlowPresenceChange extends DraftChangeBase {
  type: 'flowAdded' | 'flowRemoved'
  flow: FlowIdentity
  amount: number
  frequency: CashFlowFrequency
}

/**
 * A flow whose terms differ. `amount` is set when the amount is all that
 * changed ("Krankenversicherung 1.300 → 1.400 €/Mon."); anything else — the
 * window, the frequency, the name, tax or indexing — reads "geändert".
 */
export interface FlowTermsChange extends DraftChangeBase {
  type: 'flowTerms'
  flow: FlowIdentity
  frequency: CashFlowFrequency
  amount?: { from: number; to: number }
}

export type DraftChange = FieldChange | FlowSwitchChange | FlowPresenceChange | FlowTermsChange

interface FieldSpec {
  key: keyof SimulationParams
  group: DraftChangeGroup
  kind: AssumptionKind
}

/**
 * Every plan field that is a value of its own, in the column's order. The
 * list fields are not here: `cashFlows` is diffed per flow below, and
 * `customExpenses`, `oneTimeIncomes` and `monthlyPension` are projections of
 * it that the store rewrites on every edit.
 */
const FIELD_SPECS: readonly FieldSpec[] = [
  { key: 'currentAge', group: 'person', kind: 'age' },
  { key: 'retirementAge', group: 'person', kind: 'age' },
  { key: 'legalRetirementAge', group: 'person', kind: 'age' },
  { key: 'endAge', group: 'person', kind: 'age' },

  { key: 'currentAssets', group: 'savings', kind: 'currency' },
  { key: 'annualSavings', group: 'savings', kind: 'currency' },
  { key: 'annualSavingsGrowthRate', group: 'savings', kind: 'rate' },

  { key: 'withdrawalStrategy', group: 'rule', kind: 'strategy' },
  { key: 'dsWithdrawalRate', group: 'rule', kind: 'rate' },
  { key: 'dsCeilingRate', group: 'rule', kind: 'rate' },
  { key: 'dsFloorRate', group: 'rule', kind: 'rate' },
  { key: 'spendingFloorReal', group: 'rule', kind: 'currency' },

  { key: 'marketModel', group: 'market', kind: 'marketModel' },
  { key: 'averageROI', group: 'market', kind: 'rate' },
  { key: 'roiVolatility', group: 'market', kind: 'rate' },
  { key: 'averageInflation', group: 'market', kind: 'rate' },
  { key: 'inflationVolatility', group: 'market', kind: 'rate' },
  { key: 'glidePathEnabled', group: 'market', kind: 'toggle' },
  { key: 'equityAllocationStart', group: 'market', kind: 'rate' },
  { key: 'equityAllocationEnd', group: 'market', kind: 'rate' },
  { key: 'bondReturn', group: 'market', kind: 'rate' },
  { key: 'bondVolatility', group: 'market', kind: 'rate' },
  { key: 'simulationRuns', group: 'market', kind: 'count' },
  { key: 'capitalGainsTax', group: 'market', kind: 'percentPoints' },
  { key: 'taxAllowanceAnnual', group: 'market', kind: 'currency' },
  { key: 'householdType', group: 'market', kind: 'householdType' },
  { key: 'equityFundExemption', group: 'market', kind: 'rate' },
  { key: 'pensionTaxablePortion', group: 'market', kind: 'rate' },
  { key: 'pensionTaxRate', group: 'market', kind: 'rate' },
  { key: 'legacyTargetReal', group: 'market', kind: 'currency' },
]

/** The parameter names a field chip can carry (label keys). */
export const DRAFT_FIELD_KEYS: readonly string[] = FIELD_SPECS.map((spec) => spec.key)

/** Rates are stored as fractions; compare them with a tolerance to avoid float noise. */
const EPSILON = 1e-9

const sameValue = (a: unknown, b: unknown): boolean =>
  typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) <= EPSILON : a === b

/** A field as a change shows it: booleans read as the comparison's on/off. */
const display = (value: unknown): number | string =>
  typeof value === 'boolean' ? (value ? 'on' : 'off') : (value as number | string)

const switchState = (flow: CashFlow): FlowSwitchState => (isCashFlowEnabled(flow) ? 'on' : 'off')

const identity = (flow: CashFlow): FlowIdentity => ({
  id: flow.id,
  name: flow.name,
  ...(flow.nameKey !== undefined ? { nameKey: flow.nameKey } : {}),
  kind: flow.kind,
})

/** A flow's terms: everything but its switch, in a stable key order. */
const termsOf = (flow: CashFlow): string => {
  const { enabled: _enabled, ...terms } = flow
  void _enabled
  return JSON.stringify(
    Object.keys(terms)
      .sort()
      .map((key) => [key, (terms as Record<string, unknown>)[key]])
      .filter(([, value]) => value !== undefined)
  )
}

/** True when the two flows differ in their amount and in nothing else. */
const onlyAmountDiffers = (saved: CashFlow, draft: CashFlow): boolean =>
  saved.amount !== draft.amount && termsOf({ ...saved, amount: draft.amount }) === termsOf(draft)

const flowsOf = (params: SimulationParams): CashFlow[] => params.cashFlows ?? []

const replaceFlow = (
  draft: SimulationParams,
  id: string,
  next: (flow: CashFlow) => CashFlow
): Partial<SimulationParams> => ({
  cashFlows: flowsOf(draft).map((flow) => (flow.id === id ? next(flow) : flow)),
})

/**
 * The changes of `draft` against `saved`: plan fields in the column's order,
 * then the flows in the saved plan's list order (added ones last). Empty
 * exactly when the two describe the same plan.
 */
export function buildDraftChanges(saved: SimulationParams, draft: SimulationParams): DraftChange[] {
  const changes: DraftChange[] = []

  for (const spec of FIELD_SPECS) {
    const from = saved[spec.key]
    const to = draft[spec.key]
    if (sameValue(from, to)) continue
    changes.push({
      type: 'field',
      id: `field:${spec.key}`,
      group: spec.group,
      key: spec.key,
      kind: spec.kind,
      from: display(from),
      to: display(to),
      revert: () => ({ [spec.key]: from }) as Partial<SimulationParams>,
    })
  }

  const savedFlows = flowsOf(saved)
  for (const [savedFlow, draftFlow] of matchFlowsAcrossPlans([saved, draft])) {
    if (savedFlow && !draftFlow) {
      const index = savedFlows.indexOf(savedFlow)
      changes.push({
        type: 'flowRemoved',
        id: `flow:${savedFlow.id}:removed`,
        group: 'flows',
        flow: identity(savedFlow),
        amount: savedFlow.amount,
        frequency: savedFlow.frequency,
        // Back where it was in the list, or at the end of a shorter one.
        revert: (current) => {
          const flows = [...flowsOf(current)]
          flows.splice(Math.min(Math.max(0, index), flows.length), 0, savedFlow)
          return { cashFlows: flows }
        },
      })
      continue
    }
    if (!savedFlow && draftFlow) {
      changes.push({
        type: 'flowAdded',
        id: `flow:${draftFlow.id}:added`,
        group: 'flows',
        flow: identity(draftFlow),
        amount: draftFlow.amount,
        frequency: draftFlow.frequency,
        revert: (current) => ({
          cashFlows: flowsOf(current).filter((flow) => flow.id !== draftFlow.id),
        }),
      })
      continue
    }
    if (!savedFlow || !draftFlow) continue

    if (switchState(savedFlow) !== switchState(draftFlow)) {
      changes.push({
        type: 'flowSwitch',
        id: `flow:${draftFlow.id}:switch`,
        group: 'flows',
        flow: identity(draftFlow),
        from: switchState(savedFlow),
        to: switchState(draftFlow),
        revert: (current) =>
          replaceFlow(current, draftFlow.id, (flow) =>
            withCashFlowEnabled(flow, isCashFlowEnabled(savedFlow))
          ),
      })
    }
    if (termsOf(savedFlow) !== termsOf(draftFlow)) {
      changes.push({
        type: 'flowTerms',
        id: `flow:${draftFlow.id}:terms`,
        group: 'flows',
        // Named as the reader knew it before the edit.
        flow: identity(savedFlow),
        frequency: draftFlow.frequency,
        ...(onlyAmountDiffers(savedFlow, draftFlow)
          ? { amount: { from: savedFlow.amount, to: draftFlow.amount } }
          : {}),
        // The saved terms come back; the switch stays as the draft has it
        // (that is a change of its own).
        revert: (current) =>
          replaceFlow(current, draftFlow.id, (flow) =>
            withCashFlowEnabled(savedFlow, isCashFlowEnabled(flow))
          ),
      })
    }
  }

  return changes
}

/** Which column groups hold a change — the dots on the group headers. */
export function changedGroups(changes: readonly DraftChange[]): ReadonlySet<DraftChangeGroup> {
  return new Set(changes.map((change) => change.group))
}
