'use client'

import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { ArrowRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { AssumptionChange } from '@/lib/simulation/planDiff'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAssumptionValueFormatter } from '@/components/plans/useAssumptionFormat'
import { cashFlowDisplayName } from '@/lib/plans/cashFlowName'

interface ScenarioPlanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Name of the plan the stress lever was applied to. */
  sourceName: string
  /** Prefilled name for the plan about to be created. */
  suggestedName: string
  /** The parameters this lever actually moves, at most a handful. */
  changes: AssumptionChange[]
  /**
   * Creates the plan. Returning a message means nothing was created: the
   * dialog stays open and shows it instead of closing as if it had worked.
   */
  onConfirm: (name: string) => string | void
  /** Why creating is not possible right now (e.g. the plan limit): shown, confirm disabled. */
  blockedReason?: string
  /**
   * `scenario` (default): a stress lever saved as a plan. `draft`: the
   * working copy's unsaved changes saved as a new plan.
   */
  variant?: 'scenario' | 'draft'
  /** Where focus goes on close; defaults to what was focused on open. */
  returnFocusRef?: RefObject<HTMLElement | null>
}

/**
 * Confirmation step for "save this stress lever as a plan".
 *
 * A lever used to create-and-switch silently, which left users with a plan
 * they had not named, could not trace back to its source, and had not agreed
 * to switch to. This dialog names it, shows the lineage, and spells out the
 * parameter change before anything is written.
 */
export function ScenarioPlanDialog({
  open,
  onOpenChange,
  sourceName,
  suggestedName,
  changes,
  onConfirm,
  variant = 'scenario',
  returnFocusRef,
  blockedReason,
}: ScenarioPlanDialogProps) {
  const t = useTranslations('plans')
  const tScenario = useTranslations('plans.dialogs.scenario')
  const tDraft = useTranslations('plans.dialogs.saveDraft')
  const tRows = useTranslations('plans.comparison.assumptions.rows')
  const tFlows = useTranslations('setup.cashFlows')
  const formatValue = useAssumptionValueFormatter()
  const [name, setName] = useState(suggestedName)
  const [failure, setFailure] = useState<string | null>(null)
  const error = blockedReason ?? failure
  const draft = variant === 'draft'
  const openedFrom = useRef<HTMLElement | null>(null)

  // Layout effect: runs before Radix moves focus into the dialog.
  useLayoutEffect(() => {
    if (!open) return
    const active = document.activeElement
    openedFrom.current = active instanceof HTMLElement && active !== document.body ? active : null
  }, [open])

  const rowLabel = (change: AssumptionChange) =>
    change.flow
      ? cashFlowDisplayName(change.flow, (key) => tFlows(`defaults.${key}`))
      : tRows(change.key)

  useEffect(() => {
    if (!open) return
    setName(suggestedName)
    setFailure(null)
  }, [open, suggestedName])

  const confirm = () => {
    const trimmed = name.trim()
    if (!trimmed || blockedReason) return
    const problem = onConfirm(trimmed)
    if (problem) {
      setFailure(problem)
      return
    }
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-card sm:max-w-[32rem]"
        data-testid={draft ? 'save-draft-dialog' : 'scenario-plan-dialog'}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current ?? openedFrom.current
          if (!target?.isConnected) return
          event.preventDefault()
          target.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{draft ? tDraft('title') : tScenario('title')}</DialogTitle>
          <DialogDescription>
            {draft
              ? tDraft('description', { source: sourceName })
              : tScenario('description', { source: sourceName })}
          </DialogDescription>
        </DialogHeader>

        {!draft && (
          <div className="rounded-sm bg-muted px-3 py-2">
            <p className="text-xs font-medium text-muted-foreground">{tScenario('source')}</p>
            <p className="mt-0.5 truncate text-sm font-semibold text-ink">{sourceName}</p>
          </div>
        )}

        <div>
          <p className="text-xs font-medium text-muted-foreground">
            {draft ? tDraft('changes', { source: sourceName }) : tScenario('changes')}
          </p>
          {changes.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              {draft ? tDraft('noChanges') : tScenario('noChanges')}
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5" data-testid="scenario-plan-changes">
              {changes.map((change) => (
                <li key={change.key} className="flex flex-wrap items-center gap-2 text-sm text-ink">
                  <span className="text-muted-foreground">{rowLabel(change)}</span>
                  <span className="tabular-nums text-muted-foreground line-through">
                    {formatValue(change.from, change.kind)}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span className="tabular-nums font-semibold">
                    {formatValue(change.to, change.kind)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pt-1">
          <Label htmlFor="scenario-plan-name" className="text-sm font-medium">
            {draft ? tDraft('label') : tScenario('label')}
          </Label>
          <Input
            id="scenario-plan-name"
            autoFocus
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') confirm()
            }}
            placeholder={draft ? tDraft('placeholder') : tScenario('placeholder')}
            aria-describedby={error ? 'scenario-plan-error' : undefined}
            className="rounded-sm mt-2 h-11 border border-border bg-card px-3 py-2 text-sm"
          />
          {error && (
            <p
              id="scenario-plan-error"
              role="alert"
              className="mt-2 text-sm text-danger"
              data-testid="scenario-plan-error"
            >
              {error}
            </p>
          )}
        </div>

        <DialogFooter className="sm:flex-wrap">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={confirm}
            disabled={!name.trim() || Boolean(blockedReason)}
            data-testid={draft ? 'save-draft-confirm' : 'scenario-plan-confirm'}
          >
            {draft ? tDraft('confirm') : tScenario('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
