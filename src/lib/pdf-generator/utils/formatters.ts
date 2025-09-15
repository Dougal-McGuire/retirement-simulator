// Number and currency formatters with proper German/European formatting

const NARROW_NBSP = '\u202F' // Narrow no-break space

export function formatEUR(value: number): string {
  // Format with German locale
  const formatted = new Intl.NumberFormat('de-DE', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)

  // Replace regular space with narrow no-break space before € symbol
  return formatted.replace(/\s€/, `${NARROW_NBSP}€`)
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('de-DE', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export function formatPercent(value: number, decimals: number = 1): string {
  // Ensure decimals is valid
  const validDecimals =
    typeof decimals === 'number' && !isNaN(decimals) ? Math.max(0, Math.min(20, decimals)) : 1

  // Value might be in decimal (0.05) or percentage (5) format
  const normalizedValue = value > 1 ? value / 100 : value

  return new Intl.NumberFormat('de-DE', {
    style: 'percent',
    minimumFractionDigits: validDecimals,
    maximumFractionDigits: validDecimals,
  }).format(normalizedValue)
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString)
  // DD.MM.YYYY as requested for DACH conventions
  const d = String(date.getDate()).padStart(2, '0')
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const y = String(date.getFullYear())
  return `${d}.${m}.${y}`
}

// Helper functions for Handlebars templates
export function multiply(a: number, b: number): number {
  return a * b
}

export function subtract(a: number, b: number): number {
  return a - b
}

import type { Spending, Projections, Person } from '@/lib/pdf-generator/schema/reportData'

export function getSpendingPercent(amount: number, spending: Spending): number {
  const total = getTotalAnnualSpending(spending)
  const annualAmount = amount * 12 // Convert monthly to annual
  return total > 0 ? (annualAmount / total) * 100 : 0
}

export function getTotalMonthlySpending(spending: Spending): number {
  const monthly = spending.monthly || {}
  return (
    (monthly.health || 0) +
    (monthly.food || 0) +
    (monthly.entertainment || 0) +
    (monthly.shopping || 0) +
    (monthly.utilities || 0)
  )
}

export function getTotalAnnualSpending(spending: Spending): number {
  const monthlyTotal = getTotalMonthlySpending(spending) * 12
  const annual = spending.annual || {}
  const annualTotal = (annual.vacations || 0) + (annual.homeRepairs || 0) + (annual.car || 0)
  return monthlyTotal + annualTotal
}

export function getSuccessBadge(successRate: number): string {
  if (successRate >= 90) return 'Excellent'
  if (successRate >= 75) return 'Good'
  if (successRate >= 50) return 'Moderate'
  return 'Needs Review'
}

export function getSuccessBadgeColor(successRate: number): string {
  if (successRate >= 90) return 'excellent'
  if (successRate >= 75) return 'good'
  if (successRate >= 50) return 'warning'
  return 'danger'
}

export function getFailureCount(totalRuns: number, successRatePct: number): number {
  const successRate = successRatePct / 100
  return Math.round(totalRuns * (1 - successRate))
}

export function getRetirementMedian(projections: Projections, person: Person): number {
  const retirementMilestone = projections.milestones.find((m) => m.age === person.retireAge)
  return retirementMilestone ? retirementMilestone.p50 : 0
}

export function getRetirement10th(projections: Projections, person: Person): number {
  const retirementMilestone = projections.milestones.find((m) => m.age === person.retireAge)
  return retirementMilestone ? retirementMilestone.p10 : 0
}

export function getRetirement90th(projections: Projections, person: Person): number {
  const retirementMilestone = projections.milestones.find((m) => m.age === person.retireAge)
  return retirementMilestone ? retirementMilestone.p90 : 0
}

export function getFinalMedian(projections: Projections): number {
  const lastMilestone = projections.milestones[projections.milestones.length - 1]
  return lastMilestone ? lastMilestone.p50 : 0
}

export function getFinal10th(projections: Projections): number {
  const lastMilestone = projections.milestones[projections.milestones.length - 1]
  return lastMilestone ? lastMilestone.p10 : 0
}

export function getFinal90th(projections: Projections): number {
  const lastMilestone = projections.milestones[projections.milestones.length - 1]
  return lastMilestone ? lastMilestone.p90 : 0
}

export function isRetirementAge(age: number, retireAge: number): boolean {
  return age === retireAge
}

export function concat(...args: unknown[]): string {
  // Remove last argument (Handlebars options object)
  const values = args.slice(0, -1) as string[]
  return values.join('')
}

export function figureNumber(num: number): string {
  return `${num}`
}

export function capitalize(str?: string): string {
  if (!str) return ''
  return str.charAt(0).toUpperCase() + str.slice(1)
}
