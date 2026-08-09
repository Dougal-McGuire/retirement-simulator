'use client'

import { useEffect, useState } from 'react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

interface PlanNameDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  label: string
  placeholder: string
  confirmLabel: string
  /** Optional secondary action rendered next to cancel (used by the wizard). */
  secondaryLabel?: string
  onSecondary?: () => void
  initialName?: string
  inputId: string
  onConfirm: (name: string) => void
}

/** Shared name prompt for creating, renaming and saving plans. */
export function PlanNameDialog({
  open,
  onOpenChange,
  title,
  description,
  label,
  placeholder,
  confirmLabel,
  secondaryLabel,
  onSecondary,
  initialName = '',
  inputId,
  onConfirm,
}: PlanNameDialogProps) {
  const t = useTranslations('plans')
  const [name, setName] = useState(initialName)

  useEffect(() => {
    if (open) setName(initialName)
  }, [open, initialName])

  const confirm = () => {
    const trimmed = name.trim()
    if (!trimmed) return
    onConfirm(trimmed)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-neo-white sm:max-w-[30rem]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor={inputId} className="text-sm font-medium">
            {label}
          </Label>
          <Input
            id={inputId}
            autoFocus
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') confirm()
            }}
            placeholder={placeholder}
            className="mt-2 h-11 border-2 border-neo-black bg-neo-white px-3 py-2 text-[0.78rem] font-semibold"
          />
        </div>
        <DialogFooter className="sm:flex-wrap">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t('actions.cancel')}
          </Button>
          {secondaryLabel && onSecondary && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                onSecondary()
                onOpenChange(false)
              }}
            >
              {secondaryLabel}
            </Button>
          )}
          <Button size="sm" onClick={confirm} disabled={!name.trim()}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
