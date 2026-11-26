'use client'

import { useLayoutEffect, useRef, type RefObject } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface PlanDeleteDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  planName: string
  onConfirm: () => void
  returnFocusRef?: RefObject<HTMLElement | null>
}

/** Shared delete confirmation dialog used by both the header plan menu and the plan manager. */
export function PlanDeleteDialog({
  open,
  onOpenChange,
  planName,
  onConfirm,
  returnFocusRef,
}: PlanDeleteDialogProps) {
  const t = useTranslations('plans')
  const openedFrom = useRef<HTMLElement | null>(null)

  useLayoutEffect(() => {
    if (!open) return
    const active = document.activeElement
    openedFrom.current = active instanceof HTMLElement && active !== document.body ? active : null
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="bg-card sm:max-w-[28rem]"
        onCloseAutoFocus={(event) => {
          const target = returnFocusRef?.current ?? openedFrom.current
          if (!target?.isConnected) return
          event.preventDefault()
          target.focus()
        }}
      >
        <DialogHeader>
          <DialogTitle>{t('dialogs.delete.title')}</DialogTitle>
          <DialogDescription>
            {t('dialogs.delete.description', { name: planName })}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          <Button
            variant="destructive"
            size="sm"
            data-testid="plan-delete-confirm"
            onClick={() => {
              onConfirm()
              onOpenChange(false)
            }}
          >
            {t('actions.confirmDelete')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
