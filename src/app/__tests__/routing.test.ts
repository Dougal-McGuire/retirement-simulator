jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
  notFound: jest.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

jest.mock('next-intl/server', () => ({
  setRequestLocale: jest.fn(),
  getTranslations: jest.fn(async () => (key: string) => key),
}))

jest.mock('@/i18n/config', () => ({
  defaultLocale: 'en',
  isLocale: (value: unknown) => value === 'en' || value === 'de',
}))

jest.mock('@/components/landing/LandingPage', () => ({
  LandingPage: () => null,
}))

import { notFound, redirect } from 'next/navigation'
import { setRequestLocale } from 'next-intl/server'
import Home from '../page'
import LocaleHomePage, { generateMetadata } from '../[locale]/page'

describe('app routing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('redirects the root page to the default locale landing page', () => {
    Home()

    expect(redirect).toHaveBeenCalledWith('/en')
  })

  it('renders the landing page for supported locales without redirecting', async () => {
    const element = await LocaleHomePage({
      params: Promise.resolve({ locale: 'de' }),
    })

    expect(redirect).not.toHaveBeenCalled()
    expect(setRequestLocale).toHaveBeenCalledWith('de')
    expect(element).toBeTruthy()
  })

  it('returns a 404 for unsupported locales', async () => {
    await expect(
      LocaleHomePage({
        params: Promise.resolve({ locale: 'fr' }),
      })
    ).rejects.toThrow('NEXT_NOT_FOUND')

    expect(notFound).toHaveBeenCalled()
  })

  it('builds localized landing metadata', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: 'en' }),
    })

    expect(metadata).toEqual({ title: 'title', description: 'description' })
  })

  it('returns empty metadata for unsupported locales', async () => {
    const metadata = await generateMetadata({
      params: Promise.resolve({ locale: 'fr' }),
    })

    expect(metadata).toEqual({})
  })
})
