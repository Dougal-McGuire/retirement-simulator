'use client'

import { useCallback, useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { SimulationResults } from '@/types'
import { SpendingChart } from '@/components/charts/SpendingChart'
import { RealToggle } from '@/components/charts/RealToggle'
import {
  hasRealSeries,
  useBrushRange,
  useChartData,
  useChartFormatters,
} from '@/components/charts/useChartData'
import { useDisplayReal, useSetDisplayReal } from '@/lib/stores/displayStore'

interface SpendingSectionProps {
  results: SimulationResults
}

export function SpendingSection({ results }: SpendingSectionProps) {
  const t = useTranslations('simulationChart')
  const displayReal = useDisplayReal()
  const setDisplayReal = useSetDisplayReal()
  const canShowReal = hasRealSeries(results)
  const { spendingData, deflatorForAge } = useChartData(results, displayReal)
  const { formatCurrency, formatCurrencyShort, formatPercent } = useChartFormatters()
  const ages = useMemo(() => spendingData.map((d) => d.age), [spendingData])
  const { indexRange, onBrushChange, resetZoom } = useBrushRange(ages)

  const spendingTableNoteKey =
    results.params.withdrawalStrategy === 'vanguardDynamic'
      ? 'spendingTable.note.dynamic'
      : 'spendingTable.note.fixed'

  // The pension is a fixed nominal amount, so in today's euros it shrinks with
  // the median realised price level rather than staying flat.
  const monthlyPensionAtAge = useCallback(
    (age: number) =>
      age >= results.params.legalRetirementAge
        ? results.params.monthlyPension / deflatorForAge(age)
        : 0,
    [deflatorForAge, results.params.legalRetirementAge, results.params.monthlyPension]
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
        headerControls={
          canShowReal ? <RealToggle value={displayReal} onChange={setDisplayReal} /> : null
        }
      />

      <details className="border-3 border-neo-black bg-neo-white p-4 shadow-neo-sm">
        <summary className="cursor-pointer text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-neo-blue">
          {t('spendingTable.toggle')}
        </summary>
        <div className="mt-4 overflow-x-auto border-t-3 border-neo-black pt-4">
          <p className="mb-3 max-w-3xl text-[0.64rem] font-semibold uppercase leading-relaxed tracking-[0.1em] text-muted-foreground">
            {t(spendingTableNoteKey, {
              withdrawalRate: formatPercent(results.params.dsWithdrawalRate),
              ceiling: formatPercent(results.params.dsCeilingRate),
              floor: formatPercent(results.params.dsFloorRate),
            })}
          </p>
          <table className="min-w-full border-3 border-neo-black bg-neo-white text-[0.68rem] uppercase tracking-[0.12em]">
            <caption className="sr-only">{t('spendingTable.caption')}</caption>
            <thead>
              <tr className="bg-muted">
                <th className="border border-neo-black px-3 py-2 text-left">
                  {t('spendingTable.headers.age')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('spendingTable.headers.p10')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('spendingTable.headers.p50')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('spendingTable.headers.p90')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('spendingTable.headers.withdrawalRate')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('spendingTable.headers.pension')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('spendingTable.headers.portfolioDraw')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
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
                  <tr key={index} className="border-b border-neo-black">
                    <td className="border border-neo-black px-3 py-2 text-left">{data.age}</td>
                    <td className="border border-neo-black px-3 py-2 text-right">
                      {formatCurrency(data.spending_p10)}
                    </td>
                    <td className="border border-neo-black px-3 py-2 text-right">
                      {formatCurrency(data.spending_p50)}
                    </td>
                    <td className="border border-neo-black px-3 py-2 text-right">
                      {formatCurrency(data.spending_p90)}
                    </td>
                    <td className="border border-neo-black px-3 py-2 text-right">
                      {formatPercent(data.withdrawal_rate_p50)}
                    </td>
                    <td className="border border-neo-black px-3 py-2 text-right">
                      {formatCurrency(pension)}
                    </td>
                    <td className="border border-neo-black px-3 py-2 text-right">
                      {formatCurrency(portfolioDraw)}
                    </td>
                    <td className="border border-neo-black px-3 py-2 text-right font-black text-neo-black">
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
