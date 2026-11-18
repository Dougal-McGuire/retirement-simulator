'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { ArrowRight } from 'lucide-react'
import type { ShortfallSummary } from '@/types'
import { useMoney } from '@/lib/hooks/useMoney'
import { useUsableResults } from '../useUsableResults'
import { useWorkspace } from '../WorkspaceProvider'
import './shortfallDetails.css'

function TypicalShortfall({ summary, endAge }: { summary: ShortfallSummary; endAge: number }) {
  const t = useTranslations('workspace.shortfalls')
  const format = useFormatter()
  const money = useMoney()
  const { medianFirstAge, medianMonthlyGapReal, medianAffectedYears } = summary
  if (medianFirstAge === null || medianMonthlyGapReal === null || medianAffectedYears === null) {
    return null
  }
  return (
    <>
      <dl className="ws-shortfalls-metrics">
        <div>
          <dt>{t('firstAge')}</dt>
          <dd>{format.number(medianFirstAge)}</dd>
        </div>
        <div>
          <dt>{t('monthlyGap')}</dt>
          <dd>{money.full(medianMonthlyGapReal)}</dd>
        </div>
        <div>
          <dt>{t('duration')}</dt>
          <dd>{format.number(medianAffectedYears)}</dd>
        </div>
      </dl>
      <p>
        {t('atHorizon', { count: summary.atHorizon, affected: summary.affectedPaths, age: endAge })}
      </p>
    </>
  )
}

export function ShortfallDetails() {
  const t = useTranslations('workspace.shortfalls')
  const money = useMoney()
  const { openEditor } = useWorkspace()
  const results = useUsableResults()
  const details = results?.shortfallDetails
  if (!results || !details) return null

  const { paths, funding, lifestyle, bequestOnlyPaths } = details
  const { endAge, legacyTargetReal, lifestyleFloorMonthlyReal } = results.params
  return (
    <details className="ws-shortfalls" data-testid="shortfall-details">
      <summary>
        <span>{t('title')}</span>
        <span className="ws-shortfalls-count">
          {t('fundingCount', { count: funding.affectedPaths, total: paths })}
        </span>
      </summary>
      <div className="ws-shortfalls-body">
        <section aria-labelledby="funding-shortfall-heading">
          <h3 id="funding-shortfall-heading">{t('fundingHeading')}</h3>
          <p>{t('fundingDefinition')}</p>
          <TypicalShortfall summary={funding} endAge={endAge} />
          {legacyTargetReal > 0 && (
            <p>
              {t('bequest', {
                count: bequestOnlyPaths,
                total: paths,
                target: money.full(legacyTargetReal),
              })}
            </p>
          )}
        </section>
        <section aria-labelledby="lifestyle-shortfall-heading">
          <h3 id="lifestyle-shortfall-heading">{t('lifestyleHeading')}</h3>
          {lifestyle ? (
            <>
              <p>
                {t('lifestyleCount', {
                  count: lifestyle.affectedPaths,
                  total: paths,
                  target: money.full(lifestyleFloorMonthlyReal ?? 0),
                })}
              </p>
              {lifestyle.affectedPaths > 0 && (
                <p>{t('lifestyleFunded', { count: details.fundedPathsBelowLifestyleFloor })}</p>
              )}
              <TypicalShortfall summary={lifestyle} endAge={endAge} />
            </>
          ) : (
            <p>{t('noFloor')}</p>
          )}
          <button
            type="button"
            className="ws-text-link"
            onClick={(event) =>
              openEditor(
                { section: 'withdrawal', fieldId: 'planner-lifestyleFloorMonthlyReal' },
                event.currentTarget
              )
            }
          >
            {t(lifestyle ? 'editFloor' : 'setFloor')} <ArrowRight size={14} aria-hidden="true" />
          </button>
        </section>
        {(funding.affectedPaths > 0 || (lifestyle?.affectedPaths ?? 0) > 0) && (
          <p className="ws-shortfalls-method">{t('method')}</p>
        )}
      </div>
    </details>
  )
}
