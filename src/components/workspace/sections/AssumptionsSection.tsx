'use client'

import { memo, useMemo, useState, type MouseEvent } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { ArrowRight } from 'lucide-react'
import { DEFAULT_PARAMS, type SimulationParams } from '@/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ActionToast } from '@/components/ui/action-toast'
import { toast, TOAST_DURATION } from '@/components/ui/toast'
import { ASSUMPTION_PANELS, type AssumptionPanel } from '@/components/plans/planSections'
import { pensionMonthlyAtAge } from '@/lib/simulation/cashFlows'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import {
  HISTORICAL_FIRST_YEAR,
  HISTORICAL_LAST_YEAR,
  HISTORICAL_PATH_COUNT,
} from '@/lib/simulation/data/historicalMarket'
import { planDisplayName } from '@/lib/plans/planName'
import {
  useActivePlan,
  useSimulationParams,
  useSimulationResults,
  useSimulationStore,
  useUpdateParams,
} from '@/lib/stores/simulationStore'
import { Link } from '@/navigation'
import { useWorkspace } from '../WorkspaceProvider'
import { WorkspaceSection } from './WorkspaceSection'

interface CardContent {
  label?: string
  value: string
  details: string[]
}

/**
 * "Auf Standard zurücksetzen": dialog and undo toast moved verbatim from the
 * old PlanEditor. The reset writes the working copy only — still a draft.
 */
