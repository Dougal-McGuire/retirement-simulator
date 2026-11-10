'use client'

import { memo, useEffect, useMemo, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowRight, ChevronDown, ChevronsLeft, ChevronsRight } from 'lucide-react'
import { COLUMN_GROUPS, type ColumnGroup } from '@/components/plans/planSections'
import { SectionBoundary } from '@/components/errors/SectionBoundary'
import { changedGroups } from '@/lib/simulation/draftChanges'
import { Link } from '@/navigation'
import { useDraftChanges } from '../useDraftChanges'
import { useColumnOpen, useOpenGroups } from '../useWorkspaceUiStore'
import { useWorkspace, useWorkspaceInternals } from '../WorkspaceProvider'
import { focusField } from './focusField'
import { PANEL_CONTENT } from './panelContent'
import { ResetToDefaults } from './ResetToDefaults'
import { useGroupSummaries } from './useGroupSummaries'

interface GroupProps {
  group: ColumnGroup
  title: string
  summary: string
  open: boolean
  changed: boolean
  changedLabel: string
  onToggle: (group: ColumnGroup) => void
}

/**
 * One group of the column: a 56 px header that is a button (chevron, title,
 * a dot while the group holds unsaved changes, the group's key figure) and,
 * while open, the body with the group's inputs. The header sticks to the top
 * of the column while its group scrolls. A closed group does not mount its
 * body; the (empty) region stays, so `aria-controls` always resolves.
 */
const ColumnGroupSection = memo(function ColumnGroupSection({
  group,
  title,
  summary,
  open,
  changed,
  changedLabel,
  onToggle,
}: GroupProps) {
  const Content = PANEL_CONTENT[group]
  const headerId = `edit-${group}-header`
  const bodyId = `edit-${group}-body`
  return (
    <section className="ws-group" data-group={group} data-open={open ? 'true' : undefined}>
      <h3 className="ws-group-heading">
        <button
          type="button"
          id={headerId}
          className="ws-group-header"
          data-testid={`edit-${group}`}
          data-edit-panel={group}
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => onToggle(group)}
        >
          <ChevronDown className="ws-group-chevron" size={16} aria-hidden="true" />
          <span className="ws-group-title">{title}</span>
          {changed && (
            <span className="ws-group-dot" data-testid={`edit-${group}-changed`}>
              <span className="sr-only">{changedLabel}</span>
            </span>
          )}
          <span className="ws-group-summary" data-testid={`assumption-card-${group}`}>
            {summary}
          </span>
        </button>
      </h3>
      <div
        id={bodyId}
        className="ws-group-body"
        role="region"
        aria-labelledby={headerId}
        hidden={!open}
      >
        {/* A body that fails (or whose chunk does not arrive) keeps the
            column and the other groups usable. */}
        {open && (
          <SectionBoundary name={`panel-${group}`}>
            <Content />
          </SectionBoundary>
        )}
      </div>
    </section>
  )
})

/** The five groups; re-renders with every edit (summaries, dots), the frame around it does not. */
function ColumnGroups() {
  const t = useTranslations('workspace.column')
  const { toggleGroup } = useWorkspace()
  const openGroups = useOpenGroups()
  const summaries = useGroupSummaries()
  const changes = useDraftChanges()
  const changed = useMemo(() => changedGroups(changes), [changes])
  return (
    <>
      {COLUMN_GROUPS.map(({ id, titleKey }) => (
        <ColumnGroupSection
          key={id}
          group={id}
          title={t(`groups.${titleKey}`)}
          summary={summaries[id]}
          open={openGroups.includes(id)}
          changed={changed.has(id)}
          changedLabel={t('changed')}
          onToggle={toggleGroup}
        />
      ))}
    </>
  )
}

/**
 * The control column: every input of the plan exactly once, in five groups,
 * beside the result it changes. A permanent pane from 1180 px (sticky under
 * the bar, its own scroll); a drawer over the right side of the canvas at
 * 761–1179 (below the dock, no scrim, folds to a 48 px rail); the page's
 * second mode "Stellen" on phones. It never covers the dock.
 *
 * Several groups can be open; a deep link or an edit affordance elsewhere
 * (`openEditor`) opens the group it names, scrolls the column to the field
 * and flashes it. Nothing here saves or discards — the bar does that.
 */
