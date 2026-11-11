'use client'

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react'
import { cn } from '@/lib/utils'

export interface PopoverTriggerProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  ref: RefObject<HTMLButtonElement | null>
}

interface PopoverProps {
  /** Renders the button; spread `props` onto it (ref, aria, onClick, onKeyDown). */
  trigger: (props: PopoverTriggerProps, open: boolean) => ReactNode
  /** The floating content; `close` returns focus to the trigger. */
  children: (close: () => void) => ReactNode
  /** Accessible name of the floating panel. */
  label: string
  /**
   * `menu`: a list of `role="menuitem"` buttons (arrow keys move between
   * them, the first takes focus on opening). `dialog`: free content.
   */
  kind?: 'menu' | 'dialog'
  /** Which edge of the trigger the panel lines up with. */
  align?: 'start' | 'end'
  className?: string
  testId?: string
}

// `aria-disabled` items stay reachable: they carry the hint that says why
// they do nothing.
const ITEMS = '[role="menuitem"]'

/**
 * A small anchored popover for the workspace chrome: the chart's options, the
 * "Speichern ▾" menu, the dock's list of changes. Opens under its trigger;
 * Escape or a choice returns focus to the trigger, a click or focus outside
 * closes it. Not modal — nothing behind it goes inert.
 */
export function Popover({
  trigger,
  children,
  label,
  kind = 'dialog',
  align = 'end',
  className,
  testId,
}: PopoverProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const panelId = useId()

  const close = useCallback(() => {
    setOpen(false)
    triggerRef.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onFocusIn = (event: FocusEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('focusin', onFocusIn)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('focusin', onFocusIn)
    }
  }, [open])

  // A menu hands focus to its first item; a dialog keeps it on the trigger
  // (Tab then walks into the content, which follows it in the DOM).
  useEffect(() => {
    if (!open || kind !== 'menu') return
    panelRef.current?.querySelector<HTMLElement>(ITEMS)?.focus({ preventScroll: true })
  }, [open, kind])

  const onPanelKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
      return
    }
    if (kind !== 'menu') return
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(ITEMS) ?? [])
    if (items.length === 0) return
    const at = items.indexOf(document.activeElement as HTMLElement)
    const move = (index: number) => {
      event.preventDefault()
      items[(index + items.length) % items.length].focus()
    }
    if (event.key === 'ArrowDown') move(at + 1)
    else if (event.key === 'ArrowUp') move(at - 1)
    else if (event.key === 'Home') move(0)
    else if (event.key === 'End') move(items.length - 1)
    else if (event.key === 'Tab') setOpen(false)
  }

  return (
    <div className={cn('ws-popover', className)} ref={rootRef} data-open={open || undefined}>
      {trigger(
        {
          ref: triggerRef,
          type: 'button',
          'aria-haspopup': kind,
          'aria-expanded': open,
          'aria-controls': open ? panelId : undefined,
          onClick: () => setOpen((value) => !value),
          onKeyDown: (event) => {
            if (event.key === 'Escape' && open) {
              event.stopPropagation()
              close()
            } else if (kind === 'menu' && event.key === 'ArrowDown' && !open) {
              event.preventDefault()
              setOpen(true)
            }
          },
        },
        open
      )}
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role={kind}
          aria-label={label}
          className="ws-popover-panel"
          data-align={align}
          data-testid={testId}
          onKeyDown={onPanelKeyDown}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}
