import type { ShortfallSummary } from '@/types'

/** Three observations per affected path; the individual years never leave the engine. */
export class ShortfallDistribution {
  private firstAges: number[] = []
  private affectedYears: number[] = []
  private averageMonthlyGaps: number[] = []
  private atHorizon = 0

  private firstAge = 0
  private years = 0
  private totalMonthlyGap = 0

  recordYear(age: number, monthlyGap: number, isFinalYear: boolean) {
    if (this.years === 0) this.firstAge = age
    this.years++
    this.totalMonthlyGap += monthlyGap
    if (isFinalYear) this.atHorizon++
  }

  endPath() {
    if (this.years === 0) return false
    this.firstAges.push(this.firstAge)
    this.affectedYears.push(this.years)
    this.averageMonthlyGaps.push(this.totalMonthlyGap / this.years)
    this.years = 0
    this.totalMonthlyGap = 0
    return true
  }

  summary(percentile: (values: number[], p: number) => number): ShortfallSummary {
    const median = (values: number[]) => (values.length ? percentile(values, 50) : null)
    return {
      affectedPaths: this.firstAges.length,
      atHorizon: this.atHorizon,
      medianFirstAge: median(this.firstAges),
      medianAffectedYears: median(this.affectedYears),
      medianMonthlyGapReal: median(this.averageMonthlyGaps),
    }
  }
}
