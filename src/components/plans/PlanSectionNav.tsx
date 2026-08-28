'use client'

import { useTranslations } from 'next-intl'
import { TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PLAN_SECTIONS } from './planSections'
import { cn } from '@/lib/utils'

interface PlanSectionNavProps {
  /** Two columns only — for the phone drawer, where five across cannot fit. */
  compact?: boolean
  className?: string
}

/**
 * The plan editor's section switcher.
 *
 * Built from the same `TabsList` as the dashboard's top navigation so the two
 * levels read as one system: black segment for where you are, white for where
 * you can go. The `Tabs` root lives in `PlanEditor`, which owns the section
 * state and mounts one section at a time under it.
 */
export function PlanSectionNav({ compact = false, className }: PlanSectionNavProps) {
  const t = useTranslations('planEditor')

  return (
    <TabsList
      aria-label={t('sections.navLabel')}
      data-testid="plan-section-nav"
      className={cn(
        'grid w-full grid-cols-2 border-3 border-neo-black bg-neo-white shadow-neo',
        compact ? '[&>*:last-child]:col-span-2' : 'sm:grid-cols-3 lg:grid-cols-5',
        className
      )}
    >
      {PLAN_SECTIONS.map((section) => (
        <TabsTrigger
          key={section.group}
          value={section.group}
          data-testid={`plan-section-pill-${section.group}`}
        >
          {t(`groups.${section.group}.title`)}
        </TabsTrigger>
      ))}
    </TabsList>
  )
}
