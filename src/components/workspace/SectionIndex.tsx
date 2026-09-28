'use client'

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react'
import { useTranslations } from 'next-intl'
import {
  ChartNoAxesCombined,
  ClipboardList,
  HandCoins,
  SlidersHorizontal,
  WalletCards,
} from 'lucide-react'
import { useActiveSection } from './useWorkspaceUiStore'
import { useWorkspace } from './WorkspaceProvider'
import { WORKSPACE_SECTIONS, type WorkspaceSectionId } from './workspaceNav'

const useIsomorphicLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

const ICONS: Record<WorkspaceSectionId, typeof ChartNoAxesCombined> = {
  result: ChartNoAxesCombined,
  assumptions: ClipboardList,
  cashflow: WalletCards,
  withdrawal: HandCoins,
  levers: SlidersHorizontal,
}

/**
 * The one section index. CSS decides how it presents: a left rail (≥1024), a
 * sticky chip row under the result bar (761–1023) or a fixed bottom bar
 * (≤760). Plain links — Tab moves between them; a click scrolls the section
 * under the sticky chrome and focuses its heading, while middle-click and
 * "open in new tab" still follow the `href`. In compare mode every item means
 * "leave the comparison and go there".
 */
export function SectionIndex() {
  const t = useTranslations('workspace')
  const active = useActiveSection()
  const { mode, scrollToSection, exitCompare, pageInert } = useWorkspace()
  const listRef = useRef<HTMLOListElement>(null)
  const current = mode === 'plan' ? active : null

  // Chip row: keep the current chip in view without scrolling the page.
  useEffect(() => {
    const list = listRef.current
    if (!list || !current || list.scrollWidth <= list.clientWidth) return
    const link = list.querySelector<HTMLElement>(`[data-section-link="${current}"]`)
    if (!link) return
    const left = link.offsetLeft - list.offsetLeft
    const right = left + link.offsetWidth
    if (left < list.scrollLeft) list.scrollLeft = left
    else if (right > list.scrollLeft + list.clientWidth) list.scrollLeft = right - list.clientWidth
  }, [current])

  // Rail: the accent marker is placed from the current link's measured box,
  // so it follows the real item height (and any gap) instead of assuming a
  // fixed row. Re-measured on resize; unmeasured, CSS falls back to the
  // item index. The first placement does not slide (data-measured).
  const [marker, setMarker] = useState<{ y: number; h: number } | null>(null)
  useIsomorphicLayoutEffect(() => {
    const list = listRef.current
    if (!list || !current) return
    const measure = () => {
      const link = list.querySelector<HTMLElement>(`[data-section-link="${current}"]`)
      if (!link || link.offsetHeight === 0) return
      const next = { y: link.offsetTop, h: link.offsetHeight }
      setMarker((previous) =>
        previous && previous.y === next.y && previous.h === next.h ? previous : next
      )
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [current])

  const onClick = (event: MouseEvent<HTMLAnchorElement>, id: WorkspaceSectionId) => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return
    }
    event.preventDefault()
    if (mode === 'compare') exitCompare({ section: id, focus: true })
    else scrollToSection(id, { focus: true })
  }

  const activeIndex = current ? WORKSPACE_SECTIONS.indexOf(current) : -1
  return (
    <nav
      id="navigation"
      className="ws-index"
      aria-label={t('navigation')}
      data-testid="section-index"
      data-sticky-chrome="true"
      inert={pageInert}
      style={
        {
          '--ws-index-active': Math.max(0, activeIndex),
          ...(marker ? { '--ws-index-y': `${marker.y}px`, '--ws-index-h': `${marker.h}px` } : {}),
        } as CSSProperties
      }
      data-has-current={current ? 'true' : undefined}
      data-measured={marker ? 'true' : undefined}
    >
      <ol ref={listRef}>
        {WORKSPACE_SECTIONS.map((id) => {
          const Icon = ICONS[id]
          return (
            <li key={id}>
              <a
                href={`#${id}`}
                data-testid={`section-link-${id}`}
                data-section-link={id}
                aria-current={current === id ? 'location' : undefined}
                onClick={(event) => onClick(event, id)}
              >
                <Icon aria-hidden="true" />
                <span className="ws-index-label">{t(`sections.${id}.title`)}</span>
                <span className="ws-index-short" aria-hidden="true">
                  {t(`sections.${id}.short`)}
                </span>
              </a>
            </li>
          )
        })}
      </ol>
      <span className="ws-index-indicator" aria-hidden="true" />
    </nav>
  )
}
