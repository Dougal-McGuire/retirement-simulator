'use client'

import type { ComponentType } from 'react'
import type { AssumptionPanel } from '@/components/plans/planSections'
import { PersonalGroup } from '@/components/plans/editor/PersonalGroup'
import { SavingsGroup } from '@/components/plans/editor/SavingsGroup'
import { lazyComponent } from '@/components/lazy/lazyComponent'

const loadFlows = () =>
  import('@/components/plans/editor/FlowsGroup').then((module) => module.FlowsGroup)
const loadMarket = () =>
  import('@/components/plans/editor/MarketGroup').then((module) => module.MarketGroup)

/** Placeholder while a code-split panel body loads. */
function PanelSkeleton() {
  return (
    <div className="ws-panel-loading" data-panel-loading="true" aria-hidden="true">
      <div className="ws-skeleton" style={{ height: 64 }} />
      <div className="ws-skeleton" style={{ height: 48 }} />
      <div className="ws-skeleton" style={{ height: 48 }} />
      <div className="ws-skeleton" style={{ height: 160 }} />
    </div>
  )
}

// Client-only and retryable: a chunk that does not arrive throws to the
// panel body's `SectionBoundary`, whose "Try again" loads it afresh.
const FlowsGroup = lazyComponent(loadFlows, PanelSkeleton)
const MarketGroup = lazyComponent(loadMarket, PanelSkeleton)

/** Which component renders each assumption panel's body. */
export const PANEL_CONTENT: Record<AssumptionPanel, ComponentType> = {
  person: PersonalGroup,
  savings: SavingsGroup,
  flows: FlowsGroup,
  market: MarketGroup,
}

/** Starts loading the code-split panel bodies (called on idle). */
export function preloadPanelContent(): void {
  // A failed preload is not an error yet: opening the panel retries.
  FlowsGroup.preload().catch(() => {})
  MarketGroup.preload().catch(() => {})
}
