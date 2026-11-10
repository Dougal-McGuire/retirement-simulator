import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { getTranslations } from 'next-intl/server'
import { isLocale } from '@/i18n/config'

interface LayoutProps {
  children: ReactNode
  params: Promise<{ locale: string }>
}

/**
 * Server layout for a client page: it only gives the route its own localized
 * title and description (the root layout's English "Retirement Simulator" was
 * the same on every page, in both languages).
 */
export async function generateMetadata({
  params,
}: Omit<LayoutProps, 'children'>): Promise<Metadata> {
  const { locale } = await params
  if (!isLocale(locale)) return {}
  const t = await getTranslations({ locale, namespace: 'setup.meta' })
  return { title: t('title'), description: t('description') }
}

export default function Layout({ children }: LayoutProps) {
  return children
}
