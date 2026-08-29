'use client'

import { useEffect, useState } from 'react'
import { Settings, ChevronRight } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { PlanEditor } from '@/components/plans/PlanEditor'

interface ParameterSidebarProps {
  className?: string
}

/**
 * True while the reader is scrolling *down* somewhere below the top of the
 * page — the one situation where a full-width sticky bar is pure occlusion: the
 * drawer it opens is not what they are reaching for, and the bar covers the row
 * of chart they are reading towards. Scrolling back up (or reaching the top,
 * or tabbing into the bar) brings it straight back.
 */
function useScrollingDown(): boolean {
  const [scrollingDown, setScrollingDown] = useState(false)

  useEffect(() => {
    let lastY = window.scrollY

    const onScroll = () => {
      const y = window.scrollY
      const delta = y - lastY
      // Ignore sub-pixel jitter and rubber-banding at the extremes.
      if (Math.abs(delta) < 8) return
      lastY = y
      setScrollingDown(y > 200 && delta > 0)
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return scrollingDown
}

export function ParameterSidebar({ className = '' }: ParameterSidebarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const t = useTranslations('parameterSidebar')
  const scrollingDown = useScrollingDown()
  const retracted = scrollingDown && !isOpen

  return (
    <>
      {/* The desktop editor is no longer a cramped sidebar: it is the full-width
          "Plan" tab on the simulation page. Only the mobile drawer lives here,
          and it renders exactly the same editor. */}

      {/* Mobile sheet trigger: docked in the document flow (sticky under the
          header) so it can never cover the tabs, the gauge or a chart — and
          retracted while the reader scrolls down a long tab, so it stops being
          a permanent 3.5rem lid over mid-page content. `focus-within` brings it
          back for keyboard users, who never scroll it away in the first place. */}
      <div
        data-sticky-chrome="true"
        data-retracted={retracted ? 'true' : 'false'}
        className={`sticky top-0 z-30 -mx-2 mb-2 border-b-2 border-border bg-background px-2 py-2 transition-transform duration-200 focus-within:translate-y-0 motion-reduce:transition-none sm:-mx-3 sm:px-3 lg:hidden ${
          retracted ? '-translate-y-full' : 'translate-y-0'
        } ${className}`}
      >
        <Sheet open={isOpen} onOpenChange={setIsOpen}>
          <SheetTrigger asChild>
            <Button
              variant="secondary"
              size="sm"
              className="h-12 w-full justify-between shadow-sm"
            >
              <span className="flex items-center">
                <Settings className="mr-2 h-4 w-4" />
                {t('trigger')}
              </span>
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </SheetTrigger>
          {/* Drawer shell: a flex column so the header stays put and only the
              body scrolls, and `overflow-x-hidden` so nothing inside can push
              the panel sideways on a 390px screen. */}
          <SheetContent
            side="left"
            className="rounded-sm flex w-full max-w-full flex-col overflow-x-hidden border border-border bg-white p-0 shadow-sm sm:w-96"
          >
            <SheetHeader className="shrink-0 border-b border-border bg-white px-4 py-4 pr-12 text-left sm:px-6 sm:py-5">
              <SheetTitle className="flex items-center text-base font-bold   text-ink sm:text-lg sm:">
                <Settings className="mr-2 h-5 w-5 shrink-0" />
                {t('title')}
              </SheetTitle>
              <SheetDescription className="sr-only">{t('description')}</SheetDescription>
            </SheetHeader>
            {/* The sheet already names the panel — `hideHeading` stops the
                controls from repeating that title one row further down. */}
            <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-6 pt-3 sm:px-6">
              <PlanEditor variant="drawer" />
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  )
}
