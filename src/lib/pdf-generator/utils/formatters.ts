import type { Locale } from '@/i18n/config'
import type { Person, Projections, Spending } from '@/lib/pdf-generator/schema/reportData'

const localeMap: Record<Locale, string> = {
  en: 'en-US',
  de: 'de-DE',
}

const NARROW_NBSP = '\u202F'

type FormatterHelpers = Record<string, (...args: any[]) => any>

type SuccessBadgeKey = 'excellent' | 'good' | 'moderate' | 'needsReview'

type LocaleAwareFormatters = {
  formatEUR: (value: number) => string
  formatNumber: (value: number) => string
  formatPercent: (value: number, decimals?: number) => string
  formatDate: (dateString: string) => string
}

function createLocaleAwareFormatters(locale: Locale): LocaleAwareFormatters {
  const numberLocale = localeMap[locale] ?? localeMap.en

  const currencyFormatter = new Intl.NumberFormat(numberLocale, {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

  const integerFormatter = new Intl.NumberFormat(numberLocale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })

  function formatEUR(value: number): string {
    const formatted = currencyFormatter.format(value)
    return formatted.replace(/\s€/, `${NARROW_NBSP}€`)
  }

  function formatNumber(value: number): string {
    return integerFormatter.format(value)
  }

  function formatPercent(value: number, decimals: number = 1): string {
    const validDecimals =
      typeof decimals === 'number' && !Number.isNaN(decimals)
        ? Math.max(0, Math.min(20, decimals))
        : 1

    const normalizedValue = value > 1 ? value / 100 : value

    return new Intl.NumberFormat(numberLocale, {
      style: 'percent',
      minimumFractionDigits: validDecimals,
      maximumFractionDigits: validDecimals,
    }).format(normalizedValue)
  }

  function formatDate(dateString: string): string {
    const date = new Date(dateString)
    return new Intl.DateTimeFormat(numberLocale, {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    }).format(date)
  }

  return {
    formatEUR,
    formatNumber,
    formatPercent,
    formatDate,
  }
}

function createGeneralHelpers(): FormatterHelpers {
  const multiply = (a: number, b: number): number => a * b
  const subtract = (a: number, b: number): number => a - b
  const concat = (...args: unknown[]): string => {
    const values = args.slice(0, -1) as string[]
    return values.join('')
  }
  const figureNumber = (num: number): string => `${num}`
  const capitalize = (str?: string): string => {
    if (!str) return ''
    return str.charAt(0).toUpperCase() + str.slice(1)
  }

  const getSpendingPercent = (amount: number, spending: Spending): number => {
    const total = getTotalAnnualSpending(spending)
    const annualAmount = amount * 12
    return total > 0 ? (annualAmount / total) * 100 : 0
  }

  const getTotalMonthlySpending = (spending: Spending): number => {
    const monthly = spending.monthly || {}
    return (
      (monthly.health || 0) +
      (monthly.food || 0) +
      (monthly.entertainment || 0) +
      (monthly.shopping || 0) +
      (monthly.utilities || 0)
    )
  }

  const getTotalAnnualSpending = (spending: Spending): number => {
    const monthlyTotal = getTotalMonthlySpending(spending) * 12
    const annual = spending.annual || {}
    const annualTotal = (annual.vacations || 0) + (annual.homeRepairs || 0) + (annual.car || 0)
    return monthlyTotal + annualTotal
  }

  const successBadge = (successRate: number): SuccessBadgeKey => {
    if (successRate >= 90) return 'excellent'
    if (successRate >= 75) return 'good'
    if (successRate >= 50) return 'moderate'
    return 'needsReview'
  }

  const successBadgeColor = (successRate: number): string => {
    if (successRate >= 90) return 'excellent'
    if (successRate >= 75) return 'good'
    if (successRate >= 50) return 'warning'
    return 'danger'
  }

  const getFailureCount = (totalRuns: number, successRatePct: number): number => {
    const successRate = successRatePct / 100
    return Math.round(totalRuns * (1 - successRate))
  }

  const getRetirementMedian = (projections: Projections, person: Person): number => {
    const retirementMilestone = projections.milestones.find((m) => m.age === person.retireAge)
    return retirementMilestone ? retirementMilestone.p50 : 0
  }

  const getRetirement10th = (projections: Projections, person: Person): number => {
    const retirementMilestone = projections.milestones.find((m) => m.age === person.retireAge)
    return retirementMilestone ? retirementMilestone.p10 : 0
  }

  const getRetirement90th = (projections: Projections, person: Person): number => {
    const retirementMilestone = projections.milestones.find((m) => m.age === person.retireAge)
    return retirementMilestone ? retirementMilestone.p90 : 0
  }

  const getFinalMedian = (projections: Projections): number => {
    const lastMilestone = projections.milestones[projections.milestones.length - 1]
    return lastMilestone ? lastMilestone.p50 : 0
  }

  const getFinal10th = (projections: Projections): number => {
    const lastMilestone = projections.milestones[projections.milestones.length - 1]
    return lastMilestone ? lastMilestone.p10 : 0
  }

  const getFinal90th = (projections: Projections): number => {
    const lastMilestone = projections.milestones[projections.milestones.length - 1]
    return lastMilestone ? lastMilestone.p90 : 0
  }

  const isRetirementAge = (age: number, retireAge: number): boolean => age === retireAge

  return {
    multiply,
    subtract,
    concat,
    figureNumber,
    capitalize,
    getSpendingPercent,
    getTotalMonthlySpending,
    getTotalAnnualSpending,
    getSuccessBadgeKey: successBadge,
    getSuccessBadgeColor: successBadgeColor,
    getFailureCount,
    getRetirementMedian,
    getRetirement10th,
    getRetirement90th,
    getFinalMedian,
    getFinal10th,
    getFinal90th,
    isRetirementAge,
  }
}

export function createFormatterHelpers(locale: Locale): FormatterHelpers {
  const localeAware = createLocaleAwareFormatters(locale)
  const general = createGeneralHelpers()

  return {
    ...localeAware,
    ...general,
  }
}

export type { SuccessBadgeKey }
