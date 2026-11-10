import { getPlanHealth, type PlanHealth } from '@/lib/simulation/planInsights'
import { fmtNumber, fmtRatioPercent } from '@/lib/pdf-generator/formatters'

/**
 * Everything the report says about the plan score, generated from the score's
 * actual parts — so a sentence can only appear when its number is the reason.
 * (The old line printed "solid savings rate" for any plan whose spending
 * sub-score was high, and "same figure as the dashboard" for a figure no
 * dashboard surface computed.)
 *
 * German copy is formal, like the rest of the report.
 */

export type PlanBand = PlanHealth

type Locale = 'de' | 'en'

/** One weighted part of the score, as carried in the report payload. */
export interface PlanScorePart {
  id: string
  /** 0–100 sub-score. */
  value: number
  /** 0–1. */
  weight: number
}

/**
 * The plan's band for a success rate given as a fraction (0..1) — the app's
 * `getPlanHealth`, guarded against `0.9 * 100 === 90.00000000000001`.
 */
export function planBandOfRate(successRate: number): PlanBand {
  return getPlanHealth(Math.round(successRate * 1e6) / 1e4)
}

const BAND_LABELS: Record<PlanBand, Record<Locale, string>> = {
  strong: { de: 'Stark', en: 'Strong' },
  watch: { de: 'Beobachten', en: 'Watch' },
  strained: { de: 'Angespannt', en: 'Strained' },
}

const BAND_RULES: Record<PlanBand, Record<Locale, string>> = {
  strong: { de: 'ab 90 %', en: '90% or more' },
  watch: { de: '75 % bis unter 90 %', en: '75% to under 90%' },
  strained: { de: 'unter 75 %', en: 'below 75%' },
}

export function planBandLabel(band: PlanBand, locale: Locale): string {
  return BAND_LABELS[band][locale]
}

/** "ab 90 %" — the success-rate range a band stands for. */
export function planBandRule(band: PlanBand, locale: Locale): string {
  return BAND_RULES[band][locale]
}

/**
 * Why the score is what it is: one sentence per part, each quoting the part's
 * own number.
 */
export function planScoreReasons(
  input: {
    /** 0..100 */
    successRatePct: number
    band: PlanBand
    parts: readonly PlanScorePart[]
    /** First-year withdrawal rate (fraction); `null` when not readable. */
    withdrawalRate: number | null
  },
  locale: Locale
): string[] {
  const de = locale === 'de'
  const intl = de ? 'de-DE' : 'en-US'
  const rate = fmtRatioPercent(input.successRatePct / 100, 1, intl)
  const reasons: string[] = [
    de
      ? `Erfolgsquote ${rate}: Einstufung „${planBandLabel(input.band, 'de')}“ (${planBandRule(input.band, 'de')})`
      : `Success rate ${rate}: graded "${planBandLabel(input.band, 'en')}" (${planBandRule(input.band, 'en')})`,
  ]

  const withdrawal = input.parts.find((part) => part.id === 'withdrawal')
  if (withdrawal && input.withdrawalRate !== null) {
    const shown = fmtRatioPercent(input.withdrawalRate, 1, intl)
    const pointsAbove = Math.max(0, input.withdrawalRate - 0.04) * 100
    if (pointsAbove <= 0) {
      reasons.push(
        de
          ? `Entnahmerate im ersten Ruhestandsjahr ${shown}: nicht über 4 %, voller Teilwert`
          : `First-year withdrawal rate ${shown}: not above 4%, full sub-score`
      )
    } else {
      const above = fmtNumber(pointsAbove, {
        locale: intl,
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
      const value = fmtNumber(Math.round(withdrawal.value), { locale: intl })
      reasons.push(
        de
          ? `Entnahmerate im ersten Ruhestandsjahr ${shown}: ${above} Prozentpunkte über 4 %, Teilwert ${value} von 100`
          : `First-year withdrawal rate ${shown}: ${above} percentage points above 4%, sub-score ${value} of 100`
      )
    }
  } else {
    reasons.push(
      de
        ? 'Entnahmerate nicht bewertet: Die Ergebnisse weisen für kein erstes Ruhestandsjahr eine Entnahme aus; der Score entspricht der Erfolgsquote'
        : 'Withdrawal rate not scored: the results state no withdrawal for a first retirement year; the score equals the success rate'
    )
  }
  return reasons
}

/** Glossary entry: how the score is built, with the weights actually applied. */
export function planScoreGlossary(parts: readonly PlanScorePart[], locale: Locale): string {
  const de = locale === 'de'
  const intl = de ? 'de-DE' : 'en-US'
  const weightOf = (id: string) => {
    const part = parts.find((entry) => entry.id === id)
    return part ? fmtRatioPercent(part.weight, 0, intl) : null
  }
  const success = weightOf('success')
  const withdrawal = weightOf('withdrawal')
  const grading = de
    ? 'Die Einstufung „Stark“, „Beobachten“ oder „Angespannt“ richtet sich allein nach der Erfolgsquote (ab 90 %, ab 75 %, darunter).'
    : 'The grading "Strong", "Watch" or "Strained" follows the success rate alone (from 90%, from 75%, below).'
  if (success && withdrawal) {
    return de
      ? `Gewichteter Mittelwert aus Erfolgsquote (${success}) und Entnahmerate im ersten Ruhestandsjahr (${withdrawal}; voller Teilwert bis 4 %, je Prozentpunkt darüber 25 Punkte weniger), gerundet auf ganze Punkte. ${grading}`
      : `Weighted mean of the success rate (${success}) and the first-year withdrawal rate (${withdrawal}; full sub-score up to 4%, 25 points less per percentage point above), rounded to whole points. ${grading}`
  }
  return de
    ? `Entspricht in diesem Bericht der Erfolgsquote, auf ganze Punkte gerundet: Eine Entnahmerate ließ sich nicht ablesen. ${grading}`
    : `Equals the success rate in this report, rounded to whole points: no withdrawal rate could be read. ${grading}`
}
