'use client'

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { createPortal } from 'react-dom'
import { HelpCircle } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

interface InfoTipProps {
  /** Tip body. Plain text or small inline markup. */
  content: ReactNode
  /**
   * What the tip explains, e.g. the field label. The trigger is named
   * "Help: {label}" so it never collides with the control it sits next to.
   */
  label: string
  /** Overrides the trigger's accessible name entirely. */
  ariaLabel?: string
  /**
   * When set, the content is also rendered visually hidden under this id so a
   * form control can keep pointing at it via `aria-describedby`. Screen readers
   * then hear the explanation with the field, sighted users get it on demand.
   */
  descriptionId?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  className?: string
  iconClassName?: string
}

const GAP = 8
const EDGE = 8
const HOVER_DELAY = 150
/** 20rem, the old tooltip's `max-w-xs`. */
const MAX_WIDTH = 320

interface Placement {
  top: number
  left: number
  arrowLeft: number
  side: 'top' | 'bottom'
  maxWidth: number
}

/**
 * The area a tip must stay inside: the viewport, narrowed to the dialog the
 * trigger sits in (the docked edit panel, the phone sheet) so a tip never
 * spills over the page behind it.
 */
function boundaryOf(trigger: HTMLElement): DOMRect {
  const viewport = new DOMRect(0, 0, window.innerWidth, window.innerHeight)
  const dialog = trigger.closest<HTMLElement>('[role="dialog"]')
  if (!dialog) return viewport
  const box = dialog.getBoundingClientRect()
  const left = Math.max(viewport.left, box.left)
  const top = Math.max(viewport.top, box.top)
  const right = Math.min(viewport.right, box.right)
  const bottom = Math.min(viewport.bottom, box.bottom)
  return new DOMRect(left, top, Math.max(0, right - left), Math.max(0, bottom - top))
}

/** Pure placement: above (or below when there is no room), clamped sideways. */
export function placeTip(
  trigger: { top: number; bottom: number; left: number; width: number },
  tip: { width: number; height: number },
  boundary: { top: number; bottom: number; left: number; right: number },
  preferred: 'top' | 'bottom'
): Placement {
  const maxWidth = Math.min(MAX_WIDTH, Math.max(120, boundary.right - boundary.left - 2 * EDGE))
  const width = Math.min(tip.width, maxWidth)
  const roomAbove = trigger.top - boundary.top - GAP - EDGE
  const roomBelow = boundary.bottom - trigger.bottom - GAP - EDGE
  const side =
    preferred === 'top'
      ? roomAbove >= tip.height || roomAbove >= roomBelow
        ? 'top'
        : 'bottom'
      : roomBelow >= tip.height || roomBelow >= roomAbove
        ? 'bottom'
        : 'top'
  const center = trigger.left + trigger.width / 2
  const minLeft = boundary.left + EDGE
  const maxLeft = Math.max(minLeft, boundary.right - EDGE - width)
  const left = Math.min(maxLeft, Math.max(minLeft, center - width / 2))
  const top = side === 'top' ? trigger.top - GAP - tip.height : trigger.bottom + GAP
  const arrowLeft = Math.min(width - 12, Math.max(12, center - left))
  return { top, left, arrowLeft, side, maxWidth }
}

/**
 * The one way explanatory copy is folded out of the way across the app: a
 * small ⓘ button next to a label or heading that shows the explanation.
 *
 * A tap or click toggles it — the owner's main device is an iPad, where a
 * hover tooltip never opened at all. With a mouse it also opens on hover,
 * and from the keyboard on focus. Escape and a tap anywhere else close it;
 * it holds no focusable content, so it never traps focus, and it stays inside
 * the viewport and inside the edit panel or sheet it was opened from.
 */
