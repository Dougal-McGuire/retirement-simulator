'use client'

import { memo, useMemo, useRef, type MouseEvent, type RefObject } from 'react'
import { ArrowRight } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import type { CashFlow, SimulationParams } from '@/types'
import { cashFlowDisplayName } from '@/lib/plans/cashFlowName'
import { isCashFlowEnabled } from '@/lib/simulation/cashFlows'
import { selectUncertainFlows, toggleCashFlow } from '@/lib/simulation/uncertainFlows'
import { useCompactCurrency } from '@/lib/hooks/useCompactCurrency'
import { useSimulationParams, useSimulationStore } from '@/lib/stores/simulationStore'
import { useNearViewport } from '../useNearViewport'
import { SaturatedCallout, WorstDecileUnit } from './SaturatedCallout'
import { useWorkspace } from '../WorkspaceProvider'
import {
  impactMagnitude,
  useFlowMeasurements,
  type FlowImpact,
  type FlowMeasurement,
} from './useFlowMeasurements'

type Tone = 'ok' | 'danger' | 'neutral'
const toneOf = (rounded: number): Tone => (rounded > 0 ? 'ok' : rounded < 0 ? 'danger' : 'neutral')

interface UncertainFlowsListProps {
  /** A quick slider is held: measurement waits for the release. */
  holding: boolean
}

/**
 * "Unsichere Posten": the plan's one-off, time-limited and extra items, each
 * with its on/off switch and what switching it does to the success rate —
 * "ohne: −12,3 Pkt." for an item that is on, "mit: …" for one that is off.
 *
 * The switch is the same draft edit as in the flow list (the result bar goes
 * to "Ungespeichert", Verwerfen undoes it). Impacts are measured in the
 * background by `useFlowMeasurements`, under the levers' gate.
 */
export const UncertainFlowsList = memo(function UncertainFlowsList({
  holding,
}: UncertainFlowsListProps) {
  const rootRef = useRef<HTMLElement>(null)
  const near = useNearViewport(rootRef, '100px 0px', { once: false })
  const { measurement, fresh, measuring } = useFlowMeasurements({ near, holding })
  const params = useSimulationParams()
  return (
    <UncertainFlowsView
      rootRef={rootRef}
      params={params}
      measurement={measurement}
      fresh={fresh}
      measuring={measuring}
    />
  )
})

interface UncertainFlowsViewProps {
  rootRef: RefObject<HTMLElement | null>
  params: SimulationParams
  measurement: FlowMeasurement | null
  fresh: boolean
  measuring: boolean
}

