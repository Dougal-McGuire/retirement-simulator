'use client'

import type { RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { PlanSwitcher } from '@/components/plans/PlanSwitcher'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * "Manage plans …": the one place for switching, creating, renaming,
 * duplicating and — only here — deleting plans. Opened from the plan menu;
 * closing it returns focus to the plan menu trigger.
 */
export function PlanManagerDialog({
  open,
  onOpenChange,
  returnFocusRef,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  returnFocusRef: RefObject<HTMLElement | null>
}) {
  const t = useTranslations('workspace.planManager')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[85vh] overflow-y-auto sm:max-w-2xl"
        data-testid="plan-manager"
        onOpenAutoFocus={(event) => {
          const root = event.currentTarget as HTMLElement
          const target = root.querySelector<HTMLElement>('[data-testid="plan-switcher-select"]')
          if (!target) return
          event.preventDefault()
          target.focus()
        }}
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef.current
          if (!target?.isConnected) return
          event.preventDefault()
          target.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {/* The dialog is the surface: the switcher drops its own card chrome. */}
        <PlanSwitcher className="border-0 bg-transparent p-0" />
      </DialogContent>
    </Dialog>
  )
}
