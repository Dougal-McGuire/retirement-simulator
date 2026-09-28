'use client'

import { memo, useEffect, useRef, useState, type RefObject } from 'react'
import { ArrowRight } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { MAX_PLANS, type SimulationParams } from '@/types'
import {
  buildScenarioParams,
  buildScenarioPatch,
  pickScenarioKeys,
  SCENARIO_APPLY_KEYS,
  type ScenarioId,
} from '@/lib/simulation/planInsights'
import { diffParams } from '@/lib/simulation/planDiff'
import { planDisplayName } from '@/lib/plans/planName'
import { useCompactCurrency } from '@/lib/hooks/useCompactCurrency'
import { useSetComparisonSelection } from '@/lib/stores/comparisonStore'
import {
  useActivePlanId,
  useCreatePlan,
  usePlans,
  useSetActivePlan,
  useSimulationResults,
  useSimulationStore,
  useUpdateParams,
} from '@/lib/stores/simulationStore'
import { simulationContextOf } from '@/lib/stores/useSimulationContext'
import { toast, TOAST_DURATION } from '@/components/ui/toast'
import { ActionToast } from '@/components/ui/action-toast'
import { ScenarioPlanDialog } from '@/components/plans/ScenarioPlanDialog'
import { useNearViewport } from '../useNearViewport'
import { SaturatedCallout, WorstDecileUnit } from './SaturatedCallout'
import { useWorkspace } from '../WorkspaceProvider'
import {
  useLeverMeasurements,
  type LeverMeasurement,
  type LeverResult,
} from './useLeverMeasurements'

/** The lever rows in their unmeasured order (names are known before any run). */
const SCENARIO_IDS = Object.keys(SCENARIO_APPLY_KEYS) as ScenarioId[]

type Tone = 'ok' | 'danger' | 'neutral'
const toneOf = (rounded: number): Tone => (rounded > 0 ? 'ok' : rounded < 0 ? 'danger' : 'neutral')

interface LeverImpactListProps {
  /** A quick slider is held: measurement waits for the release. */
  holding: boolean
}

/**
 * "Was am meisten bewirkt": the three stress levers, each measured against the
 * result bar's own figure, biggest effect first. Every row can be applied to
 * the draft ("Übernehmen", with undo) or saved as a new plan.
 *
 * Measurements come from `useLeverMeasurements`, which only uses the worker
 * when this list is near the screen and the reader is not changing anything.
 * Until a change has been re-measured, the old rows stay visible but dimmed
 * and inert — their actions would describe an older draft.
 */
export const LeverImpactList = memo(function LeverImpactList({ holding }: LeverImpactListProps) {
  const rootRef = useRef<HTMLElement>(null)
  const near = useNearViewport(rootRef, '100px 0px', { once: false })
  const { measurement, fresh, measuring } = useLeverMeasurements({ near, holding })
  // The gate inside `useLeverMeasurements` follows the run state, which flips
  // in the result bar's urgent render. Only this shell re-renders then; the
  // rows below change when the measurement does.
  return (
    <LeverImpactView
      rootRef={rootRef}
      measurement={measurement}
      fresh={fresh}
      measuring={measuring}
    />
  )
})

interface LeverImpactViewProps {
  rootRef: RefObject<HTMLElement | null>
  measurement: LeverMeasurement | null
  fresh: boolean
  measuring: boolean
}