const UncertainFlowsView = memo(function UncertainFlowsView({
  rootRef,
  params,
  measurement,
  fresh,
  measuring,
}: UncertainFlowsViewProps) {
  const tl = useTranslations('workspace.levers')
  const tf = useTranslations('workspace.levers.flows')
  const tc = useTranslations('setup.cashFlows')
  const tScenarios = useTranslations('planDashboard.scenarios')
  const format = useFormatter()
  const compactCurrency = useCompactCurrency()
  const { openEditor } = useWorkspace()

  const { flows, hidden } = useMemo(() => selectUncertainFlows(params), [params])

  // Largest effect first once measured. The order is kept while the same
  // items are listed, so a row never jumps away under the pointer after its
  // own switch re-measures the plan.
  const orderRef = useRef<{ key: string; ids: string[] } | null>(null)
  const idKey = flows
    .map((flow) => flow.id)
    .sort()
    .join('|')
  if (orderRef.current && orderRef.current.key !== idKey) orderRef.current = null
  if (!orderRef.current && measurement && flows.every((flow) => measurement.byId.has(flow.id))) {
    const ranked = [...flows].sort(
      (a, b) =>
        impactMagnitude(measurement.byId.get(b.id)!, measurement.saturated) -
        impactMagnitude(measurement.byId.get(a.id)!, measurement.saturated)
    )
    orderRef.current = { key: idKey, ids: ranked.map((flow) => flow.id) }
  }
  const order = orderRef.current?.ids
  const rows = order ? [...flows].sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)) : flows

  const status =
    flows.length === 0
      ? null
      : measuring || !measurement
        ? tl('measuring')
        : !fresh
          ? tl('waiting')
          : null

  const formatCurrency = (value: number) =>
    format.number(value, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  const formatPercent = (value: number) =>
    format.number(value / 100, {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
  const sign = (rounded: number) => (rounded > 0 ? '+' : rounded < 0 ? '−' : '±')

  const nameOf = (flow: CashFlow) => cashFlowDisplayName(flow, (key) => tc(`defaults.${key}`))

  const periodOf = (flow: CashFlow) => {
    if (flow.kind === 'pension' && flow.startAge === undefined) {
      return flow.endAge === undefined
        ? tc('window.from', { age: params.legalRetirementAge })
        : tc('window.range', { from: params.legalRetirementAge, to: flow.endAge })
    }
    if (flow.frequency === 'once')
      return tc('window.at', { age: flow.startAge ?? params.currentAge })
    if (flow.startAge !== undefined && flow.endAge !== undefined) {
      return tc('window.range', { from: flow.startAge, to: flow.endAge })
    }
    if (flow.startAge !== undefined) return tc('window.from', { age: flow.startAge })
    if (flow.endAge !== undefined) return tc('window.until', { age: flow.endAge })
    return tc('window.lifetime')
  }

  const effectOf = (impact: FlowImpact, saturated: boolean) => {
    if (saturated) {
      const rounded = Math.round(impact.worstDecileDelta)
      return {
        tone: toneOf(rounded),
        delta: `${sign(rounded)}${compactCurrency(Math.abs(rounded))}`,
        result: formatCurrency(impact.worstDecileEnd),
      }
    }
    const rounded = Math.round(impact.delta * 10) / 10
    return {
      tone: toneOf(rounded),
      delta: tScenarios('deltaPoints', {
        value: `${sign(rounded)}${format.number(Math.abs(rounded), {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}`,
      }),
      result: formatPercent(impact.successRate),
    }
  }

  // Read at click time: the switch always acts on the current draft, even
  // while the numbers beside it are being re-measured.
  const toggle = (id: string) => {
    const { params: current, updateParams } = useSimulationStore.getState()
    updateParams({ cashFlows: toggleCashFlow(current.cashFlows ?? [], id) })
  }

  const openFlow = (flow: CashFlow, event: MouseEvent<HTMLButtonElement>) =>
    openEditor({ panel: 'flows', fieldId: `cashflow-switch-${flow.id}` }, event.currentTarget)

  const state = measurement ? (fresh ? 'ready' : 'stale') : 'pending'
  const saturated = measurement?.saturated ?? false
  // Each row's reading for assistive tech: points and a rate, or — once the
  // plan is saturated — the worst decile's end assets in euros.
  const ariaKey = (on: boolean) =>
    saturated ? (on ? 'withoutAriaAssets' : 'withAriaAssets') : on ? 'withoutAria' : 'withAria'

  return (
    <section
      ref={rootRef}
      className="ws-levers-group"
      aria-labelledby="levers-flows-title"
      data-testid="uncertain-flows"
      data-measure={state}
    >
      <header className="ws-levers-head">
        <h3 id="levers-flows-title" className="ws-levers-title">
          {tf('title')}
        </h3>
        <p className="ws-levers-status" role="status">
          {status}
        </p>
      </header>
      <p className="ws-levers-lede">{tf('description')}</p>

      {saturated && measurement && flows.length > 0 && (
        <SaturatedCallout rate={measurement.base.successRate} testId="uncertain-flows-saturated" />
      )}

      {flows.length === 0 ? (
        <p className="ws-levers-empty" data-testid="uncertain-flows-empty">
          {tf('empty')}{' '}
          <button
            type="button"
            className="ws-levers-link"
            data-testid="uncertain-flows-add"
            onClick={(event) => openEditor({ panel: 'flows' }, event.currentTarget)}
          >
            {tf('emptyAction')}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </p>
      ) : (
        <ul className="ws-levers-list ws-levers-flows" data-stale={state === 'stale' || undefined}>
          {rows.map((flow) => {
            const on = isCashFlowEnabled(flow)
            const name = nameOf(flow)
            const impact = measurement?.byId.get(flow.id)
            // A number measured for the other switch position answers the
            // other question; until re-measured the row shows a placeholder.
            const usable = impact && impact.measuredEnabled === on ? impact : null
            const effect = usable ? effectOf(usable, saturated) : null
            const perPayment = `${flow.kind === 'expense' ? '−' : '+'}${formatCurrency(flow.amount)}`
            return (
              <li
                key={flow.id}
                className="ws-levers-flow"
                data-testid="uncertain-flow"
                data-flow-id={flow.id}
                data-enabled={on ? 'true' : 'false'}
              >
                <button
                  type="button"
                  role="switch"
                  aria-checked={on}
                  aria-label={tc('switch.aria', { name })}
                  title={on ? tc('switch.label') : tc('switch.offHint')}
                  className="ws-switch ws-levers-flow-switch"
                  data-testid="uncertain-flow-switch"
                  onClick={() => toggle(flow.id)}
                >
                  <span aria-hidden="true" className="ws-switch-track" />
                </button>
                <div className="ws-levers-flow-text">
                  <p className="ws-levers-flow-name">
                    <button
                      type="button"
                      className="ws-levers-flow-open"
                      aria-label={tf('open', { name })}
                      data-testid="uncertain-flow-open"
                      onClick={(event) => openFlow(flow, event)}
                    >
                      {name}
                    </button>
                    {!on && <span className="ws-levers-flow-off">{tc('switch.off')}</span>}
                  </p>
                  <p className="ws-levers-flow-detail">
                    {perPayment} · {tc(`frequency.${flow.frequency}`)} · {periodOf(flow)}
                  </p>
                </div>
                <div className="ws-levers-effect ws-levers-flow-effect">
                  {effect ? (
                    <>
                      <span
                        className={`ds-delta ds-delta--${effect.tone}`}
                        data-testid="uncertain-flow-delta"
                        data-value={usable!.delta}
                        aria-hidden="true"
                      >
                        {on
                          ? tf('without', { delta: effect.delta })
                          : tf('with', { delta: effect.delta })}
                      </span>
                      <ArrowRight size={14} aria-hidden="true" />
                      <span className="ws-levers-effect-result" aria-hidden="true">
                        {effect.result}
                        {saturated && <WorstDecileUnit />}
                      </span>
                      <span className="sr-only">
                        {tf(ariaKey(on), { name, delta: effect.delta, value: effect.result })}
                      </span>
                    </>
                  ) : (
                    <span className="ws-skeleton ws-levers-effect-skeleton" aria-hidden="true" />
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {hidden > 0 && (
        <p className="ws-levers-note">
          <button
            type="button"
            className="ws-levers-link"
            onClick={(event) => openEditor({ panel: 'flows' }, event.currentTarget)}
          >
            {tf('more', { count: hidden })}
            <ArrowRight size={16} aria-hidden="true" />
          </button>
        </p>
      )}
    </section>
  )
})
