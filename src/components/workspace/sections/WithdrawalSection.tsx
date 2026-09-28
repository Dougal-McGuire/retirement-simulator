'use client'

import { memo } from 'react'
import { useTranslations } from 'next-intl'
import { WithdrawalPlanner } from '@/components/plans/WithdrawalPlanner'
import { WorkspaceSection } from './WorkspaceSection'
import './withdrawal.css'

/**
 * Entnahme (`#withdrawal`): one surface for how the portfolio becomes an
 * income. Choose and tune the rule, watch the readouts and the spending
 * corridor answer, then compare all four rules. The section id replaces the
 * planner's old `plan-editor-withdrawal` anchor; the body keeps the
 * `withdrawal-planner` test id.
 */
export const WithdrawalSection = memo(function WithdrawalSection() {
  const t = useTranslations('workspace')
  return (
    <WorkspaceSection
      id="withdrawal"
      title={t('sections.withdrawal.title')}
      description={t('sections.withdrawal.description')}
    >
      <WithdrawalPlanner />
    </WorkspaceSection>
  )
})
