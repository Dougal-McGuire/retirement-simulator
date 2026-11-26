'use client'

import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { Check, Copy, FolderOpen, Pencil, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { MAX_PLANS, type Plan } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PlanDeleteDialog } from '@/components/plans/PlanDeleteDialog'
import { PlanNameDialog } from '@/components/plans/PlanNameDialog'
import { PlanSwitchGuard } from '@/components/plans/PlanSwitchGuard'
import { deletePlanWithUndo } from '@/components/plans/planDeleteUndo'
import { planDisplayName } from '@/lib/plans/planName'
import { suggestDuplicateName } from '@/lib/stores/plans'
import { toast } from '@/components/ui/toast'
import {
  useActivePlanId,
  useCreatePlan,
  useDuplicatePlan,
  usePlanIsDirty,
  usePlanSuccessRates,
  usePlans,
  useRenamePlan,
  useRevertPlanDraft,
  useSavePlanDraft,
  useSetActivePlan,
} from '@/lib/stores/simulationStore'
import { cn } from '@/lib/utils'

interface PlanSwitcherProps {
  className?: string
}

/**
 * The single home for plan controls: switch, create, rename, duplicate, delete —
 * plus the state of the working copy (unsaved changes, save, revert).
 *
 * Editing never touches a stored plan, so this bar is where a user turns the
 * working copy into something durable, and where switching plans has to ask
 * before throwing unsaved work away.
 */
