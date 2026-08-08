import type { CashFlowTemplate } from '@/components/forms/fields/CashFlowList'

/**
 * Starter flows for a German retirement plan, positioned against the user's own
 * ages rather than fixed years: the point of a template is that clicking it
 * produces something already true for *this* plan.
 *
 * Names come from the caller's translations, so the same list reads as
 * "Teilzeit-Einkommen" in German and "Part-time income" in English.
 */
export function buildCashFlowTemplates(
  t: (key: string) => string,
  ages: { currentAge: number; retirementAge: number; legalRetirementAge: number; endAge: number }
): CashFlowTemplate[] {
  const { currentAge, retirementAge, legalRetirementAge, endAge } = ages
  const clampAge = (age: number) => Math.min(endAge, Math.max(currentAge, Math.round(age)))

  return [
    {
      key: 'partTime',
      kind: 'income',
      name: t('partTime'),
      amount: 1500,
      frequency: 'monthly',
      // Bridging work: from the moment the salary stops to the state pension.
      startAge: clampAge(retirementAge),
      endAge: clampAge(Math.min(legalRetirementAge, retirementAge + 5)),
    },
    {
      key: 'rental',
      kind: 'income',
      name: t('rental'),
      amount: 900,
      frequency: 'monthly',
    },
    {
      key: 'riester',
      kind: 'income',
      name: t('riester'),
      amount: 25000,
      frequency: 'once',
      startAge: clampAge(legalRetirementAge),
    },
    {
      key: 'partnerPension',
      kind: 'income',
      name: t('partnerPension'),
      amount: 800,
      frequency: 'monthly',
      startAge: clampAge(legalRetirementAge),
    },
    {
      key: 'care',
      kind: 'expense',
      name: t('care'),
      amount: 2500,
      frequency: 'monthly',
      // The last decade of the plan is where care costs realistically land.
      startAge: clampAge(endAge - 10),
      endAge: clampAge(endAge),
    },
    {
      key: 'roof',
      kind: 'expense',
      name: t('roof'),
      amount: 25000,
      frequency: 'once',
      startAge: clampAge(currentAge + 5),
    },
  ]
}
