'use client'

import { useMemo, useState } from 'react'
import { Check, Copy, FolderOpen, Pencil, Plus, RotateCcw, Save, Trash2 } from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { MAX_PLANS, type Plan, type SimulationParams } from '@/types'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { PlanNameDialog } from '@/components/plans/PlanNameDialog'
import { planDisplayName } from '@/lib/plans/planName'
import { suggestDuplicateName } from '@/lib/stores/plans'
import { toast, TOAST_DURATION } from '@/components/ui/toast'
import { ActionToast } from '@/components/ui/action-toast'
import {
  useActivePlanId,
  useCreatePlan,
  useDeletePlan,
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
  const deletePlan = useDeletePlan()
  const isDirty = usePlanIsDirty()
  const savePlanDraft = useSavePlanDraft()
  const revertPlanDraft = useRevertPlanDraft()
  const successRates = usePlanSuccessRates()

  const [newOpen, setNewOpen] = useState(false)
  const [duplicateOpen, setDuplicateOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)

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
  const pendingPlan = pendingPlanId ? plans.find((plan) => plan.id === pendingPlanId) : undefined
  // Prefilled into the duplicate dialog, so the copy is named before it exists
  // rather than inheriting a "(copy)" that later shows up in a PDF.
  const duplicateSuggestion = suggestDuplicateName(
    activeName,
    plans.map((plan) => planDisplayName(plan, t))
  )

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

  const restorePlan = (name: string, params: SimulationParams) => {
    const restoredId = createPlan(name, params)
    if (restoredId) toast.success(t('deleted.restored', { name }))
    else toast.error(t('deleted.restoreFailed'))
  }

  const handleDelete = (plan: Plan) => {
    const name = planDisplayName(plan, t)
    const params = plan.params
    deletePlan(plan.id)
    setDeleteOpen(false)
    toast(
      (instance) => (
        <ActionToast
          testId="plan-deleted-toast"
          message={t('deleted.toast', { name })}
          actions={[
            {
              label: t('actions.undo'),
              tone: 'primary',
              testId: 'plan-deleted-toast-undo',
              onClick: () => {
                toast.dismiss(instance.id)
                restorePlan(name, params)
              },
            },
          ]}
        />
      ),
      { duration: TOAST_DURATION }
    )
  }

  return (
    <div
      data-testid="plan-switcher"
      className={cn(
        'theme-plan-switcher flex flex-col gap-3 border-3 border-neo-black bg-neo-white px-4 py-3 shadow-neo-sm',
        className
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[0.62rem] font-extrabold uppercase tracking-[0.24em] text-muted-foreground">
          <FolderOpen className="h-3.5 w-3.5 text-neo-blue" aria-hidden="true" />
          {t('label')}
        </span>
        <div className="flex items-center gap-2">
          <span
            data-testid="plan-dirty-badge"
            className={cn(
              'inline-flex items-center gap-1.5 border-2 px-2 py-0.5 text-[0.58rem] font-extrabold uppercase tracking-[0.14em]',
              isDirty
                ? 'border-neo-black bg-neo-yellow text-neo-black'
                : 'border-neo-black/30 bg-transparent text-muted-foreground'
            )}
          >
            {isDirty ? (
              <span aria-hidden="true" className="h-2 w-2 bg-neo-black" />
            ) : (
              <Check className="h-3 w-3" aria-hidden="true" />
            )}
            {isDirty ? t('dirty.badge') : t('dirty.clean')}
          </span>
          <span className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            {t('switcher.count', { count: plans.length, max: MAX_PLANS })}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={activePlan.id} onValueChange={requestSwitch}>
          <SelectTrigger
            size="sm"
            aria-label={t('switcher.ariaLabel')}
            data-testid="plan-switcher-select"
            className="h-10 w-full min-w-0 flex-1 text-[0.72rem]"
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
                      <span className="text-[0.7rem] font-extrabold uppercase tracking-[0.12em]">
                        {planDisplayName(plan, t)}
                      </span>
                      <span className="text-[0.58rem] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
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
                      <span className="border-2 border-neo-black bg-neo-blue/10 px-1.5 py-0.5 text-[0.55rem] font-extrabold uppercase tracking-[0.12em] text-neo-blue">
                        {isDirty ? t('switcher.modified') : t('switcher.active')}
                      </span>
                    )}
                  </span>
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>

        {/* Mobile has no room for the select and the actions on one line, so
            the actions become a full-width four-up toolbar instead of a short
            orphaned row of icons hanging under the left edge of the select. */}
        {/* Naming rule for this toolbar: exactly *one* source per button.
            `title` and `aria-label` carrying the same string made a screen
            reader read the button as its own description — "New plan, New
            plan". The labelled button drops `title`; the icon-only buttons keep
            `title` (it is both the tooltip and the accessible name) and drop
            `aria-label`. The plan-limit message is not a tooltip either: it is
            already spelled out in the visible line below this row. */}
        <div className="grid shrink-0 grid-cols-4 items-center gap-1.5 sm:flex">
          <Button
            variant="outline"
            size="sm"
            className="h-10 w-full px-0 sm:w-auto sm:px-3"
            disabled={atLimit}
            onClick={() => setNewOpen(true)}
            data-testid="plan-new"
          >
            <Plus className="h-4 w-4" aria-hidden="true" />
            <span className="ml-1.5 hidden sm:inline">{t('actions.new')}</span>
            <span className="sr-only sm:hidden">{t('actions.new')}</span>
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-full px-0 sm:w-10"
            title={t('actions.rename')}
            onClick={() => setRenameOpen(true)}
            data-testid="plan-rename"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-full px-0 sm:w-10"
            title={t('actions.duplicate')}
            disabled={atLimit}
            onClick={() => setDuplicateOpen(true)}
            data-testid="plan-duplicate"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-full px-0 text-neo-red sm:w-10"
            title={t('actions.delete')}
            disabled={plans.length <= 1}
            onClick={() => setDeleteOpen(true)}
            data-testid="plan-delete"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {isDirty && (
        <div
          data-testid="plan-dirty-actions"
          className="flex flex-col gap-2 border-2 border-neo-black bg-neo-yellow/20 px-3 py-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <p className="text-[0.62rem] font-semibold leading-relaxed text-neo-black">
            {t('dirty.hint')}
          </p>
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
        <p className="text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-neo-red">
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

      {/* Duplicate asks for a name instead of inventing one: the copy becomes
          the active plan immediately, and its name is what comparison legends
          and the exported PDF will show. */}
      <PlanNameDialog
        open={duplicateOpen}
        onOpenChange={setDuplicateOpen}
        inputId="plan-duplicate-name"
        initialName={duplicateSuggestion}
        title={t('dialogs.duplicate.title')}
        description={t('dialogs.duplicate.description', { name: activeName })}
        label={t('dialogs.duplicate.label')}
        placeholder={t('dialogs.duplicate.placeholder')}
        confirmLabel={t('actions.confirmDuplicate')}
        onConfirm={(name) => {
          duplicatePlan(activePlan.id, name)
          toast.success(t('duplicated.toast', { name }))
        }}
      />

      <PlanNameDialog
        open={renameOpen}
        onOpenChange={setRenameOpen}
        inputId="plan-rename-name"
        initialName={activeName}
        title={t('dialogs.rename.title')}
        description={t('dialogs.rename.description')}
        label={t('dialogs.rename.label')}
        placeholder={t('dialogs.rename.placeholder')}
        confirmLabel={t('actions.save')}
        onConfirm={(name) => renamePlan(activePlan.id, name)}
      />

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-neo-white sm:max-w-[28rem]">
          <DialogHeader>
            <DialogTitle>{t('dialogs.delete.title')}</DialogTitle>
            <DialogDescription>
              {t('dialogs.delete.description', { name: activeName })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setDeleteOpen(false)}>
              {t('actions.cancel')}
            </Button>
            <Button
              variant="destructive"
              size="sm"
              data-testid="plan-delete-confirm"
              onClick={() => handleDelete(activePlan)}
            >
              {t('actions.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Switching plans with unsaved work asks first — the working copy is the
          only place those edits exist. */}
      <Dialog
        open={pendingPlanId !== null}
        onOpenChange={(open) => !open && setPendingPlanId(null)}
      >
        <DialogContent className="bg-neo-white sm:max-w-[30rem]" data-testid="plan-switch-guard">
          <DialogHeader>
            <DialogTitle>{t('switchGuard.title', { name: activeName })}</DialogTitle>
            <DialogDescription>
              {t('switchGuard.description', {
                name: activeName,
                target: pendingPlan ? planDisplayName(pendingPlan, t) : '',
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="sm:flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setPendingPlanId(null)}>
              {t('switchGuard.cancel')}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              data-testid="plan-switch-discard"
              onClick={() => {
                const target = pendingPlanId
                setPendingPlanId(null)
                if (target) setActivePlan(target)
              }}
            >
              {t('switchGuard.discard')}
            </Button>
            <Button
              size="sm"
              data-testid="plan-switch-save"
              onClick={() => {
                const target = pendingPlanId
                savePlanDraft()
                toast.success(t('dirty.savedToast', { name: activeName }))
                setPendingPlanId(null)
                if (target) setActivePlan(target)
              }}
            >
              {t('switchGuard.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
