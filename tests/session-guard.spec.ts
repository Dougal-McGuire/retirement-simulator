import type { Page } from '@playwright/test'
import { isAuthEnabled, TEST_USER } from './helpers/auth'
import {
  expect,
  gotoWorkspace,
  leverSlider,
  nudgeLever,
  openPlanMenu,
  test,
  waitForResults,
} from './helpers/workspace'

/**
 * Auth.js' client reports "signed out" for every failed `/api/auth/session`
 * request, and it refetches whenever another tab asks it to (and, before this
 * guard, every time the tab became visible). One failed request used to swap
 * the account's workspace for the anonymous one — the plans gone from the
 * screen, every edit landing in the wrong namespace — and it stayed that way,
 * because Auth.js never asks again once it holds `null`.
 */

const ANONYMOUS_KEY = 'retirement-simulator-store'

type Mode = 'signed-in' | 'offline' | 'server-error' | 'signed-out'

/** Answers the session endpoint from `state.mode`, counting the requests. */
async function stubSession(page: Page) {
  const state = { mode: 'signed-in' as Mode, calls: 0 }
  await page.route('**/api/auth/session', (route) => {
    state.calls += 1
    if (state.mode === 'offline') return route.abort('internetdisconnected')
    if (state.mode === 'server-error') return route.fulfill({ status: 503, body: 'unavailable' })
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body:
        state.mode === 'signed-out'
          ? 'null'
          : JSON.stringify({
              user: TEST_USER,
              expires: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
            }),
    })
  })
  // No cloud store: plans stay on the device (see `stubSignedIn`).
  await page.route('**/api/plans', (route) =>
    route.fulfill({ status: 501, contentType: 'application/json', body: '{}' })
  )
  return state
}

/** What another tab's sign-in / sign-out / page load does: asks every tab to refetch. */
const broadcastSessionChange = (page: Page) =>
  page.evaluate(() => {
    const channel = new BroadcastChannel('next-auth')
    channel.postMessage({ event: 'session', data: { trigger: 'getSession' } })
    channel.close()
  })

/** Names of the stored plans per namespace: the account's, and the anonymous one. */
const storedPlans = (page: Page) =>
  page.evaluate((anonymousKey) => {
    const names = (key: string | null): string[] | null => {
      const raw = key ? window.localStorage.getItem(key) : null
      if (!raw) return null
      return (JSON.parse(raw).state.plans as Array<{ name: string }>).map((plan) => plan.name)
    }
    const accountKey =
      Object.keys(window.localStorage).find((key) => key.startsWith(`${anonymousKey}::u-`)) ?? null
    return { account: names(accountKey), anonymous: names(anonymousKey) }
  }, ANONYMOUS_KEY)

/** Signs in (stubbed) and gives the account a plan that cannot be mistaken. */
async function openAccountWorkspace(page: Page) {
  const session = await stubSession(page)
  await gotoWorkspace(page)
  await openPlanMenu(page)
  await page.getByTestId('plan-menu-rename').click()
  const input = page.locator('#plan-menu-rename-name')
  await input.fill('Account plan')
  await input.press('Enter')
  await expect(page.getByTestId('plan-menu-trigger')).toContainText('Account plan')
  await expect.poll(async () => (await storedPlans(page)).account).toEqual(['Account plan'])
  return session
}

async function accountShown(page: Page): Promise<boolean> {
  await page.getByTestId('dashboard-tools').click()
  const menu = page.getByRole('dialog', { name: 'Settings' })
  await expect(menu).toBeVisible()
  const shown = (await menu.getByTestId('auth-account').count()) > 0
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  return shown
}

test.describe('a session that seems to disappear', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !(await isAuthEnabled(page)),
      'server has no OAuth credentials — start it via Playwright or set AUTH_SECRET/GOOGLE_CLIENT_*'
    )
  })

  test('a tab coming back to the foreground does not refetch the session', async ({ page }) => {
    const session = await openAccountWorkspace(page)

    // The laptop wakes up without network and the tab becomes visible.
    session.mode = 'offline'
    const before = session.calls
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
    await page.waitForTimeout(600)

    expect(session.calls).toBe(before)
    await expect(page.getByTestId('plan-menu-trigger')).toContainText('Account plan')
  })

  for (const failure of ['offline', 'server-error'] as const) {
    test(`a failed session request (${failure}) keeps the account's workspace, and it recovers`, async ({
      page,
    }) => {
      const session = await openAccountWorkspace(page)

      // Another tab makes this one refetch while the request cannot succeed.
      session.mode = failure
      const before = session.calls
      await broadcastSessionChange(page)
      // Auth.js' refetch, then the guard's own probe.
      await expect.poll(() => session.calls).toBeGreaterThanOrEqual(before + 2)

      // The account's plan stays on screen …
      await expect(page.getByTestId('plan-menu-trigger')).toContainText('Account plan')
      // … and an edit lands in the account's namespace, not the anonymous one.
      const slider = await nudgeLever(page)
      const edited = await slider.getAttribute('aria-valuenow')
      await expect.poll(() => storedPlans(page)).toEqual({ account: ['Account plan'], anonymous: null })

      // The network is back: the guard's next probe finds the session and
      // makes Auth.js pick it up again, without a reload.
      session.mode = 'signed-in'
      await expect.poll(() => accountShown(page), { timeout: 15000 }).toBe(true)
      await expect(page.getByTestId('plan-menu-trigger')).toContainText('Account plan')
      await expect(leverSlider(page)).toHaveAttribute('aria-valuenow', edited!)
      await expect(page.getByTestId('result-bar')).toHaveAttribute('data-dirty', 'true')
    })
  }

  test('a real sign-out in another tab still switches to the anonymous workspace', async ({
    page,
  }) => {
    const session = await openAccountWorkspace(page)

    // HTTP 200 with an empty session: the server says nobody is signed in.
    session.mode = 'signed-out'
    await broadcastSessionChange(page)

    await expect(page.getByTestId('plan-menu-trigger')).toContainText('Base plan')
    await waitForResults(page)
    // The account's plans are untouched, and nothing was copied out of them.
    expect((await storedPlans(page)).account).toEqual(['Account plan'])
    expect(await accountShown(page)).toBe(false)
  })
})
