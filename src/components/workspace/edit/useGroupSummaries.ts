'use client'

import { useMemo } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import type { ColumnGroup } from '@/components/plans/planSections'
import { isCashFlowEnabled } from '@/lib/simulation/cashFlows'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import { HISTORICAL_FIRST_YEAR, HISTORICAL_LAST_YEAR } from '@/lib/simulation/data/historicalMarket'
import { useMoney } from '@/lib/hooks/useMoney'
import { useSimulationParams } from '@/lib/stores/simulationStore'

/**
 * The key figure each group shows at the right of its header — what the
 * Annahmen cards used to carry, in one line, so a closed group still says
 * what it holds. Plan inputs in today's euros: they never follow the €
 * display switch.
 */
export function useGroupSummaries(): Record<ColumnGroup, string> {
  const t = useTranslations('workspace.column.summary')
  const format = useFormatter()
  const money = useMoney()
  const params = useSimulationParams()

  return useMemo(() => {
    const percent = (value: number, digits = 1) =>
      format.number(value, {
        style: 'percent',
        minimumFractionDigits: 0,
        maximumFractionDigits: digits,
      })
    const flows = params.cashFlows ?? []
    const switchedOff = flows.filter((flow) => !isCashFlowEnabled(flow)).length
    const combined = calculateCombinedExpenses(params.customExpenses ?? [])
    const monthly = t('flows', { amount: money.full(combined.combinedMonthly) })
    const usesRate = params.withdrawalStrategy !== 'fixedReal'
    return {
      person: t('person', {
        current: params.currentAge,
        retirement: params.retirementAge,
        end: params.endAge,
      }),
      savings: t('savings', {
        assets: money.full(params.currentAssets),
        savings: money.full(params.annualSavings),
      }),
      flows: switchedOff > 0 ? t('flowsOff', { summary: monthly, count: switchedOff }) : monthly,
      rule: usesRate
        ? t('rule', {
            strategy: t(`strategy.${params.withdrawalStrategy}`),
            rate: percent(params.dsWithdrawalRate, 2),
          })
        : t(`strategy.${params.withdrawalStrategy}`),
      market:
        params.marketModel === 'historical'
          ? t('marketHistorical', { from: HISTORICAL_FIRST_YEAR, to: HISTORICAL_LAST_YEAR })
          : t('market', {
              rate: percent(params.averageROI, 2),
              inflation: percent(params.averageInflation),
            }),
    }
  }, [params, t, format, money])
}
