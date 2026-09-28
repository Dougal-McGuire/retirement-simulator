import { expect, test } from '@playwright/test'
import { isAuthEnabled, stubSignedIn, stubSignedOut, TEST_USER } from './helpers/auth'

test.describe('account entry points', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(
      !(await isAuthEnabled(page)),
      'server has no OAuth credentials — start it via Playwright or set AUTH_SECRET/GOOGLE_CLIENT_*'
    )
  })

  test('landing page offers Google sign-in that leads to the dashboard', async ({ page }) => {
    await stubSignedOut(page)
    await page.goto('/en?stay=1')

    const header = page.getByRole('banner').first()
    await expect(header.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
    await expect(header.getByRole('link', { name: /Launch app/ })).toBeVisible()
  })

  test('a signed-in visitor is forwarded from the landing page to the dashboard', async ({
    page,
  }) => {
    await stubSignedIn(page)
    await page.goto('/en')

    await expect(page).toHaveURL(/\/en\/simulation$/)
    // The compact dashboard carries no account chrome of its own; landing on
    // it is the observable outcome.
    await expect(page.getByTestId('run-button')).toBeVisible()
  })

  test('?stay keeps a signed-in visitor on the landing page with a dashboard shortcut', async ({
    page,
  }) => {
    await stubSignedIn(page)
    await page.goto('/en?stay=1')

    await expect(page).toHaveURL(/\/en\?stay=1$/)
    await expect(page.getByTestId('landing-cta-dashboard')).toHaveAttribute(
      'href',
      '/en/simulation'
    )
    await expect(page.getByTestId('auth-account')).toContainText(TEST_USER.name)
  })

  // The setup wizard mirrors the workspace: account and language live in its
  // Menu dialog.
  test('setup menu shows the account, as the workspace menu does', async ({ page }) => {
    await stubSignedIn(page)

    await page.goto('/en/setup')
    await page.getByTestId('setup-menu').click()
    const menu = page.getByRole('dialog')
    await expect(menu.getByTestId('auth-account')).toContainText(TEST_USER.name)
    await expect(menu.getByTestId('auth-sync-status')).toBeVisible()
  })
})
