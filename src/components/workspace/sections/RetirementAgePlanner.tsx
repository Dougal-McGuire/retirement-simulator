'use client'

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { comparisonRunCount, samplingInterval95 } from '@/lib/simulation/context'
import { calculateCombinedExpenses } from '@/lib/simulation/engine'
import { useSimulationParams, useSimulationStore } from '@/lib/stores/simulationStore'
import type { AgePlannerResponse } from '@/lib/simulation/retirementFrontier.worker'
import type { RetirementAgeComparison } from '@/lib/simulation/retirementFrontier'
import type { SimulationParams } from '@/types'
import './retirement-age.css'

interface Run {
  params: SimulationParams
  inputs: string
  status: 'running' | 'error' | 'done'
  progress?: { done: number; total: number }
  result?: RetirementAgeComparison
}

function AgeComparisonForm() {
  const params = useSimulationParams()
  const t = useTranslations('workspace.agePlanner')
  const format = useFormatter()
  const [budgetOverride, setBudget] = useState<string | null>(null)
  const [probability, setProbability] = useState('90')
  const [endOverride, setEnd] = useState<string | null>(null)
  const [maxOverride, setMaxAge] = useState<string | null>(null)
  const [final, setFinal] = useState(false)
  const [run, setRun] = useState<Run | null>(null)
  const worker = useRef<Worker | null>(null)
  const budget =
    budgetOverride ??
    String(Math.round(calculateCombinedExpenses(params.customExpenses).combinedMonthly))
  const end = endOverride ?? String(params.endAge)
  const maximumAge = Math.min(100, Number(end))
  const maxAge = maxOverride ?? String(maximumAge)
  const historical = params.marketModel === 'historical'
  const inputs = [budget, probability, end, maxAge, final].join('|')
  const visible = run?.params === params && run.inputs === inputs ? run : null
  const data = visible?.result
  const running = visible?.status === 'running'
  const earliest = data?.rows.find((row) => row.age === data.earliestAge)
  const interval =
    data && earliest && !historical
      ? samplingInterval95(Math.round((earliest.successRate * data.paths) / 100), data.paths)
      : null
  const money = (value: number, signed = false) =>
    format.number(value, {
      style: 'currency',
      currency: 'EUR',
      maximumFractionDigits: 0,
      signDisplay: signed ? 'exceptZero' : 'auto',
    })
  const percent = (value: number) =>
    format.number(value / 100, { style: 'percent', maximumFractionDigits: 1 })
  useEffect(
    () => () => {
      if (worker.current) {
        worker.current.terminate()
        worker.current = null
        setRun(null)
      }
    },
    [params, inputs]
  )

  function compare(event: FormEvent) {
    event.preventDefault()
    worker.current?.terminate()
    const state = { params, inputs }
    setRun({ ...state, status: 'running' })
    try {
      const active = new Worker(
        new URL('../../../lib/simulation/retirementFrontier.worker.ts', import.meta.url),
        { type: 'module' }
      )
      worker.current = active
      const finish = (message?: RetirementAgeComparison) => {
        if (worker.current !== active) return
        active.terminate()
        worker.current = null
        setRun({ ...state, status: message ? 'done' : 'error', result: message })
      }
      active.onmessage = ({ data: reply }: MessageEvent<AgePlannerResponse>) => {
        if (worker.current !== active) return
        if (reply.type === 'progress') setRun({ ...state, status: 'running', progress: reply })
        else finish(reply.type === 'result' ? reply.data : undefined)
      }
      active.onerror = active.onmessageerror = () => finish()
      active.postMessage({
        params,
        targets: {
          monthlyBudget: Number(budget),
          probability: Number(probability),
          endAge: Number(end),
          maxRetirementAge: Number(maxAge),
          final,
        },
      })
    } catch {
      worker.current?.terminate()
      worker.current = null
      setRun({ ...state, status: 'error' })
    }
  }
  const headline =
    data &&
    (data.earliestAge === null
      ? t('none', { from: data.rows[0].age, to: data.rows[data.rows.length - 1].age })
      : t('earliest', { age: data.earliestAge }))
  return (
    <section
      className="ws-age-planner"
      aria-labelledby="ws-age-title"
      data-testid="retirement-age-planner"
    >
      <header>
        <h3 id="ws-age-title" className="ws-withdrawal-h3">
          {t('title')}
        </h3>
        <p className="ws-withdrawal-muted">{t('intro')}</p>
      </header>
      <form className="ws-age-form" onSubmit={compare}>
        <label>
          {t('budget')}
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            step={1}
            required
            value={budget}
            onChange={(e) => setBudget(e.target.value)}
          />
        </label>
        <label>
          {t('probability')}
          <Input
            type="number"
            inputMode="numeric"
            min={1}
            max={100}
            step={1}
            required
            value={probability}
            onChange={(e) => setProbability(e.target.value)}
          />
        </label>
        <label>
          {t('end')}
          <Input
            type="number"
            inputMode="numeric"
            min={params.currentAge}
            max={120}
            step={1}
            required
            value={end}
            onChange={(e) => setEnd(e.target.value)}
          />
        </label>
        <label>
          {t('maxAge')}
          <Input
            type="number"
            inputMode="numeric"
            min={params.currentAge}
            max={maximumAge}
            step={1}
            required
            value={maxAge}
            onChange={(e) => setMaxAge(e.target.value)}
          />
        </label>
        {!historical && (
          <label>
            {t('precision')}
            <select
              value={final ? 'final' : 'quick'}
              onChange={(e) => setFinal(e.target.value === 'final')}
            >
              <option value="quick">
                {t('quick', { paths: comparisonRunCount([params], false) })}
              </option>
              <option value="final">
                {t('final', { paths: comparisonRunCount([params], true) })}
              </option>
            </select>
          </label>
        )}
        {running ? (
          <Button
            type="button"
            variant="outline"
            onClick={(event) => {
              event.preventDefault()
              worker.current?.terminate()
              worker.current = null
              setRun(null)
            }}
          >
            {t('cancel')}
          </Button>
        ) : (
          <Button type="submit" variant="outline">
            {t('compare')}
          </Button>
        )}
      </form>
      <p role="status" aria-live="polite" className="ws-age-status">
        {running
          ? visible.progress
            ? t('progress', visible.progress)
            : t('running')
          : visible?.status === 'error'
            ? t('error')
            : headline}
      </p>
      {data && (
        <>
          <div className="ws-age-table" tabIndex={0} role="region" aria-label={t('table')}>
            <table>
              <caption className="sr-only">{t('table')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('age')}</th>
                  <th scope="col">{t('rate')}</th>
                  <th scope="col">{t('limit')}</th>
                  <th scope="col">{t('gain')}</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row) => (
                  <tr key={row.age} data-earliest={row.age === data.earliestAge || undefined}>
                    <th scope="row">{row.age}</th>
                    <td
                      title={t('count', {
                        hits: Math.round((row.successRate * data.paths) / 100),
                        paths: data.paths,
                      })}
                    >
                      {row.successRate < Number(probability) &&
                      Math.round(row.successRate * 10) / 10 >= Number(probability)
                        ? '<'
                        : ''}
                      {percent(row.successRate)}
                    </td>
                    <td>{row.monthlyLimit === null ? t('unfunded') : money(row.monthlyLimit)}</td>
                    <td>{row.extraYearGain === null ? '—' : money(row.extraYearGain, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="ws-withdrawal-muted">
            {t(historical ? 'historicalSample' : final ? 'finalSample' : 'quickSample', {
              paths: data.paths,
            })}{' '}
            {t('sample', {
              end: Number(end),
              probability: percent(Number(probability)),
            })}
            {interval && (
              <>
                {' '}
                {t('interval', {
                  age: earliest!.age,
                  low: percent(interval.lower),
                  high: percent(interval.upper),
                })}
              </>
            )}
          </p>
        </>
      )}
      <details className="ws-age-method">
        <summary>{t('method')}</summary>
        <p>{t('budgetMethod')}</p>
        <p>{t('successMethod')}</p>
      </details>
    </section>
  )
}

export function RetirementAgePlanner() {
  const activePlanId = useSimulationStore((state) => state.activePlanId)
  return <AgeComparisonForm key={activePlanId} />
}
