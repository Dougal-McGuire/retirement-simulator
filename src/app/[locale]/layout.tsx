import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, setRequestLocale } from 'next-intl/server'
import { Analytics } from '@vercel/analytics/next'
import { ToastProvider } from '@/components/ui/toast'
import { SkipLinks } from '@/components/navigation/SkipLinks'
import { AuthProvider } from '@/components/auth/AuthProvider'
import { isAuthConfigured } from '@/lib/auth/env'
import { isLocale, locales } from '@/i18n/config'

interface LocaleLayoutProps {
  children: ReactNode
  params: Promise<{ locale: string }>
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }))
}

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
      {/* Resolved on the server: without OAuth credentials no SessionProvider
          is mounted and the auth UI renders a disabled state instead. */}
      <AuthProvider enabled={isAuthConfigured()}>
        <SkipLinks />
        {children}
        <Analytics />
        <ToastProvider />
      </AuthProvider>
    </NextIntlClientProvider>
  )
}
