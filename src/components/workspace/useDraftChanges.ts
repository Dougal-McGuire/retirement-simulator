'use client'

import { useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { CashFlowFrequency, SimulationParams } from '@/types'
import { useAssumptionValueFormatter } from '@/components/plans/useAssumptionFormat'
import { useMoney } from '@/lib/hooks/useMoney'
import { cashFlowDisplayName } from '@/lib/plans/cashFlowName'
import { buildDraftChanges, type DraftChange } from '@/lib/simulation/draftChanges'
import { useSimulationStore } from '@/lib/stores/simulationStore'

const NONE: readonly DraftChange[] = []

/**
 * The last diff, by object identity: the head's chips, the dock's count, the
 * bar's marker and the group dots all ask for the same pair in one render.
 */
let last: { saved: SimulationParams; draft: SimulationParams; changes: DraftChange[] } | null = null

export function draftChangesFor(saved: SimulationParams, draft: SimulationParams): DraftChange[] {
  if (last?.saved === saved && last.draft === draft) return last.changes
  const changes = buildDraftChanges(saved, draft)
  last = { saved, draft, changes }
  return changes
}

/**
 * What the working copy changes against the saved plan (empty while clean).
 * Re-renders its caller on every edit of a dirty plan; use it in small leaves.
 */
export function useDraftChanges(): readonly DraftChange[] {
  const saved = useSimulationStore(
    (state) => state.plans.find((plan) => plan.id === state.activePlanId)?.params
  )
  const draft = useSimulationStore((state) => (state.isDirty ? state.params : null))
  return useMemo(() => (saved && draft ? draftChangesFor(saved, draft) : NONE), [saved, draft])
}

/** How many changes the draft holds — a number, so the caller re-renders only when it moves. */
export function useDraftChangeCount(): number {
  return useSimulationStore((state) => {
    if (!state.isDirty) return 0
    const saved = state.plans.find((plan) => plan.id === state.activePlanId)?.params
    return saved ? draftChangesFor(saved, state.params).length : 0
  })
}

/** Takes one change back: writes the working copy, like any other edit. */
export function revertDraftChange(change: DraftChange): void {
  const state = useSimulationStore.getState()
  state.updateParams(change.revert(state.params))
}

/** An amount with its time base: "1.850 €/Mon.", "12.000 €/Jahr", "125.000 € einmalig". */
export function useAmountWithUnit(): (amount: number, frequency: CashFlowFrequency) => string {
  const t = useTranslations('workspace.units')
  const money = useMoney()
  return useCallback(
    (amount: number, frequency: CashFlowFrequency) => t(frequency, { amount: money.full(amount) }),
    [t, money]
  )
}

/**
 * A change in words: "Ruhestart 62 → 64", "Kapitaloption aus",
 * "Krankenversicherung 1.300 € → 1.400 €/Mon.". Values are formatted by the
 * comparison's formatter, so a chip and a comparison row read the same.
 */
export function useChangeLabel(): (change: DraftChange) => string {
  const t = useTranslations('workspace.changes')
  const tFlows = useTranslations('setup.cashFlows')
  const formatValue = useAssumptionValueFormatter()
  const money = useMoney()
  const withUnit = useAmountWithUnit()

  return useCallback(
    (change: DraftChange) => {
      if (change.type === 'field') {
        return t('field', {
          label: t(`fields.${change.key}`),
          from: formatValue(change.from, change.kind),
          to: formatValue(change.to, change.kind),
        })
      }
      const name = cashFlowDisplayName(change.flow, (key) => tFlows(`defaults.${key}`))
      switch (change.type) {
        case 'flowSwitch':
          return t(change.to === 'off' ? 'flowOff' : 'flowOn', { name })
        case 'flowAdded':
          return t('flowAdded', { name })
        case 'flowRemoved':
          return t('flowRemoved', { name })
        case 'flowTerms':
          return change.amount
            ? t('flowAmount', {
                name,
                from: money.full(change.amount.from),
                to: withUnit(change.amount.to, change.frequency),
              })
            : t('flowChanged', { name })
      }
    },
    [t, tFlows, formatValue, money, withUnit]
  )
}
