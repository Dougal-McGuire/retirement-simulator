import {
  expect,
  gotoWorkspace,
  groupHeader,
  nudgeLever,
  openSection,
  readStoredParams,
  test,
  waitForLeversMeasured,
  waitForResults,
} from './helpers/workspace'

/**
 * Failure containment, storage-less browsers, keyboard focus after actions
 * that remove their own button, and the undo toast (UI review, lane "ui").
 */

const STORE_KEY = 'retirement-simulator-store'

test.describe('errors stay where they happen', () => {
  test('a group body whose chunk does not arrive fails inline; the rest keeps working', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    // No idle warm-up of the group bodies, so "Markt & Steuern" (closed to
    // begin with) is fetched when it is opened.
    await page.addInitScript(() => {
      window.requestIdleCallback = () => 0
    })
    await gotoWorkspace(page, '/de/simulation')
    await expect(page.locator('#plan-editor-expenses')).toBeVisible()
    // From now on every chunk fails, like a dropped connection or a deploy.
    let blocking = true
    await page.route('**/_next/static/chunks/**', (route) =>
      blocking ? route.abort('failed') : route.continue()
    )

    await groupHeader(page, 'market').click()
    const panel = page.getByTestId('edit-panel')
    await expect(groupHeader(page, 'market')).toHaveAttribute('aria-expanded', 'true')

    const message = panel.locator('[data-boundary="panel-market"]')
    const loaded = page.locator('#plan-editor-market')
    await expect(message).toBeVisible({ timeout: 15000 })
    await expect(message).toHaveAttribute('data-chunk', 'true')
    await expect(page.getByTestId('error-screen')).toHaveCount(0)

    // The rest of the page is alive: the bar, the result, the other groups
    // and the failed group's own header.
    await expect(page.getByTestId('result-bar')).toBeVisible()
    await expect(page.getByTestId('success-pill')).toHaveAttribute('data-value', /\d/)
    await expect(page.locator('#plan-editor-personal')).toBeVisible()
    await expect(page.locator('#plan-editor-expenses')).toBeVisible()
    await expect(groupHeader(page, 'market')).toBeEnabled()
    await expect(page.locator('#result')).toBeAttached()

    // Connection back: "Erneut versuchen" loads the body in place where the
    // bundler forgets a failed chunk (webpack); Turbopack keeps the failure
    // for the page's life, so the retry fails again and offers "Neu laden",
    // which brings the same group back (the URL hash keeps it open).
    blocking = false
    await message.getByTestId('section-error-retry').click()
    const reload = message.getByTestId('section-error-reload')
    await expect(loaded.or(reload)).toBeVisible({ timeout: 15000 })
    if (await reload.isVisible()) {
      await expect(page).toHaveURL(/#result:market$/)
      await reload.click()
      await waitForResults(page)
    }
    await expect(loaded).toBeVisible({ timeout: 15000 })
    await expect(page.locator('[data-boundary="panel-market"]')).toHaveCount(0)
  })

  test('malformed results in an older stored entry are ignored and recomputed', async ({ page }) => {
    await gotoWorkspace(page, '/de/simulation')
    const raw = await page.evaluate((key) => localStorage.getItem(key), STORE_KEY)
    const stored = JSON.parse(raw!)
    // Results are no longer stored; entries written by older builds carry them.
    stored.state.results = { ages: [], assetPercentiles: {}, params: stored.state.params }
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [
      STORE_KEY,
      JSON.stringify(stored),
    ] as const)
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.reload()
    await waitForResults(page)
    await expect(page.getByTestId('error-screen')).toHaveCount(0)
    await expect(page.getByTestId('section-error')).toHaveCount(0)
    await expect(page.getByTestId('verdict')).toBeVisible()
    expect(errors).toEqual([])
  })
})

