jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}))

jest.mock('@/i18n/config', () => ({
  defaultLocale: 'en',
}))

import { redirect } from 'next/navigation'
import Home from '../page'
import LocaleHomePage from '../[locale]/page'

describe('app routing', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('redirects the root page to the setup flow', () => {
    Home()

    expect(redirect).toHaveBeenCalledWith('/en/setup')
  })

  it('redirects locale home pages to the locale setup flow', async () => {
    await LocaleHomePage({
      params: Promise.resolve({ locale: 'de' }),
    })

    expect(redirect).toHaveBeenCalledWith('/de/setup')
  })
})
