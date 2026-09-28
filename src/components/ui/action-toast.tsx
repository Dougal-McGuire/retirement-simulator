'use client'

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ActionToastAction {
  label: string
  onClick: () => void
  /** Primary actions get the filled treatment; everything else is outlined. */
  tone?: 'primary' | 'neutral'
  testId?: string
}

interface ActionToastProps {
  message: ReactNode
  actions: ActionToastAction[]
  testId?: string
}

/**
 * The one shape every actionable toast takes: a line of text and one or two
 * buttons under it.
 *
 * Rendered inside `react-hot-toast`'s own fixed container (see `ToastProvider`),
 * which supplies the border, shadow and background — this component only owns
 * the layout, so an undo card in the plan editor and a "switch to it" card from
 * the stress levers cannot drift apart.
 */
export function ActionToast({ message, actions, testId }: ActionToastProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3" data-testid={testId}>
      <p className="m-0 text-sm font-medium leading-snug text-[color:var(--ui-text)]">
        {message}
      </p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            data-testid={action.testId}
            onClick={action.onClick}
            className={cn(
              'inline-flex min-h-9 items-center rounded-[var(--ui-radius)] border px-3 text-sm font-medium transition-colors motion-reduce:transition-none',
              action.tone === 'primary'
                ? 'border-[color:var(--action)] bg-[color:var(--action)] text-[color:var(--on-action)] hover:border-[color:var(--action-hover)] hover:bg-[color:var(--action-hover)]'
                : 'border-[color:var(--ui-border)] bg-[color:var(--ui-surface)] text-[color:var(--ui-text)] hover:bg-[color:var(--ui-subtle)]'
            )}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}
