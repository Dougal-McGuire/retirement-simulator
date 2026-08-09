'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { useFormatter } from 'next-intl'
import type { ChartDataPoint, SimulationResults } from '@/types'
import type { BandPoint } from '@/components/charts/AssetsChart'
import { useSetAutoRunSuspended } from '@/lib/stores/simulationStore'
import { useCompactCurrency } from '@/lib/hooks/useCompactCurrency'

/**
 * True when the results carry the real-terms series, i.e. were produced by an
 * engine that knows about them. Results persisted by an older build do not, and
 * the UI has to fall back to nominal rather than render blanks.
 */
export function hasRealSeries(results: SimulationResults | null | undefined): boolean {
  return Boolean(results?.assetPercentilesReal && results?.spendingPercentilesReal)
}

export function useChartData(results: SimulationResults, displayReal = false) {
  // Real mode is only honoured when the engine actually produced the deflated
  // series; otherwise we silently stay nominal.
  const real = displayReal && hasRealSeries(results)

  const chartData: ChartDataPoint[] = useMemo(() => {
    const assets = (real && results.assetPercentilesReal) || results.assetPercentiles
    const spending = (real && results.spendingPercentilesReal) || results.spendingPercentiles

    return results.ages.map((age, index) => {
      const yearsFromStart = age - results.params.currentAge
      const annualSavingsAtAge =
        age < results.params.retirementAge
          ? results.params.annualSavings *
            Math.pow(1 + results.params.annualSavingsGrowthRate, Math.max(0, yearsFromStart))
          : 0
      const nominalMonthlySavings =
        age < results.params.retirementAge ? annualSavingsAtAge / 12 : null
      // A pension and a savings rate are fixed *nominal* euro amounts, so in
      // real mode they have to be divided by the median realised price level
      // rather than left alone.
      const deflator = real ? (results.inflationIndexP50?.[index] ?? 1) : 1
      const monthlySavings =
        nominalMonthlySavings === null ? null : nominalMonthlySavings / deflator
      const monthlyPensionAtAge =
        age >= results.params.legalRetirementAge ? results.params.monthlyPension / deflator : 0
      const medianPortfolioDraw = Math.max(0, spending.p50[index] - monthlyPensionAtAge)

      return {
        age,
        assets_p10: Math.round(assets.p10[index]),
        assets_p20: Math.round(assets.p20[index]),
        assets_p50: Math.round(assets.p50[index]),
        assets_p80: Math.round(assets.p80[index]),
        assets_p90: Math.round(assets.p90[index]),
        spending_p10: Math.round(spending.p10[index]),
        spending_p50: Math.round(spending.p50[index]),
        spending_p90: Math.round(spending.p90[index]),
        // A ratio of two like-for-like series: identical in both modes, as it
        // should be — deflating cannot change a withdrawal *rate*.
        withdrawal_rate_p50:
          assets.p50[index] > 0 ? (medianPortfolioDraw * 12) / assets.p50[index] : null,
        monthly_savings_p50: monthlySavings,
      }
    })
  }, [results, real])

  const chartDataWithBand: BandPoint[] = useMemo(
    () =>
      chartData.map((d) => ({
        ...d,
        assets_band_lower: d.assets_p20,
        assets_band_height: Math.max(0, d.assets_p80 - d.assets_p20),
        assets_outer_lower: d.assets_p10,
        assets_outer_height: Math.max(0, d.assets_p90 - d.assets_p10),
        spending_band_lower: d.spending_p10,
        spending_band_height: Math.max(0, d.spending_p90 - d.spending_p10),
      })),
    [chartData]
  )

  const spendingData = useMemo(
    () => chartDataWithBand.filter((d) => d.age >= results.params.retirementAge),
    [chartDataWithBand, results.params.retirementAge]
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

  /**
   * Divides a nominally fixed euro amount at `age` into the displayed unit.
   * The identity in nominal mode, the median realised price level in real mode.
   */
  const deflatorForAge = useCallback(
    (age: number) => {
      if (!real) return 1
      const index = results.ages.indexOf(age)
      return (index === -1 ? undefined : results.inflationIndexP50?.[index]) ?? 1
    },
    [real, results]
  )

  return { chartData, chartDataWithBand, spendingData, milestoneRows, real, deflatorForAge }
}

export function useChartFormatters() {
  const format = useFormatter()

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

  const compactCurrency = useCompactCurrency()
  const formatCurrencyShort = useCallback(
    (value: number) => compactCurrency(value),
    [compactCurrency]
  )

  const formatPercent = useCallback(
    (value: number | null) =>
      value == null
        ? '—'
        : format.number(value, {
            style: 'percent',
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          }),
    [format]
  )

  return { formatCurrency, formatCurrencyShort, formatPercent }
}

function toIndexRange(ages: number[], startAge?: number, endAge?: number) {
  if (startAge == null || endAge == null) {
    return { startIndex: 0, endIndex: Math.max(0, ages.length - 1) }
  }
  let startIndex = ages.findIndex((a) => a >= startAge)
  if (startIndex === -1) startIndex = 0
  let endIndex = ages.findIndex((a) => a > endAge)
  endIndex = endIndex === -1 ? ages.length - 1 : Math.max(startIndex, endIndex - 1)
  return { startIndex, endIndex }
}

export function useBrushRange(ages: number[]) {
  const [ageRange, setAgeRange] = useState<{ startAge?: number; endAge?: number }>({})
  const setAutoRunSuspended = useSetAutoRunSuspended()
  // Intentionally not cleared on unmount: the pending timer must still resume auto-run, otherwise it could stay suspended forever.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scheduleResume = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      setAutoRunSuspended(false)
    }, 500)
  }, [setAutoRunSuspended])

  const indexRange = useMemo(
    () => toIndexRange(ages, ageRange.startAge, ageRange.endAge),
    [ages, ageRange]
  )

  const onBrushChange = useCallback(
    (range: { startIndex?: number; endIndex?: number }) => {
      if (!range || range.startIndex == null || range.endIndex == null) return
      if (range.startIndex === indexRange.startIndex && range.endIndex === indexRange.endIndex) {
        scheduleResume()
        return
      }
      const startAge = ages[Math.max(0, Math.min(range.startIndex, ages.length - 1))]
      const endAge = ages[Math.max(0, Math.min(range.endIndex, ages.length - 1))]
      setAgeRange({ startAge, endAge })
      setAutoRunSuspended(true)
      scheduleResume()
    },
    [ages, indexRange.startIndex, indexRange.endIndex, scheduleResume, setAutoRunSuspended]
  )

  const resetZoom = useCallback(() => {
    setAgeRange({})
    setAutoRunSuspended(false)
  }, [setAutoRunSuspended])

  return { indexRange, onBrushChange, resetZoom }
}