export function PlanSwitcher({ className }: PlanSwitcherProps) {
  const t = useTranslations('plans')
  const format = useFormatter()
  const plans = usePlans()
  const activePlanId = useActivePlanId()
  const setActivePlan = useSetActivePlan()
  const createPlan = useCreatePlan()
  const renamePlan = useRenamePlan()
  const duplicatePlan = useDuplicatePlan()
  const isDirty = usePlanIsDirty()
  const savePlanDraft = useSavePlanDraft()
  const revertPlanDraft = useRevertPlanDraft()
  const successRates = usePlanSuccessRates()

  const [newOpen, setNewOpen] = useState(false)
  const [duplicateTarget, setDuplicateTarget] = useState<Plan | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [editingRowId, setEditingRowId] = useState<string | null>(null)
  const [rowRenameDraft, setRowRenameDraft] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<Plan | null>(null)
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const renameButtonRef = useRef<HTMLButtonElement>(null)
  const rowRenameInputRef = useRef<HTMLInputElement>(null)
  const refocusRenameBtn = useRef(false)

  useEffect(() => {
    if (renaming) {
      const input = renameInputRef.current
      if (input) {
        input.focus()
        input.select()
      }
      return
    }
    if (refocusRenameBtn.current) {
      refocusRenameBtn.current = false
      renameButtonRef.current?.focus()
    }
  }, [renaming])

  useEffect(() => {
    if (!editingRowId) return
    const input = rowRenameInputRef.current
    if (input) {
      input.focus()
      input.select()
    }
  }, [editingRowId])

  useEffect(() => {
    setRenaming(false)
  }, [activePlanId])

  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === activePlanId) ?? plans[0],
    [plans, activePlanId]
  )

  const formatRate = (rate: number) =>
    format.number(rate / 100, {
      style: 'percent',
      minimumFractionDigits: 0,
      maximumFractionDigits: 1,
    })

  if (!activePlan) return null

  const activeName = planDisplayName(activePlan, t)
  const atLimit = plans.length >= MAX_PLANS
  const duplicateTargetName = duplicateTarget ? planDisplayName(duplicateTarget, t) : activeName
  // Prefilled into the duplicate dialog, so the copy is named before it exists
  // rather than inheriting a "(copy)" that later shows up in a PDF.
  const duplicateSuggestion = suggestDuplicateName(
    duplicateTargetName,
    plans.map((plan) => planDisplayName(plan, t))
  )

  const startRowRename = (plan: Plan) => {
    setRenaming(false)
    setRowRenameDraft(planDisplayName(plan, t))
    setEditingRowId(plan.id)
  }

  const commitRowRename = (plan: Plan, event?: FormEvent) => {
    event?.preventDefault()
    const trimmed = rowRenameDraft.trim()
    if (!trimmed) return
    if (trimmed !== planDisplayName(plan, t)) renamePlan(plan.id, trimmed)
    setEditingRowId(null)
  }

  const cancelRowRename = () => {
    setEditingRowId(null)
  }

  const requestSwitch = (nextId: string) => {
    if (nextId === activePlan.id) return
    if (isDirty) {
      setPendingPlanId(nextId)
      return
    }
    setActivePlan(nextId)
  }

  const handleSave = () => {
    savePlanDraft()
    toast.success(t('dirty.savedToast', { name: activeName }))
  }

  const handleRevert = () => {
    revertPlanDraft()
    toast.success(t('dirty.revertedToast', { name: activeName }))
  }

  const startInlineRename = () => {
    setRenameDraft(activeName)
    setRenaming(true)
  }

  const commitInlineRename = (event?: FormEvent) => {
    event?.preventDefault()
    const trimmed = renameDraft.trim()
    if (!trimmed) return
    if (trimmed !== activeName) renamePlan(activePlan.id, trimmed)
    refocusRenameBtn.current = true
    setRenaming(false)
  }

  const cancelInlineRename = () => {
    refocusRenameBtn.current = true
    setRenaming(false)
  }

  return (
    <div
      data-testid="plan-switcher"
      className={cn(
        'rounded-sm theme-plan-switcher flex flex-col gap-4 border border-border bg-card p-4',
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-xs font-semibold   text-muted-foreground">
          <FolderOpen className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          {t('label')}
        </span>
        <div className="flex items-center gap-2">
          <span
            data-testid="plan-dirty-badge"
            className={cn(
              'rounded-sm inline-flex items-center gap-1.5 border px-2 py-0.5 text-xs font-semibold  ',
              isDirty
                ? 'border-border bg-amber text-ink'
                : 'border-ink/30 bg-transparent text-muted-foreground'
            )}
          >
            {isDirty ? (
              <span aria-hidden="true" className="h-2 w-2 bg-ink" />
            ) : (
              <Check className="h-3 w-3" aria-hidden="true" />
            )}
            {isDirty ? t('dirty.badge') : t('dirty.clean')}
          </span>
          <span className="text-xs font-semibold   text-muted-foreground">
            {t('switcher.count', { count: plans.length, max: MAX_PLANS })}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {renaming ? (
          <form
            className="flex items-center gap-1.5"
            data-testid="plan-switcher-inline-rename"
            onSubmit={commitInlineRename}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                event.nativeEvent.stopPropagation()
                cancelInlineRename()
              }
            }}
          >
            <Input
              ref={renameInputRef}
              id="plan-rename-name"
              value={renameDraft}
              maxLength={60}
              aria-label={t('dialogs.rename.label')}
              placeholder={t('dialogs.rename.placeholder')}
              onChange={(event) => setRenameDraft(event.target.value)}
              className="rounded-sm h-10 flex-1 border border-border bg-card px-3 text-xs font-semibold"
            />
            <Button
              type="submit"
              size="sm"
              className="h-10 px-3"
              disabled={!renameDraft.trim()}
              aria-label={t('actions.save')}
              data-testid="plan-rename-save"
            >
              <Check className="h-4 w-4" aria-hidden="true" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-10 px-3"
              aria-label={t('actions.cancel')}
              data-testid="plan-rename-cancel"
              onClick={cancelInlineRename}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </form>
        ) : (
          <Select value={activePlan.id} onValueChange={requestSwitch}>
            <SelectTrigger
              size="sm"
              aria-label={t('switcher.ariaLabel')}
              data-testid="plan-switcher-select"
              className="h-10 w-full min-w-0 flex-1 text-xs"
            >
              <SelectValue placeholder={activeName}>{activeName}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {plans.map((plan) => {
                const rate = successRates[plan.id]
                const isActive = plan.id === activePlan.id
                return (
                  <SelectItem key={plan.id} value={plan.id}>
                    <span className="flex w-full min-w-[14rem] items-center justify-between gap-3">
                      <span className="flex flex-col text-left">
                        <span className="text-xs font-semibold  ">
                          {planDisplayName(plan, t)}
                        </span>
                        <span className="text-xs font-semibold   text-muted-foreground">
                          {/* A cached rate describes the *stored* plan, so it is
                              not shown while unsaved edits are on top of it. */}
                          {isActive && isDirty
                            ? t('dirty.badge')
                            : typeof rate === 'number'
                              ? t('switcher.successRate', { rate: formatRate(rate) })
                              : t('switcher.notSimulated')}
                        </span>
                      </span>
                      {isActive && (
                        <span className="rounded-sm border border-border bg-accent/10 px-1.5 py-0.5 text-xs font-semibold   text-accent">
                          {isDirty ? t('switcher.modified') : t('switcher.active')}
                        </span>
                      )}
                    </span>
                  </SelectItem>
                )
              })}
            </SelectContent>
          </Select>
        )}

        {/* Every action carries a visible label: four bare icons (pencil,
            copy, bin) made users guess, and a tooltip is invisible on touch.
            Two-up on phones, one row under the select from `sm` up. The plan-limit message is
            not a tooltip either: it is spelled out in the line below. */}
        <div className="grid grid-cols-2 items-center gap-1.5 sm:flex sm:flex-wrap">
          <Button
            variant="outline"
            size="sm"
            className="h-10 w-full px-3 sm:w-auto"
            disabled={atLimit}
            onClick={() => setNewOpen(true)}
            data-testid="plan-new"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="ml-1.5">{t('actions.new')}</span>
          </Button>
          <Button
            ref={renameButtonRef}
            variant="ghost"
            size="sm"
            className="h-10 w-full px-3 sm:w-auto"
            disabled={renaming}
            onClick={startInlineRename}
            data-testid="plan-rename"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
            <span className="ml-1.5">{t('actions.rename')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-full px-3 sm:w-auto"
            disabled={atLimit}
            onClick={() => setDuplicateTarget(activePlan)}
            data-testid="plan-duplicate"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
            <span className="ml-1.5">{t('actions.duplicate')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-full px-3 text-danger sm:w-auto"
            disabled={plans.length <= 1}
            onClick={() => setDeleteTarget(activePlan)}
            data-testid="plan-delete"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            <span className="ml-1.5">{t('actions.delete')}</span>
          </Button>
        </div>
      </div>

      {plans.length > 1 && (
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-xs font-semibold text-muted-foreground">
            {t('switcher.allPlans')}
          </span>
          <ul
            data-testid="plan-manager-list"
            className="flex flex-col divide-y divide-border rounded-sm border border-border bg-surface"
          >
            {plans.map((plan) => {
              const name = planDisplayName(plan, t)
              const isActive = plan.id === activePlan.id
              const rate = successRates[plan.id]
              const rateText =
                isActive && isDirty
                  ? t('dirty.badge')
                  : typeof rate === 'number'
                    ? t('switcher.successRate', { rate: formatRate(rate) })
                    : t('switcher.notSimulated')
              const isEditingThis = editingRowId === plan.id
              return (
                <li
                  key={plan.id}
                  data-testid={`plan-row-${plan.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
                >
                  {isEditingThis ? (
                    <form
                      className="flex w-full items-center gap-1.5"
                      data-testid={`plan-row-rename-form-${plan.id}`}
                      onSubmit={(event) => commitRowRename(plan, event)}
                      onKeyDown={(event) => {
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          event.stopPropagation()
                          event.nativeEvent.stopPropagation()
                          cancelRowRename()
                        }
                      }}
                    >
                      <Input
                        ref={rowRenameInputRef}
                        id={`plan-row-rename-input-${plan.id}`}
                        data-testid={`plan-row-rename-input-${plan.id}`}
                        value={rowRenameDraft}
                        maxLength={60}
                        aria-label={t('dialogs.rename.label')}
                        placeholder={t('dialogs.rename.placeholder')}
                        onChange={(event) => setRowRenameDraft(event.target.value)}
                        className="rounded-sm h-9 flex-1 border border-border bg-card px-2.5 text-xs font-semibold"
                      />
                      <Button
                        type="submit"
                        size="sm"
                        className="h-9 px-2.5"
                        disabled={!rowRenameDraft.trim()}
                        aria-label={t('actions.save')}
                        data-testid={`plan-row-rename-save-${plan.id}`}
                      >
                        <Check className="h-4 w-4" aria-hidden="true" />
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-9 px-2.5"
                        aria-label={t('actions.cancel')}
                        data-testid={`plan-row-rename-cancel-${plan.id}`}
                        onClick={cancelRowRename}
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </Button>
                    </form>
                  ) : (
                    <>
                      <div className="flex min-w-0 flex-1 flex-col">
                        <div className="flex items-center gap-2">
                          {isActive ? (
                            <span className="truncate text-xs font-semibold text-ink">{name}</span>
                          ) : (
                            <button
                              type="button"
                              className="truncate text-left text-xs font-semibold text-ink underline-offset-2 hover:text-accent hover:underline"
                              data-testid={`plan-row-select-${plan.id}`}
                              onClick={() => requestSwitch(plan.id)}
                            >
                              {name}
                            </button>
                          )}
                          {isActive && (
                            <span className="rounded-sm shrink-0 border border-border bg-accent/10 px-1.5 py-0.5 text-xs font-semibold text-accent">
                              {isDirty ? t('switcher.modified') : t('switcher.active')}
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">{rateText}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          aria-label={`${t('actions.rename')}: ${name}`}
                          title={t('actions.rename')}
                          data-testid={`plan-row-rename-${plan.id}`}
                          onClick={() => startRowRename(plan)}
                        >
                          <Pencil className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9"
                          disabled={atLimit}
                          aria-label={`${t('actions.duplicate')}: ${name}`}
                          title={t('actions.duplicate')}
                          data-testid={`plan-row-duplicate-${plan.id}`}
                          onClick={() => setDuplicateTarget(plan)}
                        >
                          <Copy className="h-4 w-4" aria-hidden="true" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-9 w-9 text-danger"
                          disabled={plans.length <= 1}
                          aria-label={`${t('actions.delete')}: ${name}`}
                          title={t('actions.delete')}
                          data-testid={`plan-row-delete-${plan.id}`}
                          onClick={() => setDeleteTarget(plan)}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    </>
                  )}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {isDirty && (
        <div
          data-testid="plan-dirty-actions"
          className="rounded-sm flex flex-col gap-2 border border-border bg-amber/15 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-xs font-semibold leading-relaxed text-ink">{t('dirty.hint')}</p>
          <div className="flex shrink-0 items-center gap-2">
            <Button
              size="sm"
              className="h-9"
              data-testid="plan-save-draft"
              aria-label={t('dirty.ariaSave', { name: activeName })}
              onClick={handleSave}
            >
              <Save className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t('actions.saveToPlan')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-9"
              data-testid="plan-revert-draft"
              aria-label={t('dirty.ariaRevert', { name: activeName })}
              onClick={handleRevert}
            >
              <RotateCcw className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" />
              {t('actions.revert')}
            </Button>
          </div>
        </div>
      )}

      {atLimit && (
        <p className="text-xs font-semibold   text-danger">
          {t('switcher.limit', { max: MAX_PLANS })}
        </p>
      )}

      <PlanNameDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        inputId="plan-new-name"
        title={t('dialogs.new.title')}
        description={t('dialogs.new.description')}
        label={t('dialogs.new.label')}
        placeholder={t('dialogs.new.placeholder')}
        confirmLabel={t('actions.create')}
        onConfirm={(name) => createPlan(name)}
      />

      {/* Duplicate asks for a name instead of inventing one: duplicating the
          active plan makes the copy active immediately; duplicating another
          row from the list creates it in the background without disturbing
          any unsaved draft. */}
      <PlanNameDialog
        open={duplicateTarget !== null}
        onOpenChange={(open) => !open && setDuplicateTarget(null)}
        inputId="plan-duplicate-name"
        initialName={duplicateSuggestion}
        title={t('dialogs.duplicate.title')}
        description={t('dialogs.duplicate.description', { name: duplicateTargetName })}
        label={t('dialogs.duplicate.label')}
        placeholder={t('dialogs.duplicate.placeholder')}
        confirmLabel={t('actions.confirmDuplicate')}
        onConfirm={(name) => {
          if (!duplicateTarget) return
          const created =
            duplicateTarget.id === activePlan.id
              ? duplicatePlan(activePlan.id, name)
              : createPlan(name, duplicateTarget.params, { activate: false })
          if (created) toast.success(t('duplicated.toast', { name }))
        }}
      />

      <PlanDeleteDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        planName={deleteTarget ? planDisplayName(deleteTarget, t) : activeName}
        onConfirm={() => {
          if (!deleteTarget) return
          if (editingRowId === deleteTarget.id) setEditingRowId(null)
          deletePlanWithUndo(deleteTarget, t)
        }}
      />

      {/* Switching plans with unsaved work asks first — the working copy is the
          only place those edits exist. */}
      <PlanSwitchGuard
        pendingPlanId={pendingPlanId}
        activeName={activeName}
        onDone={() => setPendingPlanId(null)}
      />
    </div>
  )
}
