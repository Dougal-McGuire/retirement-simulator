import { getRequestConfig } from 'next-intl/server'
import type { AbstractIntlMessages } from 'next-intl'
import { defaultLocale, isLocale, type Locale } from './config'

type MessagesImport = () => Promise<AbstractIntlMessages>

const messagesImports: Record<Locale, MessagesImport> = {
  en: () => import('./messages/en.json').then((module) => module.default),
  de: () => import('./messages/de.json').then((module) => module.default),
}

export async function loadMessages(locale: Locale): Promise<AbstractIntlMessages> {
  const normalizedLocale = isLocale(locale) ? locale : defaultLocale
  return messagesImports[normalizedLocale]()
}

export default getRequestConfig(async ({ requestLocale }) => {
  const locale = await requestLocale
  const normalizedLocale = isLocale(locale) ? locale : defaultLocale

  const messages = await loadMessages(normalizedLocale)

  return {
    locale: normalizedLocale,
    messages,
  }
})
