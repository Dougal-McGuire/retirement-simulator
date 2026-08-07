import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'
import { isLocale } from '@/i18n/config'
import { LandingPage } from '@/components/landing/LandingPage'

interface LocaleHomePageProps {
  params: Promise<{ locale: string }>
}

export async function generateMetadata({ params }: LocaleHomePageProps): Promise<Metadata> {
  const { locale } = await params

  if (!isLocale(locale)) {
    return {}
  }

  const t = await getTranslations({ locale, namespace: 'landing.meta' })

  return {
    title: t('title'),
    description: t('description'),
  }
}

export default async function LocaleHomePage({ params }: LocaleHomePageProps) {
  const { locale } = await params

  if (!isLocale(locale)) {
    notFound()
  }

  setRequestLocale(locale)

  return <LandingPage />
}
