import { notFound } from 'next/navigation'
import { getRequestConfig } from 'next-intl/server'
import type { AbstractIntlMessages } from 'next-intl'
import { defaultLocale, locales, type Locale } from './config'

type MessagesImport = () => Promise<AbstractIntlMessages>

const messagesImports: Record<Locale, MessagesImport> = {
  en: () => import('./messages/en.json').then((module) => module.default),
  de: () => import('./messages/de.json').then((module) => module.default),
}

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = (await requestLocale) as Locale | undefined
  const normalizedLocale = locales.includes(locale as Locale)
    ? (locale as Locale)
    : defaultLocale

  if (!locales.includes(normalizedLocale)) {
    notFound()
  }

  const messages = await messagesImports[normalizedLocale]()

  return {
    locale: normalizedLocale,
    messages,
  }
})
