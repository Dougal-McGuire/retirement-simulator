import type { Page } from '@playwright/test'
import { expect, gotoWorkspace, test, waitForResults } from './helpers/workspace'

/**
 * A corrected engine gives a stored plan other numbers than the release
 * before. Someone who knew their plan at 95% must be told once why it now says
 * something else — and never again after "Got it".
 */

const STORE_KEY = 'retirement-simulator-store'

/** Rewrites the stored entry into one a build from before `calcVersion` left. */
async function leaveOlderEntry(page: Page, rate: number | null) {
  await page.evaluate(
    ([key, oldRate]) => {
      const entry = JSON.parse(window.localStorage.getItem(key as string)!)
      delete entry.state.calcVersion
      delete entry.state.ratesBeforeCalcChange
      entry.state.planSuccessRates = oldRate === null ? {} : { [entry.state.activePlanId]: oldRate }
      window.localStorage.setItem(key as string, JSON.stringify(entry))
    },
    [STORE_KEY, rate] as const
  )
}

test.describe('the "calculation corrected" notice', () => {
  test('names the old and the new rate of the open plan, until dismissed', async ({ page }) => {
    await gotoWorkspace(page, '/de/simulation')
    await expect(page.getByTestId('calc-change-notice')).toHaveCount(0)

    await leaveOlderEntry(page, 12)
    await page.reload()
    await waitForResults(page)

    const notice = page.getByTestId('calc-change-notice')
    await expect(notice).toBeVisible()
    await expect(notice).toContainText('Berechnung korrigiert')
    await expect(page.getByTestId('calc-change-notice-rates')).toContainText(
      /vorher 12\s%, jetzt \d+\s%/
    )

    // Not a one-shot toast: it is still there after a reload.
    await page.reload()
    await waitForResults(page)
    await expect(page.getByTestId('calc-change-notice')).toBeVisible()

    await page.getByTestId('calc-change-notice-dismiss').click()
    await expect(page.getByTestId('calc-change-notice')).toHaveCount(0)

    await page.reload()
    await waitForResults(page)
    await expect(page.getByTestId('calc-change-notice')).toHaveCount(0)
    const stored = await page.evaluate(
      (key) => JSON.parse(window.localStorage.getItem(key)!).state,
      STORE_KEY
    )
    expect(stored.ratesBeforeCalcChange).toBeNull()
    expect(stored.calcVersion).toBe(2)
  })

  test('stays away when the stored entry never remembered a rate', async ({ page }) => {
    await gotoWorkspace(page, '/de/simulation')
    await leaveOlderEntry(page, null)
    await page.reload()
    await waitForResults(page)
    await expect(page.getByTestId('calc-change-notice')).toHaveCount(0)
  })

  test('is not shown away from the workspace', async ({ page }) => {
    await gotoWorkspace(page, '/de/simulation')
    await leaveOlderEntry(page, 12)
    await page.goto('/de')
    await expect(page.getByTestId('explore-example-plan').first()).toBeVisible()
    await expect(page.getByTestId('calc-change-notice')).toHaveCount(0)
  })
})
