import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import {
  applyCashFlows,
  buildCashFlowSeries,
  cashFlowSignature,
  cashFlowsEqual,
  enabledCashFlows,
  firstPensionAge,
  isCashFlowEnabled,
  isStatutoryPensionSwitchedOff,
  netPensionAnnualAtAge,
  pensionMonthlyAtAge,
  projectCustomExpenses,
  projectOneTimeIncomes,
  reconcileCashFlows,
  sanitizeCashFlows,
  STATUTORY_PENSION_FLOW_ID,
  statutoryPensionMonthly,
  switchedOffPensions,
  withCashFlowEnabled,
  withCashFlowProjections,
  withStatutoryPension,
} from '@/lib/simulation/cashFlows'
import {
  buildAssumptionRows,
  buildFlowSwitchRows,
  comparisonFingerprint,
  diffFlowSwitches,
  diffParams,
  withSwitchesOf,
} from '@/lib/simulation/planDiff'
import { areSimulationParamsEqual, buildScenarioParams } from '@/lib/simulation/planInsights'
import { simulationFingerprint } from '@/lib/simulation/context'
import {
  buildFlowToggleParams,
  flowPlanTotal,
  isEventLikeFlow,
  selectUncertainFlows,
} from '@/lib/simulation/uncertainFlows'
import { normalizePersistedParams } from '@/lib/stores/normalizeParams'
import { computeBridgeAnalysis } from '@/lib/insights/bridge'
import { transformToReportData } from '@/lib/transformers/reportDataTransformer'
import { mapReportDataToContent } from '@/lib/pdf-generator/reportTypes'
import { ReportDataSchema } from '@/lib/pdf-generator/schema/reportData'
import { buildMethodologyCopy } from '@/lib/pdf-generator/methodologyCopy'
import { allPensionsSwitchedOff } from '@/lib/pdf-generator/pensionSwitch'
import { deriveKeyFindings } from '@/lib/pdf-generator/insights/keyFindings'
import { DEFAULT_PARAMS, type CashFlow, type SimulationParams } from '@/types'

/**
 * Flow switches (`CashFlow.enabled`): a switched-off flow stays in the plan
 * but is invisible to every calculation, and the legacy projections
 * (`customExpenses`, `oneTimeIncomes`, `monthlyPension`) can neither drop nor
 * resurrect it.
 */

const statutory: CashFlow = {
  id: STATUTORY_PENSION_FLOW_ID,
  kind: 'pension',
  nameKey: 'statutoryPension',
  name: 'Statutory pension',
  amount: 2_400,
  frequency: 'monthly',
  inflationLinked: false,
}

/** One flow of every shape the projections treat differently. */
const EVERY_KIND: CashFlow[] = [
  statutory,
  { id: 'food', kind: 'expense', name: 'Groceries', amount: 900, frequency: 'monthly' },
  { id: 'trips', kind: 'expense', name: 'Trips', amount: 4_000, frequency: 'annual' },
  {
    id: 'care',
    kind: 'expense',
    name: 'Care',
    amount: 2_000,
    frequency: 'monthly',
    startAge: 82,
    endAge: 90,
  },
  { id: 'roof', kind: 'expense', name: 'Roof', amount: 30_000, frequency: 'once', startAge: 64 },
  {
    id: 'rent',
    kind: 'income',
    name: 'Rent',
    amount: 900,
    frequency: 'monthly',
    startAge: 62,
    endAge: 70,
  },
  {
    id: 'inheritance',
    kind: 'income',
    name: 'Inheritance',
    amount: 80_000,
    frequency: 'once',
    startAge: 70,
  },
  {
    id: 'company',
    kind: 'pension',
    name: 'Company pension',
    amount: 600,
    frequency: 'monthly',
    startAge: 63,
    inflationLinked: false,
  },
]

const plan = (flows: CashFlow[] = EVERY_KIND, overrides: Partial<SimulationParams> = {}) =>
  applyCashFlows({
    ...DEFAULT_PARAMS,
    currentAge: 55,
    retirementAge: 62,
    legalRetirementAge: 67,
    endAge: 90,
    simulationRuns: 200,
    cashFlows: flows,
    ...overrides,
  })

