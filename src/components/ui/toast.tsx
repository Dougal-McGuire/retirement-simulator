'use client'

import {
  useCallback,
  useEffect,
  useRef,
  type CSSProperties,
  type FocusEvent,
  type ReactNode,
} from 'react'
import { ToastBar, resolveValue, useToaster, type ToastOptions } from 'react-hot-toast'
import { pruneUndos, runLatestUndo } from './undoRegistry'

/**
 * App-wide toast overlay.
 *
 * Toasts used to land top-right, where the simulation page keeps its sticky
 * chrome and its tab strip: an "undo" card would sit *inside* the reading flow,
 * covering the comparison chart on desktop and reading as a page section on a
 * 390px screen. Bottom-right (bottom-centre on mobile) is out of the way of
 * everything the user is looking at, and above every other layer.
 *
 * A timed toast's dismissal pauses while the pointer is over the stack *or
 * focus is inside it* (keyboard users reach it with Tab). Action toasts — an
 * Undo, "switch to it" — never time out at all (`showActionToast`): they stay
 * until acted on or closed, and the latest Undo also answers Ctrl/Cmd+Z.
 * Motion follows `prefers-reduced-motion` (react-hot-toast's ToastBar then
 * fades without the slide, and the stack does not glide).
 */

/** Default life of a timed toast, in ms. */
export const TOAST_DURATION = 8000

const TOAST_OPTIONS: ToastOptions & {
  success: ToastOptions
  error: ToastOptions
  loading: ToastOptions
} = {
  duration: TOAST_DURATION,
  className: 'max-w-[calc(100vw-1.5rem)] sm:max-w-[24rem]',
  // Design-system surface (1px line, 4px radius) rather than the old 3px ink
  // frame, which read as a glaring outline in the dark scheme.
  style: {
    background: 'var(--surface-raised)',
    color: 'var(--ui-text)',
    border: '1px solid var(--line-strong)',
    borderRadius: 'var(--ui-radius)',
    padding: '12px 16px',
    fontSize: '14px',
    boxShadow: 'var(--shadow-lg)',
    maxWidth: 'none',
  },
  success: {
    duration: 4000,
    iconTheme: { primary: 'var(--ok)', secondary: 'var(--white)' },
  },
  error: {
    iconTheme: { primary: 'var(--danger)', secondary: 'var(--white)' },
    duration: 6000,
  },
  loading: {
    iconTheme: { primary: 'var(--accent)', secondary: 'var(--white)' },
  },
}

const GUTTER = 12

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/** Text fields keep the browser's own undo. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  if (target.isContentEditable) return true
  if (target instanceof HTMLTextAreaElement) return true
  if (target instanceof HTMLInputElement) {
    return !['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color'].includes(
      target.type
    )
  }
  return false
}

export function ToastProvider() {
  const { toasts, handlers } = useToaster(TOAST_OPTIONS)
  const { startPause, endPause, calculateOffset, updateHeight } = handlers
  const hovered = useRef(false)
  const focused = useRef(false)
  const sync = useCallback(() => {
    if (hovered.current || focused.current) startPause()
    else endPause()
  }, [startPause, endPause])

  // A toast dismissed from elsewhere (a plan switch) takes its Undo with it.
  useEffect(() => {
    pruneUndos(new Set(toasts.filter((item) => item.visible).map((item) => item.id)))
  }, [toasts])

  // Ctrl/Cmd+Z runs the most recent toast's Undo (outside text fields).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'z' || !(event.ctrlKey || event.metaKey)) return
      if (event.altKey || event.shiftKey || event.defaultPrevented) return
      if (isTextEntry(event.target)) return
      if (runLatestUndo()) event.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const reduced = prefersReducedMotion()
  return (
    <div
      data-rht-toaster=""
      // `--toast-bottom` / `--toast-right` let a page with chrome at an edge
      // (the phone tab bar, an open edit panel) keep toasts clear of it.
      className="!right-[var(--toast-right,1rem)] !bottom-[var(--toast-bottom,max(1rem,env(safe-area-inset-bottom)))] max-sm:!left-2 max-sm:!right-2"
      style={{
        position: 'fixed',
        // Above dialogs, selects and tooltips (which sit at 99999): a toast the
        // user cannot see is a toast that never happened.
        zIndex: 100000,
        inset: '1rem',
        pointerEvents: 'none',
      }}
      onMouseEnter={() => {
        hovered.current = true
        sync()
      }}
      onMouseLeave={() => {
        hovered.current = false
        sync()
      }}
      onFocus={() => {
        focused.current = true
        sync()
      }}
      onBlur={(event: FocusEvent<HTMLDivElement>) => {
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
        focused.current = false
        sync()
      }}
    >
      {toasts.map((item) => {
        const offset = calculateOffset(item, { reverseOrder: false, gutter: GUTTER })
        const style: CSSProperties = {
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          display: 'flex',
          justifyContent: 'flex-end',
          transform: `translateY(${-offset}px)`,
          transition: reduced ? undefined : 'transform 230ms cubic-bezier(.21,1.02,.73,1)',
          zIndex: item.visible ? 9999 : undefined,
        }
        return (
          <ToastSlot key={item.id} id={item.id} style={style} onHeight={updateHeight}>
            {item.type === 'custom' ? (
              resolveValue(item.message, item)
            ) : (
              <ToastBar toast={item} position="bottom-right" />
            )}
          </ToastSlot>
        )
      })}
    </div>
  )
}

/** One toast's positioned slot; reports its height to the stack. */
function ToastSlot({
  id,
  style,
  onHeight,
  children,
}: {
  id: string
  style: CSSProperties
  onHeight: (id: string, height: number) => void
  children: ReactNode
}) {
  // Stable per toast: an inline ref would re-measure (and re-render) forever.
  const ref = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return
      const measure = () => onHeight(id, element.getBoundingClientRect().height)
      measure()
      const observer = new MutationObserver(measure)
      observer.observe(element, { subtree: true, childList: true, characterData: true })
      return () => observer.disconnect()
    },
    [id, onHeight]
  )
  return (
    <div ref={ref} className="[&>*]:pointer-events-auto" style={style}>
      {children}
    </div>
  )
}

export { toast } from 'react-hot-toast'
