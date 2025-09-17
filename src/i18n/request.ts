import { notFound } from 'next/navigation'
import { getRequestConfig } from 'next-intl/server'
import { locales, type Locale } from './config'

type MessagesImport = () => Promise<Record<string, unknown>>

const messagesImports: Record<Locale, MessagesImport> = {
  en: () => import('./messages/en.json').then((module) => module.default),
  de: () => import('./messages/de.json').then((module) => module.default),
}

export default getRequestConfig(async ({ locale }) => {
  const normalizedLocale = locale as Locale

  if (!locales.includes(normalizedLocale)) {
    notFound()
  }

  const messages = await messagesImports[normalizedLocale]()

  return {
    locale: normalizedLocale,
    messages,
  }
})
