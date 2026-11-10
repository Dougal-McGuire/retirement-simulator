'use client'

import type { ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { cn } from '@/lib/utils'
import { registerUndo, unregisterUndo } from './undoRegistry'

interface ActionToastAction {
  label: string
  onClick: () => void
  /** Primary actions get the filled treatment; everything else is outlined. */
  tone?: 'primary' | 'neutral'
  testId?: string
  /** This action also answers Ctrl/Cmd+Z (announced via `aria-keyshortcuts`). */
  undoShortcut?: boolean
}

interface ActionToastProps {
  message: ReactNode
  actions: ActionToastAction[]
  testId?: string
  /** Renders a visible close button. */
  onClose?: () => void
}

function isApple(): boolean {
  return typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)
}

/**
 * The one shape every actionable toast takes: a line of text and one or two
 * buttons under it, plus a close button when the toast does not time out.
 *
 * Rendered inside the toast stack (see `ToastProvider`), which supplies the
 * border, shadow and background — this component only owns the layout, so an
 * undo card in the plan editor and a "switch to it" card from the stress
 * levers cannot drift apart.
 */
export function ActionToast({ message, actions, testId, onClose }: ActionToastProps) {
  const t = useTranslations('ui.toast')
  const shortcut = isApple() ? t('shortcutMeta') : t('shortcutCtrl')
  return (
    <div className="flex min-w-0 items-start gap-2" data-testid={testId}>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
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
              aria-keyshortcuts={action.undoShortcut ? 'Control+Z Meta+Z' : undefined}
              title={action.undoShortcut ? `${action.label} (${shortcut})` : undefined}
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
      {onClose && (
        <button
          type="button"
          data-testid={testId ? `${testId}-close` : undefined}
          onClick={onClose}
          aria-label={t('close')}
          title={t('close')}
          className="-mr-2 -mt-1 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--ui-radius)] text-[color:var(--ui-muted)] transition-colors hover:bg-[color:var(--ui-subtle)] hover:text-[color:var(--ui-text)] motion-reduce:transition-none"
        >
          <X size={16} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

/** At most this many action toasts at once; the oldest goes first. */
const MAX_ACTION_TOASTS = 3
let open: string[] = []

export interface ShowActionToastOptions {
  message: ReactNode
  testId?: string
  /** The Undo: first, primary, and on Ctrl/Cmd+Z while the toast is up. */
  undo?: { label: string; testId?: string; run: () => void }
  /** Further actions; each receives `dismiss` to close the toast. */
  actions?: Array<Omit<ActionToastAction, 'onClick'> & { onClick: (dismiss: () => void) => void }>
}

/**
 * Shows an action toast that stays until it is acted on or closed — an 8 s
 * timer (paused only by mouse hover) made the Undo practically unreachable
 * from the keyboard. Returns the toast id (for `toast.dismiss`).
 */
export function showActionToast({ message, testId, undo, actions = [] }: ShowActionToastOptions) {
  let id = ''
  const dismiss = () => {
    unregisterUndo(id)
    open = open.filter((entry) => entry !== id)
    toast.dismiss(id)
  }
  const runUndo = () => {
    dismiss()
    undo?.run()
  }
  const list: ActionToastAction[] = [
    ...(undo
      ? [
          {
            label: undo.label,
            tone: 'primary' as const,
            testId: undo.testId,
            undoShortcut: true,
            onClick: runUndo,
          },
        ]
      : []),
    ...actions.map((action) => ({ ...action, onClick: () => action.onClick(dismiss) })),
  ]
  id = toast(
    () => <ActionToast testId={testId} message={message} actions={list} onClose={dismiss} />,
    { duration: Infinity }
  )
  if (undo) registerUndo(id, runUndo)
  open = [...open.filter((entry) => entry !== id), id]
  while (open.length > MAX_ACTION_TOASTS) {
    const oldest = open[0]
    open = open.slice(1)
    unregisterUndo(oldest)
    toast.dismiss(oldest)
  }
  return id
}

/** Forgets the Undo of a toast that was dismissed from elsewhere. */
export function forgetActionToast(id: string): void {
  unregisterUndo(id)
  open = open.filter((entry) => entry !== id)
}
