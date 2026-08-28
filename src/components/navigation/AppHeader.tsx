'use client'

import type { ReactNode } from 'react'
import { AuthMenu } from '@/components/auth/AuthMenu'
import { HeaderControlsMenu } from '@/components/navigation/HeaderControlsMenu'
import { LocaleSwitcher } from '@/components/navigation/LocaleSwitcher'
import { ThemeSwitcher } from '@/components/navigation/ThemeSwitcher'
import { cn } from '@/lib/utils'

interface AppHeaderProps {
  /** Small chips above the title (engine badge, plan context, …). */
  eyebrow?: ReactNode
  title: ReactNode
  /** One sentence at most. Hidden on phones — every row there costs a number. */
  subtitle?: ReactNode
  /** Page-specific content under the title: plan switcher, live preview, … */
  children?: ReactNode
  /**
   * Page-specific buttons appended to the action row after the shared
   * controls (account, theme, language). Rendered from `lg` up.
   */
  actions?: ReactNode
  /**
   * What the phone toolbar shows instead of the desktop row. Defaults to the
   * account button and the display-settings menu; pages with a primary action
   * of their own (report, dashboard) supply a row that includes it.
   */
  mobileActions?: ReactNode
  /** Extra classes on the hero card. */
  className?: string
  /** `id` of the wrapping header (skip-link target). */
  id?: string
}

/**
 * The one header shell shared by the setup wizard and the dashboard.
 *
 * Both pages used to hand-roll the same hero card with their own action
 * strips — one wrapping four controls into two ragged rows, the other stacking
 * five buttons in a column — so account, theme and language sat somewhere
 * different on every page. Here they are one horizontal row, always in the
 * same order, with the page's own call to action at the end.
 */
export function AppHeader({
  eyebrow,
  title,
  subtitle,
  children,
  actions,
  mobileActions,
  className,
  id = 'navigation',
}: AppHeaderProps) {
  return (
    <header id={id} className="theme-page-header relative z-10 pt-5 pb-5 sm:pt-10 sm:pb-8">
      <div className="theme-container mx-auto max-w-[90rem] px-2 sm:px-3 lg:px-4">
        <div
          className={cn(
            'theme-hero neo-surface relative px-4 py-5 transition-neo sm:px-8 sm:py-8',
            className
          )}
        >
          <div className="theme-hero-layout relative flex flex-col gap-5 sm:gap-6">
            {/* Row 1 — toolbar: badges left, controls right. Keeping the
                controls out of the title row is what lets a 20-character
                compound like "Ruhestandssimulation" stay on one line. */}
            <div className="theme-hero-top flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
              <div className="theme-badge-row flex min-w-0 flex-wrap items-center gap-2 text-[0.62rem] font-semibold uppercase tracking-[0.18em] text-neo-black">
                {eyebrow}
              </div>

              {/* Desktop: one row, shared controls first, page action last. */}
              <div
                data-testid="app-header-actions"
                className="theme-action-strip hidden shrink-0 items-center gap-2 lg:flex"
              >
                <AuthMenu className="w-auto max-w-[18rem] shrink-0" />
                <ThemeSwitcher className="w-auto shrink-0" />
                <LocaleSwitcher className="w-auto shrink-0" />
                {actions}
              </div>

              {/* Phone: the account button plus whatever the page needs. */}
              <div
                data-testid="app-header-mobile-actions"
                className="theme-mobile-actions flex items-center gap-2 lg:hidden"
              >
                {mobileActions ?? (
                  <>
                    <AuthMenu compact className="shrink-0" />
                    <HeaderControlsMenu />
                  </>
                )}
              </div>
            </div>

            {/* Row 2 — the page itself. */}
            <div className="flex min-w-0 flex-col gap-4 text-neo-black sm:gap-5">
              <div className="min-w-0">
                <h1 className="text-2xl font-black tracking-[0.06em] [overflow-wrap:anywhere] sm:text-4xl sm:tracking-[0.12em]">
                  {title}
                </h1>
                {subtitle && (
                  <p className="mt-2 hidden max-w-2xl text-sm font-medium leading-relaxed text-foreground/80 sm:block">
                    {subtitle}
                  </p>
                )}
              </div>
              {children}
            </div>
          </div>
        </div>
      </div>
    </header>
  )
}
