'use client'

import { useCallback, useMemo } from 'react'
import { pensionMonthlyAtAge } from '@/lib/simulation/cashFlows'
import { useTranslations } from 'next-intl'
import type { SimulationResults } from '@/types'
import { SpendingChart } from '@/components/charts/SpendingChart'
import {
  useBrushRange,
  useChartData,
  useChartFormatters,
} from '@/components/charts/useChartData'
import { useDisplayReal } from '@/lib/stores/displayStore'

interface SpendingSectionProps {
  results: SimulationResults
}

export function SpendingSection({ results }: SpendingSectionProps) {
  const t = useTranslations('simulationChart')
  const displayReal = useDisplayReal()
  const { spendingData, deflatorForAge } = useChartData(results, displayReal)
  const { formatCurrency, formatCurrencyShort, formatPercent } = useChartFormatters()
  const ages = useMemo(() => spendingData.map((d) => d.age), [spendingData])
  const { indexRange, onBrushChange, resetZoom } = useBrushRange(ages)

  const spendingTableNoteKey = `spendingTable.note.${results.params.withdrawalStrategy}`

  // A nominal pension shrinks in today's euros with the median realised price
  // level; an indexed one holds its value (and grows in nominal terms).
  const monthlyPensionAtAge = useCallback(
    (age: number) => {
      const pension = pensionMonthlyAtAge(
        results.params.cashFlows ?? [],
        age,
        results.params.legalRetirementAge
      )
      const deflator = deflatorForAge(age)
      return displayReal
        ? pension.fixed / deflator + pension.linked
        : pension.fixed + pension.linked * deflator
    },
    [deflatorForAge, displayReal, results.params.cashFlows, results.params.legalRetirementAge]
  )

  return (
    <div className="space-y-5">
      <SpendingChart
        data={spendingData}
        retirementAge={results.params.retirementAge}
        withdrawalStrategy={results.params.withdrawalStrategy}
        dsWithdrawalRate={results.params.dsWithdrawalRate}
        dsCeilingRate={results.params.dsCeilingRate}
        dsFloorRate={results.params.dsFloorRate}
        indexRange={indexRange}
        onBrushChange={onBrushChange}
        onResetZoom={resetZoom}
        formatCurrency={formatCurrency}
        formatCurrencyShort={formatCurrencyShort}
      />

      <details className="rounded-sm border border-border bg-white p-4 shadow-sm">
        <summary className="cursor-pointer text-[0.68rem] font-semibold   text-accent">
          {t('spendingTable.toggle')}
        </summary>
        <div className="mt-4 overflow-x-auto border-t border-border pt-4">
          <p className="mb-3 max-w-3xl text-[0.64rem] font-semibold  leading-relaxed  text-muted-foreground">
            {t(spendingTableNoteKey, {
              withdrawalRate: formatPercent(results.params.dsWithdrawalRate),
              ceiling: formatPercent(results.params.dsCeilingRate),
              floor: formatPercent(results.params.dsFloorRate),
            })}
          </p>
          <table className="rounded-sm min-w-full border border-border bg-white text-[0.68rem]  ">
            <caption className="sr-only">{t('spendingTable.caption')}</caption>
            <thead>
              <tr className="bg-muted">
                <th className="rounded-sm border border-border px-3 py-2 text-left">
                  {t('spendingTable.headers.age')}
                </th>
                <th className="rounded-sm border border-border px-3 py-2 text-right">
                  {t('spendingTable.headers.p10')}
                </th>
                <th className="rounded-sm border border-border px-3 py-2 text-right">
                  {t('spendingTable.headers.p50')}
                </th>
                <th className="rounded-sm border border-border px-3 py-2 text-right">
                  {t('spendingTable.headers.p90')}
                </th>
                <th className="rounded-sm border border-border px-3 py-2 text-right">
                  {t('spendingTable.headers.withdrawalRate')}
                </th>
                <th className="rounded-sm border border-border px-3 py-2 text-right">
                  {t('spendingTable.headers.pension')}
                </th>
                <th className="rounded-sm border border-border px-3 py-2 text-right">
                  {t('spendingTable.headers.portfolioDraw')}
                </th>
                <th className="rounded-sm border border-border px-3 py-2 text-right">
                  {t('spendingTable.headers.availableCash')}
                </th>
              </tr>
            </thead>
            <tbody>
              {spendingData.map((data, index) => {
                const pension = monthlyPensionAtAge(data.age)
                const portfolioDraw = Math.max(0, data.spending_p50 - pension)
                const availableCash = pension + portfolioDraw

                return (
                  <tr key={index} className="border-b border-border">
                    <td className="rounded-sm border border-border px-3 py-2 text-left">{data.age}</td>
                    <td className="rounded-sm border border-border px-3 py-2 text-right">
                      {formatCurrency(data.spending_p10)}
                    </td>
                    <td className="rounded-sm border border-border px-3 py-2 text-right">
                      {formatCurrency(data.spending_p50)}
                    </td>
                    <td className="rounded-sm border border-border px-3 py-2 text-right">
                      {formatCurrency(data.spending_p90)}
                    </td>
                    <td className="rounded-sm border border-border px-3 py-2 text-right">
                      {formatPercent(data.withdrawal_rate_p50)}
                    </td>
                    <td className="rounded-sm border border-border px-3 py-2 text-right">
                      {formatCurrency(pension)}
                    </td>
                    <td className="rounded-sm border border-border px-3 py-2 text-right">
                      {formatCurrency(portfolioDraw)}
                    </td>
                    <td className="rounded-sm border border-border px-3 py-2 text-right font-black text-ink">
                      {formatCurrency(availableCash)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
