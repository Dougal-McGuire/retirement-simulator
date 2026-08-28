import type { Page } from '@playwright/test'

export const TEST_USER = {
  id: 'e2e-user-1',
  name: 'Ada Lovelace',
  email: 'ada@example.com',
  image: null,
}

/**
 * Whether the server under test has OAuth configured. Without credentials the
 * app mounts no `SessionProvider` and `/api/auth/session` answers 404, so a
 * stubbed session would never be read. Specs that need a signed-in user skip
 * in that case — the Playwright-managed server always has placeholder
 * credentials (see `playwright.config.ts`); a hand-started `pnpm dev` may not.
 */
export async function isAuthEnabled(page: Page): Promise<boolean> {
  const response = await page.request.get('/api/auth/session')
  return response.status() !== 404
}

/**
 * Makes the browser believe it is signed in. Auth.js reads the session
 * client-side from `/api/auth/session`, so answering that request is enough
 * for every `useSession()` in the app; nothing touches Google.
 */
export async function stubSignedIn(page: Page, user = TEST_USER): Promise<void> {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        user,
        expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      }),
    })
  )
  // No cloud store in tests: the sync layer must see "not configured" and
  // leave the plans on the device, exactly as a sign-in-only deployment does.
  await page.route('**/api/plans', (route) =>
    route.fulfill({ status: 501, contentType: 'application/json', body: '{}' })
  )
}

export async function stubSignedOut(page: Page): Promise<void> {
  await page.route('**/api/auth/session', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: 'null' })
  )
}
