'use client'

import { useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import type { AnnualCashFlow, SimulationParams, SimulationResults } from '@/types'
import { useDisplayReal } from '@/lib/stores/displayStore'

interface CashflowCardProps {
  params: SimulationParams
  results: SimulationResults | null
}

/** Reads booked amounts from the engine; never reconstructs sales from a budget. */
export function CashflowCard({ results }: CashflowCardProps) {
  const t = useTranslations('cashflowResults')
  const format = useFormatter()
  const displayReal = useDisplayReal()
  const [selectedAge, setSelectedAge] = useState<number | null>(null)
  const series = displayReal ? results?.cashFlowMeansReal : results?.cashFlowMeans
  const ages = results?.ages ?? []
  const preferredAge =
    selectedAge ?? Math.max(results?.params.currentAge ?? 0, results?.params.retirementAge ?? 0)
  const index = Math.max(0, ages.indexOf(preferredAge))
  const row = series?.[index]
  const money = (value: number) =>
    format.number(value, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
      minimumFractionDigits: 0,
    })
  const line = (label: string, amount: number, emphasis = false) => (
    <div
      key={label}
      className={`flex items-baseline justify-between gap-4 py-2 ${emphasis ? 'border-t border-border font-semibold' : ''}`}
    >
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="shrink-0 text-right text-sm tabular-nums">{money(amount)}</dd>
    </div>
  )
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

  return (
    <section
      className="ds-card p-4 sm:p-6"
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
        {row && (
          <label className="flex items-center gap-3 text-sm font-medium">
            {t('age')}
            <select
              className="ds-select min-h-11"
              value={ages[index]}
              onChange={(event) => setSelectedAge(Number(event.target.value))}
            >
              {ages.map((age) => (
                <option key={age} value={age}>
                  {age}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {!row ? (
        <p className="mt-4 text-sm" role="status">
          {t('missing')}
        </p>
      ) : (
        <>
          <p className="mt-4 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            {t('method')}
          </p>
          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <div className="rounded-lg border border-border p-4">
              <h3 className="font-semibold">{t('incomeTitle')}</h3>
              <dl className="mt-2">
                {line(t('incomeGross'), row.incomeGross)}
                {line(t('incomeTax'), -row.incomeTax)}
                {line(t('incomeNet'), row.incomeGross - row.incomeTax, true)}
                {line(t('savings'), row.savings)}
              </dl>
            </div>
            <div className="rounded-lg border border-border p-4">
              <h3 className="font-semibold">{t('withdrawalTitle')}</h3>
              <dl className="mt-2">
                {line(t('portfolioWithdrawal'), row.portfolioWithdrawal)}
                {line(t('capitalGainsTax'), -row.capitalGainsTax)}
                {line(t('withdrawalNet'), row.portfolioWithdrawal - row.capitalGainsTax, true)}
              </dl>
            </div>
            <div className="rounded-lg border border-border p-4">
              <h3 className="font-semibold">{t('budgetTitle')}</h3>
              <dl className="mt-2">
                {line(t('expenses'), row.expenses)}
                {line(t('funded'), row.expenses - row.shortfall)}
                {line(t('shortfall'), row.shortfall, true)}
                {line(t('portfolioContribution'), row.portfolioContribution)}
              </dl>
            </div>
          </div>
          <p
            className="mt-4 rounded-lg bg-amber/15 p-3 text-sm font-medium"
            data-testid="cashflow-tax-total"
          >
            {t('totalTax', { amount: money(row.incomeTax + row.capitalGainsTax) })}
          </p>
          {row.shortfall > 0.01 && (
            <p className="mt-3 text-sm font-medium text-destructive">{t('shortfallNote')}</p>
          )}
          {ages[index] < (results?.params.retirementAge ?? 0) && (
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
              {line(t('closingAssets'), row.closingAssets, true)}
            </dl>
          </details>
          <details className="mt-3 rounded-lg border border-border p-4">
            <summary className="cursor-pointer text-sm font-semibold">{t('allYears')}</summary>
            <div
              className="mt-4 overflow-x-auto"
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
                  {series!.map((entry, i) => (
                    <tr key={ages[i]} className="border-t border-border">
                      <th scope="row" className="p-3 text-left">
                        {ages[i]}
                      </th>
                      <td className="whitespace-nowrap p-3">{money(entry.savings)}</td>
                      {columns.map((key) => (
                        <td key={key} className="whitespace-nowrap p-3">
                          {money(entry[key])}
                        </td>
                      ))}
                    </tr>
                  ))}
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
