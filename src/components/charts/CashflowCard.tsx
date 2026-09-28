'use client'

import { useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { PencilLine } from 'lucide-react'
import type { AnnualCashFlow, SimulationParams, SimulationResults } from '@/types'
import type { PlanSectionGroup } from '@/components/plans/planSections'
import { useDisplayReal } from '@/lib/stores/displayStore'
import { cn } from '@/lib/utils'
import { CashflowSankey } from './CashflowSankey'
import {
  ledgerParts,
  resolveLedgerSelection,
  RETIREMENT_SUM,
  SANKEY_MIN_AMOUNT,
  type LedgerSelection,
} from './cashflowSankeyModel'

interface CashflowCardProps {
  params: SimulationParams
  results: SimulationResults | null
  /**
   * Opens the plan editor on a section. When given, ledger labels such as
   * "gross pensions" become shortcuts to where that number is set.
   */
  onEdit?: (section: PlanSectionGroup) => void
}

interface LineOptions {
  emphasis?: boolean
  /** An indented "of which" line under a total. */
  detail?: boolean
  section?: PlanSectionGroup
}

/** Reads booked amounts from the engine; never reconstructs sales from a budget. */
export function CashflowCard({ results, onEdit }: CashflowCardProps) {
  const t = useTranslations('cashflowResults')
  const ts = useTranslations('cashflowSankey')
  const tGroups = useTranslations('planEditor.groups')
  const format = useFormatter()
  const displayReal = useDisplayReal()
  const sectionRef = useRef<HTMLElement>(null)
  const [selection, setSelection] = useState<LedgerSelection | null>(null)
  const series = displayReal ? results?.cashFlowMeansReal : results?.cashFlowMeans
  const ages = results?.ages ?? []
  const retirementAge = Math.max(
    results?.params.currentAge ?? 0,
    results?.params.retirementAge ?? 0
  )
  const selected = resolveLedgerSelection(series, ages, retirementAge, selection)
  const row = selected?.row
  const hasRetirement = ages.some((age) => age >= retirementAge)
  const money = (value: number) =>
    format.number(value, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    })
  const line = (label: string, amount: number, options: LineOptions = {}) => {
    const { emphasis = false, detail = false, section } = options
    return (
      <div
        key={label}
        className={cn(
          'flex items-baseline justify-between gap-4',
          detail ? 'py-1 pl-3' : 'py-2',
          emphasis && 'border-t border-border font-semibold'
        )}
      >
        <dt className={cn('text-muted-foreground', detail ? 'text-xs' : 'text-sm')}>
          {section && onEdit ? (
            <button
              type="button"
              className="group inline-flex items-baseline gap-1.5 text-left underline-offset-2 hover:text-foreground hover:underline"
              onClick={() => onEdit(section)}
              data-edit-section={section}
            >
              {label}
              <PencilLine
                size={12}
                aria-hidden="true"
                className="shrink-0 self-center opacity-50 group-hover:opacity-100"
              />
              <span className="sr-only">
                {' – '}
                {ts('ledger.edit', { section: tGroups(`${section}.title`) })}
              </span>
            </button>
          ) : (
            label
          )}
        </dt>
        <dd className={cn('shrink-0 text-right tabular-nums', detail ? 'text-xs' : 'text-sm')}>
          {money(amount)}
        </dd>
      </div>
    )
  }
  const columns = [
    'incomeGross',
    'incomeTax',
    'expenses',
    'portfolioWithdrawal',
    'capitalGainsTax',
    'shortfall',
    'portfolioContribution',
    'closingAssets',
  ] as const satisfies readonly (keyof AnnualCashFlow)[]

  // "Of which" lines only where a total really has more than one part.
  const parts = row ? ledgerParts(row) : null
  const shown = (value: number) => value >= SANKEY_MIN_AMOUNT
  const incomeDetail =
    parts && parts.incomes.filter((income) => shown(income.gross)).length > 1
      ? parts.incomes.filter((income) => shown(income.gross) && income.id !== 'income')
      : []
  const expenseDetail =
    parts && parts.expenses.filter((part) => shown(part.value)).length > 1
      ? parts.expenses.filter((part) => shown(part.value) && part.id !== 'spending')
      : []

  const selectAge = (age: number) => {
    setSelection(age)
    const section = sectionRef.current
    if (!section || section.getBoundingClientRect().top >= 0) return
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    section.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  }

  return (
    <section
      ref={sectionRef}
      className="ds-card scroll-mt-4 p-4 sm:p-6"
      aria-labelledby="cashflow-title"
      data-testid="cashflow-ledger"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 id="cashflow-title" className="text-lg font-semibold">
            {t('title')}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(displayReal ? 'real' : 'nominal')}
          </p>
        </div>
        {selected && (
          <label className="flex items-center gap-3 text-sm font-medium">
            {t('age')}
            <select
              className="ds-select min-h-11"
              value={selected.sum ? RETIREMENT_SUM : String(ages[selected.index])}
              onChange={(event) =>
                setSelection(
                  event.target.value === RETIREMENT_SUM
                    ? RETIREMENT_SUM
                    : Number(event.target.value)
                )
              }
              data-testid="cashflow-year-select"
            >
              {hasRetirement && <option value={RETIREMENT_SUM}>{ts('wholeRetirement')}</option>}
              {ages.map((age) => (
                <option key={age} value={age}>
                  {age}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!row || !selected || !parts ? (
        <p className="mt-4 text-sm" role="status">
          {t('missing')}
        </p>
      ) : (
        <>
          <p className="mt-4 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            {t('method')}
          </p>
          <CashflowSankey
            row={row}
            period={{ fromAge: selected.fromAge, toAge: selected.toAge, sum: selected.sum }}
            displayReal={displayReal}
          />
          {selected.sum && (
            <p className="mt-5 text-sm font-semibold" data-testid="cashflow-sum-heading">
              {ts('ledger.sumHeading', { from: selected.fromAge, to: selected.toAge })}
            </p>
          )}
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <div className="rounded-lg border border-border p-4">
              <h3 className="font-semibold">{t('incomeTitle')}</h3>
              <dl className="mt-2">
                {line(t('incomeGross'), row.incomeGross, { section: 'cashFlows' })}
                {incomeDetail.map((income) =>
                  line(ts(`ledger.${income.id}Gross`), income.gross, {
                    detail: true,
                    section: 'cashFlows',
                  })
                )}
                {line(t('incomeTax'), -row.incomeTax, { section: 'market' })}
                {line(t('incomeNet'), row.incomeGross - row.incomeTax, { emphasis: true })}
                {line(t('savings'), row.savings, { section: 'income' })}
              </dl>
            </div>
            <div className="rounded-lg border border-border p-4">
              <h3 className="font-semibold">{t('withdrawalTitle')}</h3>
              <dl className="mt-2">
                {line(t('portfolioWithdrawal'), row.portfolioWithdrawal, { section: 'withdrawal' })}
                {line(t('capitalGainsTax'), -row.capitalGainsTax, { section: 'market' })}
                {line(t('withdrawalNet'), row.portfolioWithdrawal - row.capitalGainsTax, {
                  emphasis: true,
                })}
              </dl>
            </div>
            <div className="rounded-lg border border-border p-4">
              <h3 className="font-semibold">{t('budgetTitle')}</h3>
              <dl className="mt-2">
                {line(t('expenses'), row.expenses, { section: 'cashFlows' })}
                {expenseDetail.map((part) =>
                  line(ts(`ledger.${part.id}`), part.value, { detail: true, section: 'cashFlows' })
                )}
                {line(t('funded'), row.expenses - row.shortfall)}
                {line(t('shortfall'), row.shortfall, { emphasis: true })}
                {line(t('portfolioContribution'), row.portfolioContribution)}
              </dl>
            </div>
          </div>
          <p
            className="mt-4 rounded-lg bg-amber/15 p-3 text-sm font-medium"
            data-testid="cashflow-tax-total"
          >
            {selected.sum
              ? ts('ledger.totalTaxSum', {
                  from: selected.fromAge,
                  to: selected.toAge,
                  amount: money(row.incomeTax + row.capitalGainsTax),
                })
              : t('totalTax', { amount: money(row.incomeTax + row.capitalGainsTax) })}
          </p>
          {row.shortfall > 0.01 && (
            <p className="mt-3 text-sm font-medium text-destructive">{t('shortfallNote')}</p>
          )}
          {selected.phase === 'working' && (
            <p className="mt-3 text-sm text-muted-foreground">{t('workingYears')}</p>
          )}
          <details className="mt-5 rounded-lg border border-border p-4">
            <summary className="cursor-pointer text-sm font-semibold">
              {t('assetReconciliation')}
            </summary>
            <dl className="mt-2 max-w-xl">
              {line(t('openingAssets'), row.openingAssets)}
              {line(t('investmentReturn'), row.investmentReturn)}
              {line(t('portfolioContribution'), row.portfolioContribution)}
              {line(t('portfolioWithdrawal'), -row.portfolioWithdrawal)}
              {line(t('closingAssets'), row.closingAssets, { emphasis: true })}
            </dl>
          </details>
          <details className="mt-3 rounded-lg border border-border p-4">
            <summary className="cursor-pointer text-sm font-semibold">{t('allYears')}</summary>
            <p className="mt-3 text-xs text-muted-foreground">{ts('ledger.rowHint')}</p>
            <div
              className="mt-3 overflow-x-auto"
              tabIndex={0}
              role="region"
              aria-label={t('allYears')}
            >
              <table className="min-w-full text-right text-sm tabular-nums">
                <caption className="mb-3 text-left text-sm text-muted-foreground">
                  {t('tableNote')}
                </caption>
                <thead>
                  <tr>
                    <th scope="col" className="p-3 text-left">
                      {t('age')}
                    </th>
                    <th scope="col" className="p-3">
                      {t('savings')}
                    </th>
                    {columns.map((key) => (
                      <th key={key} scope="col" className="min-w-32 p-3">
                        {t(key)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {series!.map((entry, i) => {
                    const isSelected = !selected.sum && selected.index === i
                    return (
                      <tr
                        key={ages[i]}
                        className={cn(
                          'cursor-pointer border-t border-border hover:bg-muted/60',
                          isSelected && 'bg-muted'
                        )}
                        onClick={() => selectAge(ages[i])}
                        data-selected={isSelected || undefined}
                      >
                        <th scope="row" className="p-1.5 text-left">
                          {/* The row is clickable for the mouse; this is the keyboard way in. */}
                          <button
                            type="button"
                            className={cn(
                              'min-h-9 min-w-11 rounded-sm px-1.5 text-left font-semibold underline-offset-2 hover:underline',
                              isSelected && 'underline'
                            )}
                            aria-pressed={isSelected}
                            aria-label={ts('ledger.selectRow', { age: ages[i] })}
                          >
                            {ages[i]}
                          </button>
                        </th>
                        <td className="whitespace-nowrap p-3">{money(entry.savings)}</td>
                        {columns.map((key) => (
                          <td key={key} className="whitespace-nowrap p-3">
                            {money(entry[key])}
                          </td>
                        ))}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </details>
          <details className="mt-3 text-sm text-muted-foreground">
            <summary className="cursor-pointer py-2 font-medium">{t('assumptionsTitle')}</summary>
            <p className="mt-2 leading-relaxed">{t('assumptions')}</p>
            <p className="mt-2 leading-relaxed">{t('oneOffTiming')}</p>
          </details>
        </>
      )}
    </section>
  )
}
