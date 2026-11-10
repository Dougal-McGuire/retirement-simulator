'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'
import { RecommendationList } from '@/components/charts/RecommendationList'
import { LazyMount } from '../LazyMount'
import { LeverImpactList } from '../levers/LeverImpactList'
import { UncertainFlowsList } from '../levers/UncertainFlowsList'
import { WorkspaceSection } from './WorkspaceSection'
import './levers.css'

/** Placeholder until the section comes near the viewport: three measured rows. */
function LeversSkeleton() {
  return (
    <div className="ws-levers" aria-hidden="true">
      <div className="ws-levers-list">
        {[0, 1, 2].map((index) => (
          <div key={index} className="ws-levers-row-skeleton">
            <span className="ws-skeleton" style={{ width: '40%' }} />
            <span className="ws-skeleton" style={{ width: '65%' }} />
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Wirkung (`#levers`): what moves the result most — the measured stress
 * levers you can apply or save as a plan, the uncertain items with their
 * switches and measured impact, then recommendations. The quick sliders that
 * used to lead this section are gone: the control column is the lever board,
 * and every value has its one home there.
 *
 * Everything here edits the working copy; saving and discarding happen only
 * in the bar. The measurements are the page's background runs: they wait
 * until their list is near the screen and the reader has stopped changing
 * things (see `useLeverMeasurements`), on one queue with the ghost's run.
 */
export const LeversSection = memo(function LeversSection() {
  const t = useTranslations('workspace')
  return (
    <WorkspaceSection
      id="levers"
      title={t('sections.levers.title')}
      description={t('sections.levers.description')}
    >
      <LazyMount minHeight={520} fallback={<LeversSkeleton />}>
        <div className="ws-levers">
          <LeverImpactList />
          <UncertainFlowsList />
          <RecommendationList />
        </div>
      </LazyMount>
    </WorkspaceSection>
  )
})
