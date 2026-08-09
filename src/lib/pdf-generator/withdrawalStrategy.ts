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

const SUMMARIES: Record<WithdrawalStrategy, { de: string; en: string }> = {
  fixedReal: {
    de: 'Die Ausgaben behalten ihre Kaufkraft, unabhängig von der Marktentwicklung.',
    en: 'Spending keeps its purchasing power regardless of market returns.',
  },
  vanguardDynamic: {
    de: 'Die Entnahme zielt auf einen Prozentsatz des Vorjahresdepots, darf gegenüber dem inflationsangepassten Vorjahr aber nur begrenzt steigen oder fallen.',
    en: 'Withdrawals target a share of the prior year-end portfolio but may only rise or fall within a ceiling and floor around last year’s inflation-adjusted spending.',
  },
  guytonKlinger: {
    de: 'Inflationsausgleich mit zwei Leitplanken: 10% Kürzung, sobald die Entnahmequote 20% über der Startquote liegt, 10% Aufschlag, sobald sie 20% darunter liegt.',
    en: 'Inflation-linked spending with two guardrails: a 10% cut once the withdrawal rate runs 20% above the initial rate, a 10% raise once it runs 20% below.',
  },
  percentOfPortfolio: {
    de: 'Jedes Jahr wird ein fester Prozentsatz des Depots entnommen. Das Depot kann rechnerisch nicht aufgezehrt werden, dafür schwanken die Ausgaben mit dem Markt.',
    en: 'A fixed share of the portfolio is withdrawn every year. The portfolio cannot mathematically be exhausted, but spending swings with the market.',
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
          label: isGerman ? 'Zielentnahmerate' : 'Target withdrawal rate',
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
          label: isGerman ? 'Startentnahmerate' : 'Initial withdrawal rate',
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
