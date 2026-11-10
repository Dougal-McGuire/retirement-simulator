import { expect, test, type APIResponse } from '@playwright/test'

/**
 * HTTP-level contract of the deployment: locale redirects (src/proxy.ts),
 * security headers (next.config.ts), no cookies on anonymous pages, and 404s
 * for paths that must not render. Plain requests, no browser.
 */

const DE = { 'Accept-Language': 'de-DE,de;q=0.9,en;q=0.5' }
const EN = { 'Accept-Language': 'en-US,en;q=0.9' }

function setCookies(response: APIResponse): string[] {
  return response
    .headersArray()
    .filter((header) => header.name.toLowerCase() === 'set-cookie')
    .map((header) => header.value)
}

test.describe('locale routing', () => {
  for (const [path, headers, location] of [
    ['/', DE, '/de'],
    ['/', EN, '/en'],
    ['/simulation', DE, '/de/simulation'],
    ['/simulation', EN, '/en/simulation'],
    ['/setup', DE, '/de/setup'],
  ] as const) {
    test(`${path} redirects to ${location} for ${headers['Accept-Language'].slice(0, 2)}`, async ({
      request,
    }) => {
      const response = await request.get(path, { headers, maxRedirects: 0 })
      expect([307, 308]).toContain(response.status())
      expect(new URL(response.headers()['location'], 'http://x').pathname).toBe(location)
    })
  }

  for (const path of ['/zz1.zz', '/fr/simulation', '/reports/x/print', '/de/reports/x/print']) {
    test(`${path} ends in a 404`, async ({ request }) => {
      const response = await request.get(path, { headers: DE })
      expect(response.status()).toBe(404)
    })
  }
})

test.describe('anonymous responses', () => {
  for (const [path, headers] of [
    ['/de', DE],
    ['/de/simulation', DE],
    ['/en/setup', EN],
    ['/', DE],
  ] as const) {
    test(`${path} sets no cookies`, async ({ request }) => {
      const response = await request.get(path, { headers, maxRedirects: 0 })
      expect(response.status()).toBeLessThan(400)
      expect(setCookies(response)).toEqual([])
    })
  }

  test('never an Auth.js cookie, even when the URL and browser language differ', async ({
    request,
  }) => {
    // The only cookie a page may set is next-intl's NEXT_LOCALE preference,
    // and only when the URL's locale differs from Accept-Language.
    const response = await request.get('/en/simulation', { headers: DE })
    expect(response.status()).toBe(200)
    for (const cookie of setCookies(response)) expect(cookie).toMatch(/^NEXT_LOCALE=en;/)
  })
})

test.describe('security headers', () => {
  for (const path of ['/de', '/api/plans']) {
    test(`are sent on ${path}`, async ({ request }) => {
      const response = await request.get(path, { headers: DE })
      const headers = response.headers()
      expect(headers['x-content-type-options']).toBe('nosniff')
      expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin')
      expect(headers['x-frame-options']).toBe('DENY')
      expect(headers['cross-origin-opener-policy']).toBe('same-origin-allow-popups')
      expect(headers['permissions-policy']).toContain('camera=()')
      expect(headers['permissions-policy']).toContain('geolocation=()')
      const csp = headers['content-security-policy']
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("base-uri 'self'")
      expect(csp).toContain("object-src 'none'")
      expect(csp).toContain("form-action 'self' https://accounts.google.com")
      expect(headers['x-powered-by']).toBeUndefined()
    })
  }

  test('Google sign-in still starts with them in place', async ({ request }) => {
    // Placeholder OAuth config (playwright.config.ts): the POST must answer
    // with a redirect to Google's consent screen.
    const csrf = await request.get('/api/auth/csrf')
    test.skip(csrf.status() !== 200, 'auth is not configured on this server')
    const { csrfToken } = (await csrf.json()) as { csrfToken: string }
    const response = await request.post('/api/auth/signin/google', {
      form: { csrfToken, callbackUrl: '/de/simulation' },
      maxRedirects: 0,
    })
    expect(response.status()).toBe(302)
    expect(response.headers()['location']).toMatch(/^https:\/\/accounts\.google\.com\//)
  })
})
