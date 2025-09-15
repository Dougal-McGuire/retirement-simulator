'use client'

import { useMemo, useState, useCallback, useRef } from 'react'
import type { SimulationResults, ChartDataPoint } from '@/types'
import { useSetAutoRunSuspended } from '@/lib/stores/simulationStore'
import { AssetsChart, type BandPoint } from '@/components/charts/AssetsChart'
import { SpendingChart } from '@/components/charts/SpendingChart'

interface SimulationChartProps {
  results: SimulationResults | null
  isLoading: boolean
}

export function SimulationChart({ results, isLoading }: SimulationChartProps) {
  if (isLoading) {
    return (
      <div className="h-96 flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Running Monte Carlo simulation...</p>
          <p className="text-sm text-gray-500 mt-1">This may take a few moments</p>
        </div>
      </div>
    )
  }

  if (!results) {
    return (
      <div className="h-96 flex items-center justify-center bg-gray-50 rounded-lg">
        <div className="text-center">
          <p className="text-gray-600">No simulation data available</p>
          <p className="text-sm text-gray-500 mt-1">Adjust parameters to run simulation</p>
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

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value)

  const formatCurrencyShort = (value: number) => {
    if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `€${(value / 1_000).toFixed(0)}K`
    return `€${value.toFixed(0)}`
  }

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
      />

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
          View spending data table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="min-w-full text-xs border border-gray-300">
            <caption className="sr-only">
              Monthly spending projections during retirement by age and percentile
            </caption>
            <thead>
              <tr className="bg-gray-50">
                <th className="border px-2 py-1">Age</th>
                <th className="border px-2 py-1">10th Percentile</th>
                <th className="border px-2 py-1">20th Percentile</th>
                <th className="border px-2 py-1">50th Percentile</th>
                <th className="border px-2 py-1">80th Percentile</th>
                <th className="border px-2 py-1">90th Percentile</th>
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
