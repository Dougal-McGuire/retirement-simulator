'use client'

import { useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { PencilLine } from 'lucide-react'
import type { AnnualCashFlow, SimulationParams, SimulationResults } from '@/types'
import { assumptionPanel } from '@/components/plans/planSections'
import type { EditTarget } from '@/components/workspace/WorkspaceProvider'
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
   * Opens the edit panel (or the Entnahme section) where a number is set.
   * When given, ledger labels such as "gross pensions" become shortcuts.
   * The clicked label is passed along so focus can return to it.
   */
  onEdit?: (target: EditTarget, invoker?: HTMLElement | null) => void
}

interface LineOptions {
  emphasis?: boolean
  /** An indented "of which" line under a total. */
  detail?: boolean
  edit?: EditTarget
}

/** Reads booked amounts from the engine; never reconstructs sales from a budget. */
export function CashflowCard({ results, onEdit }: CashflowCardProps) {
  const t = useTranslations('cashflowResults')
  const ts = useTranslations('cashflowSankey')
  const tGroups = useTranslations('planEditor.groups')
  const tWorkspace = useTranslations('workspace.sections')
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
    const { emphasis = false, detail = false, edit } = options
    return (
      <div
        key={label}
        className="ws-ledger-line"
        data-detail={detail || undefined}
        data-emphasis={emphasis || undefined}
      >
        <dt>
          {edit && onEdit ? (
            <button
              type="button"
              className="ws-ledger-edit"
              onClick={(event) => onEdit(edit, event.currentTarget)}
              data-edit-target={'panel' in edit ? edit.panel : edit.section}
            >
              {label}
              <PencilLine size={12} aria-hidden="true" />
              <span className="sr-only">
                {' – '}
                {ts('ledger.edit', {
                  section:
                    'panel' in edit
                      ? tGroups(`${assumptionPanel(edit.panel).messageKey}.title`)
                      : tWorkspace(`${edit.section}.title`),
                })}
              </span>
            </button>
          ) : (
            label
          )}
        </dt>
        <dd>{money(amount)}</dd>
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
      className="ws-cashflow"
      aria-labelledby="cashflow-card-title"
      data-testid="cashflow-ledger"
    >
      <div className="ws-cashflow-head">
        <div>
          <h3 id="cashflow-card-title">{t('title')}</h3>
          <p>{t(displayReal ? 'real' : 'nominal')}</p>
        </div>
        {selected && (
          <label className="ws-cashflow-year">
            {t('age')}
            <select
              className="ds-select"
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
        <p className="ws-cashflow-method" role="status">
          {t('missing')}
        </p>
      ) : (
        <>
          <p className="ws-cashflow-method">{t('method')}</p>
          <CashflowSankey
            row={row}
            period={{ fromAge: selected.fromAge, toAge: selected.toAge, sum: selected.sum }}
            displayReal={displayReal}
          />
          {selected.sum && (
            <p className="ws-cashflow-sum" data-testid="cashflow-sum-heading">
              {ts('ledger.sumHeading', { from: selected.fromAge, to: selected.toAge })}
            </p>
          )}
          <div className="ws-ledger">
            <div>
              <h4>{t('incomeTitle')}</h4>
              <dl>
                {line(t('incomeGross'), row.incomeGross, { edit: { panel: 'flows' } })}
                {incomeDetail.map((income) =>
                  line(ts(`ledger.${income.id}Gross`), income.gross, {
                    detail: true,
                    edit: { panel: 'flows' },
                  })
                )}
                {line(t('incomeTax'), -row.incomeTax, {
                  edit: { panel: 'market', fieldId: 'editor-pensionTaxablePortion' },
                })}
                {line(t('incomeNet'), row.incomeGross - row.incomeTax, { emphasis: true })}
                {line(t('savings'), row.savings, {
                  edit: { panel: 'savings', fieldId: 'editor-annualSavings' },
                })}
              </dl>
            </div>
            <div>
              <h4>{t('withdrawalTitle')}</h4>
              <dl>
                {line(t('portfolioWithdrawal'), row.portfolioWithdrawal, {
                  edit: { section: 'withdrawal' },
                })}
                {line(t('capitalGainsTax'), -row.capitalGainsTax, {
                  edit: { panel: 'market', fieldId: 'editor-capitalGainsTax' },
                })}
                {line(t('withdrawalNet'), row.portfolioWithdrawal - row.capitalGainsTax, {
                  emphasis: true,
                })}
              </dl>
            </div>
            <div>
              <h4>{t('budgetTitle')}</h4>
              <dl>
                {line(t('expenses'), row.expenses, { edit: { panel: 'flows' } })}
                {expenseDetail.map((part) =>
                  line(ts(`ledger.${part.id}`), part.value, {
                    detail: true,
                    edit: { panel: 'flows' },
                  })
                )}
                {line(t('funded'), row.expenses - row.shortfall)}
                {line(t('shortfall'), row.shortfall, { emphasis: true })}
                {line(t('portfolioContribution'), row.portfolioContribution)}
              </dl>
            </div>
          </div>
          <div className="ws-cashflow-notes">
            <p className="ws-callout" data-testid="cashflow-tax-total">
              {selected.sum
                ? ts('ledger.totalTaxSum', {
                    from: selected.fromAge,
                    to: selected.toAge,
                    amount: money(row.incomeTax + row.capitalGainsTax),
                  })
                : t('totalTax', { amount: money(row.incomeTax + row.capitalGainsTax) })}
            </p>
            {row.shortfall > 0.01 && <p className="ws-note-danger">{t('shortfallNote')}</p>}
            {selected.phase === 'working' && (
              <p className="ws-footnote">{t('workingYears')}</p>
            )}
          </div>
          <details className="ws-disclosure">
            <summary>{t('assetReconciliation')}</summary>
            <dl className="ws-disclosure-body" style={{ maxWidth: '36rem' }}>
              {line(t('openingAssets'), row.openingAssets)}
              {line(t('investmentReturn'), row.investmentReturn)}
              {line(t('portfolioContribution'), row.portfolioContribution)}
              {line(t('portfolioWithdrawal'), -row.portfolioWithdrawal)}
              {line(t('closingAssets'), row.closingAssets, { emphasis: true })}
            </dl>
          </details>
          <details className="ws-disclosure">
            <summary>{t('allYears')}</summary>
            <div className="ws-disclosure-body">
              <p className="ws-footnote">{ts('ledger.rowHint')}</p>
              <div
                className="ws-cashflow-table"
                style={{ marginTop: 12 }}
                tabIndex={0}
                role="region"
                aria-label={t('allYears')}
              >
                <table>
                  <caption>{t('tableNote')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('age')}</th>
                      <th scope="col">{t('savings')}</th>
                      {columns.map((key) => (
                        <th key={key} scope="col">
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
                          onClick={() => selectAge(ages[i])}
                          data-selected={isSelected || undefined}
                        >
                          <th scope="row">
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
                          <td>{money(entry.savings)}</td>
                          {columns.map((key) => (
                            <td key={key}>{money(entry[key])}</td>
                          ))}
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
          <details className="ws-disclosure">
            <summary>{t('assumptionsTitle')}</summary>
            <div className="ws-disclosure-body ws-footnote" style={{ maxWidth: '72ch' }}>
              <p>{t('assumptions')}</p>
              <p style={{ marginTop: 8 }}>{t('oneOffTiming')}</p>
            </div>
          </details>
        </>
      )}
    </section>
  )
}
