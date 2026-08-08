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
    <div className="flex min-w-0 flex-col gap-2" data-testid={testId}>
      <p className="text-[0.72rem] font-semibold leading-snug text-neo-black">{message}</p>
      <div className="flex flex-wrap gap-2">
        {actions.map((action) => (
          <button
            key={action.label}
            type="button"
            data-testid={action.testId}
            onClick={action.onClick}
            className={cn(
              'border-2 border-neo-black px-2.5 py-1 text-[0.62rem] font-extrabold uppercase tracking-[0.12em] transition-neo hover:-translate-y-[1px]',
              action.tone === 'primary'
                ? 'bg-neo-yellow text-neo-black'
                : 'bg-neo-white text-neo-black'
            )}
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  )
}
