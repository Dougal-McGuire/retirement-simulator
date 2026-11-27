import { hasSessionCookie, landingLocale } from '../landingForward'

describe('hasSessionCookie', () => {
  it('recognises the Auth.js session cookie on http, https and when chunked', () => {
    expect(hasSessionCookie(['authjs.session-token'])).toBe(true)
    expect(hasSessionCookie(['__Secure-authjs.session-token'])).toBe(true)
    expect(hasSessionCookie(['NEXT_LOCALE', '__Secure-authjs.session-token.0'])).toBe(true)
  })

  it('ignores the other Auth.js cookies and look-alikes', () => {
    expect(hasSessionCookie([])).toBe(false)
    expect(hasSessionCookie(['authjs.csrf-token', 'authjs.callback-url', 'NEXT_LOCALE'])).toBe(
      false
    )
    expect(hasSessionCookie(['xauthjs.session-token', 'authjs.session-token-old'])).toBe(false)
  })
})

describe('landingLocale', () => {
  it('names the locale of the landing page paths', () => {
    expect(landingLocale('/de')).toBe('de')
    expect(landingLocale('/en/')).toBe('en')
  })

  it('is null for every other path', () => {
    expect(landingLocale('/')).toBeNull()
    expect(landingLocale('/fr')).toBeNull()
    expect(landingLocale('/de/simulation')).toBeNull()
    expect(landingLocale('/simulation')).toBeNull()
  })
})