const switchOff = (flows: CashFlow[], id: string) =>
  flows.map((flow) => (flow.id === id ? withCashFlowEnabled(flow, false) : flow))

describe('the switch itself', () => {
  it('is on by default and stored only when off', () => {
    const [flow] = sanitizeCashFlows([{ ...EVERY_KIND[1] }])
    expect(isCashFlowEnabled(flow)).toBe(true)
    expect('enabled' in flow).toBe(false)
    const off = withCashFlowEnabled(flow, false)
    expect(off.enabled).toBe(false)
    // Switching back leaves the flow byte-identical to before.
    expect(withCashFlowEnabled(off, true)).toEqual(flow)
    expect(sanitizeCashFlows([{ ...flow, enabled: true }])[0]).toEqual(flow)
    expect(sanitizeCashFlows([off])[0].enabled).toBe(false)
  })
})

describe('projections and reconcile', () => {
  it.each(EVERY_KIND.map((flow) => [flow.id]))(
    'a switched-off %s is kept, untouched, by every round trip',
    (id) => {
      const params = plan(switchOff(EVERY_KIND, id))
      const off = params.cashFlows.find((flow) => flow.id === id)!
      expect(off.enabled).toBe(false)

      // Projections never mention it.
      expect(params.customExpenses.some((expense) => expense.id === id)).toBe(false)
      expect(params.oneTimeIncomes.some((income) => income.name === off.name)).toBe(false)

      // Legacy-first reconcile of consistent params is the identity.
      const reconciled = reconcileCashFlows(params)
      expect(reconciled).toEqual(params.cashFlows)
      expect(withCashFlowProjections(params)).toEqual(params)
      // …and idempotent.
      expect(reconcileCashFlows({ ...params, cashFlows: reconciled })).toEqual(reconciled)
      // The persisted round trip keeps it too.
      const restored = normalizePersistedParams(JSON.parse(JSON.stringify(params)))
      expect(restored.cashFlows).toEqual(params.cashFlows)
      expect(restored.customExpenses).toEqual(params.customExpenses)
      expect(restored.oneTimeIncomes).toEqual(params.oneTimeIncomes)
      expect(restored.monthlyPension).toBe(params.monthlyPension)
    }
  )

  it('projections omit switched-off flows', () => {
    const flows = switchOff(switchOff(EVERY_KIND, 'food'), 'inheritance')
    expect(projectCustomExpenses(flows).map((expense) => expense.id)).toEqual(['trips'])
    expect(projectOneTimeIncomes(flows, 55)).toEqual([])
    expect(statutoryPensionMonthly(switchOff(EVERY_KIND, STATUTORY_PENSION_FLOW_ID))).toBe(0)
  })

  it('a stress lever that rewrites customExpenses keeps switched-off flows', () => {
    const params = plan(switchOff(switchOff(EVERY_KIND, 'food'), 'care'))
    // What `lowerSpending` and the quick spending slider do: scale the legacy
    // array only and let reconcile fold it back in.
    const scaled = params.customExpenses.map((expense) => ({
      ...expense,
      amount: Math.round(expense.amount * 0.9),
    }))
    const flows = reconcileCashFlows({ ...params, customExpenses: scaled })
    expect(flows.find((flow) => flow.id === 'food')).toEqual(
      params.cashFlows.find((flow) => flow.id === 'food')
    )
    expect(flows.find((flow) => flow.id === 'care')).toEqual(
      params.cashFlows.find((flow) => flow.id === 'care')
    )
    expect(flows.find((flow) => flow.id === 'trips')!.amount).toBe(3_600)
    expect(flows).toHaveLength(EVERY_KIND.length)
  })

  it('a stale expense entry for a switched-off flow is absorbed, never re-added', () => {
    const base = plan()
    // Switched off without re-projecting: the array still lists the expense.
    const flows = reconcileCashFlows({ ...base, cashFlows: switchOff(base.cashFlows, 'food') })
    expect(flows).toHaveLength(EVERY_KIND.length)
    expect(flows.find((flow) => flow.id === 'food')!.enabled).toBe(false)
  })

  it('an income added through the legacy list next to an equal switched-off one is new', () => {
    // The wizard's one-off list writes `oneTimeIncomes`; it cannot see the
    // switched-off inheritance and may add the very same windfall again.
    const params = plan(switchOff(EVERY_KIND, 'inheritance'))
    const flows = reconcileCashFlows({
      ...params,
      oneTimeIncomes: [{ name: 'Inheritance', age: 70, amount: 80_000 }],
    })
    const inheritances = flows.filter((flow) => flow.name === 'Inheritance')
    expect(inheritances.map((flow) => isCashFlowEnabled(flow))).toEqual([false, true])
  })

  it('the lowerSpending lever leaves switched-off expenses alone', () => {
    const params = plan(switchOff(EVERY_KIND, 'care'))
    const lower = buildScenarioParams(params).find((entry) => entry.id === 'lowerSpending')!
    expect(lower.params.cashFlows.find((flow) => flow.id === 'care')!.amount).toBe(2_000)
    expect(lower.params.cashFlows.find((flow) => flow.id === 'food')!.amount).toBe(810)
  })
})

