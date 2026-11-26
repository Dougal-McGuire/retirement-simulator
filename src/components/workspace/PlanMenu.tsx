'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react'
import {
  ArrowLeftRight,
  Check,
  ChevronDown,
  Copy,
  CopyPlus,
  FolderCog,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react'
import { useFormatter, useTranslations } from 'next-intl'
import { MAX_PLANS } from '@/types'
import { PlanDeleteDialog } from '@/components/plans/PlanDeleteDialog'
import { PlanNameDialog } from '@/components/plans/PlanNameDialog'
import { PlanSwitchGuard } from '@/components/plans/PlanSwitchGuard'
import { deletePlanWithUndo } from '@/components/plans/planDeleteUndo'
import { toast } from '@/components/ui/toast'
import { planDisplayName } from '@/lib/plans/planName'
import { suggestDuplicateName } from '@/lib/stores/plans'
import {
  useActivePlanId,
  useCreatePlan,
  useDuplicatePlan,
  usePlanIsDirty,
  usePlanSuccessRates,
  usePlans,
  useRenamePlan,
  useSetActivePlan,
} from '@/lib/stores/simulationStore'

const ITEM_SELECTOR = '[role="menuitem"], [role="menuitemradio"]'

/**
 * The header's plan picker: a menu listing every plan (name, last known
 * success rate, active and unsaved markers) plus the everyday plan actions.
 * Plan management used to sit behind Menu → "Plans and tools" → four
 * unlabelled icons; it now lives where the plan name is.
 *
 * Follows the WAI-ARIA menu-button pattern: arrow keys, Home/End, Escape
 * returns focus to the trigger, Tab or an outside click closes.
 */
export function PlanMenu({
  onManage,
  onCompare,
  onSaveAsNew,
}: {
  /** Opens the plan manager; receives the trigger so focus can come back to it. */
  onManage: (trigger: HTMLButtonElement | null) => void
  /**
   * Enters plan comparison. Receives the trigger: the menu item unmounts with
   * the menu, so the trigger is what focus returns to on exit.
   */
  onCompare?: (trigger: HTMLButtonElement | null) => void
  /**
   * Saves the unsaved changes as a new plan (offered only while dirty).
   * Receives the trigger, for the same reason as `onCompare`.
   */
  onSaveAsNew?: (trigger: HTMLButtonElement | null) => void
}) {
  const t = useTranslations('workspace.planMenu')
  const tp = useTranslations('plans')
  const format = useFormatter()
  const plans = usePlans()
  const activePlanId = useActivePlanId()
  const setActivePlan = useSetActivePlan()
  const createPlan = useCreatePlan()
  const duplicatePlan = useDuplicatePlan()
  const renamePlan = useRenamePlan()
  const dirty = usePlanIsDirty()
  const successRates = usePlanSuccessRates()

  const [open, setOpen] = useState(false)
  const [dialog, setDialog] = useState<'new' | 'duplicate' | 'delete' | null>(null)
  const [renaming, setRenaming] = useState(false)
  const [renameDraft, setRenameDraft] = useState('')
  const [pendingPlanId, setPendingPlanId] = useState<string | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const renameInputRef = useRef<HTMLInputElement>(null)
  const refocusTriggerRef = useRef(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const activePlan = plans.find((plan) => plan.id === activePlanId) ?? plans[0]
  const activeName = activePlan ? planDisplayName(activePlan, tp) : ''
  const atLimit = plans.length >= MAX_PLANS
  const canDelete = plans.length > 1

  const items = () =>
    Array.from(menuRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? [])

  const close = (refocus = true) => {
    setOpen(false)
    if (refocus) triggerRef.current?.focus()
  }

  const startInlineRename = useCallback(() => {
    setOpen(false)
    setRenameDraft(activeName)
    setRenaming(true)
  }, [activeName])

  const commitInlineRename = useCallback(
    (refocus = true) => {
      const trimmed = renameDraft.trim()
      if (activePlan && trimmed && trimmed !== activeName) {
        renamePlan(activePlan.id, trimmed)
      }
      refocusTriggerRef.current = refocus
      setRenaming(false)
    },
    [activePlan, activeName, renameDraft, renamePlan]
  )

  const cancelInlineRename = useCallback((refocus = true) => {
    refocusTriggerRef.current = refocus
    setRenaming(false)
  }, [])

  // Opening focuses the active plan, so Enter on the trigger then Enter again
  // is a no-op rather than an accidental switch.
  const [focusOnOpen, setFocusOnOpen] = useState<'active' | 'last'>('active')
  useEffect(() => {
    if (!open) return
    const list = items()
    const target =
      focusOnOpen === 'last'
        ? list[list.length - 1]
        : (menuRef.current?.querySelector<HTMLElement>('[aria-checked="true"]') ?? list[0])
    target?.focus()
  }, [open, focusOnOpen])

  // Entering inline rename focuses and selects the name; leaving returns focus
  // to the trigger when the user finished via keyboard or button.
  useEffect(() => {
    if (renaming) {
      const input = renameInputRef.current
      if (input) {
        input.focus()
        input.select()
      }
      return
    }
    if (refocusTriggerRef.current) {
      refocusTriggerRef.current = false
      triggerRef.current?.focus()
    }
  }, [renaming])

  // If the active plan changes (e.g. synced from another tab), close inline rename.
  useEffect(() => {
    setRenaming(false)
  }, [activePlanId])

  useEffect(() => {
    if (!open && !renaming) return
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      if (open) setOpen(false)
      if (renaming) commitInlineRename(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open, renaming, commitInlineRename])

  if (!activePlan) return null

  const openMenu = (focus: 'active' | 'last') => {
    setFocusOnOpen(focus)
    setOpen(true)
  }

  const onTriggerKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'F2') {
      event.preventDefault()
      startInlineRename()
      return
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      openMenu(event.key === 'ArrowUp' ? 'last' : 'active')
    }
  }

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = items()
    const index = list.indexOf(document.activeElement as HTMLElement)
    const move = (next: number) => {
      event.preventDefault()
      list[(next + list.length) % list.length]?.focus()
    }
    switch (event.key) {
      case 'ArrowDown':
        return move(index + 1)
      case 'ArrowUp':
        return move(index - 1)
      case 'Home':
        return move(0)
      case 'End':
        return move(list.length - 1)
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        return close()
      case 'Tab':
        return setOpen(false)
    }
  }

  const choosePlan = (id: string) => {
    close()
    if (id === activePlan.id) return
    if (dirty) setPendingPlanId(id)
    else setActivePlan(id)
  }

  const runAction = (
    action: 'saveAsNew' | 'new' | 'duplicate' | 'rename' | 'delete' | 'compare' | 'manage',
    disabled = false
  ) => {
    if (disabled) return
    if (action === 'rename') {
      startInlineRename()
      return
    }
    close()
    if (action === 'manage') onManage(triggerRef.current)
    else if (action === 'compare') onCompare?.(triggerRef.current)
    else if (action === 'saveAsNew') onSaveAsNew?.(triggerRef.current)
    else setDialog(action)
  }

  const handleRenameSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!renameDraft.trim()) return
    commitInlineRename(true)
  }

  const rateLabel = (id: string) => {
    if (id === activePlan.id && dirty) return tp('dirty.badge')
    const rate = successRates[id]
    return typeof rate === 'number'
      ? tp('switcher.successRate', {
          rate: format.number(rate / 100, { style: 'percent', maximumFractionDigits: 1 }),
        })
      : tp('switcher.notSimulated')
  }

  const duplicateSuggestion = suggestDuplicateName(
    activeName,
    plans.map((plan) => planDisplayName(plan, tp))
  )

  return (
    <div className="workspace-plan-menu-root" ref={rootRef}>
      {renaming ? (
        <form
          className="workspace-plan-inline-rename"
          data-testid="plan-inline-rename"
          onSubmit={handleRenameSubmit}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              event.nativeEvent.stopPropagation()
              cancelInlineRename(true)
            }
          }}
        >
          <input
            ref={renameInputRef}
            id="plan-menu-rename-name"
            data-testid="plan-inline-rename-input"
            type="text"
            className="workspace-plan-inline-input"
            value={renameDraft}
            maxLength={60}
            aria-label={tp('dialogs.rename.label')}
            placeholder={tp('dialogs.rename.placeholder')}
            onChange={(event) => setRenameDraft(event.target.value)}
          />
          <button
            type="submit"
            className="workspace-plan-inline-btn workspace-plan-inline-save"
            data-testid="plan-inline-rename-save"
            disabled={!renameDraft.trim()}
            aria-label={tp('actions.save')}
            title={tp('actions.save')}
          >
            <Check size={16} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="workspace-plan-inline-btn workspace-plan-inline-cancel"
            data-testid="plan-inline-rename-cancel"
            aria-label={tp('actions.cancel')}
            title={tp('actions.cancel')}
            onClick={() => cancelInlineRename(true)}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </form>
      ) : (
        <button
          ref={triggerRef}
          type="button"
          className="workspace-plan-trigger"
          data-testid="plan-menu-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-controls={open ? menuId : undefined}
          aria-label={
            dirty ? t('triggerDirty', { name: activeName }) : t('trigger', { name: activeName })
          }
          onClick={() => (open ? close(false) : openMenu('active'))}
          onKeyDown={onTriggerKeyDown}
        >
          <span className="workspace-plan-trigger-name">{activeName}</span>
          {dirty && <span className="workspace-dirty-dot" aria-hidden="true" />}
          <ChevronDown size={16} aria-hidden="true" />
        </button>
      )}

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          role="menu"
          aria-label={t('label')}
          className="workspace-plan-menu"
          data-testid="plan-menu"
          onKeyDown={onMenuKeyDown}
        >
          <div className="workspace-plan-menu-heading" aria-hidden="true">
            <span>{t('heading')}</span>
            <span>{tp('switcher.count', { count: plans.length, max: MAX_PLANS })}</span>
          </div>
          <div role="group" aria-label={t('heading')}>
            {plans.map((plan) => {
              const isActive = plan.id === activePlan.id
              return (
                <button
                  key={plan.id}
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  tabIndex={-1}
                  className="workspace-plan-option"
                  data-testid={`plan-menu-option-${plan.id}`}
                  onClick={() => choosePlan(plan.id)}
                >
                  <span className="workspace-plan-option-mark" aria-hidden="true">
                    {isActive && <Check size={16} />}
                  </span>
                  <span className="workspace-plan-option-text">
                    <span className="workspace-plan-option-name">{planDisplayName(plan, tp)}</span>
                    <span
                      className="workspace-plan-option-meta"
                      data-dirty={isActive && dirty ? 'true' : undefined}
                    >
                      {isActive && dirty && (
                        <span className="workspace-dirty-dot" aria-hidden="true" />
                      )}
                      {rateLabel(plan.id)}
                    </span>
                  </span>
                  {isActive && <span className="workspace-plan-option-badge">{t('active')}</span>}
                </button>
              )
            })}
          </div>
          <div role="separator" className="workspace-plan-menu-separator" />
          <div role="group" aria-label={t('actions')}>
            {(
              [
                // While there are unsaved changes, keeping them as a variant
                // comes first: it is what the dirty marker invites.
                ...(onSaveAsNew && dirty
                  ? ([
                      {
                        action: 'saveAsNew',
                        icon: CopyPlus,
                        label: t('saveAsNew'),
                        disabled: atLimit,
                      },
                    ] as const)
                  : []),
                { action: 'new', icon: Plus, label: tp('actions.new'), disabled: atLimit },
                {
                  action: 'duplicate',
                  icon: Copy,
                  label: tp('actions.duplicate'),
                  disabled: atLimit,
                  danger: false,
                },
                {
                  action: 'rename',
                  icon: Pencil,
                  label: tp('actions.rename'),
                  disabled: false,
                  danger: false,
                },
                {
                  action: 'delete',
                  icon: Trash2,
                  label: tp('actions.delete'),
                  disabled: !canDelete,
                  danger: true,
                },
                ...(onCompare
                  ? ([
                      {
                        action: 'compare',
                        icon: ArrowLeftRight,
                        label: t('compare'),
                        disabled: false,
                        danger: false,
                      },
                    ] as const)
                  : []),
                {
                  action: 'manage',
                  icon: FolderCog,
                  label: t('manage'),
                  disabled: false,
                  danger: false,
                },
              ] as const
            ).map(({ action, icon: Icon, label, disabled, ...rest }) => {
              const danger = 'danger' in rest && rest.danger
              return (
                <button
                  key={action}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  aria-disabled={disabled || undefined}
                  className={
                    danger
                      ? 'workspace-plan-action workspace-plan-action--danger'
                      : 'workspace-plan-action'
                  }
                  data-testid={`plan-menu-${action}`}
                  onClick={() => runAction(action, disabled)}
                >
                  <Icon size={16} aria-hidden="true" />
                  <span>{label}</span>
                  {action === 'rename' && (
                    <kbd className="workspace-kbd" aria-hidden="true">
                      F2
                    </kbd>
                  )}
                </button>
              )
            })}
          </div>
          {atLimit && (
            <p className="workspace-plan-menu-note">{tp('switcher.limit', { max: MAX_PLANS })}</p>
          )}
        </div>
      )}

      <PlanNameDialog
        open={dialog === 'new'}
        onOpenChange={(next) => !next && setDialog(null)}
        inputId="plan-menu-new-name"
        returnFocusRef={triggerRef}
        title={tp('dialogs.new.title')}
        description={tp('dialogs.new.description')}
        label={tp('dialogs.new.label')}
        placeholder={tp('dialogs.new.placeholder')}
        confirmLabel={tp('actions.create')}
        onConfirm={(name) => {
          if (createPlan(name)) toast.success(t('createdToast', { name }))
        }}
      />
      <PlanNameDialog
        open={dialog === 'duplicate'}
        onOpenChange={(next) => !next && setDialog(null)}
        inputId="plan-menu-duplicate-name"
        returnFocusRef={triggerRef}
        initialName={duplicateSuggestion}
        title={tp('dialogs.duplicate.title')}
        description={tp('dialogs.duplicate.description', { name: activeName })}
        label={tp('dialogs.duplicate.label')}
        placeholder={tp('dialogs.duplicate.placeholder')}
        confirmLabel={tp('actions.confirmDuplicate')}
        onConfirm={(name) => {
          if (duplicatePlan(activePlan.id, name)) toast.success(tp('duplicated.toast', { name }))
        }}
      />
      <PlanDeleteDialog
        open={dialog === 'delete'}
        onOpenChange={(next) => !next && setDialog(null)}
        planName={activeName}
        returnFocusRef={triggerRef}
        onConfirm={() => deletePlanWithUndo(activePlan, tp)}
      />
      <PlanSwitchGuard
        pendingPlanId={pendingPlanId}
        activeName={activeName}
        onDone={() => setPendingPlanId(null)}
        onCloseAutoFocus={(event) => {
          event.preventDefault()
          triggerRef.current?.focus()
        }}
      />
    </div>
  )
}
