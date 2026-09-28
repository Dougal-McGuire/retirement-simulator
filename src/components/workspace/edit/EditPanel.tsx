'use client'

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type RefObject,
} from 'react'
import * as DialogPrimitive from '@radix-ui/react-dialog'
import { useFormatter, useTranslations } from 'next-intl'
import { ChevronLeft, ChevronRight, LoaderCircle, X } from 'lucide-react'
import { adjacentPanels, assumptionPanel } from '@/components/plans/planSections'
import { useSimulationResults } from '@/lib/stores/simulationStore'
import { AnimatedNumber } from '../AnimatedNumber'
import { useRunStatus } from '../useRunStatus'
import { useSavedSuccessDelta } from '../useSavedSuccessDelta'
import { useWorkspaceUiStore } from '../useWorkspaceUiStore'
import { useWorkspace, useWorkspaceInternals, type EditorState } from '../WorkspaceProvider'
import { focusField } from './focusField'
import { PANEL_CONTENT } from './panelContent'

const TABBABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]'

/** The elements of `root` that Tab stops at, in DOM order. */
function tabbables(root: Element | null): HTMLElement[] {
  if (!root) return []
  return Array.from(root.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) =>
      el.tabIndex >= 0 &&
      el.getClientRects().length > 0 &&
      !el.closest('[inert]') &&
      window.getComputedStyle(el).visibility !== 'hidden'
  )
}

/**
 * Overlay mode (761–1279): the page behind the panel is inert, the result bar
 * is not (Save, Discard, plan menu and Menu stay usable). Tab therefore runs
 * one cycle through what is live — bar → panel → any toast → bar — instead of
 * Radix's loop inside the panel, which left the bar out of keyboard reach.
 * Only the moves across a zone edge are steered; inside a zone the browser's
 * own order holds (roving radio groups, sliders and all).
 */
function useOverlayTabCycle(active: boolean, panelRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Tab' || event.altKey || event.ctrlKey || event.metaKey) return
      const focused = document.activeElement
      if (!(focused instanceof HTMLElement)) return
      const zones = [
        document.querySelector('[data-testid="result-bar"]'),
        panelRef.current,
        document.querySelector('[data-rht-toaster]'),
      ]
        .map((zone) => tabbables(zone))
        .filter((list) => list.length > 0)
      const at = zones.findIndex((list) => list.includes(focused))
      if (at === -1) return
      const zone = zones[at]
      const edge = event.shiftKey ? zone[0] : zone[zone.length - 1]
      if (focused !== edge) return
      const next = zones[(at + (event.shiftKey ? zones.length - 1 : 1)) % zones.length]
      const target = event.shiftKey ? next[next.length - 1] : next[0]
      event.preventDefault()
      // Radix would loop focus back inside the panel.
      event.stopPropagation()
      target.focus()
    }
    // Capture on the document: ahead of Radix's own Tab handling.
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [active, panelRef])
}

function useRateText() {
  const format = useFormatter()
  const results = useSimulationResults()
  const formatRate = (value: number) =>
    format.number(value / 100, {
      style: 'percent',
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })
  const rate = results ? Math.round(results.successRate * 10) / 10 : null
  return {
    text: rate === null ? '—' : formatRate(rate),
    value: rate === null ? undefined : String(rate),
    rate,
    formatRate,
  }
}

/** Phones: the bar is behind the sheet, so the sheet carries the live result. */
function MiniResult() {
  const t = useTranslations('workspace.bar')
  const rate = useRateText()
  const delta = useSavedSuccessDelta()
  const { status } = useRunStatus()
  return (
    <div
      className="ws-panel-mini"
      data-testid="edit-panel-mini-result"
      data-value={rate.value}
      data-running={status === 'running' ? 'true' : undefined}
    >
      <span className="ws-panel-mini-label">{t('successShort')}</span>
      <span className="ws-panel-mini-rate">
        <AnimatedNumber value={rate.rate} format={rate.formatRate} />
      </span>
      {delta.text && (
        <span
          className={`ds-delta ds-delta--${delta.tone}`}
          data-pending={delta.pending ? 'true' : undefined}
        >
          {delta.text}
        </span>
      )}
      {status === 'running' && <LoaderCircle className="ws-spin" size={16} aria-hidden="true" />}
    </div>
  )
}

/**
 * Screen-reader users hear cause and effect: once per settled run (1 s after
 * the status returns to "updated") while the panel is open.
 */