describe('the statutory pension switch', () => {
  const off = () => plan(switchOff(EVERY_KIND, STATUTORY_PENSION_FLOW_ID))

  it('projects monthlyPension 0 and survives every round trip', () => {
    const params = off()
    expect(params.monthlyPension).toBe(0)
    expect(isStatutoryPensionSwitchedOff(params.cashFlows)).toBe(true)
    // monthlyPension = 0 would delete an enabled statutory pension; a
    // switched-off one is out of the legacy field's reach.
    const again = withCashFlowProjections(params)
    expect(again.cashFlows).toEqual(params.cashFlows)
    expect(again.cashFlows.find((flow) => flow.id === STATUTORY_PENSION_FLOW_ID)!.amount).toBe(
      2_400
    )
    expect(normalizePersistedParams(params).cashFlows).toEqual(params.cashFlows)
  })

  it('ignores legacy monthlyPension writes while off (neither deleted nor re-enabled)', () => {
    const flows = off().cashFlows
    expect(withStatutoryPension(flows, 0)).toEqual(flows)
    expect(withStatutoryPension(flows, 3_000)).toEqual(flows)
    expect(reconcileCashFlows({ cashFlows: flows, monthlyPension: 1_234 })).toEqual(flows)
    // Switched on, the legacy field is authoritative again.
    const on = flows.map((flow) => withCashFlowEnabled(flow, true))
    expect(
      withStatutoryPension(on, 3_000).find((flow) => flow.id === STATUTORY_PENSION_FLOW_ID)!.amount
    ).toBe(3_000)
    expect(withStatutoryPension(on, 0).some((flow) => flow.id === STATUTORY_PENSION_FLOW_ID)).toBe(
      false
    )
  })

  it('counts in no pension figure', () => {
    const flows = off().cashFlows
    const context = { currentAge: 55, legalRetirementAge: 67, pensionTaxRate: 0.2 }
    expect(pensionMonthlyAtAge(flows, 70, 67).total).toBe(600)
    expect(firstPensionAge(flows, 67)).toBe(63)
    expect(netPensionAnnualAtAge(flows, 70, context)).toBe(
      netPensionAnnualAtAge(
        flows.filter((flow) => flow.id !== STATUTORY_PENSION_FLOW_ID),
        70,
        context
      )
    )
    // With the company pension off too the bridge runs to the statutory age.
    const none = switchOff(flows, 'company')
    expect(firstPensionAge(none, 67)).toBe(67)
    expect(computeBridgeAnalysis(plan(none), { unit: 'real' }).endAge).toBe(
      computeBridgeAnalysis(
        plan(
          none.filter((flow) => flow.kind !== 'pension'),
          { monthlyPension: 0 }
        ),
        { unit: 'real' }
      ).endAge
    )
  })
})

describe('every pension switched off', () => {
  const statutoryOnly = [statutory, EVERY_KIND[1]]

  it('names the case only when no pension counts but one is kept', () => {
    expect(switchedOffPensions(EVERY_KIND)).toBeNull()
    expect(switchedOffPensions([EVERY_KIND[1]])).toBeNull()
    expect(switchedOffPensions(undefined)).toBeNull()
    // The company pension still pays: not "switched off".
    expect(switchedOffPensions(switchOff(EVERY_KIND, STATUTORY_PENSION_FLOW_ID))).toBeNull()
    expect(switchedOffPensions(switchOff(statutoryOnly, STATUTORY_PENSION_FLOW_ID))).toEqual({
      count: 1,
      statutory: true,
    })
    expect(
      switchedOffPensions(switchOff(switchOff(EVERY_KIND, STATUTORY_PENSION_FLOW_ID), 'company'))
    ).toEqual({ count: 2, statutory: false })
  })
})

