'use client'

import { memo, useMemo, useState, useSyncExternalStore, type MouseEvent } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { ArrowLeftRight, ArrowRight, CopyPlus } from 'lucide-react'
import { MAX_PLANS, type SimulationResults } from '@/types'
import { FanChartCard } from '@/components/simulation-compact/FanChartCard'
import { buildCompactKpis } from '@/components/simulation-compact/metrics'
import { PlanNameDialog } from '@/components/plans/PlanNameDialog'
import { toast } from '@/components/ui/toast'
import { planDisplayName } from '@/lib/plans/planName'
import { useDisplayReal } from '@/lib/stores/displayStore'
import { useSetComparisonSelection } from '@/lib/stores/comparisonStore'
import { suggestDuplicateName } from '@/lib/stores/plans'
import { effectiveRunCount } from '@/lib/simulation/context'
import {
  useActivePlanId,
  useDuplicatePlan,
  usePlans,
  useSimulationResults,
  useSimulationStore,
} from '@/lib/stores/simulationStore'
import { simulationContextOf } from '@/lib/stores/useSimulationContext'
import { AnimatedNumber } from '../AnimatedNumber'
import { LazyMount } from '../LazyMount'
import { Skeleton } from '../Skeleton'
import { useWorkspace, type EditTarget } from '../WorkspaceProvider'
import { WorkspaceSection } from './WorkspaceSection'
import './result.css'

const PHONE_QUERY = '(max-width: 760px)'

