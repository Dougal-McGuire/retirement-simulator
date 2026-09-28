'use client'

import { memo, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { CustomExpense } from '@/types'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import { hasLifetimeExpenseShape, isStatutoryPensionSwitchedOff } from '@/lib/simulation/cashFlows'
import {
  useActivePlan,
  usePlanIsDirty,
  useSimulationParams,
  useUpdateParams,
} from '@/lib/stores/simulationStore'
import { InlineSlider } from '@/components/simulation-compact/InlineSlider'
import { useWorkspace } from '../WorkspaceProvider'

const sameExpenses = (left: CustomExpense[], right: CustomExpense[]) =>
  JSON.stringify(left) === JSON.stringify(right)

interface QuickLeversProps {
  /**
   * Reports while a slider is held (pointer down): background lever runs wait
   * for the release, so the next drag step never queues behind one.
   */
  onHoldChange?: (holding: boolean) => void
}

/**
 * "Schnell ausprobieren": four what-if sliders that edit the working copy,
 * then "Weitere Regler" for the market and horizon. Every change is a draft —
 * the result bar's Save/Discard is the one way to keep or drop it.
 *
 * The quick-row logic is moved verbatim from the old `CompactCommandBar`
 * (plan-anchored ranges, per-lever reset, and the spending scale that always
 * multiplies from the same base so a drag never compounds rounding).
 */
export const QuickLevers = memo(function QuickLevers({ onHoldChange }: QuickLeversProps) {
  const t = useTranslations('simulationCompact.commandBar')
  const ta = useTranslations('simulationCompact.advanced')
  const tl = useTranslations('workspace.levers')
  const tw = useTranslations('workspace.whatIf')
  const format = useFormatter()
  const params = useSimulationParams()
  const updateParams = useUpdateParams()
  const activePlan = useActivePlan()
  const dirty = usePlanIsDirty()
  const { openEditor } = useWorkspace()
  const [moreOpen, setMoreOpen] = useState(false)

  // ---- Spending scale (verbatim) -------------------------------------------

  const scaleBaseRef = useRef<{ source: CustomExpense[]; monthly: number } | null>(null)
  const emittedRef = useRef<CustomExpense[] | null>(null)

  const expenses = params.customExpenses ?? []
  if (
    scaleBaseRef.current &&
    (!emittedRef.current || !sameExpenses(emittedRef.current, expenses))
  ) {
    scaleBaseRef.current = null
  }

  const planParams = activePlan?.params
  const planExpenses = planParams?.customExpenses ?? expenses
  const combined = useMemo(() => calculateCombinedExpenses(expenses), [expenses])
  const planCombined = useMemo(() => calculateCombinedExpenses(planExpenses), [planExpenses])

  const scaleExpenses = (targetMonthly: number) => {
    const base =
      scaleBaseRef.current ??
      (combined.combinedMonthly > 0
        ? { source: expenses, monthly: combined.combinedMonthly }
        : { source: planExpenses, monthly: planCombined.combinedMonthly })
    scaleBaseRef.current = base
    if (base.monthly <= 0) return

    const factor = targetMonthly / base.monthly
    const next = base.source.map((expense) => ({
      ...expense,
      amount: Math.max(0, Math.round(expense.amount * factor)),
    }))
    emittedRef.current = next
    updateParams({ customExpenses: next })
  }

  /**
   * Back to the plan's spending. Written as flows, not as the legacy array:
   * the array only lists switched-on expenses, so restoring it would drop an
   * expense the draft switched back on. Here every lifetime expense comes
   * back exactly as saved (amount and on/off) and nothing else is touched.
   */
  const resetExpenses = () => {
    scaleBaseRef.current = null
    const planFlows = planParams?.cashFlows ?? []
    const draftFlows = params.cashFlows ?? []
    const savedById = new Map(
      planFlows.filter(hasLifetimeExpenseShape).map((flow) => [flow.id, flow])
    )
    const draftIds = new Set(draftFlows.map((flow) => flow.id))
    const restored = [
      ...draftFlows.flatMap((flow) => {
        if (!hasLifetimeExpenseShape(flow)) return [flow]
        const saved = savedById.get(flow.id)
        return saved ? [{ ...saved }] : []
      }),
      ...[...savedById.values()].filter((flow) => !draftIds.has(flow.id)),
    ]
    emittedRef.current = null
    updateParams({ cashFlows: restored })
  }

  // ---- Held slider → pause background runs ---------------------------------

  const holdingRef = useRef(false)
  const endHold = useRef<() => void>(() => {})
  const onPointerDownCapture = (event: PointerEvent<HTMLDivElement>) => {
    if (!onHoldChange || holdingRef.current) return
    if (!(event.target as Element).closest('.ws-levers-slider-control')) return
    holdingRef.current = true
    onHoldChange(true)
    const release = () => {
      window.removeEventListener('pointerup', release, true)
      window.removeEventListener('pointercancel', release, true)
      holdingRef.current = false
      onHoldChange(false)
    }
    endHold.current = release
    window.addEventListener('pointerup', release, true)
    window.addEventListener('pointercancel', release, true)
  }
  useEffect(() => () => endHold.current(), [])

  // ---- Formatting and ranges -----------------------------------------------

  const currency = (value: number) =>
    format.number(value, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })
  const percent = (value: number, digits = 1) =>
    format.number(value, { style: 'percent', maximumFractionDigits: digits })
  const resetLabel = (label: string) => tl('reset', { label })

  const historical = params.marketModel === 'historical'
  const retirementMin = Math.min(params.retirementAge, params.currentAge)
  const retirementMax = Math.max(params.retirementAge, params.endAge - 1)
  const savingsMax = Math.max(
    100000,
    Math.ceil(((planParams?.annualSavings ?? 0) * 2) / 1000) * 1000
  )
  const monthlyAnchor = Math.max(1000, Math.round(planCombined.combinedMonthly * 2))
  const monthlyNow = Math.round(combined.combinedMonthly)
  const monthlyPlan = Math.round(planCombined.combinedMonthly)
  // Anchored on the saved plan (like the quick levers), so the range does not
  // grow under the thumb while it is dragged.
  const pensionMax = Math.max(
    8000,
    Math.ceil(((planParams?.monthlyPension ?? params.monthlyPension) * 2) / 500) * 500,
    params.monthlyPension
  )

  const ageDirty = planParams != null && params.retirementAge !== planParams.retirementAge
  const savingsDirty = planParams != null && params.annualSavings !== planParams.annualSavings
  const spendingDirty = planParams != null && !sameExpenses(expenses, planExpenses)
  const roiDirty = planParams != null && params.averageROI !== planParams.averageROI
  const volatilityDirty = planParams != null && params.roiVolatility !== planParams.roiVolatility
  const inflationDirty =
    planParams != null && params.averageInflation !== planParams.averageInflation
  const pensionDirty = planParams != null && params.monthlyPension !== planParams.monthlyPension
  // A switched-off statutory pension is outside this slider's reach (it would
  // read 0); it is switched back on in the flow list.
  const pensionOff = isStatutoryPensionSwitchedOff(params.cashFlows)
  const endAgeDirty = planParams != null && params.endAge !== planParams.endAge

  return (
    <section
      className="ws-levers-group"
      aria-labelledby="levers-quick-title"
      data-testid="quick-levers"
    >
      <h3 id="levers-quick-title" className="ws-levers-title">
        {tl('quickTitle')}
      </h3>
      <div className="ws-levers-card" onPointerDownCapture={onPointerDownCapture}>
        <div className="ws-levers-grid">
          <InlineSlider
            label={t('ageAria')}
            ariaLabel={t('ageAria')}
            value={params.retirementAge}
            min={retirementMin}
            max={Math.max(retirementMin, retirementMax)}
            step={1}
            formattedValue={format.number(params.retirementAge)}
            onChange={(value) => updateParams({ retirementAge: value })}
            onReset={
              ageDirty
                ? () => updateParams({ retirementAge: planParams!.retirementAge })
                : undefined
            }
            resetLabel={resetLabel(t('ageAria'))}
            planValue={ageDirty ? planParams!.retirementAge : undefined}
          />
          <InlineSlider
            label={t('saveAria')}
            ariaLabel={t('saveAria')}
            value={params.annualSavings}
            min={0}
            max={savingsMax}
            step={1000}
            formattedValue={currency(params.annualSavings)}
            onChange={(value) => updateParams({ annualSavings: value })}
            onReset={
              savingsDirty
                ? () => updateParams({ annualSavings: planParams!.annualSavings })
                : undefined
            }
            resetLabel={resetLabel(t('saveAria'))}
            planValue={savingsDirty ? planParams!.annualSavings : undefined}
          />
          <InlineSlider
            label={t('spendAria')}
            ariaLabel={t('spendAria')}
            value={monthlyNow}
            min={0}
            max={monthlyAnchor}
            step={50}
            formattedValue={currency(monthlyNow)}
            valueText={t('spendValue', { amount: currency(monthlyNow) })}
            disabled={
              combined.combinedMonthly <= 0 &&
              planCombined.combinedMonthly <= 0 &&
              !scaleBaseRef.current?.monthly
            }
            onChange={scaleExpenses}
            onReset={spendingDirty ? resetExpenses : undefined}
            resetLabel={resetLabel(t('spendAria'))}
            planValue={spendingDirty ? monthlyPlan : undefined}
          />
          <InlineSlider
            label={t('roiAria')}
            ariaLabel={t('roiAria')}
            disabled={historical}
            value={params.averageROI}
            min={0}
            max={0.12}
            step={0.001}
            formattedValue={percent(params.averageROI)}
            onChange={(value) => updateParams({ averageROI: value })}
            onReset={
              roiDirty ? () => updateParams({ averageROI: planParams!.averageROI }) : undefined
            }
            resetLabel={resetLabel(t('roiAria'))}
            planValue={roiDirty ? planParams!.averageROI : undefined}
          />
        </div>

        <div className="ws-levers-more">
          <button
            type="button"
            className="ws-levers-disclosure"
            aria-expanded={moreOpen}
            aria-controls="advanced-params"
            data-testid="more-sliders-toggle"
            onClick={() => setMoreOpen((open) => !open)}
          >
            {tl('more')}
            <ChevronDown size={16} aria-hidden="true" />
          </button>
        </div>

        {moreOpen && (
          <div id="advanced-params" data-testid="advanced-params" className="ws-levers-advanced">
            <div className="ws-levers-grid">
              <InlineSlider
                label={ta('volatilityAria')}
                ariaLabel={ta('volatilityAria')}
                disabled={historical}
                value={params.roiVolatility}
                min={0}
                max={0.3}
                step={0.005}
                formattedValue={percent(params.roiVolatility)}
                onChange={(value) => updateParams({ roiVolatility: value })}
                onReset={
                  volatilityDirty
                    ? () => updateParams({ roiVolatility: planParams!.roiVolatility })
                    : undefined
                }
                resetLabel={resetLabel(ta('volatilityAria'))}
                planValue={volatilityDirty ? planParams!.roiVolatility : undefined}
              />
              <InlineSlider
                label={ta('inflationAria')}
                ariaLabel={ta('inflationAria')}
                disabled={historical}
                value={params.averageInflation}
                min={0}
                max={0.06}
                step={0.001}
                formattedValue={percent(params.averageInflation)}
                onChange={(value) => updateParams({ averageInflation: value })}
                onReset={
                  inflationDirty
                    ? () => updateParams({ averageInflation: planParams!.averageInflation })
                    : undefined
                }
                resetLabel={resetLabel(ta('inflationAria'))}
                planValue={inflationDirty ? planParams!.averageInflation : undefined}
              />
              <InlineSlider
                label={ta('pensionAria')}
                ariaLabel={ta('pensionAria')}
                value={params.monthlyPension}
                min={0}
                max={pensionMax}
                step={100}
                disabled={pensionOff}
                formattedValue={pensionOff ? tl('pensionOff') : currency(params.monthlyPension)}
                valueText={pensionOff ? tl('pensionOff') : undefined}
                onChange={(value) => updateParams({ monthlyPension: value })}
                onReset={
                  pensionDirty && !pensionOff
                    ? () => updateParams({ monthlyPension: planParams!.monthlyPension })
                    : undefined
                }
                resetLabel={resetLabel(ta('pensionAria'))}
                planValue={pensionDirty && !pensionOff ? planParams!.monthlyPension : undefined}
              />
              <InlineSlider
                label={ta('endAgeAria')}
                ariaLabel={ta('endAgeAria')}
                value={params.endAge}
                min={Math.max(params.retirementAge + 1, 75)}
                max={105}
                step={1}
                formattedValue={format.number(params.endAge)}
                onChange={(value) => updateParams({ endAge: value })}
                onReset={
                  endAgeDirty ? () => updateParams({ endAge: planParams!.endAge }) : undefined
                }
                resetLabel={resetLabel(ta('endAgeAria'))}
                planValue={endAgeDirty ? planParams!.endAge : undefined}
              />
            </div>
            <div className="ws-levers-advanced-foot">
              <label className="ws-levers-check">
                <input
                  type="checkbox"
                  checked={params.glidePathEnabled}
                  onChange={(event) => updateParams({ glidePathEnabled: event.target.checked })}
                />
                {ta('glidePath', {
                  start: percent(params.equityAllocationStart, 0),
                  end: percent(params.equityAllocationEnd, 0),
                })}
              </label>
              <button
                type="button"
                className="ws-levers-link"
                onClick={(event) => openEditor({ panel: 'market' }, event.currentTarget)}
              >
                {tl('editMarket')}
                <ArrowRight size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        )}
      </div>
      <p className="ws-levers-note" data-testid="levers-note" data-dirty={dirty || undefined}>
        {tw('note')}
        {dirty && <> {tw('pending')}</>}
      </p>
    </section>
  )
})
