import type { DraftChange } from '@/lib/simulation/draftChanges'
import type { EditTarget } from './WorkspaceProvider'

/**
 * Resolves where a draft change chip should jump inside the control column so
 * clicking the chip opens the right group, focuses the input and flashes it.
 */
export function changeEditTarget(change: DraftChange): EditTarget {
  if (change.type !== 'field') {
    if (change.type === 'flowRemoved') return { panel: 'flows' }
    return { panel: 'flows', fieldId: `cashflow-switch-${change.flow.id}` }
  }

  if (change.group === 'rule') {
    if (change.key === 'withdrawalStrategy') {
      return { section: 'withdrawal', fieldId: `withdrawal-strategy-${String(change.to)}` }
    }
    return { section: 'withdrawal', fieldId: `planner-${change.key}` }
  }

  if (change.key === 'oneOffIncomeTiming' || change.key === 'legacyTargetReal') {
    return { panel: change.group }
  }

  return { panel: change.group, fieldId: `editor-${change.key}` }
}
