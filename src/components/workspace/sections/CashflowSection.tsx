'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'
import { CashflowCard } from '@/components/charts/CashflowCard'
import { useSimulationResults } from '@/lib/stores/simulationStore'
import { LazyMount } from '../LazyMount'
import { Skeleton } from '../Skeleton'
import { useWorkspace } from '../WorkspaceProvider'
import { WorkspaceSection } from './WorkspaceSection'

/** The Sankey and ledger only redraw for a new result (`onEdit` is stable). */
const MemoCashflowCard = memo(CashflowCard)

/** Room the Sankey and the ledger take once mounted (placeholder height). */
const CASHFLOW_RESERVED_HEIGHT = 960

/**
 * The card's shape while it waits: title and year picker, the method line,
 * the Sankey plot at its height and the three ledger columns.
 */
function CashflowSkeleton() {
  return (
    <div className="ws-cashflow" aria-hidden="true" style={{ height: CASHFLOW_RESERVED_HEIGHT }}>
      <div className="ws-cashflow-head">
        <div className="ws-skeleton-lines" style={{ flex: '1 1 16rem' }}>
          <Skeleton height={22} width="14rem" />
          <Skeleton height={14} width="8rem" />
        </div>
        <Skeleton height={40} width="12rem" />
      </div>
      <div className="ws-skeleton-lines" style={{ marginTop: 24 }}>
        <Skeleton height={14} width="80%" />
        <Skeleton height={14} width="55%" />
      </div>
      <div className="ws-sankey">
        <Skeleton height={20} width="16rem" />
        <Skeleton variant="chart" height={360} style={{ marginTop: 24 }} />
      </div>
      <div className="ws-ledger">
        {[0, 1, 2].map((key) => (
          <div key={key} className="ws-skeleton-lines">
            <Skeleton height={16} width="50%" />
            <Skeleton height={14} />
            <Skeleton height={14} />
            <Skeleton height={14} width="80%" />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Geldfluss (`#cashflow`): the Sankey and the ledger, mounted when near the
 * viewport. Inside the page's `DeferredResultsScope`: a landing run redraws
 * them after the result bar has committed.
 */
export const CashflowSection = memo(function CashflowSection() {
  const t = useTranslations('workspace')
  const results = useSimulationResults()
  const { openEditor } = useWorkspace()
  return (
    <WorkspaceSection
      id="cashflow"
      title={t('sections.cashflow.title')}
      description={t('sections.cashflow.description')}
    >
      <LazyMount minHeight={CASHFLOW_RESERVED_HEIGHT} fallback={<CashflowSkeleton />}>
        {results ? (
          <MemoCashflowCard params={results.params} results={results} onEdit={openEditor} />
        ) : (
          <>
            <CashflowSkeleton />
            <p className="sr-only" role="status">
              {t('computing')}
            </p>
          </>
        )}
      </LazyMount>
    </WorkspaceSection>
  )
})