const LeverImpactView = memo(function LeverImpactView({
  rootRef,
  measurement,
  fresh,
  measuring,
}: LeverImpactViewProps) {
  const t = useTranslations('planDashboard.scenarios')
  const tl = useTranslations('workspace.levers')
  const tPlans = useTranslations('plans')
  const tToast = useTranslations('plans.toasts')
  const format = useFormatter()
  const compactCurrency = useCompactCurrency()
  const updateParams = useUpdateParams()
  const createPlan = useCreatePlan()
  const setActivePlan = useSetActivePlan()
  const setComparisonSelection = useSetComparisonSelection()
  const plans = usePlans()
  const activePlanId = useActivePlanId()
  const results = useSimulationResults()
  const { enterCompare } = useWorkspace()

  const atPlanLimit = plans.length >= MAX_PLANS
  const activePlan = plans.find((plan) => plan.id === activePlanId)
  const sourceName = activePlan ? planDisplayName(activePlan, tPlans) : tPlans('label')

  // ---- Formatting -------------------------------------------------------------

  // One decimal always, as in the result bar: the resulting rates read as one
  // aligned column, and the baseline is the bar's figure character for character.
  const formatPercent = (value: number) =>
    format.number(value / 100, {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
  const formatCurrency = (value: number) =>
    format.number(value, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  const sign = (rounded: number) => (rounded > 0 ? '+' : rounded < 0 ? '−' : '±')

  const effectOf = (lever: LeverResult, saturated: boolean) => {
    if (saturated) {
      const rounded = Math.round(lever.worstDecileDelta)
      return {
        tone: toneOf(rounded),
        delta: `${sign(rounded)}${compactCurrency(Math.abs(rounded))}`,
        result: formatCurrency(lever.worstDecileEnd),
      }
    }
    const rounded = Math.round(lever.delta * 10) / 10
    return {
      tone: toneOf(rounded),
      delta: t('deltaPoints', {
        value: `${sign(rounded)}${format.number(Math.abs(rounded), {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}`,
      }),
      result: formatPercent(lever.successRate),
    }
  }

  // ---- Übernehmen (with undo) ----------------------------------------------------

  // The undo belongs to the plan it changed: once another plan is active it
  // could no longer apply, so the toast goes with the switch (as Discard's).
  const appliedToastRef = useRef<{ id: string; planId: string } | null>(null)
  useEffect(() => {
    const pending = appliedToastRef.current
    if (pending && pending.planId !== activePlanId) {
      toast.dismiss(pending.id)
      appliedToastRef.current = null
    }
  }, [activePlanId])

  const apply = (id: ScenarioId) => {
    const { params, activePlanId: planId } = useSimulationStore.getState()
    const name = t(`items.${id}.name`)
    const snapshot = pickScenarioKeys(id, params)
    updateParams(buildScenarioPatch(id, params))
    if (appliedToastRef.current) toast.dismiss(appliedToastRef.current.id)
    const toastId = toast(
      (instance) => (
        <ActionToast
          testId="lever-applied-toast"
          message={tl('appliedToast', { name })}
          actions={[
            {
              label: tPlans('actions.undo'),
              tone: 'primary',
              testId: 'lever-applied-toast-undo',
              onClick: () => {
                toast.dismiss(instance.id)
                appliedToastRef.current = null
                if (useSimulationStore.getState().activePlanId !== planId) return
                updateParams(snapshot)
              },
            },
          ]}
        />
      ),
      { duration: TOAST_DURATION }
    )
    appliedToastRef.current = { id: toastId, planId }
  }

  // ---- Als neuen Plan speichern ----------------------------------------------------

  const [pending, setPending] = useState<{ id: ScenarioId; base: SimulationParams } | null>(null)
  const saveInvokerRef = useRef<HTMLElement | null>(null)
  const pendingScenario = pending
    ? buildScenarioParams(pending.base).find((entry) => entry.id === pending.id)
    : undefined

  /**
   * Turns a stress lever into a real plan: the same tweak, at the plan's full
   * run count. The new plan is created in the background — switching to it or
   * comparing is offered, never imposed — and lined up against its source.
   */
  const saveScenarioAsPlan = (name: string) => {
    if (!pending || !pendingScenario) return
    const sourceId = activePlanId
    const newPlanId = createPlan(
      name,
      { ...pendingScenario.params, simulationRuns: pending.base.simulationRuns },
      { activate: false }
    )
    // Nothing was created (the plan limit): the dialog says so and stays open.
    if (!newPlanId) return tPlans('switcher.limit', { max: MAX_PLANS })

    setComparisonSelection([sourceId, newPlanId].filter(Boolean))

    // Read the stored name back: duplicates get a suffix on the way in.
    const createdName =
      useSimulationStore.getState().plans.find((plan) => plan.id === newPlanId)?.name ?? name
    const invoker = saveInvokerRef.current
    toast(
      (instance) => (
        <ActionToast
          testId="plan-created-toast"
          message={tToast('planCreatedFrom', { name: createdName, source: sourceName })}
          actions={[
            {
              label: tToast('switchToPlan'),
              tone: 'primary',
              testId: 'plan-created-toast-switch',
              onClick: () => {
                setActivePlan(newPlanId)
                toast.dismiss(instance.id)
              },
            },
            {
              label: tToast('compare'),
              testId: 'plan-created-toast-compare',
              onClick: () => {
                toast.dismiss(instance.id)
                const state = useSimulationStore.getState()
                if (!state.plans.some((plan) => plan.id === newPlanId)) return
                const other = state.activePlanId === newPlanId ? sourceId : newPlanId
                setComparisonSelection(
                  [state.activePlanId, other].filter(
                    (id, index, list) =>
                      Boolean(id) &&
                      list.indexOf(id) === index &&
                      state.plans.some((plan) => plan.id === id)
                  )
                )
                enterCompare(invoker?.isConnected ? invoker : null)
              },
            },
            { label: tToast('dismiss'), onClick: () => toast.dismiss(instance.id) },
          ]}
        />
      ),
      { duration: TOAST_DURATION }
    )
  }

  // ---- Rows -----------------------------------------------------------------------

  const baseResults = measurement?.base ?? results
  const context = baseResults ? simulationContextOf(baseResults.params, baseResults) : null
  const saturated = measurement?.saturated ?? false
  const state = measurement ? (fresh ? 'ready' : 'stale') : 'pending'
  const rows: Array<{ id: ScenarioId; lever: LeverResult | null }> = measurement
    ? measurement.levers.map((lever) => ({ id: lever.id, lever }))
    : SCENARIO_IDS.map((id) => ({ id, lever: null }))
  const status =
    measuring || state === 'pending' ? tl('measuring') : state === 'stale' ? tl('waiting') : null

  return (
    <section
      ref={rootRef}
      className="ws-levers-group"
      aria-labelledby="levers-impact-title"
      data-testid="lever-list"
      data-measure={state}
    >
      <header className="ws-levers-head">
        <h3 id="levers-impact-title" className="ws-levers-title">
          {tl('impactTitle')}
        </h3>
        <p className="ws-levers-status" role="status">
          {status}
        </p>
      </header>

      <div
        className="ws-levers-impact"
        data-stale={state === 'stale' || undefined}
        aria-busy={state !== 'ready'}
        inert={state === 'stale'}
      >
        {/* The reference every delta is measured against, stated in full: the
            result bar's figure verbatim, at its run count. */}
        {context?.hasResults && (
          <p
            className="ws-levers-baseline"
            data-testid="stress-lever-baseline"
            data-baseline={context.successRate}
            data-runs={context.effectiveRuns}
          >
            {tl(context.marketModel === 'historical' ? 'baselineHistorical' : 'baseline', {
              rate: formatPercent(context.successRate),
              runs: format.number(context.effectiveRuns),
            })}
          </p>
        )}

        {saturated && measurement && (
          <SaturatedCallout rate={measurement.base.successRate} testId="stress-lever-saturated" />
        )}

        <ul className="ws-levers-list">
          {rows.map(({ id, lever }) => {
            const effect = lever ? effectOf(lever, saturated) : null
            const nameId = `stress-lever-${id}-name`
            const name = t(`items.${id}.name`)
            return (
              <li key={id} className="ws-levers-row" data-testid="stress-lever" data-lever={id}>
                <div className="ws-levers-row-text">
                  <p id={nameId} className="ws-levers-row-name">
                    {name}
                  </p>
                  <p className="ws-levers-row-description">{t(`items.${id}.description`)}</p>
                </div>
                <div className="ws-levers-effect">
                  {effect ? (
                    <>
                      <span
                        className={`ds-delta ds-delta--${effect.tone}`}
                        data-testid="stress-lever-delta"
                      >
                        {effect.delta}
                      </span>
                      <ArrowRight size={14} aria-hidden="true" />
                      <span className="ws-levers-effect-result">
                        <span className="sr-only">{tl('leadsTo')} </span>
                        {effect.result}
                        {saturated && <WorstDecileUnit />}
                      </span>
                    </>
                  ) : (
                    <span className="ws-skeleton ws-levers-effect-skeleton" aria-hidden="true" />
                  )}
                </div>
                <div className="ws-levers-actions">
                  <button
                    type="button"
                    className="ws-levers-button"
                    aria-label={tl('applyAria', { name })}
                    data-testid="stress-lever-apply"
                    onClick={() => apply(id)}
                  >
                    {tl('apply')}
                  </button>
                  <button
                    type="button"
                    className="ws-levers-button ws-levers-button-quiet"
                    aria-describedby={nameId}
                    disabled={atPlanLimit}
                    title={t('savedHint')}
                    data-testid="stress-lever-save"
                    onClick={(event) => {
                      saveInvokerRef.current = event.currentTarget
                      setPending({ id, base: useSimulationStore.getState().params })
                    }}
                  >
                    {tl('saveAsPlan')}
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </div>

      <ScenarioPlanDialog
        open={pending !== null}
        onOpenChange={(open) => {
          if (!open) setPending(null)
        }}
        sourceName={sourceName}
        suggestedName={pending ? t(`items.${pending.id}.name`) : ''}
        changes={pending && pendingScenario ? diffParams(pending.base, pendingScenario.params) : []}
        onConfirm={saveScenarioAsPlan}
        blockedReason={atPlanLimit ? tPlans('switcher.limit', { max: MAX_PLANS }) : undefined}
      />
    </section>
  )
})