describe('calculations', () => {
  const deleted = (id: string) => plan(EVERY_KIND.filter((flow) => flow.id !== id))
  const disabled = (id: string) => plan(switchOff(EVERY_KIND, id))

  it.each(EVERY_KIND.map((flow) => [flow.id]))(
    'switching off %s gives exactly the results of deleting it (same seed)',
    (id) => {
      const { params: _a, ...off } = runMonteCarloSimulation(disabled(id), { seed: 42 })
      const { params: _b, ...gone } = runMonteCarloSimulation(deleted(id), { seed: 42 })
      void _a
      void _b
      expect(off).toEqual(gone)
      // …and differ from the plan with it on, so the test can fail.
      const { params: _c, ...on } = runMonteCarloSimulation(plan(), { seed: 42 })
      void _c
      expect(on).not.toEqual(off)
    }
  )

  it('the per-age series skips a switched-off flow', () => {
    const series = (flows: CashFlow[]) =>
      buildCashFlowSeries(flows, 55, 90, { legalRetirementAge: 67, currentAge: 55 })
    expect(series(switchOff(EVERY_KIND, 'rent'))).toEqual(
      series(EVERY_KIND.filter((flow) => flow.id !== 'rent'))
    )
    expect(series(switchOff(EVERY_KIND, 'food')).baselineMonthly).toBe(0)
  })

  it('enabledCashFlows is the list a calculation may see', () => {
    expect(enabledCashFlows(switchOff(EVERY_KIND, 'roof')).map((flow) => flow.id)).not.toContain(
      'roof'
    )
    expect(enabledCashFlows(undefined)).toEqual([])
  })
})

describe('identity, dirty state and comparison', () => {
  it('the signature, fingerprints and equality see the switch', () => {
    const on = plan()
    const off = plan(switchOff(EVERY_KIND, 'inheritance'))
    expect(cashFlowSignature(on.cashFlows)).not.toEqual(cashFlowSignature(off.cashFlows))
    expect(cashFlowsEqual(on.cashFlows, off.cashFlows)).toBe(false)
    expect(areSimulationParamsEqual(on, off)).toBe(false)
    expect(simulationFingerprint(on)).not.toBe(simulationFingerprint(off))
    expect(comparisonFingerprint(on)).not.toBe(comparisonFingerprint(off))
    // An enabled flow's signature is unchanged by the feature.
    expect(cashFlowSignature([EVERY_KIND[1]])).toEqual([
      'food|expense|Groceries|900|monthly|||linked|0|||',
    ])
  })

  it('a flow that differs only in its switch is one compare row', () => {
    const on = plan()
    const off = plan(switchOff(EVERY_KIND, 'inheritance'))
    expect(buildFlowSwitchRows([on, off])).toEqual([
      { id: 'inheritance', name: 'Inheritance', values: ['on', 'off'] },
    ])
    expect(buildFlowSwitchRows([on, on])).toEqual([])
    // Off in both: no difference to show.
    expect(buildFlowSwitchRows([off, off])).toEqual([])
    const changes = diffFlowSwitches(on, off)
    expect(changes).toEqual([
      {
        key: 'flow:inheritance',
        kind: 'flowSwitch',
        from: 'on',
        to: 'off',
        flow: { name: 'Inheritance' },
      },
    ])
    // Once the switch is named, nothing else is left to report…
    expect(diffParams(withSwitchesOf(on, off), off)).toEqual([])
    // …while the plain diff does see what the switch moved.
    expect(diffParams(on, off).length).toBeGreaterThan(0)
  })

  it('switched-off flows are not counted as scheduled items', () => {
    const rows = (params: SimulationParams) =>
      Object.fromEntries(buildAssumptionRows([params]).map((row) => [row.key, row.values[0]]))
    const off = plan(switchOff(switchOff(EVERY_KIND, 'care'), 'food'))
    const gone = plan(EVERY_KIND.filter((flow) => flow.id !== 'care' && flow.id !== 'food'))
    expect(rows(off)).toEqual(rows(gone))
  })
})

