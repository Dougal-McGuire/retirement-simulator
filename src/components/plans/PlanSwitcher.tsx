'use client'

import { useMemo, useState } from 'react'
import { Copy, FolderOpen, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { MAX_PLANS } from '@/types'
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
import {
  useActivePlanId,
  useCreatePlan,
  useDeletePlan,
  useDuplicatePlan,
  usePlans,
  useRenamePlan,
  useSetActivePlan,
} from '@/lib/stores/simulationStore'
import { cn } from '@/lib/utils'

interface PlanSwitcherProps {
  className?: string
}

/**
 * Switch between plans and manage them (create / rename / duplicate / delete).
 * Lives on the simulation dashboard, above the parameter controls.
 */
export function PlanSwitcher({ className }: PlanSwitcherProps) {
  const t = useTranslations('plans')
  const plans = usePlans()
  const activePlanId = useActivePlanId()
  const setActivePlan = useSetActivePlan()
  const createPlan = useCreatePlan()
  const renamePlan = useRenamePlan()
  const duplicatePlan = useDuplicatePlan()
  const deletePlan = useDeletePlan()

  const [newOpen, setNewOpen] = useState(false)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === activePlanId) ?? plans[0],
    [plans, activePlanId]
  )

  if (!activePlan) return null

  const activeName = planDisplayName(activePlan, t)
  const atLimit = plans.length >= MAX_PLANS

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
        <span className="text-[0.6rem] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          {t('switcher.count', { count: plans.length, max: MAX_PLANS })}
        </span>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Select value={activePlan.id} onValueChange={(value) => setActivePlan(value)}>
          <SelectTrigger
            size="sm"
            aria-label={t('switcher.ariaLabel')}
            data-testid="plan-switcher-select"
            className="h-10 w-full min-w-0 flex-1 text-[0.72rem]"
          >
            <SelectValue placeholder={activeName}>{activeName}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {plans.map((plan) => (
              <SelectItem key={plan.id} value={plan.id}>
                {planDisplayName(plan, t)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-10 px-3"
            disabled={atLimit}
            title={atLimit ? t('switcher.limit', { max: MAX_PLANS }) : t('actions.new')}
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
            className="h-10 w-10 px-0"
            aria-label={t('actions.rename')}
            title={t('actions.rename')}
            onClick={() => setRenameOpen(true)}
            data-testid="plan-rename"
          >
            <Pencil className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 px-0"
            aria-label={t('actions.duplicate')}
            title={atLimit ? t('switcher.limit', { max: MAX_PLANS }) : t('actions.duplicate')}
            disabled={atLimit}
            onClick={() =>
              duplicatePlan(activePlan.id, `${activeName} (${t('copySuffix')})`)
            }
            data-testid="plan-duplicate"
          >
            <Copy className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-10 w-10 px-0 text-neo-red"
            aria-label={t('actions.delete')}
            title={t('actions.delete')}
            disabled={plans.length <= 1}
            onClick={() => setDeleteOpen(true)}
            data-testid="plan-delete"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

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
              onClick={() => {
                deletePlan(activePlan.id)
                setDeleteOpen(false)
              }}
            >
              {t('actions.confirmDelete')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
