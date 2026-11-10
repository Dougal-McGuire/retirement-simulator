import type { Page, Request } from '@playwright/test'
import { test, expect, openPanel, openPlanMenu, waitForResults } from './helpers/workspace'
import { isAuthEnabled, stubSignedIn } from './helpers/auth'

/**
 * Cloud sync in the browser, against a mocked `/api/plans`
 * (`docs/specs/2026-11-09-sync-protocol.md`):
 *
 *  - the plan-schema guard (`src/lib/plans/schemaVersion.ts`): every request
 *    states the build's schema version, and a `409 outdated-client` stops this
 *    tab's sync for good and asks for a reload — while local edits keep working;
 *  - a failed read (`502`) is "offline", never an empty account: nothing is
 *    pushed until a pull has succeeded;
 *  - a push names the revision it is based on, and a `412` makes the tab pull,
 *    merge and push again.
 *
 * `/api/plans` is served from the page (no backing store in tests); the routes
 * registered here win over the 501 stub `stubSignedIn` installs.
 */

const PLAN_SCHEMA_VERSION = '3'
/** A schema version from a build newer than the one under test. */
const NEWER_SCHEMA = 4

interface PlansCall {
  method: string
  schema: string | null
  /** `x-plan-rev` of a PUT: the revision the push says it is based on. */
  rev: string | null
  body: { plans?: Array<{ id: string }> } | null
}

type Answer = { status: number; body: unknown; headers?: Record<string, string> }

