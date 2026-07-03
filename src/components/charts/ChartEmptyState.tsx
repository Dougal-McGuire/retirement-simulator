'use client'

import { useTranslations } from 'next-intl'

export function ChartEmptyState() {
  const t = useTranslations('simulationChart')

  return (
    <div className="flex h-96 flex-col items-center justify-center gap-3 border-3 border-neo-black bg-neo-white text-center shadow-neo">
      <p className="text-[0.78rem] font-bold uppercase tracking-[0.16em] text-neo-black">
        {t('empty.title')}
      </p>
      <p className="max-w-xs text-[0.65rem] font-medium uppercase tracking-[0.12em] text-muted-foreground">
        {t('empty.subtitle')}
      </p>
    </div>
  )
}
