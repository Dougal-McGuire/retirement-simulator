'use client'

import { useTranslations } from 'next-intl'

export function SkipLinks() {
  const t = useTranslations('layout.skipLinks')

  return (
    <>
      <a
        href="#main-content"
        className="sr-only z-50 p-3 font-medium transition-all focus:absolute focus:left-0 focus:top-0 focus:not-sr-only focus:rounded-br-md focus:bg-neo-blue focus:text-neo-white focus:outline-none focus:ring-2 focus:ring-neo-blue focus:ring-offset-2"
      >
        {t('main')}
      </a>
      <a
        href="#navigation"
        className="sr-only z-50 p-3 font-medium transition-all focus:absolute focus:left-32 focus:top-0 focus:not-sr-only focus:rounded-br-md focus:bg-neo-blue focus:text-neo-white focus:outline-none focus:ring-2 focus:ring-neo-blue focus:ring-offset-2"
      >
        {t('navigation')}
      </a>
    </>
  )
}
