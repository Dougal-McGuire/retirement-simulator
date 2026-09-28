import type { ReportExpenses } from '@/lib/pdf-generator/reportTypes'

/**
 * The plan keeps its pension(s) but every one is switched off: no pension is
 * in any figure of the report, so no sentence may describe one as paid or
 * taxed. False when a pension counts, and for plans without any pension
 * (or payloads from before flow switches), whose copy is unchanged.
 */
export function allPensionsSwitchedOff(
  expenses: Pick<ReportExpenses, 'scheduledFlows' | 'switchedOffFlows'>
): boolean {
  const off = (expenses.switchedOffFlows ?? []).some((flow) => flow.kind === 'pension')
  const on = expenses.scheduledFlows.some((flow) => flow.kind === 'pension')
  return off && !on
}