function subscribePhone(onChange: () => void) {
  const media = window.matchMedia(PHONE_QUERY)
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

/**
 * The phone layout (≤760), right on the first client render. `useMediaQuery`
 * starts at `false` and corrects itself in an effect, which drew the fan at
 * the desktop height for a frame and then shrank it under the reader.
 */
function usePhoneLayout(): boolean {
  return useSyncExternalStore(
    subscribePhone,
    () => window.matchMedia(PHONE_QUERY).matches,
    () => false
  )
}

/**
 * Entry into plan comparison. With two or more plans it lines up the active
 * plan against the most recently updated other one; with a single plan it
 * offers to duplicate it, which is what makes a comparison possible.
 */
function CompareEntry() {
  const t = useTranslations('workspace.compareEntry')
  const tPlans = useTranslations('plans')
  const plans = usePlans()
  const activeId = useActivePlanId()
  const duplicate = useDuplicatePlan()
  const setSelection = useSetComparisonSelection()
  const { enterCompare } = useWorkspace()
  const [naming, setNaming] = useState(false)
  const active = plans.find((plan) => plan.id === activeId)
  const other = plans
    .filter((plan) => plan.id !== activeId)
    .reduce<
      (typeof plans)[number] | null
    >((latest, plan) => (!latest || plan.updatedAt > latest.updatedAt ? plan : latest), null)

  if (active && other) {
    return (
      <button
        type="button"
        className="workspace-compare-entry"
        data-testid="overview-compare"
        onClick={(event) => {
          setSelection([active.id, other.id])
          enterCompare(event.currentTarget)
        }}
      >
        <ArrowLeftRight size={18} aria-hidden="true" />
        <span>
          <strong>{t('title')}</strong>
          <small>
            {t('detail', {
              active: planDisplayName(active, tPlans),
              other: planDisplayName(other, tPlans),
            })}
          </small>
        </span>
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    )
  }
  if (!active || plans.length >= MAX_PLANS) return null
  const activeName = planDisplayName(active, tPlans)
  return (
    <>
      <button
        type="button"
        className="workspace-compare-entry workspace-compare-entry-quiet"
        data-testid="overview-duplicate"
        onClick={() => setNaming(true)}
      >
        <CopyPlus size={18} aria-hidden="true" />
        <span>
          <strong>{t('duplicateTitle')}</strong>
          <small>{t('duplicateDetail')}</small>
        </span>
      </button>
      {/* Same naming step as "Duplicate" everywhere else: the copy's name is
          what the comparison legend and the PDF will show. */}
      <PlanNameDialog
        open={naming}
        onOpenChange={setNaming}
        inputId="overview-duplicate-name"
        initialName={suggestDuplicateName(
          activeName,
          plans.map((plan) => planDisplayName(plan, tPlans))
        )}
        title={tPlans('dialogs.duplicate.title')}
        description={tPlans('dialogs.duplicate.description', { name: activeName })}
        label={tPlans('dialogs.duplicate.label')}
        placeholder={tPlans('dialogs.duplicate.placeholder')}
        confirmLabel={tPlans('actions.confirmDuplicate')}
        onConfirm={(name) => {
          if (duplicate(active.id, name)) toast.success(tPlans('duplicated.toast', { name }))
        }}
      />
    </>
  )
}

/** The fan chart only redraws for a new result, display mode or height. */
const MemoFanChartCard = memo(FanChartCard)

/**
 * Everything in Ergebnis is derived from `results` (never from the draft
 * params), so a keystroke does not re-render it; a landing run does, in the
 * deferred pass after the result bar (see `DeferredResultsScope`).
 */
const ResultBody = memo(function ResultBody({ results }: { results: SimulationResults }) {
  const t = useTranslations('workspace')
  const format = useFormatter()
  const displayReal = useDisplayReal()
  // The run behind these numbers: `results.params`, which is what
  // `useSimulationContext` resolves to whenever results exist.
  const context = useMemo(() => simulationContextOf(results.params, results), [results])
  const { openEditor, scrollToSection } = useWorkspace()
  const phone = usePhoneLayout()
  const p = results.params
  const kpis = useMemo(
    () => buildCompactKpis(results.params, results, { displayReal }),
    [results, displayReal]
  )
  const euro = (value: number) =>
    format.number(value, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  const formatRate = (value: number) =>
    format.number(value / 100, {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
  const rate = Math.round(results.successRate * 10) / 10
  const runs = format.number(context.effectiveRuns)
  const fanHeight = phone ? 260 : 330
  const fanTotal = fanHeight + (phone ? FAN_CHROME_PHONE : FAN_CHROME)
  const hasPension = p.cashFlows.some((flow) => flow.kind === 'pension' && flow.amount > 0)

  const stages: {
    key: 'today' | 'retirement' | 'pension' | 'horizon'
    label: string
    value: string
    target: EditTarget
  }[] = [
    {
      key: 'today',
      label: t('today'),
      value: t('ageValue', { age: p.currentAge }),
      target: { panel: 'person', fieldId: 'editor-currentAge' },
    },
    {
      key: 'retirement',
      label: t('retirement'),
      value: t('ageValue', { age: p.retirementAge }),
      target: { panel: 'person', fieldId: 'editor-retirementAge' },
    },
    {
      key: 'pension',
      label: t('firstPension'),
      value: hasPension ? t('ageValue', { age: kpis.firstPensionAge }) : t('noPension'),
      target: { panel: 'flows' },
    },
    {
      key: 'horizon',
      label: t('horizon'),
      value: t('ageValue', { age: p.endAge }),
      target: { panel: 'person', fieldId: 'editor-endAge' },
    },
  ]

  return (
    <>
      <div className="ws-verdict" data-testid="verdict">
        <p className="ws-verdict-statement">
          <span className="ws-verdict-rate" data-value={rate}>
            <AnimatedNumber value={rate} format={formatRate} />
          </span>{' '}
          <span className="ws-verdict-lead">{t('verdict.lead', { end: p.endAge })}</span>
        </p>
        <p className="ws-verdict-context">
          {context.marketModel === 'historical'
            ? t('runContext.historical', { runs })
            : t('runContext.monteCarlo', { runs })}
          {' · '}
          {t('runContext.disclaimer')}
        </p>
      </div>

      <dl className="ws-facts" data-testid="kpi-strip">
        <div>
          <dt>{t('lastsTo')}</dt>
          <dd className="ws-fact-value">
            {kpis.lastsToMedian === null ? `${p.endAge}+` : String(kpis.lastsToMedian)}
          </dd>
          <dd className="ws-fact-hint">
            {t('badPaths', { age: kpis.lastsToP10 ?? `${p.endAge}+` })}
          </dd>
        </div>
        <div>
          <dt>{t('firstDraw')}</dt>
          <dd className="ws-fact-value">
            <button
              type="button"
              className="ws-link-button"
              onClick={() => scrollToSection('withdrawal', { focus: true })}
            >
              {euro(kpis.firstYearWithdrawalMonthly)}
            </button>
          </dd>
          <dd className="ws-fact-hint">{t('grossMean')}</dd>
        </div>
        <div>
          <dt>{t('endAssets')}</dt>
          <dd className="ws-fact-value">{euro(kpis.medianEndWealth)}</dd>
          <dd className="ws-fact-hint">{t('lowAssets', { amount: euro(kpis.p10EndWealth) })}</dd>
        </div>
      </dl>

      <section className="ws-chart-card" aria-labelledby="result-assets-title">
        <h3 id="result-assets-title">{t('assetTitle')}</h3>
        <p>{t('assetDescription')}</p>
        <LazyMount
          minHeight={fanTotal}
          fallback={<FanSkeleton />}
        >
          <MemoFanChartCard results={results} displayReal={displayReal} height={fanHeight} />
        </LazyMount>
      </section>

      <ol className="ws-life-stages" data-testid="life-stages" aria-label={t('lifeStages.label')}>
        {stages.map((stage) => (
          <li key={stage.key}>
            <button
              type="button"
              data-testid={`life-stage-${stage.key}`}
              aria-label={t('lifeStages.editAria', { label: stage.label, value: stage.value })}
              onClick={(event: MouseEvent<HTMLButtonElement>) =>
                openEditor(stage.target, event.currentTarget)
              }
            >
              <span>{stage.label}</span>
              <strong>{stage.value}</strong>
            </button>
          </li>
        ))}
      </ol>

      <CompareEntry />
    </>
  )
})

/**
 * Height of the fan chart's chrome around its plot (toolbar, axis, range
 * brush, table toggle). The lazy placeholder inside a rendered result
 * reserves plot + chrome, so nothing below moves when the chart mounts.
 */
const FAN_CHROME = 191
const FAN_CHROME_PHONE = 245

/**
 * The fan chart's shape before it mounts: toolbar, plot area, the rest
 * reserved. Sized by `result.css` (plot 330, 260 at ≤760, plus the chrome at
 * that width), not by a media-query hook, so the server-rendered skeleton
 * already has its final height.
 */
function FanSkeleton() {
  return (
    <div className="ws-fan-skeleton" aria-hidden="true">
      <div className="ws-chart-toolbar">
        <Skeleton height={40} width="17rem" style={{ maxWidth: '100%' }} />
      </div>
      <Skeleton variant="chart" height="var(--ws-fan-plot-h)" />
    </div>
  )
}

/**
 * Before the first result: Ergebnis in its final shape. The skeleton is the
 * real markup with the real words — verdict, facts, chart card, life stages —
 * but every figure (and every sentence that carries one) is painted as a
 * placeholder bar (`.ws-ghost`). The line boxes are therefore the ones the
 * result will have at any width and in either language, so nothing moves
 * when the first run lands (no layout shift on a phone's first load). The
 * compare entry needs no result and is the real one. One visually hidden
 * status line says what is happening.
 */
function ResultSkeleton({ label }: { label: string }) {
  const t = useTranslations('workspace')
  const format = useFormatter()
  const endAge = useSimulationStore((state) => state.params.endAge)
  const currentAge = useSimulationStore((state) => state.params.currentAge)
  const retirementAge = useSimulationStore((state) => state.params.retirementAge)
  const legalAge = useSimulationStore((state) => state.params.legalRetirementAge)
  const historical = useSimulationStore((state) => state.params.marketModel === 'historical')
  const runs = useSimulationStore((state) => effectiveRunCount(state.params))
  const euro = (value: number) =>
    format.number(value, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
  const rate = format.number(0.888, {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
  const runLine = historical
    ? t('runContext.historical', { runs: format.number(runs) })
    : t('runContext.monteCarlo', { runs: format.number(runs) })
  const stages = [
    [t('today'), currentAge],
    [t('retirement'), retirementAge],
    [t('firstPension'), legalAge],
    [t('horizon'), endAge],
  ] as const

  return (
    <>
      <div className="ws-verdict" aria-hidden="true">
        <p className="ws-verdict-statement">
          <span className="ws-verdict-rate">
            <span className="ws-ghost">{rate}</span>
          </span>{' '}
          <span className="ws-ghost">{t('verdict.lead', { end: endAge })}</span>
        </p>
        <p className="ws-verdict-context">
          <span className="ws-ghost">
            {runLine}
            {' · '}
            {t('runContext.disclaimer')}
          </span>
        </p>
      </div>

      <dl className="ws-facts" aria-hidden="true">
        <div>
          <dt>{t('lastsTo')}</dt>
          <dd className="ws-fact-value">
            <span className="ws-ghost">{endAge}</span>
          </dd>
          <dd className="ws-fact-hint">
            <span className="ws-ghost">{t('badPaths', { age: endAge })}</span>
          </dd>
        </div>
        <div>
          <dt>{t('firstDraw')}</dt>
          <dd className="ws-fact-value">
            <span className="ws-ghost">{euro(2500)}</span>
          </dd>
          <dd className="ws-fact-hint">{t('grossMean')}</dd>
        </div>
        <div>
          <dt>{t('endAssets')}</dt>
          <dd className="ws-fact-value">
            <span className="ws-ghost">{euro(1250000)}</span>
          </dd>
          <dd className="ws-fact-hint">
            <span className="ws-ghost">{t('lowAssets', { amount: euro(250000) })}</span>
          </dd>
        </div>
      </dl>

      <div className="ws-chart-card" aria-hidden="true">
        <h3>{t('assetTitle')}</h3>
        <p>{t('assetDescription')}</p>
        <FanSkeleton />
      </div>

      <ol className="ws-life-stages" aria-hidden="true" inert>
        {stages.map(([stageLabel, age]) => (
          <li key={stageLabel}>
            <button type="button" tabIndex={-1}>
              <span>{stageLabel}</span>
              <strong>
                <span className="ws-ghost">{t('ageValue', { age })}</span>
              </strong>
            </button>
          </li>
        ))}
      </ol>

      <CompareEntry />
      <p className="sr-only" role="status">
        {label}
      </p>
    </>
  )
}

/**
 * Ergebnis (`#result`): verdict, facts, the fan chart, life stages, compare
 * entry. Rendered inside the page's `DeferredResultsScope`.
 */
export const ResultSection = memo(function ResultSection() {
  const t = useTranslations('workspace')
  const results = useSimulationResults()
  return (
    <WorkspaceSection
      id="result"
      title={t('sections.result.title')}
      description={t('sections.result.description')}
    >
      {results ? <ResultBody results={results} /> : <ResultSkeleton label={t('computing')} />}
    </WorkspaceSection>
  )
})
