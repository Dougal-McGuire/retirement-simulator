'use client'

import { useEffect, useRef } from 'react'
import { WORKSPACE_SECTIONS, pickActiveSection, type WorkspaceSectionId } from './workspaceNav'
import { useWorkspaceUiStore } from './useWorkspaceUiStore'

/** Share of the unobstructed viewport above the reading line. */
const READING_LINE = 0.3

/** Reads the section tops once and decides which section is being read. */
export function measureActiveSection(): WorkspaceSectionId | null {
  const tops: { id: WorkspaceSectionId; top: number }[] = []
  for (const id of WORKSPACE_SECTIONS) {
    const node = document.getElementById(id)
    if (!node || node.getClientRects().length === 0) continue
    tops.push({ id, top: node.getBoundingClientRect().top })
  }
  if (tops.length === 0) return null
  const { stickyTop, bottomInset } = useWorkspaceUiStore.getState()
  const readingLine = stickyTop + READING_LINE * (window.innerHeight - stickyTop - bottomInset)
  const root = document.scrollingElement ?? document.documentElement
  const atBottom = window.innerHeight + window.scrollY >= root.scrollHeight - 2
  return pickActiveSection(tops, readingLine, atBottom)
}

/**
 * Keeps `activeSection` in step with the scroll position: a passive,
 * rAF-throttled listener with five rect reads per frame. Paused while
 * `enabled` is false (an overlay or sheet panel is open, compare mode) and
 * during programmatic scrolls, so a jump is not second-guessed half-way.
 * `onChange` hears only changes the spy itself detected.
 */
export function useScrollSpy(enabled: boolean, onChange: (id: WorkspaceSectionId) => void) {
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!enabled) return
    let frame = 0
    const update = () => {
      frame = 0
      const state = useWorkspaceUiStore.getState()
      if (state.programmaticScroll) return
      const next = measureActiveSection()
      if (!next || next === state.activeSection) return
      state.setActiveSection(next)
      onChangeRef.current(next)
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule, { passive: true })
    schedule()
    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      if (frame) window.cancelAnimationFrame(frame)
    }
  }, [enabled])
}
