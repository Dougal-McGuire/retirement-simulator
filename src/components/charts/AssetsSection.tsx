'use client'

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { SimulationResults } from '@/types'
import { AssetsChart } from '@/components/charts/AssetsChart'
import { RealToggle } from '@/components/charts/RealToggle'
import {
  hasRealSeries,
  useBrushRange,
  useChartData,
  useChartFormatters,
} from '@/components/charts/useChartData'
import { useDisplayReal, useSetDisplayReal } from '@/lib/stores/displayStore'
import { deriveDepletionAges } from '@/lib/insights/depletion'
import { cn } from '@/lib/utils'

interface AssetsSectionProps {
  results: SimulationResults
}

export function AssetsSection({ results }: AssetsSectionProps) {
  const t = useTranslations('simulationChart')
  const displayReal = useDisplayReal()
  const setDisplayReal = useSetDisplayReal()
  // Results persisted by an older build carry no real-terms series; hide the
  // control entirely rather than offering a switch that does nothing.
  const canShowReal = hasRealSeries(results)
  const { chartDataWithBand, milestoneRows } = useChartData(results, displayReal)
  const { formatCurrency, formatCurrencyShort } = useChartFormatters()
  const ages = useMemo(() => chartDataWithBand.map((d) => d.age), [chartDataWithBand])
  const { indexRange, onBrushChange, resetZoom } = useBrushRange(ages)
  const depletion = useMemo(() => deriveDepletionAges(results), [results])

  return (
    <div className="space-y-5">
      <AssetsChart
        data={chartDataWithBand}
        marketModel={results.params.marketModel}
        retirementAge={results.params.retirementAge}
        legalRetirementAge={results.params.legalRetirementAge}
        p10DepletionAge={depletion.p10DepletionAge}
        p50DepletionAge={depletion.p50DepletionAge}
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
          {t('assetTable.toggle')}
        </summary>
        <div className="mt-4 overflow-x-auto border-t-3 border-neo-black pt-4">
          <table className="min-w-full border-3 border-neo-black bg-neo-white text-[0.68rem] uppercase tracking-[0.12em]">
            <caption className="sr-only">{t('assetTable.caption')}</caption>
            <thead>
              <tr className="bg-muted">
                <th className="border border-neo-black px-3 py-2 text-left">
                  {t('assetTable.headers.age')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('assetTable.headers.p10')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('assetTable.headers.p50')}
                </th>
                <th className="border border-neo-black px-3 py-2 text-right">
                  {t('assetTable.headers.p90')}
                </th>
              </tr>
            </thead>
            <tbody>
              {milestoneRows.map((row) => {
                const isRetirementAge = row.age === results.params.retirementAge
                return (
                  <tr
                    key={row.age}
                    className={cn(
                      'border-b border-neo-black',
                      isRetirementAge
                        ? 'bg-neo-blue/10 font-bold text-neo-blue'
                        : 'bg-neo-white text-foreground'
                    )}
                  >
                    <td className="border border-neo-black px-3 py-2">
                      {row.age}{' '}
                      {isRetirementAge && (
                        <span className="ml-2 text-[0.58rem] font-semibold uppercase tracking-[0.16em] text-neo-blue">
                          {t('assetTable.retirementFlag')}
                        </span>
                      )}
                    </td>
                    <td className="border border-neo-black px-3 py-2 text-right">
                      {formatCurrency(row.p10)}
                    </td>
                    <td className="border border-neo-black px-3 py-2 text-right">
                      {formatCurrency(row.p50)}
                    </td>
                    <td className="border border-neo-black px-3 py-2 text-right">
                      {formatCurrency(row.p90)}
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
