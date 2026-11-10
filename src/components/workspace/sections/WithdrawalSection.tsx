'use client'

import { memo, type MouseEvent } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowRight } from 'lucide-react'
import { WithdrawalOutcome } from '@/components/plans/WithdrawalPlanner'
import { useSimulationStore } from '@/lib/stores/simulationStore'
import { useWorkspace } from '../WorkspaceProvider'
import { WorkspaceSection } from './WorkspaceSection'
import './withdrawal.css'

/**
 * The rule the outcome below belongs to, and the way to change it: the rule
 * and its settings live in the column's "Entnahme" group, one tap away.
 */
function RulePointer() {
  const t = useTranslations('workspace.withdrawal')
  const tOptions = useTranslations('parameterControls.fields.withdrawalStrategy.options')
  const strategy = useSimulationStore((state) => state.params.withdrawalStrategy)
  const { openEditor } = useWorkspace()
  return (
    <button
      type="button"
      className="ws-text-link ws-rule-pointer"
      data-testid="withdrawal-rule-link"
      onClick={(event: MouseEvent<HTMLButtonElement>) =>
        openEditor({ section: 'withdrawal' }, event.currentTarget)
      }
    >
      <span>{t('rule', { strategy: tOptions(`${strategy}.label`) })}</span>
      <span className="ws-rule-pointer-action">
        {t('change')}
        <ArrowRight size={14} aria-hidden="true" />
      </span>
    </button>
  )
}

/**
 * Entnahme (`#withdrawal`): what the withdrawal rule does to the income —
 * four readouts, the spending corridor, and the same plan under all four
 * rules. The rule itself is chosen and tuned in the control column (group
 * "Entnahme"), so cause and effect are on screen together. The body keeps
 * the `withdrawal-planner` test id.
 */
export const WithdrawalSection = memo(function WithdrawalSection() {
  const t = useTranslations('workspace')
  return (
    <WorkspaceSection
      id="withdrawal"
      title={t('sections.withdrawal.title')}
      description={t('sections.withdrawal.description')}
      actions={<RulePointer />}
    >
      <WithdrawalOutcome />
    </WorkspaceSection>
  )
})