async function servePlans(
  page: Page,
  answer: (method: string, call: PlansCall) => Answer
): Promise<PlansCall[]> {
  const calls: PlansCall[] = []
  await page.route('**/api/plans', async (route) => {
    const request: Request = route.request()
    const call: PlansCall = {
      method: request.method(),
      schema: request.headers()['x-plan-schema'] ?? null,
      rev: request.headers()['x-plan-rev'] ?? null,
      body: request.method() === 'PUT' ? (request.postDataJSON() as PlansCall['body']) : null,
    }
    calls.push(call)
    const { status, body, headers } = answer(request.method(), call)
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
const gets = (calls: PlansCall[]) => calls.filter((call) => call.method === 'GET')

/** `GET` answer of an account that holds nothing, at revision `rev`. */
const emptyAccount = (rev = 0): Answer => ({
  status: 200,
  body: { configured: true, schemaVersion: Number(PLAN_SCHEMA_VERSION), rev, blob: null },
})

/** `PUT` answer of a stored write that produced revision `rev`. */
const stored = (rev: number): Answer => ({
  status: 200,
  body: { configured: true, rev, updatedAt: Date.now() },
})

/** Changes the annual savings and saves the plan — a change sync would push. */
async function editAndSave(page: Page, value: string) {
  await openPanel(page, 'savings')
  const savings = page.locator('#editor-annualSavings')
  await savings.fill(value)
  await savings.blur()
  await page.getByTestId('command-save').click()
  await expect(page.getByTestId('command-save')).toHaveCount(0)
}

/** The sync dot in the account row of the Menu dialog; leaves the dialog closed. */
async function syncStatus(page: Page): Promise<{ phase: string | null; label: string | null }> {
  await page.getByTestId('dashboard-tools').click()
  const status = page.getByRole('dialog').getByTestId('auth-sync-status')
  await expect(status).toBeVisible()
  const result = {
    phase: await status.getAttribute('data-phase'),
    label: await status.getAttribute('aria-label'),
  }
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  return result
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
        ? { status: 409, body: { error: 'outdated-client', schemaVersion: NEWER_SCHEMA } }
        : emptyAccount()
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
    await expect(page.locator('[role="status"][aria-live="polite"]', { has: notice })).toHaveCount(
      1
    )

    // Local edits keep working, but never reach the server again.
    await editAndSave(page, '21000')
    await page.waitForTimeout(PAST_DEBOUNCE_MS)
    expect(puts(calls)).toHaveLength(1)
    // A focus-triggered pull is off too.
    await page.evaluate(() => window.dispatchEvent(new Event('focus')))
    await page.waitForTimeout(500)
    expect(gets(calls)).toHaveLength(1)

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
        ? { status: 409, body: { error: 'outdated-client', schemaVersion: NEWER_SCHEMA } }
        : stored(1)
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

  test('an older server (rollback) pauses sync without asking for a reload', async ({ page }) => {
    const calls = await servePlans(page, () => ({
      status: 409,
      body: { error: 'outdated-server', schemaVersion: 2 },
    }))

    await page.goto('/de/simulation')
    await waitForResults(page)
    await expect.poll(() => gets(calls).length).toBeGreaterThanOrEqual(1)

    await editAndSave(page, '20000')
    await page.waitForTimeout(PAST_DEBOUNCE_MS)
    expect(puts(calls)).toHaveLength(0)

    // Reloading would load the very same build: no card asks for it.
    await expect(page.getByTestId('sync-reload-notice')).toHaveCount(0)
    expect(await syncStatus(page)).toEqual({
      phase: 'server-outdated',
      label: 'Synchronisierung pausiert – der Server läuft gerade mit einer älteren Version',
    })
  })

  test('a newer build on the server suggests a reload but keeps syncing', async ({ page }) => {
    // The hint needs a build id in this bundle, which the server under test
    // only has when started with NEXT_PUBLIC_BUILD_ID (Playwright's own server
    // is) — the unmocked API reports it.
    const probe = await page.request.get('/api/plans')
    const buildId = probe.headers()['x-build-id']
    test.skip(!buildId, 'server under test has no build id (NEXT_PUBLIC_BUILD_ID)')

    let rev = 0
    const newerBuild = { 'x-build-id': `${buildId}-next` }
    const calls = await servePlans(page, (method) =>
      method === 'PUT'
        ? { ...stored((rev += 1)), headers: newerBuild }
        : { ...emptyAccount(rev), headers: newerBuild }
    )

    await page.goto('/en/simulation')
    await waitForResults(page)
    const notice = page.getByTestId('sync-reload-notice')
    await expect(notice).toContainText('New version available — reload to use it.')

    await editAndSave(page, '20000')
    await expect.poll(() => puts(calls).length, { timeout: 10_000 }).toBe(1)
    await editAndSave(page, '21000')
    await expect.poll(() => puts(calls).length, { timeout: 10_000 }).toBe(2)
    // Each push names the revision the one before produced.
    expect(puts(calls).map((call) => call.rev)).toEqual(['0', '1'])
  })
})

test.describe('cloud sync: reads that fail, writes that come too late', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !(await isAuthEnabled(page)),
      'server has no OAuth credentials — start it via Playwright or set AUTH_SECRET/GOOGLE_CLIENT_*'
    )
    await stubSignedIn(page)
  })

  test('a 502 on GET is "offline", not an empty account: nothing is pushed until a pull succeeds', async ({
    page,
  }) => {
    let storeDown = true
    let rev = 0
    const calls = await servePlans(page, (method) => {
      if (method === 'PUT') return stored((rev += 1))
      return storeDown ? { status: 502, body: { error: 'read-failed' } } : emptyAccount(rev)
    })

    await page.goto('/en/simulation')
    await waitForResults(page)
    await expect.poll(() => gets(calls).length).toBeGreaterThanOrEqual(1)

    // The status says so — it does not claim "Synced".
    expect(await syncStatus(page)).toEqual({
      phase: 'offline',
      label: 'Offline (stored on this device)',
    })

    // Saving a change retries the *pull*; while that fails, nothing is pushed.
    const pullsBefore = gets(calls).length
    await editAndSave(page, '20000')
    await page.waitForTimeout(PAST_DEBOUNCE_MS)
    expect(gets(calls).length).toBeGreaterThan(pullsBefore)
    expect(puts(calls)).toHaveLength(0)
    expect((await syncStatus(page)).phase).toBe('offline')

    // The store is back: the next change pulls first, then pushes — against
    // the revision that pull returned.
    storeDown = false
    await editAndSave(page, '21000')
    await expect.poll(() => puts(calls).length, { timeout: 10_000 }).toBe(1)
    const lastPull = calls.map((call) => call.method).lastIndexOf('GET')
    expect(lastPull).toBeLessThan(calls.indexOf(puts(calls)[0]))
    expect(puts(calls)[0].rev).toBe('0')
    await expect.poll(async () => (await syncStatus(page)).phase).toBe('synced')
  })

  test('a 412 on PUT makes the tab pull, merge and push again with the new revision', async ({
    page,
  }) => {
    // Another device wrote while this tab was open: the account is at
    // revision 1 and holds a plan this tab has never seen.
    const remotePlan = {
      id: 'plan-remote',
      name: 'Vom Handy',
      params: {},
      createdAt: 1,
      updatedAt: 2,
    }
    let accountMovedOn = false
    const calls = await servePlans(page, (method, call) => {
      if (method === 'GET') {
        if (!accountMovedOn) return emptyAccount(0)
        return {
          status: 200,
          body: {
            configured: true,
            schemaVersion: Number(PLAN_SCHEMA_VERSION),
            rev: 1,
            blob: {
              schemaVersion: Number(PLAN_SCHEMA_VERSION),
              rev: 1,
              updatedAt: Date.now(),
              plans: [remotePlan],
              deletedPlans: {},
              activePlanId: remotePlan.id,
            },
          },
        }
      }
      if (call.rev === '0') {
        accountMovedOn = true
        return {
          status: 412,
          body: { error: 'rev-mismatch', rev: 1 },
          headers: { 'x-plan-rev': '1' },
        }
      }
      return stored(Number(call.rev) + 1)
    })

    await page.goto('/de/simulation')
    await waitForResults(page)
    await expect.poll(() => gets(calls).length).toBeGreaterThanOrEqual(1)
    expect(puts(calls)).toHaveLength(0)

    await editAndSave(page, '20000')
    await expect.poll(() => puts(calls).length, { timeout: 10_000 }).toBe(2)

    // Refused push, then a pull, then a push based on what the pull returned.
    expect(calls.map((call) => call.method).slice(-3)).toEqual(['PUT', 'GET', 'PUT'])
    expect(puts(calls).map((call) => call.rev)).toEqual(['0', '1'])

    // The second push carries the merge: this tab's plan and the other device's.
    const pushed = (puts(calls)[1].body?.plans ?? []).map((plan) => plan.id)
    expect(pushed).toEqual(['plan-base', 'plan-remote'])

    // …and the other device's plan is now in this tab's plan list.
    const menu = await openPlanMenu(page)
    await expect(menu.getByTestId('plan-menu-option-plan-remote')).toContainText('Vom Handy')
    await page.keyboard.press('Escape')

    await expect.poll(async () => (await syncStatus(page)).phase).toBe('synced')
    // No reload card, no conflict card: nothing diverged.
    await expect(page.getByTestId('sync-reload-notice')).toHaveCount(0)
    await expect(page.getByTestId('sync-conflict-notice')).toHaveCount(0)
  })

  test('a plan changed both here and in the account is kept twice, and the user is told', async ({
    page,
  }) => {
    // The account's own "plan-base" — another device's starter plan, worked in.
    const accountPlan = {
      id: 'plan-base',
      name: 'Base plan',
      nameKey: 'base',
      params: { currentAssets: 123_456 },
      createdAt: 1,
      updatedAt: 2,
    }
    let accountMovedOn = false
    const calls = await servePlans(page, (method, call) => {
      if (method === 'GET') {
        if (!accountMovedOn) return emptyAccount(0)
        return {
          status: 200,
          body: {
            configured: true,
            schemaVersion: Number(PLAN_SCHEMA_VERSION),
            rev: 1,
            blob: {
              schemaVersion: Number(PLAN_SCHEMA_VERSION),
              rev: 1,
              updatedAt: Date.now(),
              plans: [accountPlan],
              deletedPlans: {},
              activePlanId: accountPlan.id,
            },
          },
        }
      }
      if (call.rev === '0') {
        accountMovedOn = true
        return { status: 412, body: { error: 'rev-mismatch', rev: 1 } }
      }
      return stored(Number(call.rev) + 1)
    })

    await page.goto('/de/simulation')
    await waitForResults(page)
    await expect.poll(() => gets(calls).length).toBeGreaterThanOrEqual(1)

    // This device works in its own starter plan and saves.
    await editAndSave(page, '20000')
    await expect.poll(() => puts(calls).length, { timeout: 10_000 }).toBe(2)

    // Neither version replaced the other: the account's keeps the id, this
    // device's went up next to it under a new one.
    const pushed = (puts(calls)[1].body?.plans ?? []).map((plan) => plan.id)
    expect(pushed).toHaveLength(2)
    expect(pushed[0]).toBe('plan-base')
    expect(pushed[1]).toMatch(/^plan-base-c/)

    // The user is told, in the language of the page, and with the name on screen.
    const notice = page.getByTestId('sync-conflict-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('Basisplan (Kopie von diesem Gerät)')
    await notice.getByRole('button', { name: 'Verstanden' }).click()
    await expect(notice).toHaveCount(0)

    // The device keeps looking at its own plan, now under the copy's name…
    await expect(page.getByTestId('plan-menu-trigger')).toContainText(
      'Basisplan (Kopie von diesem Gerät)'
    )
    // …and both plans are in the list.
    const menu = await openPlanMenu(page)
    await expect(menu.getByTestId('plan-menu-option-plan-base')).toContainText('Basisplan')
    await expect(menu.getByTestId(`plan-menu-option-${pushed[1]}`)).toContainText(
      'Basisplan (Kopie von diesem Gerät)'
    )
  })
})
