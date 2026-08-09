import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import {
  fmtCurrency,
  fmtNumber,
  fmtPercent,
  fmtRatioPercent,
} from '@/lib/pdf-generator/formatters'

export type FindingTone = 'positive' | 'neutral' | 'risk'

export interface KeyFinding {
  id: string
  tone: FindingTone
  text: string
}

/**
 * Key findings are *derived from the simulation output*, not copied from the
 * recommendation list — the recommendations already have their own section, and
 * repeating their titles here told the reader nothing new. Each finding states
 * a number the reader can check against the tables later in the report.
 */
export function deriveKeyFindings(content: ReportContent): KeyFinding[] {
  const { profile, projections, expenses, finances, assumptions, simulation } = content
  const isGerman = content.locale !== 'en'
  const locale = content.locale === 'en' ? 'en-US' : 'de-DE'

  const findings: KeyFinding[] = []
  const { person, success } = profile
  const milestones = projections.milestones
  const annualSpend = expenses.monthlyTotal * 12 + expenses.annualTotal
  const pensionAnnual = finances.monthlyPension * 12
  const money = (value: number) => fmtCurrency(value, locale)
  const num = (value: number) => fmtNumber(value, { locale })
  // A historical backtest has no "simulation runs" — it has start years. Every
  // count in this list is the context's, and so is the word used for it.
  const isHistorical = simulation.marketModel === 'historical'
  const pathWord = isHistorical
    ? isGerman
      ? 'historischen Startjahre'
      : 'historical start years'
    : isGerman
      ? 'Simulationsläufe'
      : 'simulation runs'
  const pathWordShort = isHistorical
    ? isGerman
      ? 'Startjahre'
      : 'start years'
    : isGerman
      ? 'Läufe'
      : 'runs'

  // 1 — Where the plan sits relative to the usual comfort band. With a bequest
  // goal the headline answers a harder question, so the finding says so and
  // names the pure-survival number alongside it.
  const legacyNote =
    simulation.successDefinition === 'legacyConditioned'
      ? isGerman
        ? ` Gemessen inklusive Nachlassziel von ${money(simulation.legacyTargetReal)}; ohne dieses Ziel reicht das Kapital in ${fmtPercent(simulation.depletionSuccessRate, 1, locale)} der ${pathWordShort}.`
        : ` Measured including the ${money(simulation.legacyTargetReal)} bequest goal; without it capital lasts in ${fmtPercent(simulation.depletionSuccessRate, 1, locale)} of ${pathWordShort}.`
      : ''
  const rate = success.successRate
  const ratePct = fmtPercent(rate, 1, locale)
  if (rate >= 0.9) {
    findings.push({
      id: 'successBand',
      tone: 'positive',
      text: isGerman
        ? `${ratePct} der ${num(success.trials)} ${pathWord} tragen den Plan bis Alter ${person.horizonAge} — deutlich über der üblichen Komfortschwelle von 85 %.${legacyNote}`
        : `${ratePct} of ${num(success.trials)} ${pathWord} fund the plan to age ${person.horizonAge} — comfortably above the usual 85% threshold.${legacyNote}`,
    })
  } else if (rate >= 0.75) {
    findings.push({
      id: 'successBand',
      tone: 'neutral',
      text: isGerman
        ? `${ratePct} der ${num(success.trials)} ${pathWordShort} tragen bis Alter ${person.horizonAge}; ${num(success.trials - success.successCount)} verfehlen das Ziel — tragfähig, aber ohne großen Puffer.${legacyNote}`
        : `${ratePct} of ${num(success.trials)} ${pathWordShort} last to age ${person.horizonAge}; ${num(success.trials - success.successCount)} miss the goal — workable, but without much buffer.${legacyNote}`,
    })
  } else {
    findings.push({
      id: 'successBand',
      tone: 'risk',
      text: isGerman
        ? `Nur ${ratePct} der ${num(success.trials)} ${pathWordShort} tragen bis Alter ${person.horizonAge}; ${num(success.trials - success.successCount)} verfehlen das Ziel.${legacyNote}`
        : `Only ${ratePct} of ${num(success.trials)} ${pathWordShort} last to age ${person.horizonAge}; ${num(success.trials - success.successCount)} miss the goal.${legacyNote}`,
    })
  }

  // 2 — Depletion risk in the stress path, stated with the age it happens.
  if (projections.exhaustionAge !== undefined) {
    const yearsShort = Math.max(0, person.horizonAge - projections.exhaustionAge)
    findings.push({
      id: 'depletion',
      tone: 'risk',
      text: isGerman
        ? `Im Stressszenario (P10) ist das Vermögen ab Alter ${num(projections.exhaustionAge)} aufgebraucht — ${num(yearsShort)} Jahre vor dem Planungsende.`
        : `In the stress case (P10) capital is exhausted from age ${num(projections.exhaustionAge)} — ${num(yearsShort)} years short of the planning horizon.`,
    })
  } else {
    findings.push({
      id: 'depletion',
      tone: simulation.depletionRisk > 0.0005 ? 'neutral' : 'positive',
      text: isGerman
        ? `Der konservative P10-Pfad bleibt bis Alter ${person.horizonAge} positiv; ${
            simulation.depletionRisk > 0.0005
              ? `in ${fmtPercent(simulation.depletionRisk, 1, locale)} der ${pathWordShort} ist das Kapital dennoch vorher aufgebraucht`
              : 'kein einziger Lauf erschöpft das Kapital vorher'
          }.`
        : `The conservative P10 path stays positive to age ${person.horizonAge}; ${
            simulation.depletionRisk > 0.0005
              ? `capital is still exhausted earlier in ${fmtPercent(simulation.depletionRisk, 1, locale)} of ${pathWordShort}`
              : 'not a single run exhausts capital before then'
          }.`,
    })
  }

  // 3 — The bridge between retirement and the state pension.
  const bridgeYears = Math.max(0, person.pensionAge - person.retireAge)
  if (profile.bridge && bridgeYears > 0) {
    const retireAssets = milestones.find((m) => m.age === person.retireAge)?.p50
    const share =
      retireAssets && retireAssets > 0 ? profile.bridge.cashNeedEUR / retireAssets : null
    findings.push({
      id: 'bridge',
      tone: share !== null && share > 0.4 ? 'risk' : 'neutral',
      text: isGerman
        ? `Zwischen Ruhestand (${person.retireAge}) und Rentenbeginn (${person.pensionAge}) liegen ${num(bridgeYears)} Jahre ohne Rentenzahlung: ${money(profile.bridge.cashNeedEUR)} müssen aus dem Depot kommen${share !== null ? ` (${fmtRatioPercent(share, 0, locale)} des Medianvermögens bei Ruhestandsbeginn)` : ''}.`
        : `${num(bridgeYears)} years sit between retirement (${person.retireAge}) and the state pension (${person.pensionAge}): ${money(profile.bridge.cashNeedEUR)} has to come from the portfolio${share !== null ? ` (${fmtRatioPercent(share, 0, locale)} of median assets at retirement)` : ''}.`,
    })
  }

  // 4 — How much of the budget the pension actually covers.
  if (annualSpend > 0) {
    const coverage = Math.min(1, pensionAnnual / annualSpend)
    const residual = Math.max(0, annualSpend - pensionAnnual)
    findings.push({
      id: 'pensionCoverage',
      tone: coverage >= 0.8 ? 'positive' : 'neutral',
      text: isGerman
        ? `Ab Alter ${person.pensionAge} deckt die Rente ${fmtRatioPercent(coverage, 0, locale)} des Jahresbudgets von ${money(annualSpend)}; ${money(residual)} pro Jahr bleiben als Entnahme aus dem Depot.`
        : `From age ${person.pensionAge} the pension covers ${fmtRatioPercent(coverage, 0, locale)} of the ${money(annualSpend)} annual budget; ${money(residual)} a year still has to be withdrawn from the portfolio.`,
    })
  }

  // 5 — Median trajectory, so the reader has the upside as well as the risk.
  const startMedian = milestones[0]?.p50 ?? 0
  const endMedian = milestones[milestones.length - 1]?.p50 ?? 0
  if (startMedian > 0) {
    const growth = endMedian / startMedian - 1
    const sign = growth >= 0 ? '+' : '−'
    const growthPct = `${sign}${fmtNumber(Math.abs(growth) * 100, { locale, maximumFractionDigits: 0 })}${isGerman ? ' %' : '%'}`
    findings.push({
      id: 'medianPath',
      tone: growth >= 0 ? 'positive' : 'neutral',
      text: isGerman
        ? isHistorical
          ? `Der Medianpfad entwickelt sich von ${money(startMedian)} heute auf ${money(endMedian)} über die ${num(simulation.effectiveRuns)} historischen Verläufe (${growthPct} nominal).`
          : `Der Medianpfad entwickelt sich von ${money(startMedian)} heute auf ${money(endMedian)} mit ${fmtPercent(assumptions.expectedReturn, 1, locale)} Renditeerwartung (${growthPct} nominal).`
        : isHistorical
          ? `The median path moves from ${money(startMedian)} today to ${money(endMedian)} across the ${num(simulation.effectiveRuns)} historical replays (${growthPct} nominal).`
          : `The median path moves from ${money(startMedian)} today to ${money(endMedian)} at a ${fmtPercent(assumptions.expectedReturn, 1, locale)} expected return (${growthPct} nominal).`,
    })
  }

  return findings
}