function LiveAnnouncer() {
  const t = useTranslations('workspace.editPanel')
  const rate = useRateText()
  const delta = useSavedSuccessDelta()
  const { status } = useRunStatus()
  const [message, setMessage] = useState('')
  const wasRunning = useRef(false)
  const latest = useRef({ rate: rate.text, delta: delta.text })
  useEffect(() => {
    latest.current = { rate: rate.text, delta: delta.text }
  }, [rate.text, delta.text])

  useEffect(() => {
    if (status === 'running') {
      wasRunning.current = true
      return
    }
    if (status !== 'updated' || !wasRunning.current) return
    wasRunning.current = false
    const timer = setTimeout(() => {
      const { rate: rateText, delta: deltaText } = latest.current
      setMessage(
        deltaText
          ? `${t('liveResult', { rate: rateText })} (${t('liveDelta', { delta: deltaText })})`
          : t('liveResult', { rate: rateText })
      )
    }, 1000)
    return () => clearTimeout(timer)
  }, [status, t])

  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      {message}
    </p>
  )
}

/**
 * The assumption editor as a non-modal Radix dialog that leaves the results
 * visible: docked beside the page (≥1280), an overlay sheet under the result
 * bar (761–1279, page inert, bar live) or a bottom sheet on phones (with a
 * mini result). One panel at a time; previous/next walk the four panels.
 * Closing neither saves nor discards — the result bar does that.
 */
