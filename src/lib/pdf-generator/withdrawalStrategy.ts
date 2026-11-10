import type { WithdrawalStrategy } from '@/types'
import type { ReportAssumptions } from '@/lib/pdf-generator/reportTypes'
import { fmtCurrency, fmtPercent } from '@/lib/pdf-generator/formatters'

/**
 * How the report names a withdrawal strategy — and, crucially, which of the
 * strategy parameters it is allowed to print.
 *
 * A PDF that lists "DS ceiling 5.0%" under a Guyton-Klinger plan is not a
 * cosmetic slip: the engine never reads that number for that plan, so the
 * report would be stating an assumption that did not apply. Every strategy
 * therefore declares its own rows here, and both report renderers (React PDF
 * and the legacy HTML print page) read them from this one place.
 */

const LABELS: Record<WithdrawalStrategy, { de: string; en: string }> = {
  fixedReal: { de: 'Feste Kaufkraft', en: 'Fixed real spending' },
  vanguardDynamic: {
    de: 'Dynamisch mit Leitplanken (Vanguard)',
    en: 'Dynamic with guardrails (Vanguard)',
  },
  guytonKlinger: { de: 'Guyton-Klinger-Leitplanken', en: 'Guyton-Klinger guardrails' },
  percentOfPortfolio: { de: 'Prozent vom Depot', en: 'Percent of portfolio' },
}

/**
 * What each rule does, in the engine's terms: the rules govern the part of
 * spending the **portfolio** pays. Pensions and recurring income come first,
 * the rule's rate is the portfolio's share on top of them — so none of these
 * sentences describes total spending as a percentage of the portfolio.
 */
const SUMMARIES: Record<WithdrawalStrategy, { de: string; en: string }> = {
  fixedReal: {
    de: 'Das geplante Budget behält seine Kaufkraft, unabhängig von der Marktentwicklung.',
    en: 'The planned budget keeps its purchasing power regardless of market returns.',
  },
  vanguardDynamic: {
    de: 'Als leistbar gelten Renten und laufende Einnahmen plus ein Prozentsatz des Vorjahresdepots; die Ausgaben dürfen gegenüber dem inflationsangepassten Vorjahr aber nur begrenzt steigen oder fallen.',
    en: 'What counts as affordable is pensions and recurring income plus a share of the prior year-end portfolio; spending may only rise or fall within a ceiling and floor around last year’s inflation-adjusted spending.',
  },
  guytonKlinger: {
    de: 'Inflationsausgleich mit zwei Leitplanken auf der Entnahmequote des Depots (Ausgaben, die Renten und Einnahmen nicht decken, geteilt durch das Depot): 10% Kürzung, sobald sie 20% über der Zielquote liegt, 10% Aufschlag, sobald sie 20% darunter liegt.',
    en: 'Inflation-linked spending with two guardrails on the portfolio’s withdrawal rate (spending that pensions and income do not cover, over the portfolio): a 10% cut once it runs 20% above the target rate, a 10% raise once it runs 20% below.',
  },
  percentOfPortfolio: {
    de: 'Das Depot zahlt jedes Jahr einen festen Prozentsatz seines Wertes, zusätzlich zu Renten und laufenden Einnahmen. Die Regel allein zehrt das Depot nicht auf — geplante Sonderausgaben oder eine Ausgabenuntergrenze können es; die Ausgaben schwanken mit dem Markt.',
    en: 'The portfolio pays a fixed share of its value every year, on top of pensions and recurring income. The rule alone cannot use the portfolio up — scheduled expenses or a spending floor can — and spending swings with the market.',
  },
}

export function withdrawalStrategyLabel(strategy: WithdrawalStrategy, isGerman: boolean): string {
  const entry = LABELS[strategy] ?? LABELS.fixedReal
  return isGerman ? entry.de : entry.en
}

export function withdrawalStrategySummary(strategy: WithdrawalStrategy, isGerman: boolean): string {
  const entry = SUMMARIES[strategy] ?? SUMMARIES.fixedReal
  return isGerman ? entry.de : entry.en
}

/**
 * The strategy parameters that actually drive this plan, ready to print.
 * Empty for `fixedReal`, which reads none of them.
 */
export function withdrawalStrategyRows(
  assumptions: Pick<
    ReportAssumptions,
    | 'withdrawalStrategy'
    | 'dsWithdrawalRate'
    | 'dsCeilingRate'
    | 'dsFloorRate'
    | 'spendingFloorReal'
  >,
  locale: string,
  isGerman: boolean
): Array<{ label: string; value: string }> {
  switch (assumptions.withdrawalStrategy) {
    case 'vanguardDynamic':
      return [
        {
          label: isGerman ? 'Zielentnahmerate vom Depot' : 'Target portfolio withdrawal rate',
          value: fmtPercent(assumptions.dsWithdrawalRate, 2, locale),
        },
        {
          label: isGerman ? 'Obergrenze / Untergrenze' : 'Ceiling / Floor',
          value: `${fmtPercent(assumptions.dsCeilingRate, 1, locale)} / ${fmtPercent(assumptions.dsFloorRate, 1, locale)}`,
        },
      ]
    case 'guytonKlinger':
      return [
        {
          // The rate the guardrails are measured against — every year, not
          // only at the start.
          label: isGerman ? 'Zielentnahmerate vom Depot' : 'Target portfolio withdrawal rate',
          value: fmtPercent(assumptions.dsWithdrawalRate, 2, locale),
        },
        {
          label: isGerman ? 'Leitplanken' : 'Guardrails',
          value: isGerman ? '±20% → ∓10% Anpassung' : '±20% band → ∓10% adjustment',
        },
      ]
    case 'percentOfPortfolio':
      return [
        {
          label: isGerman ? 'Entnahmerate vom Depot' : 'Portfolio withdrawal rate',
          value: fmtPercent(assumptions.dsWithdrawalRate, 2, locale),
        },
        {
          label: isGerman
            ? 'Ausgabenuntergrenze (heutige Kaufkraft)'
            : "Spending floor (today's €)",
          value:
            assumptions.spendingFloorReal > 0
              ? `${fmtCurrency(assumptions.spendingFloorReal, locale)} ${isGerman ? 'p.a.' : 'p.a.'}`
              : isGerman
                ? 'keine'
                : 'none',
        },
      ]
    default:
      return []
  }
}
