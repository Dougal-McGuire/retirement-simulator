'use client'

import { useEffect, useState } from 'react'
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

interface ScenarioPlanDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Name of the plan the stress lever was applied to. */
  sourceName: string
  /** Prefilled name for the plan about to be created. */
  suggestedName: string
  /** The parameters this lever actually moves, at most a handful. */
  changes: AssumptionChange[]
  onConfirm: (name: string) => void
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
}: ScenarioPlanDialogProps) {
  const t = useTranslations('plans')
  const td = useTranslations('plans.dialogs.scenario')
  const tRows = useTranslations('plans.comparison.assumptions.rows')
  const formatValue = useAssumptionValueFormatter()
  const [name, setName] = useState(suggestedName)

  useEffect(() => {
    if (open) setName(suggestedName)
  }, [open, suggestedName])

  const confirm = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onConfirm(trimmed)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white sm:max-w-[32rem]" data-testid="scenario-plan-dialog">
        <DialogHeader>
          <DialogTitle>{td('title')}</DialogTitle>
          <DialogDescription>{td('description', { source: sourceName })}</DialogDescription>
        </DialogHeader>

        <div className="rounded-sm border-2 border-border bg-muted px-3 py-2">
          <p className="text-[0.58rem] font-extrabold   text-muted-foreground">
            {td('source')}
          </p>
          <p className="mt-1 truncate text-[0.78rem] font-extrabold text-ink">{sourceName}</p>
        </div>

        <div>
          <p className="text-[0.58rem] font-extrabold   text-muted-foreground">
            {td('changes')}
          </p>
          {changes.length === 0 ? (
            <p className="mt-2 text-[0.72rem] font-medium text-muted-foreground">
              {td('noChanges')}
            </p>
          ) : (
            <ul className="mt-2 space-y-1.5" data-testid="scenario-plan-changes">
              {changes.map((change) => (
                <li
                  key={change.key}
                  className="flex flex-wrap items-center gap-2 text-[0.72rem] font-semibold text-ink"
                >
                  <span className="text-muted-foreground">{tRows(change.key)}</span>
                  <span className="tabular-nums line-through opacity-60">
                    {formatValue(change.from, change.kind)}
                  </span>
                  <ArrowRight className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span className="tabular-nums font-extrabold">
                    {formatValue(change.to, change.kind)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="pt-1">
          <Label htmlFor="scenario-plan-name" className="text-sm font-medium">
            {td('label')}
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
            placeholder={td('placeholder')}
            className="rounded-sm mt-2 h-11 border-2 border-border bg-white px-3 py-2 text-[0.78rem] font-semibold"
          />
        </div>

        <DialogFooter className="sm:flex-wrap">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button
            size="sm"
            onClick={confirm}
            disabled={!name.trim()}
            data-testid="scenario-plan-confirm"
          >
            {td('confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