export function EditPanel() {
  const t = useTranslations('workspace.editPanel')
  const tGroups = useTranslations('planEditor.groups')
  const tSections = useTranslations('planEditor.sections')
  const { editor, panelMode, openEditor, closeEditor } = useWorkspace()
  const { invokerRef, focusRequest, suppressReturnFocusRef } = useWorkspaceInternals()
  const contentRef = useRef<HTMLDivElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)

  const open = editor !== null
  // The last panel keeps rendering while the close animation runs.
  const [shown, setShown] = useState<EditorState | null>(editor)
  if (editor && editor !== shown) setShown(editor)
  const openRef = useRef(open)
  const editorRef = useRef(editor)
  useEffect(() => {
    openRef.current = open
    editorRef.current = editor
  }, [open, editor])

  // Focus on every open request (and on a mode change, which remounts the
  // content): the requested field, else the title. Two frames first, so the
  // content has mounted and laid out; code-split bodies are waited for.
  const modeRef = useRef(panelMode)
  useEffect(() => {
    const modeChanged = modeRef.current !== panelMode
    modeRef.current = panelMode
    const current = editorRef.current
    if (!current) return
    const fieldId = modeChanged ? undefined : current.fieldId
    let cancelled = false
    let frame = 0
    const focusTitle = () => titleRef.current?.focus({ preventScroll: true })
    const started = performance.now()
    const attempt = () => {
      if (cancelled) return
      const body = bodyRef.current
      if (!body) return
      if (!fieldId) {
        body.scrollTop = 0
        focusTitle()
        return
      }
      if (focusField(fieldId, body)) return
      if (body.querySelector('[data-panel-loading]') && performance.now() - started < 3000) {
        frame = window.requestAnimationFrame(attempt)
        return
      }
      focusTitle()
    }
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(attempt)
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
    }
  }, [focusRequest, panelMode])

  const onCloseAutoFocus = (event: Event) => {
    event.preventDefault()
    // A mode change remounts the content while the panel stays open.
    if (openRef.current) return
    if (suppressReturnFocusRef.current) {
      suppressReturnFocusRef.current = false
      return
    }
    const invoker = invokerRef.current
    const target =
      invoker?.isConnected && !invoker.closest('[inert]')
        ? invoker
        : shown
          ? document.querySelector<HTMLElement>(`[data-edit-panel="${shown.panel}"]`)
          : null
    // Never let the focus return scroll the page while a jump is under way.
    target?.focus({ preventScroll: useWorkspaceUiStore.getState().programmaticScroll })
  }

  // Escape closes only from inside the panel (or with nothing focused), so it
  // never fights the plan menu or a focused chart.
  const onEscapeKeyDown = (event: KeyboardEvent) => {
    const active = document.activeElement
    const inside =
      !active || active === document.body || Boolean(contentRef.current?.contains(active))
    if (!inside) event.preventDefault()
  }

  useOverlayTabCycle(open && panelMode === 'overlay', contentRef)

  // Docked, the page stays usable: Tab past the last control leaves the panel
  // instead of looping back to its first (Radix loops focus by default).
  // Overlay mode steers Tab through the live bar instead (above); the phone
  // sheet keeps the loop, since everything behind it is inert.
  const onKeyDownCapture = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (panelMode !== 'docked' || event.key !== 'Tab') return
    if (event.altKey || event.ctrlKey || event.metaKey) return
    const list = tabbables(contentRef.current)
    const edge = event.shiftKey ? list[0] : list[list.length - 1]
    if (edge && document.activeElement === edge) event.stopPropagation()
  }

  if (!shown) return null
  const def = assumptionPanel(shown.panel)
  const title = tGroups(`${def.messageKey}.title`)
  const { previous, next } = adjacentPanels(shown.panel)
  const Content = PANEL_CONTENT[shown.panel]
  const panelTitle = (panel: typeof previous) =>
    panel ? tGroups(`${assumptionPanel(panel).messageKey}.title`) : ''

  return (
    <DialogPrimitive.Root
      open={open}
      modal={false}
      onOpenChange={(next) => {
        if (!next) closeEditor()
      }}
    >
      {panelMode !== 'docked' && open && (
        <div
          className="ws-panel-scrim"
          data-testid="edit-panel-scrim"
          data-mode={panelMode}
          aria-hidden="true"
          onClick={closeEditor}
        />
      )}
      <DialogPrimitive.Content
        key={panelMode}
        ref={contentRef}
        id="edit-panel"
        data-testid="edit-panel"
        data-mode={panelMode}
        data-panel={shown.panel}
        className="ws-panel"
        aria-modal={panelMode === 'sheet' ? true : undefined}
        onOpenAutoFocus={(event) => event.preventDefault()}
        onCloseAutoFocus={onCloseAutoFocus}
        onEscapeKeyDown={onEscapeKeyDown}
        onInteractOutside={(event) => event.preventDefault()}
        onFocusOutside={(event) => event.preventDefault()}
        onKeyDownCapture={onKeyDownCapture}
      >
        {/* A div, not <header>: beside the result bar's <header> it would be
            a second banner landmark. */}
        <div className="ws-panel-header">
          <div className="ws-panel-heading">
            <DialogPrimitive.Title asChild>
              <h2 ref={titleRef} tabIndex={-1} data-testid="edit-panel-title">
                {title}
              </h2>
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <button
                type="button"
                className="ws-panel-close"
                data-testid="edit-panel-close"
                aria-label={t('close')}
                title={t('close')}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </DialogPrimitive.Close>
          </div>
          <DialogPrimitive.Description className="ws-panel-description">
            {tGroups(`${def.messageKey}.description`)}
          </DialogPrimitive.Description>
          {panelMode === 'sheet' && <MiniResult />}
        </div>

        <div ref={bodyRef} className="ws-panel-body @container">
          <Content />
        </div>

        <footer className="ws-panel-footer">
          {/* The chevrons say "back" and "next"; the words stay in the
              accessible name ("Zurück: …" / "Weiter: …"), so the row fits
              one line beside Fertig. */}
          <nav className="ws-panel-walk" aria-label={t('navLabel')}>
            {previous && (
              <button
                type="button"
                className="workspace-button workspace-button-quiet"
                data-testid="edit-panel-previous"
                aria-label={tSections('previous', { title: panelTitle(previous) })}
                title={tSections('previous', { title: panelTitle(previous) })}
                onClick={() => openEditor({ panel: previous }, null)}
              >
                <ChevronLeft size={16} aria-hidden="true" />
                <span>{panelTitle(previous)}</span>
              </button>
            )}
            {next && (
              <button
                type="button"
                className="workspace-button workspace-button-quiet"
                data-testid="edit-panel-next"
                aria-label={tSections('next', { title: panelTitle(next) })}
                title={tSections('next', { title: panelTitle(next) })}
                onClick={() => openEditor({ panel: next }, null)}
              >
                <span>{panelTitle(next)}</span>
                <ChevronRight size={16} aria-hidden="true" />
              </button>
            )}
          </nav>
          <button
            type="button"
            className="workspace-button workspace-button-primary"
            data-testid="edit-panel-done"
            onClick={closeEditor}
          >
            {t('done')}
          </button>
        </footer>
        <LiveAnnouncer />
      </DialogPrimitive.Content>
    </DialogPrimitive.Root>
  )
}
