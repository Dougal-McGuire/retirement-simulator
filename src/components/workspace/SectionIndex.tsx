'use client'

import { memo, type MouseEvent } from 'react'
import { useTranslations } from 'next-intl'
import { ChartNoAxesCombined, SlidersHorizontal } from 'lucide-react'
import { useActiveSection, useColumnOpen } from './useWorkspaceUiStore'
import { useWorkspace } from './WorkspaceProvider'
import { WORKSPACE_SECTIONS, type WorkspaceSectionId } from './workspaceNav'

/** The sections below the head; the head itself needs no link to itself. */
const ANCHORS = WORKSPACE_SECTIONS.filter((id) => id !== 'result')

/**
 * The three anchors under the head: Geldfluss · Entnahme · Wirkung. They
 * replace the rail — the page is short enough to need no pinned index, and
 * the dock's mini chart leads back to the head. Plain links: a click scrolls
 * the section under the pinned chrome and focuses its heading, while
 * middle-click and "open in new tab" still follow the `href`.
 */
export const SectionAnchors = memo(function SectionAnchors() {
  const t = useTranslations('workspace')
  const active = useActiveSection()
  const { scrollToSection } = useWorkspace()

  const onClick = (event: MouseEvent<HTMLAnchorElement>, id: WorkspaceSectionId) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    event.preventDefault()
    scrollToSection(id, { focus: true })
  }

  return (
    <nav
      id="navigation"
      className="ws-anchors"
      aria-label={t('navigation')}
      data-testid="section-index"
    >
      <ol>
        {ANCHORS.map((id) => (
          <li key={id}>
            <a
              href={`#${id}`}
              data-testid={`section-link-${id}`}
              data-section-link={id}
              aria-current={active === id ? 'location' : undefined}
              onClick={(event) => onClick(event, id)}
            >
              {t(`sections.${id}.title`)}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  )
})

/**
 * The phone's two modes, switched by a bar fixed at the bottom: "Ansehen"
 * (the canvas) and "Stellen" (the control column). The dock stays pinned in
 * both, so the result is in view whichever one is showing. Hidden above
 * 760 px by CSS, where both are on screen (or one tap of the drawer away).
 */
export const ModeBar = memo(function ModeBar() {
  const t = useTranslations('workspace.modes')
  const { mode, setColumnOpen, exitCompare } = useWorkspace()
  const editing = useColumnOpen() === true
  const select = (edit: boolean) => {
    // Out of the comparison first: "Stellen" edits the active plan.
    if (edit && mode === 'compare') exitCompare()
    setColumnOpen(edit, { focus: true })
  }
  return (
    <nav className="ws-modes" aria-label={t('label')} data-testid="mode-bar" data-bottom-chrome>
      <button
        type="button"
        data-testid="mode-view"
        aria-pressed={!editing}
        onClick={() => select(false)}
      >
        <ChartNoAxesCombined size={20} aria-hidden="true" />
        {t('view')}
      </button>
      <button
        type="button"
        data-testid="mode-edit"
        aria-pressed={editing}
        onClick={() => select(true)}
      >
        <SlidersHorizontal size={20} aria-hidden="true" />
        {t('edit')}
      </button>
    </nav>
  )
})