export function EditPanel() {
  const t = useTranslations('workspace.column')
  const tw = useTranslations('workspace')
  const { panelMode, setColumnOpen, closeEditor } = useWorkspace()
  const { focusRequest, forgetInvoker } = useWorkspaceInternals()
  const columnOpen = useColumnOpen()
  const bodyRef = useRef<HTMLDivElement>(null)

  // Every request to show a group: its field (scrolled to a third of the
  // column and flashed) or, with none, its header at the top of the column.
  // Two frames first, so the group has mounted; a code-split body is waited
  // for. Only the column scrolls — never the window.
  useEffect(() => {
    if (!focusRequest) return
    const { group, fieldId, focus } = focusRequest
    let cancelled = false
    let frame = 0
    const started = performance.now()
    const attempt = () => {
      if (cancelled) return
      const body = bodyRef.current
      if (!body) return
      const section = body.querySelector<HTMLElement>(`[data-group="${group}"]`)
      if (fieldId) {
        if (focusField(fieldId, body)) return
        const region = section?.querySelector('.ws-group-body')
        const loading = !region?.firstElementChild || region.querySelector('[data-panel-loading]')
        if (loading && performance.now() - started < 3000) {
          frame = window.requestAnimationFrame(attempt)
          return
        }
      }
      if (!section) return
      body.scrollTop += section.getBoundingClientRect().top - body.getBoundingClientRect().top
      if (focus) {
        section.querySelector<HTMLElement>('.ws-group-header')?.focus({ preventScroll: true })
      }
    }
    frame = window.requestAnimationFrame(() => {
      frame = window.requestAnimationFrame(attempt)
    })
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
    }
  }, [focusRequest])

  // `null`: the width has not been looked at yet and CSS decides.
  const folded = panelMode !== 'docked' && columnOpen === false
  const ToggleIcon = folded ? ChevronsLeft : ChevronsRight

  return (
    <aside
      id="edit-panel"
      data-testid="edit-panel"
      data-mode={panelMode}
      // Until the width has been looked at (server HTML, first paint) there
      // is no attribute and CSS decides: a pane from 1180 px, an open drawer
      // from 1000, a rail below, nothing on phones. Saying "open" here would
      // flash the column over a phone's canvas before hydration.
      data-open={
        columnOpen === null
          ? undefined
          : panelMode === 'docked' || columnOpen
            ? 'true'
            : 'false'
      }
      className="ws-panel"
      aria-labelledby="edit-panel-title"
      // Help tips opened in the column stay inside it (see `InfoTip`).
      data-tip-boundary
      // Escape: back to what led into the column (a ✎ label, a diagram item,
      // a pointer in a section). A popover or tip that used the key first has
      // already claimed it.
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || event.defaultPrevented) return
        closeEditor()
      }}
      // Focus that leaves on its own (Tab, a click on the canvas) ends that
      // way back; a later Escape must not jump to a stale place.
      onBlur={(event) => {
        const next = event.relatedTarget
        if (next instanceof Node && !event.currentTarget.contains(next)) forgetInvoker()
      }}
    >
      <div className="ws-panel-top">
        <h2 id="edit-panel-title" data-testid="edit-panel-title" tabIndex={-1}>
          {t('title')}
        </h2>
        {/* The drawer's one fold control: the same button, in the same
            corner under the dock, whether the drawer is open or a rail. */}
        <button
          type="button"
          className="ws-panel-toggle"
          data-testid="edit-panel-toggle"
          data-column-toggle
          aria-expanded={!folded}
          aria-controls="edit-panel-body"
          aria-label={folded ? t('unfold') : t('fold')}
          title={folded ? t('unfold') : t('fold')}
          onClick={() => setColumnOpen(folded)}
        >
          <ToggleIcon size={18} aria-hidden="true" />
          <span className="ws-panel-toggle-label" aria-hidden="true">
            {t('title')}
          </span>
        </button>
      </div>

      <div ref={bodyRef} id="edit-panel-body" className="ws-panel-body @container">
        <ColumnGroups />
        <footer className="ws-column-footer">
          <p className="ws-footnote">{tw('cards.startingValues')}</p>
          <div className="ws-column-footer-actions">
            <Link href="/setup" className="ws-text-link" data-testid="setup-link">
              {tw('guidedSetup')}
              <ArrowRight size={14} aria-hidden="true" />
            </Link>
            <ResetToDefaults />
          </div>
        </footer>
      </div>
    </aside>
  )
}
