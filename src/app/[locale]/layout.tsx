import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { Analytics } from '@vercel/analytics/next'
import { ToastProvider } from '@/components/ui/toast'
import { SkipLinks } from '@/components/navigation/SkipLinks'
import { HtmlLang } from '@/components/navigation/HtmlLang'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { isAuthConfigured } from '@/lib/auth/env'
import { isCloudStoreConfigured } from '@/lib/server/planStore'
import { isLocale, locales } from '@/i18n/config'

interface LocaleLayoutProps {
  children: ReactNode
  params: Promise<{ locale: string }>
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

// Only the prerendered locales exist. Anything else (`/zz1.zz`, `/fr/…`) is a
// 404 instead of an on-demand render that leaves an ISR cache entry behind.
export const dynamicParams = false

export default async function LocaleLayout({
  children,
  params,
}: LocaleLayoutProps) {
  const { locale } = await params

  if (!isLocale(locale)) {
    notFound()
  }

  setRequestLocale(locale)
  const messages = await getMessages()

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <HtmlLang locale={locale} />
      {/* Resolved on the server: without OAuth credentials no SessionProvider
          is mounted and the auth UI renders a disabled state instead. The
          pages are prerendered, so these flags are fixed at BUILD time while
          /api/auth and /api/plans read the runtime env. The deploy workflow
          refuses a production build whose pulled env lacks the auth or store
          variables (scripts/check-deploy-env.mjs), so the two cannot drift. */}
      <AuthProvider enabled={isAuthConfigured()} cloudSync={isCloudStoreConfigured()}>
        <SkipLinks />
        {children}
        <Analytics />
        <ToastProvider />
      </AuthProvider>
    </NextIntlClientProvider>
  )
}