export function InfoTip({
  content,
  label,
  ariaLabel,
  descriptionId,
  side = 'top',
  className,
  iconClassName,
}: InfoTipProps) {
  const t = useTranslations('ui')
  const tipId = useId()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const pinned = useRef(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [placement, setPlacement] = useState<Placement | null>(null)
  const preferred = side === 'bottom' ? 'bottom' : 'top'

  const clearHover = () => {
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = null
  }
  const close = useCallback(() => {
    pinned.current = false
    setOpen(false)
  }, [])

  const reposition = useCallback(() => {
    const trigger = triggerRef.current
    const tip = tipRef.current
    if (!trigger || !tip) return
    const rect = trigger.getBoundingClientRect()
    const boundary = boundaryOf(trigger)
    // Narrow first, then measure: the height depends on the wrapped width.
    tip.style.maxWidth = `${Math.min(MAX_WIDTH, Math.max(120, boundary.width - 2 * EDGE))}px`
    setPlacement(
      placeTip(rect, { width: tip.offsetWidth, height: tip.offsetHeight }, boundary, preferred)
    )
  }, [preferred])

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null)
      return
    }
    reposition()
  }, [open, reposition])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node
      if (triggerRef.current?.contains(target) || tipRef.current?.contains(target)) return
      close()
    }
    // Window capture runs before the edit panel's own Escape handling, so
    // the first Escape closes only the tip.
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.stopPropagation()
      event.preventDefault()
      close()
    }
    const onMove = () => reposition()
    document.addEventListener('pointerdown', onPointerDown, true)
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  }, [open, close, reposition])

  useEffect(() => clearHover, [])

  const tipStyle: CSSProperties = placement
    ? { top: placement.top, left: placement.left, maxWidth: placement.maxWidth }
    : { top: 0, left: 0, maxWidth: MAX_WIDTH, visibility: 'hidden' }

  return (
    <>
      {descriptionId && (
        <span id={descriptionId} className="sr-only">
          {content}
        </span>
      )}
      <button
        ref={triggerRef}
        type="button"
        data-slot="info-tip"
        className={cn(
          'inline-flex shrink-0 cursor-help items-center rounded-full align-middle text-muted-foreground/70 transition-colors hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2',
          className
        )}
        aria-label={ariaLabel ?? t('fieldHelp', { label })}
        aria-expanded={open}
        aria-controls={open ? tipId : undefined}
        aria-describedby={open && !descriptionId ? tipId : undefined}
        onClick={() => {
          clearHover()
          // Open but only hovered/focused: a click keeps it. Pinned: closes.
          if (open && pinned.current) {
            close()
            return
          }
          pinned.current = true
          setOpen(true)
        }}
        onPointerEnter={(event) => {
          if (event.pointerType !== 'mouse') return
          clearHover()
          hoverTimer.current = setTimeout(() => setOpen(true), HOVER_DELAY)
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== 'mouse') return
          clearHover()
          if (!pinned.current && document.activeElement !== triggerRef.current) setOpen(false)
        }}
        onFocus={(event) => {
          // Keyboard focus only: a tap focuses too, and its click decides.
          if (event.currentTarget.matches(':focus-visible')) setOpen(true)
        }}
        onBlur={() => {
          clearHover()
          close()
        }}
      >
        <HelpCircle className={cn('h-3.5 w-3.5', iconClassName)} aria-hidden="true" />
      </button>
      {open &&
        createPortal(
          <div
            ref={tipRef}
            id={tipId}
            role="tooltip"
            data-slot="info-tip-content"
            data-side={placement?.side}
            className="info-tip-content fixed z-[99999] w-max rounded-sm border border-border bg-card px-3 py-2 text-ink shadow-sm"
            style={tipStyle}
          >
            <div className="text-xs font-medium normal-case leading-relaxed">{content}</div>
            {placement && (
              <span
                aria-hidden="true"
                className="info-tip-arrow"
                data-side={placement.side}
                style={{ left: placement.arrowLeft }}
              />
            )}
          </div>,
          document.body
        )}
    </>
  )
}
