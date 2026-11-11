'use client'

import type { ComponentType } from 'react'
import type { ColumnGroup } from '@/components/plans/planSections'
import { PersonalGroup } from '@/components/plans/editor/PersonalGroup'
import { SavingsGroup } from '@/components/plans/editor/SavingsGroup'
import { lazyComponent } from '@/components/lazy/lazyComponent'

const loadFlows = () =>
  import('@/components/plans/editor/FlowsGroup').then((module) => module.FlowsGroup)
const loadMarket = () =>
  import('@/components/plans/editor/MarketGroup').then((module) => module.MarketGroup)
const loadRule = () =>
  import('@/components/plans/WithdrawalPlanner').then((module) => module.WithdrawalRuleGroup)

/** Placeholder while a code-split group body loads. */
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
// group body's `SectionBoundary`, whose "Try again" loads it afresh.
const FlowsGroup = lazyComponent(loadFlows, PanelSkeleton)
const MarketGroup = lazyComponent(loadMarket, PanelSkeleton)
const RuleGroup = lazyComponent(loadRule, PanelSkeleton)

/** Which component renders each group's body in the control column. */
export const PANEL_CONTENT: Record<ColumnGroup, ComponentType> = {
  person: PersonalGroup,
  savings: SavingsGroup,
  flows: FlowsGroup,
  rule: RuleGroup,
  market: MarketGroup,
}

/** Starts loading the code-split group bodies (called on idle). */
export function preloadPanelContent(): void {
  // A failed preload is not an error yet: opening the group retries.
  FlowsGroup.preload().catch(() => {})
  MarketGroup.preload().catch(() => {})
  RuleGroup.preload().catch(() => {})
}
