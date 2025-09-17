'use client'

import { useTranslations } from 'next-intl'

export function SkipLinks() {
  const t = useTranslations('layout.skipLinks')

  return (
    <>
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-0 bg-blue-600 text-white p-3 z-50 rounded-br-md font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        {t('main')}
      </a>
      <a
        href="#navigation"
        className="sr-only focus:not-sr-only focus:absolute focus:top-0 focus:left-32 bg-blue-600 text-white p-3 z-50 rounded-br-md font-medium transition-all focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
      >
        {t('navigation')}
      </a>
    </>
  )
}
