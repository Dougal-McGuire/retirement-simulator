'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'
import { CashflowCard } from '@/components/charts/CashflowCard'
import { useSimulationResults } from '@/lib/stores/simulationStore'
import { LazyMount } from '../LazyMount'
import { Skeleton } from '../Skeleton'
import { useWorkspace } from '../WorkspaceProvider'
import { WorkspaceSection } from './WorkspaceSection'
import './cashflow.css'

/** The Sankey and its table only redraw for a new result (`onEdit` is stable). */
const MemoCashflowCard = memo(CashflowCard)

/** Room the Sankey and the table take once mounted (placeholder height). */
const CASHFLOW_RESERVED_HEIGHT = 1180

/**
 * The card's shape while it waits: the control row, the Sankey (its sentence
 * and plot) and the rows of the table under it.
 */
function CashflowSkeleton() {
  return (
    <div className="ws-cashflow" aria-hidden="true" style={{ height: CASHFLOW_RESERVED_HEIGHT }}>
      <div className="ws-cashflow-controls">
        <Skeleton height={40} width="12rem" />
        <Skeleton height={14} width="10rem" />
      </div>
      <div className="ws-sankey">
        <div className="ws-skeleton-lines">
          <Skeleton height={14} width="80%" />
          <Skeleton height={14} width="45%" />
        </div>
        <Skeleton variant="chart" height={260} style={{ marginTop: 16 }} />
      </div>
      <div className="ws-flowtable-wrap ws-skeleton-lines">
        <Skeleton height={16} width="30%" />
        {[0, 1, 2, 3, 4, 5].map((key) => (
          <Skeleton key={key} height={14} width={key % 3 === 2 ? '70%' : '100%'} />
        ))}
      </div>
    </div>
  )
}

/**
 * Geldfluss (`#cashflow`): the Sankey and its table, mounted when near the
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
