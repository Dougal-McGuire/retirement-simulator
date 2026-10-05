import type { Page, Request } from '@playwright/test'
import { test, expect, openPanel, waitForResults } from './helpers/workspace'
import { isAuthEnabled, stubSignedIn } from './helpers/auth'

/**
 * The plan-schema guard on cloud sync (`src/lib/plans/schemaVersion.ts`):
 * every `/api/plans` request states the build's schema version, and a `409`
 * from the server stops this tab's sync for good and asks for a reload — while
 * local edits keep working.
 *
 * `/api/plans` is served from the page (no backing store in tests); the routes
 * registered here win over the 501 stub `stubSignedIn` installs.
 */

const PLAN_SCHEMA_VERSION = '2'

interface PlansCall {
  method: string
  schema: string | null
}

type Answer = { status: number; body: unknown; headers?: Record<string, string> }

async function servePlans(
  page: Page,
  answer: (method: string) => Answer
): Promise<PlansCall[]> {
  const calls: PlansCall[] = []
  await page.route('**/api/plans', async (route) => {
    const request: Request = route.request()
    calls.push({ method: request.method(), schema: request.headers()['x-plan-schema'] ?? null })
    const { status, body, headers } = answer(request.method())
    await route.fulfill({
      status,
      contentType: 'application/json',
      headers: { 'x-plan-schema': PLAN_SCHEMA_VERSION, ...(headers ?? {}) },
      body: JSON.stringify(body),
    })
  })
  return calls
}

const puts = (calls: PlansCall[]) => calls.filter((call) => call.method === 'PUT')

/** Changes the annual savings and saves the plan — a change sync would push. */
async function editAndSave(page: Page, value: string) {
  await openPanel(page, 'savings')
  const savings = page.locator('#editor-annualSavings')
  await savings.fill(value)
  await savings.blur()
  await page.getByTestId('edit-panel-done').click()
  await expect(page.getByTestId('edit-panel')).toHaveCount(0)
  await page.getByTestId('command-save').click()
  await expect(page.getByTestId('command-save')).toHaveCount(0)
}

/** Longer than the 2 s push debounce, so a push that was going to happen has. */
const PAST_DEBOUNCE_MS = 3500

test.describe('cloud sync schema guard', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !(await isAuthEnabled(page)),
      'server has no OAuth credentials — start it via Playwright or set AUTH_SECRET/GOOGLE_CLIENT_*'
    )
    await stubSignedIn(page)
  })

  test('a 409 on PUT shows the reload notice and nothing is pushed again', async ({ page }) => {
    const calls = await servePlans(page, (method) =>
      method === 'PUT'
        ? { status: 409, body: { error: 'outdated-client', schemaVersion: 3 } }
        : { status: 200, body: { configured: true, schemaVersion: 2, blob: null } }
    )

    await page.goto('/de/simulation')
    await waitForResults(page)
    // A pristine workspace against an empty account: one pull, nothing pushed.
    await expect.poll(() => calls.length).toBeGreaterThanOrEqual(1)
    expect(puts(calls)).toHaveLength(0)

    await editAndSave(page, '20000')
    await expect.poll(() => puts(calls).length, { timeout: 10_000 }).toBe(1)

    const notice = page.getByTestId('sync-reload-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText(
      'Neue Version verfügbar – bitte neu laden, damit deine Pläne weiter synchronisiert werden.'
    )
    await expect(notice.getByRole('button', { name: 'Neu laden' })).toBeVisible()
    // Polite, not an alert: react-hot-toast's status region.
    await expect(page.locator('[role="status"][aria-live="polite"]', { has: notice })).toHaveCount(1)

    // Local edits keep working, but never reach the server again.
    await editAndSave(page, '21000')
    await page.waitForTimeout(PAST_DEBOUNCE_MS)
    expect(puts(calls)).toHaveLength(1)
    // A focus-triggered pull is off too.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.waitForTimeout(500)
    expect(calls.filter((call) => call.method === 'GET')).toHaveLength(1)

    // Every request stated the schema version.
    expect(calls.every((call) => call.schema === PLAN_SCHEMA_VERSION)).toBe(true)

    // "Neu laden" reloads the page.
    await Promise.all([
      page.waitForEvent('load'),
      notice.getByRole('button', { name: 'Neu laden' }).click(),
    ])
  })

  test('a 409 on GET stops sync before anything is merged or pushed', async ({ page }) => {
    const calls = await servePlans(page, (method) =>
      method === 'GET'
        ? { status: 409, body: { error: 'outdated-client', schemaVersion: 3 } }
        : { status: 200, body: { configured: true, updatedAt: Date.now() } }
    )

    await page.goto('/en/simulation')
    await waitForResults(page)

    const notice = page.getByTestId('sync-reload-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('New version available')

    await editAndSave(page, '20000')
    await page.waitForTimeout(PAST_DEBOUNCE_MS)
    expect(puts(calls)).toHaveLength(0)

    // "Later" dismisses the card; the account status keeps saying why.
    await notice.getByRole('button', { name: 'Later' }).click()
    await expect(notice).toHaveCount(0)
    await page.getByTestId('dashboard-tools').click()
    const status = page.getByRole('dialog').getByTestId('auth-sync-status')
    await expect(status).toHaveAttribute('data-phase', 'outdated')
    await expect(status).toHaveAttribute('aria-label', 'Sync paused — reload needed')
  })

  test('a newer build on the server suggests a reload but keeps syncing', async ({ page }) => {
    // The hint needs a build id in this bundle, which the server under test
    // only has when started with NEXT_PUBLIC_BUILD_ID (Playwright's own server
    // is) — the unmocked API reports it.
    const probe = await page.request.get('/api/plans')
    const buildId = probe.headers()['x-build-id']
    test.skip(!buildId, 'server under test has no build id (NEXT_PUBLIC_BUILD_ID)')

    const calls = await servePlans(page, (method) =>
      method === 'PUT'
        ? { status: 200, body: { configured: true, updatedAt: Date.now() }, headers: { 'x-build-id': `${buildId}-next` } }
        : { status: 200, body: { configured: true, schemaVersion: 2, blob: null }, headers: { 'x-build-id': `${buildId}-next` } }
    )

    await page.goto('/en/simulation')
    await waitForResults(page)
    const notice = page.getByTestId('sync-reload-notice')
    await expect(notice).toContainText('New version available — reload to use it.')

    await editAndSave(page, '20000')
    await expect.poll(() => puts(calls).length, { timeout: 10_000 }).toBe(1)
    await editAndSave(page, '21000')
    await expect.poll(() => puts(calls).length, { timeout: 10_000 }).toBe(2)
  })
})