describe('uncertain items (levers)', () => {
  it('lists events, not living costs or the statutory pension', () => {
    expect(EVERY_KIND.filter(isEventLikeFlow).map((flow) => flow.id)).toEqual([
      'care',
      'roof',
      'rent',
      'inheritance',
      'company',
    ])
  })

  it('picks the largest by plan total, switched-off ones included, capped', () => {
    const params = plan(switchOff(EVERY_KIND, 'inheritance'))
    const inheritance = params.cashFlows.find((flow) => flow.id === 'inheritance')!
    expect(flowPlanTotal(inheritance, params)).toBe(80_000)
    const { flows, hidden } = selectUncertainFlows(params, 3)
    expect(flows.map((flow) => flow.id)).toEqual(['care', 'company', 'rent'])
    expect(hidden).toBe(2)
    expect(selectUncertainFlows(params).flows).toHaveLength(5)
  })

  it('the measured scenario switches exactly one flow, flows-first', () => {
    const params = plan()
    const without = buildFlowToggleParams(params, 'inheritance')
    expect(without.cashFlows.find((flow) => flow.id === 'inheritance')!.enabled).toBe(false)
    expect(without.oneTimeIncomes).toEqual([])
    const back = buildFlowToggleParams(without, 'inheritance')
    expect(back).toEqual(params)
  })
})

describe('report', () => {
  const results = (params: SimulationParams) =>
    runMonteCarloSimulation({ ...params, simulationRuns: 50 })

  it('leaves switched-off flows out of every figure and names them once', () => {
    const params = plan(switchOff(switchOff(EVERY_KIND, 'inheritance'), STATUTORY_PENSION_FLOW_ID))
    const data = transformToReportData(params, results(params), 'Plan', 'de')
    expect(data.spending.cashFlows.map((flow) => flow.id)).not.toContain('inheritance')
    expect(data.spending.switchedOffFlows.map((flow) => flow.id)).toEqual([
      STATUTORY_PENSION_FLOW_ID,
      'inheritance',
    ])
    // Only the company pension pays at 67.
    expect(data.finances.expectedMonthlyPensionEUR).toBe(600)

    const parsed = ReportDataSchema.parse({ ...data, locale: 'de' })
    const content = mapReportDataToContent(parsed)
    expect(content.expenses.switchedOffFlows!.map((flow) => flow.name)).toEqual([
      'Gesetzliche Rente',
      'Inheritance',
    ])
  })

  it('describes no switched-off pension as paid or taxed', () => {
    const reportOf = (flows: CashFlow[]) => {
      const params = plan(flows)
      const data = transformToReportData(params, results(params), 'Plan', 'de')
      return mapReportDataToContent(ReportDataSchema.parse({ ...data, locale: 'de' }))
    }
    const pensionOff = reportOf(switchOff([statutory, EVERY_KIND[1]], STATUTORY_PENSION_FLOW_ID))
    expect(allPensionsSwitchedOff(pensionOff.expenses)).toBe(true)
    const [, tax] = buildMethodologyCopy(pensionOff).limitations
    expect(tax).not.toContain('gesetzliche Rente')
    expect(tax).toContain('Kapitalerträge werden bei Realisierung')
    const coverage = deriveKeyFindings(pensionOff).find(
      (finding) => finding.id === 'pensionCoverage'
    )
    expect(coverage?.text).toContain('Keine Rente berücksichtigt')
    expect(coverage?.text).not.toContain('deckt die Rente')

    // With the pension on, the sentences are unchanged.
    const pensionOn = reportOf([statutory, EVERY_KIND[1]])
    expect(allPensionsSwitchedOff(pensionOn.expenses)).toBe(false)
    expect(buildMethodologyCopy(pensionOn).limitations[1]).toContain(
      'Die gesetzliche Rente wird zu'
    )
    expect(
      deriveKeyFindings(pensionOn).find((finding) => finding.id === 'pensionCoverage')?.text
    ).toContain('deckt die Rente')
  })
})
