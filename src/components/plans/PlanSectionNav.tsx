'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslations } from 'next-intl'
import {
  PLAN_SECTIONS,
  PLAN_SECTION_IDS,
  activeSectionId,
  scrollToPlanSection,
} from './planSections'
import { cn } from '@/lib/utils'

/**
 * How far below the top of the viewport a section has to reach before it counts
 * as "the one being read". Roughly the height of the sticky chrome plus this
 * bar; the bottom margin keeps the band shallow so the pill changes when a new
 * card arrives rather than when the old one finally leaves.
 */
const DETECTION_BAND = '-140px 0px -68% 0px'

interface PlanSectionNavProps {
  /** Sections the user has folded away, so a jump can open the target first. */
  collapsed: Record<string, boolean>
  onExpand: (id: string) => void
  className?: string
}

/**
 * Sticky sub-navigation for the plan editor.
 *
 * The Plan tab is a five-thousand-pixel column; without this the only way to
 * find the withdrawal planner is to scroll past everything else and hope.
 */
export function PlanSectionNav({ collapsed, onExpand, className }: PlanSectionNavProps) {
  const t = useTranslations('planEditor')
  const [active, setActive] = useState<string>(PLAN_SECTION_IDS[0])
  const intersecting = useRef<Set<string>>(new Set())
  /** Suppresses the spy while a click-driven smooth scroll is in flight. */
  const pinnedUntil = useRef(0)

  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return

    const nodes = PLAN_SECTION_IDS.map((id) => document.getElementById(id)).filter(
      (node): node is HTMLElement => node !== null
    )
    if (nodes.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) intersecting.current.add(entry.target.id)
          else intersecting.current.delete(entry.target.id)
        })
        if (Date.now() < pinnedUntil.current) return
        setActive((previous) => activeSectionId(PLAN_SECTION_IDS, intersecting.current, previous))
      },
      { rootMargin: DETECTION_BAND, threshold: 0 }
    )

    nodes.forEach((node) => observer.observe(node))
    return () => observer.disconnect()
  }, [])

  const jumpTo = useCallback(
    (id: string) => {
      if (collapsed[id]) onExpand(id)
      setActive(id)
      // The observer fires all the way down during a smooth scroll and would
      // otherwise repaint the bar with every section it passes.
      pinnedUntil.current = Date.now() + 900

      // A section that was folded away has to be opened before it is scrolled
      // to, and the DOM needs a frame to grow before the offsets are read.
      window.requestAnimationFrame(() => scrollToPlanSection(id))
    },
    [collapsed, onExpand]
  )

  return (
    <nav
      aria-label={t('sections.navLabel')}
      data-testid="plan-section-nav"
      className={cn(
        'sticky top-[4.5rem] z-20 -mx-1 border-3 border-neo-black bg-neo-white px-2 py-2 shadow-neo-sm lg:top-1',
        className
      )}
    >
      <ul className="flex list-none flex-wrap gap-1.5 p-0">
        {PLAN_SECTIONS.map((section) => {
          const isActive = active === section.id
          return (
            <li key={section.id}>
              <button
                type="button"
                data-testid={`plan-section-pill-${section.group}`}
                data-active={isActive || undefined}
                aria-current={isActive ? 'true' : undefined}
                onClick={() => jumpTo(section.id)}
                className={cn(
                  'border-2 border-neo-black px-3 py-1.5 text-[0.6rem] font-extrabold uppercase tracking-[0.12em] transition-neo',
                  isActive
                    ? 'bg-neo-blue text-neo-white shadow-neo-xs'
                    : 'bg-neo-white text-neo-black hover:bg-neo-blue/10'
                )}
              >
                {t(`groups.${section.group}.title`)}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
