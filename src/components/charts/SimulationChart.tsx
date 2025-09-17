'use client'

import { useMemo, useState, useCallback, useRef } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import type { SimulationResults, ChartDataPoint } from '@/types'
import { useSetAutoRunSuspended } from '@/lib/stores/simulationStore'
import { AssetsChart, type BandPoint } from '@/components/charts/AssetsChart'
import { SpendingChart } from '@/components/charts/SpendingChart'

interface SimulationChartProps {
  results: SimulationResults | null
  isLoading: boolean
}

export function SimulationChart({ results, isLoading }: SimulationChartProps) {
  const t = useTranslations('simulationChart')
  const format = useFormatter()
  if (isLoading) {
    return (
      <div className="h-96 flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">{t('loading.title')}</p>
          <p className="text-sm text-gray-500 mt-1">{t('loading.subtitle')}</p>
        </div>
      </div>
    )
  }

  if (!results) {
    return (
      <div className="h-96 flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="text-center">
          <p className="text-gray-600">{t('empty.title')}</p>
          <p className="text-sm text-gray-500 mt-1">{t('empty.subtitle')}</p>
        </div>
      </div>
    )
  }

  // Transform data for charts
  const chartData: ChartDataPoint[] = useMemo(
    () =>
      results.ages.map((age, index) => ({
        age,
        assets_p10: Math.round(results.assetPercentiles.p10[index]),
        assets_p20: Math.round(results.assetPercentiles.p20[index]),
        assets_p50: Math.round(results.assetPercentiles.p50[index]),
        assets_p80: Math.round(results.assetPercentiles.p80[index]),
        assets_p90: Math.round(results.assetPercentiles.p90[index]),
        spending_p10: Math.round(results.spendingPercentiles.p10[index]),
        spending_p20: Math.round(results.spendingPercentiles.p20[index]),
        spending_p50: Math.round(results.spendingPercentiles.p50[index]),
        spending_p80: Math.round(results.spendingPercentiles.p80[index]),
        spending_p90: Math.round(results.spendingPercentiles.p90[index]),
      })),
    [results]
  )

  const chartDataWithBand: BandPoint[] = useMemo(
    () =>
      chartData.map((d) => ({
        ...d,
        assets_band_lower: d.assets_p20,
        assets_band_height: Math.max(0, d.assets_p80 - d.assets_p20),
      })),
    [chartData]
  )

  const milestoneRows = useMemo(
    () =>
      chartData.map((d) => ({
        age: d.age,
        p10: d.assets_p10,
        p50: d.assets_p50,
        p90: d.assets_p90,
      })),
    [chartData]
  )

  // Shared horizontal zoom range
  const [ageRange, setAgeRange] = useState<{ startAge?: number; endAge?: number }>({})

  const assetsAges = useMemo(() => chartDataWithBand.map((d) => d.age), [chartDataWithBand])
  const spendingData = useMemo(
    () => chartData.filter((d) => d.age >= results.params.retirementAge),
    [chartData, results.params.retirementAge]
  )
  const spendingAges = useMemo(() => spendingData.map((d) => d.age), [spendingData])

  const toIndexRange = (ages: number[], startAge?: number, endAge?: number) => {
    if (startAge == null || endAge == null) {
      return { startIndex: 0, endIndex: Math.max(0, ages.length - 1) }
    }
    let startIndex = ages.findIndex((a) => a >= startAge)
    if (startIndex === -1) startIndex = 0
    let endIndex = ages.findIndex((a) => a > endAge)
    endIndex = endIndex === -1 ? ages.length - 1 : Math.max(startIndex, endIndex - 1)
    return { startIndex, endIndex }
  }

  const assetsIndexRange = useMemo(
    () => toIndexRange(assetsAges, ageRange.startAge, ageRange.endAge),
    [assetsAges, ageRange]
  )
  const spendingIndexRange = useMemo(
    () => toIndexRange(spendingAges, ageRange.startAge, ageRange.endAge),
    [spendingAges, ageRange]
  )

  const setAutoRunSuspended = useSetAutoRunSuspended()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleResume = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setAutoRunSuspended(false)
    }, 500)
  }, [setAutoRunSuspended])

  const onAssetsBrushChange = useCallback(
    (range: { startIndex?: number; endIndex?: number }) => {
      if (!range || range.startIndex == null || range.endIndex == null) return
      if (
        range.startIndex === assetsIndexRange.startIndex &&
        range.endIndex === assetsIndexRange.endIndex
      ) {
        scheduleResume()
        return
      }
      const startAge = assetsAges[Math.max(0, Math.min(range.startIndex, assetsAges.length - 1))]
      const endAge = assetsAges[Math.max(0, Math.min(range.endIndex, assetsAges.length - 1))]
      setAgeRange({ startAge, endAge })
      setAutoRunSuspended(true)
      scheduleResume()
    },
    [
      assetsAges,
      assetsIndexRange.startIndex,
      assetsIndexRange.endIndex,
      scheduleResume,
      setAutoRunSuspended,
    ]
  )

  const onSpendingBrushChange = useCallback(
    (range: { startIndex?: number; endIndex?: number }) => {
      if (!range || range.startIndex == null || range.endIndex == null) return
      if (
        range.startIndex === spendingIndexRange.startIndex &&
        range.endIndex === spendingIndexRange.endIndex
      ) {
        scheduleResume()
        return
      }
      const startAge =
        spendingAges[Math.max(0, Math.min(range.startIndex, spendingAges.length - 1))]
      const endAge = spendingAges[Math.max(0, Math.min(range.endIndex, spendingAges.length - 1))]
      setAgeRange({ startAge, endAge })
      setAutoRunSuspended(true)
      scheduleResume()
    },
    [
      scheduleResume,
      setAutoRunSuspended,
      spendingAges,
      spendingIndexRange.startIndex,
      spendingIndexRange.endIndex,
    ]
  )

  const resetZoom = useCallback(() => {
    setAgeRange({})
    setAutoRunSuspended(false)
  }, [setAgeRange, setAutoRunSuspended])

  const formatCurrency = useCallback(
    (value: number) =>
      format.number(value, {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
      }),
    [format]
  )

  const formatCurrencyShort = useCallback(
    (value: number) =>
      format.number(value, {
        style: 'currency',
        currency: 'EUR',
        notation: 'compact',
        maximumFractionDigits: 1,
        minimumFractionDigits: 0,
      }),
    [format]
  )

  return (
    <div className="space-y-8">
      <AssetsChart
        data={chartDataWithBand}
        retirementAge={results.params.retirementAge}
        legalRetirementAge={results.params.legalRetirementAge}
        indexRange={assetsIndexRange}
        onBrushChange={onAssetsBrushChange}
        onResetZoom={resetZoom}
        formatCurrency={formatCurrency}
        formatCurrencyShort={formatCurrencyShort}
      />

      <details className="mt-4">
        <summary className="text-sm text-blue-600 cursor-pointer hover:text-blue-800">
          {t('assetTable.toggle')}
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-xs border border-gray-300">
            <caption className="sr-only">{t('assetTable.caption')}</caption>
            <thead>
              <tr className="bg-gray-50">
                <th className="border px-2 py-1 text-left">{t('assetTable.headers.age')}</th>
                <th className="border px-2 py-1 text-right">{t('assetTable.headers.p10')}</th>
                <th className="border px-2 py-1 text-right">{t('assetTable.headers.p50')}</th>
                <th className="border px-2 py-1 text-right">{t('assetTable.headers.p90')}</th>
              </tr>
            </thead>
            <tbody>
              {milestoneRows.map((row) => {
                const isRetirementAge = row.age === results.params.retirementAge
                return (
                  <tr
                    key={row.age}
                    className={`border ${
                      isRetirementAge ? 'bg-blue-50 font-semibold' : 'bg-white'
                    }`}
                  >
                    <td className="border px-2 py-1">
                      {row.age}{' '}
                      {isRetirementAge && (
                        <span className="text-[10px] text-blue-600">{t('assetTable.retirementFlag')}</span>
                      )}
                    </td>
                    <td className="border px-2 py-1 text-right">{formatCurrency(row.p10)}</td>
                    <td className="border px-2 py-1 text-right">{formatCurrency(row.p50)}</td>
                    <td className="border px-2 py-1 text-right">{formatCurrency(row.p90)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </details>

      <SpendingChart
        data={spendingData}
        retirementAge={results.params.retirementAge}
        indexRange={spendingIndexRange}
        onBrushChange={onSpendingBrushChange}
        onResetZoom={resetZoom}
        formatCurrency={formatCurrency}
        formatCurrencyShort={formatCurrencyShort}
      />

      {/* Data Table for Accessibility */}
      <details className="mt-4">
        <summary className="text-sm text-blue-600 cursor-pointer hover:text-blue-800">
          {t('spendingTable.toggle')}
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-xs border border-gray-300">
            <caption className="sr-only">{t('spendingTable.caption')}</caption>
            <thead>
              <tr className="bg-gray-50">
                <th className="border px-2 py-1">{t('spendingTable.headers.age')}</th>
                <th className="border px-2 py-1">{t('spendingTable.headers.p10')}</th>
                <th className="border px-2 py-1">{t('spendingTable.headers.p20')}</th>
                <th className="border px-2 py-1">{t('spendingTable.headers.p50')}</th>
                <th className="border px-2 py-1">{t('spendingTable.headers.p80')}</th>
                <th className="border px-2 py-1">{t('spendingTable.headers.p90')}</th>
              </tr>
            </thead>
            <tbody>
              {chartData
                .filter((d) => d.age >= results.params.retirementAge && d.age % 5 === 0)
                .map((data, index) => (
                  <tr key={index}>
                    <td className="border px-2 py-1">{data.age}</td>
                    <td className="border px-2 py-1">{formatCurrency(data.spending_p10)}</td>
                    <td className="border px-2 py-1">{formatCurrency(data.spending_p20)}</td>
                    <td className="border px-2 py-1">{formatCurrency(data.spending_p50)}</td>
                    <td className="border px-2 py-1">{formatCurrency(data.spending_p80)}</td>
                    <td className="border px-2 py-1">{formatCurrency(data.spending_p90)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