test.describe('without web storage', () => {
  for (const path of ['/de/simulation', '/de/setup']) {
    test(`${path} runs in memory and says so once`, async ({ page }) => {
      await page.addInitScript(() => {
        Object.defineProperty(window, 'localStorage', {
          configurable: true,
          get() {
            throw new DOMException('The operation is insecure.', 'SecurityError')
          },
        })
      })
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(String(error)))
      await page.goto(path)
      await expect(page.getByTestId('storage-notice')).toHaveText(
        'Dein Browser blockiert lokalen Speicher – Änderungen gehen beim Schließen verloren.'
      )
      await expect(page.getByTestId('error-screen')).toHaveCount(0)
      if (path.endsWith('simulation')) {
        await waitForResults(page)
        await expect(page.locator('#result')).toBeVisible()
      } else {
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
        await expect(page.getByRole('heading', { level: 2 }).first()).toBeVisible()
      }
      expect(errors).toEqual([])
    })
  }

  test('a full quota does not break the setup wizard', async ({ page }) => {
    await page.addInitScript(() => {
      Storage.prototype.setItem = function () {
        throw new DOMException('The quota has been exceeded.', 'QuotaExceededError')
      }
    })
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(String(error)))
    await page.goto('/de/setup')
    await expect(page.getByTestId('storage-notice')).toBeVisible()
    await expect(page.getByTestId('error-screen')).toHaveCount(0)
    expect(errors).toEqual([])
  })
})

test.describe('focus after actions that remove their own button', () => {
  const activeTestId = (page: import('@playwright/test').Page) =>
    page.evaluate(
      () => document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName
    )

  test('Save and Discard hand focus to the saved marker, or the plan menu on phones', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await gotoWorkspace(page)
    await nudgeLever(page)
    await page.getByTestId('command-save').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('bar-saved')).toBeFocused()

    await nudgeLever(page)
    await page.getByTestId('command-discard').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('bar-saved')).toBeFocused()

    // The marker has its place in the bar from 761 px.
    await page.setViewportSize({ width: 1024, height: 800 })
    await nudgeLever(page)
    await page.getByTestId('command-save').focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('bar-saved')).toBeFocused()

    // On phones the draft row goes away once clean: the plan menu (which
    // names the plan just saved) is the nearest stop.
    await page.setViewportSize({ width: 390, height: 844 })
    await nudgeLever(page)
    await page.getByTestId('command-save').focus()
    await page.keyboard.press('Enter')
    await expect.poll(() => activeTestId(page)).toBe('plan-menu-trigger')
  })

  test('"Übernehmen" keeps focus in the lever list while it re-measures', async ({ page }) => {
    test.setTimeout(90000)
    await gotoWorkspace(page)
    await openSection(page, 'levers')
    const list = await waitForLeversMeasured(page)
    const lever = list.locator('[data-testid="stress-lever"][data-lever="laterRetirement"]')
    const apply = lever.getByTestId('stress-lever-apply')
    await apply.focus()
    await page.keyboard.press('Enter')
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.id))
      .toBe('levers-impact-title')
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(false)
    // Back on the lever's button once the list is live again.
    await expect(list).toHaveAttribute('data-measure', 'ready', { timeout: 45000 })
    await expect(apply).toBeFocused()
  })
})

test.describe('undo toast', () => {
  test('stays until acted on, has a close button and answers Ctrl+Z', async ({ page }) => {
    test.setTimeout(60000)
    await gotoWorkspace(page)
    const slider = await nudgeLever(page)
    await expect(slider).toHaveAttribute('aria-valuenow', '61')
    await page.getByTestId('command-discard').click()
    const toast = page.getByTestId('plan-discarded-toast')
    await expect(toast).toBeVisible()
    await expect(page.getByTestId('plan-discarded-toast-undo')).toHaveAttribute(
      'aria-keyshortcuts',
      'Control+Z Meta+Z'
    )
    // Well past the old 8 s timer.
    await page.waitForTimeout(9000)
    await expect(toast).toBeVisible()

    // Ctrl+Z from wherever focus is (not a text field) runs the undo.
    await page.keyboard.press('Control+z')
    await expect(slider).toHaveAttribute('aria-valuenow', '61')
    await expect(toast).toHaveCount(0)
    await expect.poll(async () => (await readStoredParams(page))?.retirementAge).toBe(61)

    // The close button dismisses without undoing.
    await page.getByTestId('command-discard').click()
    await expect(toast).toBeVisible()
    await page.getByTestId('plan-discarded-toast-close').click()
    await expect(toast).toHaveCount(0)
    await expect(slider).toHaveAttribute('aria-valuenow', '60')
    // …and takes its undo with it.
    await page.keyboard.press('Control+z')
    await expect(slider).toHaveAttribute('aria-valuenow', '60')
  })
})
