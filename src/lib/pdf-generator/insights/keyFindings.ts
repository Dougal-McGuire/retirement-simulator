import type { ReportContent } from '@/lib/pdf-generator/reportTypes'
import { allPensionsSwitchedOff } from '@/lib/pdf-generator/pensionSwitch'
import { fmtCurrency, fmtNumber, fmtPercent, fmtRatioPercent } from '@/lib/pdf-generator/formatters'
import { buildEuroUnitCopy } from '@/lib/pdf-generator/euroUnitCopy'
import { planBandOfRate } from '@/lib/pdf-generator/planScoreCopy'

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
 *
 * Every euro amount about money moving (what the pension covers, what the
 * portfolio pays out) is the engine's own booking, taken from
 * `content.ledger` / `profile.bridge` in the report's unit and labelled with
 * it. A finding whose booking is not available is left out, never estimated.
 */
export function deriveKeyFindings(content: ReportContent): KeyFinding[] {
  const { profile, projections, expenses, finances, assumptions, simulation, ledger } = content
  const isGerman = content.locale !== 'en'
  const locale = content.locale === 'en' ? 'en-US' : 'de-DE'

  const findings: KeyFinding[] = []
  const { person, success } = profile
  const milestones = projections.milestones
  const annualSpend = expenses.monthlyTotal * 12 + expenses.annualTotal
  const money = (value: number) => fmtCurrency(value, locale)
  // Which euro a projected amount is in — said next to every one of them.
  const unitCopy = buildEuroUnitCopy(content.units, content.locale)
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

  // 1 — Where the plan sits. The three cases are the app's own bands
  // (`getPlanHealth`: 90 % / 75 %), so the tone here can never grade the plan
  // differently from the score card. With a bequest goal the headline answers
  // a harder question, so the finding says so and names the funding-only
  // number alongside it.
  const legacyNote =
    simulation.successDefinition === 'legacyConditioned'
      ? isGerman
        ? ` Gemessen inklusive Nachlassziel von ${money(simulation.legacyTargetReal)}; ohne dieses Ziel sind die Ausgaben in ${fmtPercent(simulation.depletionSuccessRate, 1, locale)} der ${pathWordShort} durchgehend gedeckt.`
        : ` Measured including the ${money(simulation.legacyTargetReal)} bequest goal; without it spending is funded throughout in ${fmtPercent(simulation.depletionSuccessRate, 1, locale)} of ${pathWordShort}.`
      : ''
  const rate = success.successRate
  const ratePct = fmtPercent(rate, 1, locale)
  const band = planBandOfRate(rate)
  if (band === 'strong') {
    findings.push({
      id: 'successBand',
      tone: 'positive',
      text: isGerman
        ? `${ratePct} der ${num(success.trials)} ${pathWord} tragen den Plan bis Alter ${person.horizonAge} — deutlich über der üblichen Komfortschwelle von 85 %.${legacyNote}`
        : `${ratePct} of ${num(success.trials)} ${pathWord} fund the plan to age ${person.horizonAge} — comfortably above the usual 85% threshold.${legacyNote}`,
    })
  } else if (band === 'watch') {
    findings.push({
      id: 'successBand',
      tone: 'neutral',
      text: isGerman
        ? `${ratePct} der ${num(success.trials)} ${pathWordShort} tragen bis Alter ${person.horizonAge}; ${num(success.trials - success.successCount)} verfehlen das Ziel — tragfähig, aber ohne großen Puffer.${legacyNote}`
        : `${ratePct} of ${num(success.trials)} ${pathWordShort} fund the plan to age ${person.horizonAge}; ${num(success.trials - success.successCount)} miss the goal — workable, but without much buffer.${legacyNote}`,
    })
  } else {
    findings.push({
      id: 'successBand',
      tone: 'risk',
      text: isGerman
        ? `Nur ${ratePct} der ${num(success.trials)} ${pathWordShort} tragen bis Alter ${person.horizonAge}; ${num(success.trials - success.successCount)} verfehlen das Ziel.${legacyNote}`
        : `Only ${ratePct} of ${num(success.trials)} ${pathWordShort} fund the plan to age ${person.horizonAge}; ${num(success.trials - success.successCount)} miss the goal.${legacyNote}`,
    })
  }

  // 2 — The stress case, stated as the event the success rate counts: a year
  // whose spending portfolio and income together could not pay. The age is
  // the one by which a tenth of the runs got there (`exhaustionAge`). A
  // portfolio at zero is not that event — where the weakest tenth runs the
  // portfolio down and income carries on, the finding says so separately.
  if (projections.exhaustionAge !== undefined) {
    const yearsShort = Math.max(0, person.horizonAge - projections.exhaustionAge)
    const years = isGerman
      ? `${num(yearsShort)} ${yearsShort === 1 ? 'Jahr' : 'Jahre'}`
      : `${num(yearsShort)} ${yearsShort === 1 ? 'year' : 'years'}`
    findings.push({
      id: 'depletion',
      tone: 'risk',
      text: isGerman
        ? `Im Stressszenario — dem schwächsten Zehntel der ${pathWordShort} — reichen Depot und Einnahmen spätestens im Alter ${num(projections.exhaustionAge)} erstmals nicht mehr für die Ausgaben, ${years} vor dem Planungsende.`
        : `In the stress case — the weakest tenth of ${pathWordShort} — portfolio and income first fail to cover a year's spending by age ${num(projections.exhaustionAge)}, ${years} short of the planning horizon.`,
    })
  } else {
    const someFail = simulation.depletionRisk > 0.0005
    const riskPct = fmtPercent(simulation.depletionRisk, 1, locale)
    const emptyNote =
      projections.portfolioEmptyAge !== undefined
        ? isGerman
          ? ` Im P10-Pfad ist das Depot ab Alter ${num(projections.portfolioEmptyAge)} aufgebraucht; die Ausgaben tragen dann Renten und Einnahmen.`
          : ` On the P10 path the portfolio is used up from age ${num(projections.portfolioEmptyAge)}; pensions and income then carry the spending.`
        : ''
    findings.push({
      id: 'depletion',
      tone: someFail ? 'neutral' : 'positive',
      text: isGerman
        ? `${
            someFail
              ? `Das Stressszenario bleibt finanziert: Nur in ${riskPct} der ${pathWordShort} reichen Depot und Einnahmen in mindestens einem Jahr bis Alter ${person.horizonAge} nicht für die Ausgaben.`
              : `In keinem einzigen der ${pathWordShort} entsteht bis Alter ${person.horizonAge} eine Deckungslücke: Depot und Einnahmen tragen die Ausgaben in jedem Jahr.`
          }${emptyNote}`
        : `${
            someFail
              ? `The stress case stays funded: only in ${riskPct} of ${pathWordShort} do portfolio and income fail to cover at least one year's spending before age ${person.horizonAge}.`
              : `Not one of the ${pathWordShort} has a shortfall before age ${person.horizonAge}: portfolio and income cover every year's spending.`
          }${emptyNote}`,
    })
  }

  // 3 — The bridge: the retirement years before the main pension pays, and
  // what the ledger withdrew from the portfolio in exactly those years. Other
  // income in that time (a small company pension, part-time work) is already
  // netted, so the sentence does not claim "years without a pension".
  const bridge = profile.bridge
  if (bridge) {
    const bridgeYears = Math.max(0, bridge.endAge - bridge.startAge + 1)
    const share = projections.ratios?.bridgeShareOfRetirementAssets ?? null
    const pensionName =
      bridge.mainPension === 'statutory'
        ? isGerman
          ? 'der gesetzlichen Rente'
          : 'the statutory pension'
        : isGerman
          ? 'der größten Rente'
          : 'the main pension'
    const ages =
      bridge.startAge === bridge.endAge
        ? `${isGerman ? 'Alter' : 'age'} ${bridge.startAge}`
        : `${isGerman ? 'Alter' : 'ages'} ${bridge.startAge}–${bridge.endAge}`
    findings.push({
      id: 'bridge',
      tone: share !== null && share > 0.4 ? 'risk' : 'neutral',
      text: isGerman
        ? `Bis zum Beginn ${pensionName} mit ${bridge.pensionAge} trägt das Depot ${num(bridgeYears)} ${bridgeYears === 1 ? 'Ruhestandsjahr' : 'Ruhestandsjahre'} (${ages}): ${money(bridge.cashNeedEUR)}${unitCopy.amountQualifier} werden in dieser Zeit entnommen${share !== null ? ` — ${fmtRatioPercent(share, 0, locale)} des Depots zu Ruhestandsbeginn` : ''}.`
        : `Until ${pensionName} starts at ${bridge.pensionAge}, the portfolio carries ${num(bridgeYears)} retirement ${bridgeYears === 1 ? 'year' : 'years'} (${ages}): ${money(bridge.cashNeedEUR)}${unitCopy.amountQualifier} is withdrawn in that time${share !== null ? ` — ${fmtRatioPercent(share, 0, locale)} of the portfolio at the start of retirement` : ''}.`,
    })
  }

  // 4 — What the pension actually covers: the net pension over that year's
  // spending, both as the engine booked them. A pension kept in the plan but
  // switched off covers nothing, and is not described as paying.
  const pensionYear = ledger?.pensionYear ?? null
  if (annualSpend > 0 && allPensionsSwitchedOff(expenses)) {
    findings.push({
      id: 'pensionCoverage',
      tone: 'neutral',
      text: isGerman
        ? `Keine Rente berücksichtigt (im Plan ausgeschaltet): Das Jahresbudget von ${money(annualSpend)}${unitCopy.inputQualifier} kommt vollständig als Entnahme aus dem Depot.`
        : `No pension included (switched off in the plan): the full annual budget of ${money(annualSpend)}${unitCopy.inputQualifier} is withdrawn from the portfolio.`,
    })
  } else if (pensionYear && pensionYear.coverage !== null) {
    const coverage = pensionYear.coverage
    const firstYear = pensionYear.firstPensionYear
    findings.push({
      id: 'pensionCoverage',
      tone: coverage >= 0.8 ? 'positive' : 'neutral',
      text: isGerman
        ? `Im Alter ${pensionYear.age}${firstYear ? ', dem ersten Rentenjahr,' : ''} deckt die Rente nach Steuern ${fmtRatioPercent(coverage, 0, locale)} der Ausgaben dieses Jahres (${money(pensionYear.pensionNet)} von ${money(pensionYear.expenses)}${unitCopy.amountQualifier}); ${money(pensionYear.portfolioWithdrawal)} kommen als Entnahme aus dem Depot, Steuern auf Kursgewinne eingerechnet.`
        : `At age ${pensionYear.age}${firstYear ? ', the first pension year,' : ''} the pension after tax covers ${fmtRatioPercent(coverage, 0, locale)} of that year's spending (${money(pensionYear.pensionNet)} of ${money(pensionYear.expenses)}${unitCopy.amountQualifier}); ${money(pensionYear.portfolioWithdrawal)} is withdrawn from the portfolio, tax on gains included.`,
    })
  }

  // 5 — Median trajectory, so the reader has the upside as well as the risk.
  // "Today" is the capital that was entered — identical in nominal and real
  // terms. The first simulated value is the *end* of the first plan year,
  // after a year of savings and returns, and must not be called today.
  const startAssets = finances.currentAssets
  const endMedian = milestones[milestones.length - 1]?.p50
  if (startAssets > 0 && endMedian !== undefined) {
    const growth = endMedian / startAssets - 1
    const sign = growth >= 0 ? '+' : '−'
    const growthPct = `${sign}${fmtNumber(Math.abs(growth) * 100, { locale, maximumFractionDigits: 0 })}${isGerman ? ' %' : '%'}`
    findings.push({
      id: 'medianPath',
      tone: growth >= 0 ? 'positive' : 'neutral',
      text: isGerman
        ? isHistorical
          ? `Der Medianpfad führt von ${money(startAssets)} heute auf ${money(endMedian)}${unitCopy.amountQualifier} am Ende von Alter ${person.horizonAge}, über die ${num(simulation.effectiveRuns)} historischen Verläufe (${growthPct} ${unitCopy.growth}).`
          : `Der Medianpfad führt von ${money(startAssets)} heute auf ${money(endMedian)}${unitCopy.amountQualifier} am Ende von Alter ${person.horizonAge}, bei ${fmtPercent(assumptions.expectedReturn, 1, locale)} Renditeerwartung (${growthPct} ${unitCopy.growth}).`
        : isHistorical
          ? `The median path moves from ${money(startAssets)} today to ${money(endMedian)}${unitCopy.amountQualifier} at the end of age ${person.horizonAge}, across the ${num(simulation.effectiveRuns)} historical replays (${growthPct} ${unitCopy.growth}).`
          : `The median path moves from ${money(startAssets)} today to ${money(endMedian)}${unitCopy.amountQualifier} at the end of age ${person.horizonAge}, at a ${fmtPercent(assumptions.expectedReturn, 1, locale)} expected return (${growthPct} ${unitCopy.growth}).`,
    })
  }

  return findings
}
