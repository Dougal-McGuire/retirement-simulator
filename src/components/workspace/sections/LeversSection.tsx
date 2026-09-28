'use client'

import { memo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { RecommendationList } from '@/components/charts/RecommendationList'
import { LazyMount } from '../LazyMount'
import { LeverImpactList } from '../levers/LeverImpactList'
import { QuickLevers } from '../levers/QuickLevers'
import { UncertainFlowsList } from '../levers/UncertainFlowsList'
import { WorkspaceSection } from './WorkspaceSection'
import './levers.css'

/** Placeholder until the section comes near the viewport: the slider card and three rows. */
function LeversSkeleton() {
  return (
    <div className="ws-levers" aria-hidden="true">
      <div className="ws-skeleton" style={{ height: 232 }} />
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
 * Stellschrauben (`#levers`): the one place to try changes, in one order —
 * quick sliders, then what moves the needle (measured stress levers you can
 * apply or save as a plan), then the uncertain items with their switches and
 * measured impact, then recommendations.
 *
 * Everything here edits the working copy; saving and discarding happen only
 * in the result bar. The lever measurements are the only background runs on
 * the page, and they wait until this list is on screen and the reader has
 * stopped changing things (see `useLeverMeasurements`).
 */
export const LeversSection = memo(function LeversSection() {
  const t = useTranslations('workspace')
  const [holding, setHolding] = useState(false)
  return (
    <WorkspaceSection
      id="levers"
      title={t('sections.levers.title')}
      description={t('sections.levers.description')}
    >
      <LazyMount minHeight={720} fallback={<LeversSkeleton />}>
        <div className="ws-levers">
          <QuickLevers onHoldChange={setHolding} />
          <LeverImpactList holding={holding} />
          <UncertainFlowsList holding={holding} />
          <RecommendationList />
        </div>
      </LazyMount>
    </WorkspaceSection>
  )
})