function ResetToDefaults() {
  const t = useTranslations('planEditor')
  const tPlans = useTranslations('plans')
  const updateParams = useUpdateParams()
  const activePlan = useActivePlan()
  const [resetOpen, setResetOpen] = useState(false)
  const planName = activePlan ? planDisplayName(activePlan, tPlans) : ''

  const handleReset = () => {
    // Read at click time: subscribing to the params would re-render this
    // button on every keystroke anywhere on the page.
    const previous: SimulationParams = { ...useSimulationStore.getState().params }
    updateParams({ ...DEFAULT_PARAMS })
    setResetOpen(false)
    toast(
      (instance) => (
        <ActionToast
          testId="plan-reset-toast"
          message={t('reset.done', { name: planName })}
          actions={[
            {
              label: tPlans('actions.undo'),
              tone: 'primary',
              testId: 'plan-reset-toast-undo',
              onClick: () => {
                toast.dismiss(instance.id)
                updateParams(previous)
                toast.success(t('reset.undone'))
              },
            },
          ]}
        />
      ),
      { duration: TOAST_DURATION }
    )
  }

  return (
    <>
      <button
        type="button"
        className="ws-reset-button"
        data-testid="plan-editor-reset"
        onClick={() => setResetOpen(true)}
      >
        {t('reset.trigger')}
      </button>
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="bg-card sm:max-w-[30rem]" data-testid="plan-reset-dialog">
          <DialogHeader>
            <DialogTitle>{t('reset.title')}</DialogTitle>
            <DialogDescription>{t('reset.description', { name: planName })}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setResetOpen(false)}>
              {tPlans('actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              data-testid="plan-reset-confirm"
              onClick={handleReset}
            >
              {t('reset.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

/**
 * Annahmen (`#assumptions`): the plan's starting values as four cards. Each
 * card opens its edit panel; the values are plan inputs in today's euros and
 * never follow the € display switch.
 */
export const AssumptionsSection = memo(function AssumptionsSection() {
  const t = useTranslations('workspace')
  const tGroups = useTranslations('planEditor.groups')
  const format = useFormatter()
  const params = useSimulationParams()
  // Deferred inside the page's results scope; only the tax drag is read.
  const drag = useSimulationResults()?.withdrawalTaxDrag
  const { editor, openEditor } = useWorkspace()

  const cards = useMemo<Record<AssumptionPanel, CardContent>>(() => {
    const euro = (value: number) =>
      format.number(value, { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
    const percent = (value: number, digits = 1) =>
      format.number(value, {
        style: 'percent',
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
      })
    const combined = calculateCombinedExpenses(params.customExpenses ?? [])
    const flows = params.cashFlows ?? []
    const savingsBase = params.annualSavings + combined.combinedAnnual
    const savingsRate = savingsBase > 0 ? params.annualSavings / savingsBase : 0
    const pensionGross = pensionMonthlyAtAge(
      flows,
      params.legalRetirementAge,
      params.legalRetirementAge
    ).total
    const historical = params.marketModel === 'historical'
    return {
      person: {
        value: t('cards.person.value', { age: params.retirementAge }),
        details: [
          t('cards.person.detail', { current: params.currentAge, end: params.endAge }),
          t('cards.person.pension', { age: params.legalRetirementAge }),
        ],
      },
      savings: {
        label: t('startingAssets'),
        value: euro(params.currentAssets),
        details: [
          t('savingsHint', { amount: euro(params.annualSavings) }),
          t('cards.savings.growth', {
            rate: format.number(params.annualSavingsGrowthRate, {
              style: 'percent',
              maximumFractionDigits: 1,
              signDisplay: 'exceptZero',
            }),
            share: percent(savingsRate, 0),
          }),
        ],
      },
      flows: {
        label: t('plannedBudget'),
        value: t('cards.flows.value', { amount: euro(combined.combinedMonthly) }),
        details: [
          t('cards.flows.counts', {
            pensions: flows.filter((flow) => flow.kind === 'pension').length,
            expenses: flows.filter((flow) => flow.kind === 'expense').length,
            incomes: flows.filter((flow) => flow.kind === 'income').length,
          }),
          t('cards.flows.pensions', {
            age: params.legalRetirementAge,
            amount: euro(pensionGross),
          }),
        ],
      },
      market: {
        value: historical
          ? t('cards.market.valueHistorical')
          : t('cards.market.value', { rate: percent(params.averageROI, 2) }),
        details: [
          historical
            ? t('cards.market.detailHistorical', {
                from: HISTORICAL_FIRST_YEAR,
                to: HISTORICAL_LAST_YEAR,
                count: format.number(HISTORICAL_PATH_COUNT),
              })
            : t('cards.market.detail', {
                inflation: percent(params.averageInflation),
                volatility: percent(params.roiVolatility),
              }),
          `${
            params.glidePathEnabled
              ? t('cards.market.glideOn', {
                  start: percent(params.equityAllocationStart, 0),
                  end: percent(params.equityAllocationEnd, 0),
                })
              : t('cards.market.glideOff')
          } · ${t('cards.market.tax', { rate: drag === undefined ? '—' : percent(drag) })}`,
        ],
      },
    }
  }, [params, drag, t, format])

  return (
    <WorkspaceSection
      id="assumptions"
      title={t('sections.assumptions.title')}
      description={t('sections.assumptions.description')}
      actions={
        <p className="ws-setup-hint">
          {t('guidedSetupHint')}{' '}
          <Link href="/setup" className="ws-text-link" data-testid="setup-link">
            {t('guidedSetup')}
            <ArrowRight size={14} aria-hidden="true" />
          </Link>
        </p>
      }
    >
      <div className="ws-cards-frame">
        <div className="ws-cards">
          {ASSUMPTION_PANELS.map(({ id, messageKey }) => {
            const card = cards[id]
            const title = tGroups(`${messageKey}.title`)
            const open = editor?.panel === id
            return (
              <article
                key={id}
                className="ws-card"
                data-testid={`assumption-card-${id}`}
                data-open={open ? 'true' : undefined}
              >
                <h3>{title}</h3>
                {card.label && <p className="ws-card-label">{card.label}</p>}
                <p className="ws-card-value">{card.value}</p>
                {card.details.map((detail) => (
                  <p key={detail} className="ws-card-detail">
                    {detail}
                  </p>
                ))}
                <button
                  type="button"
                  className="ws-card-edit"
                  data-testid={`edit-${id}`}
                  data-edit-panel={id}
                  aria-label={t('editPanel.editAria', { title })}
                  aria-expanded={open}
                  aria-controls="edit-panel"
                  onClick={(event: MouseEvent<HTMLButtonElement>) =>
                    openEditor({ panel: id }, event.currentTarget)
                  }
                >
                  {t('edit')}
                  <ArrowRight size={14} aria-hidden="true" />
                </button>
              </article>
            )
          })}
        </div>
      </div>
      <footer className="ws-section-footer">
        <p className="ws-footnote">{t('cards.startingValues')}</p>
        <ResetToDefaults />
      </footer>
    </WorkspaceSection>
  )
})
