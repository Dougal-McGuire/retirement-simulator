'use client'

import { useTranslations } from 'next-intl'

export function ChartEmptyState() {
  const t = useTranslations('simulationChart')

  return (
    <div className="flex h-96 flex-col items-center justify-center gap-4 border-3 border-neo-black bg-neo-white px-6 text-center shadow-neo">
      <svg
        viewBox="0 0 120 64"
        className="h-16 w-28 opacity-80"
        aria-hidden="true"
        fill="none"
      >
        <path
          d="M4,56 C30,52 52,40 76,26 C92,17 108,10 116,8 L116,40 C108,42 92,46 76,50 C52,55 30,57 4,59 Z"
          fill="rgb(var(--neo-blue-rgb) / 0.12)"
        />
        <path
          d="M4,57 C30,54 54,46 78,36 C94,29 108,24 116,22"
          stroke="rgb(var(--neo-blue-rgb) / 0.55)"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <line
          x1="4"
          y1="62"
          x2="116"
          y2="62"
          stroke="rgb(var(--neo-black-rgb) / 0.2)"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
      <p className="text-[0.78rem] font-bold uppercase tracking-[0.16em] text-neo-black">
        {t('empty.title')}
      </p>
      <p className="max-w-xs text-xs font-medium leading-relaxed text-muted-foreground">
        {t('empty.subtitle')}
      </p>
    </div>
  )
}
