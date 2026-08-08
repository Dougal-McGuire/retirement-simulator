import { DEFAULT_PARAMS, type CashFlow, type SimulationParams } from '@/types'
import { applyCashFlows } from '@/lib/simulation/cashFlows'

/** Translation key the demo plan carries, so its name follows the UI language. */
export const DEMO_PLAN_NAME_KEY = 'demo'

/**
 * A furnished example plan, for the visitor who wants to see what the tool does
 * before typing their own salary into it.
 *
 * `DEFAULT_PARAMS` is deliberately plain — it is the starting point of a real
 * plan — which makes it a poor demonstration: no age windows, no one-off
 * payments, no bequest goal, so half the dashboard has nothing to show. This
 * one exercises the parts a stranger would otherwise never see: a part-time
 * income that stops at the state pension, a roof repair in a single year, care
 * costs in the last decade, a bequest target and the allocation glide path.
 *
 * It is an ordinary plan in every other respect — editable, comparable and
 * deletable like any other — and carries {@link DEMO_PLAN_NAME_KEY} so the
 * plan switcher can label it as the example rather than as the user's own work.
 */
export function buildDemoPlanParams(): SimulationParams {
  const cashFlows: CashFlow[] = [
    ...DEFAULT_PARAMS.cashFlows,
    {
      id: 'demo-parttime',
      kind: 'income',
      nameKey: 'demoPartTime',
      name: 'Part-time consulting',
      amount: 1800,
      frequency: 'monthly',
      // Bridges the gap between leaving full-time work and the state pension.
      startAge: 62,
      endAge: 66,
    },
    {
      id: 'demo-inheritance',
      kind: 'income',
      nameKey: 'demoInheritance',
      name: 'Inheritance',
      amount: 80000,
      frequency: 'once',
      startAge: 70,
    },
    {
      id: 'demo-roof',
      kind: 'expense',
      nameKey: 'demoRoof',
      name: 'Roof renovation',
      amount: 28000,
      frequency: 'once',
      startAge: 64,
    },
    {
      id: 'demo-care',
      kind: 'expense',
      nameKey: 'demoCare',
      name: 'Care costs',
      amount: 2200,
      frequency: 'monthly',
      startAge: 82,
      endAge: 90,
      // Care inflation runs ahead of the general index; this is the one place
      // the extra-growth field earns its keep.
      growthRate: 0.015,
    },
  ]

  return applyCashFlows({
    ...DEFAULT_PARAMS,
    currentAge: 52,
    retirementAge: 62,
    legalRetirementAge: 67,
    endAge: 92,
    currentAssets: 540000,
    annualSavings: 36000,
    monthlyPension: 2400,
    householdType: 'couple',
    // A bequest goal turns the success gauge into a strictly harder question,
    // which is exactly the behaviour the example is meant to demonstrate.
    legacyTargetReal: 150000,
    glidePathEnabled: true,
    cashFlows,
  })
}
