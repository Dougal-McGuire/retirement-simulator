import { expect, gotoWorkspace, openPanel, openSection, test } from './helpers/workspace'

test.describe('i18n routing', () => {
  test('redirects root to default locale landing page', async ({ page }) => {
    await page.goto('/')
    await page.waitForURL((url) => url.pathname === '/en', { timeout: 5000 })
    await expect(
      page.getByRole('heading', { level: 1, name: /simulated 5,000 times/i })
    ).toBeVisible()
  })

  test('renders German translations on simulation page', async ({ page }) => {
    await gotoWorkspace(page, '/de/simulation')
    // The workspace in German: the run button, the section index and a lever.
    await expect(page.getByTestId('run-button')).toHaveAccessibleName('Neu berechnen')
    await expect(page.getByTestId('section-index')).toContainText('Ergebnis')
    await expect(page.getByRole('navigation', { name: 'Abschnitte' })).toBeVisible()
    await openSection(page, 'levers')
    await expect(
      page.getByTestId('quick-levers').getByRole('slider', { name: 'Jährliche Sparrate' })
    ).toBeVisible()
  })

  test('localises the seeded cash-flow names in German', async ({ page }) => {
    await gotoWorkspace(page, '/de/simulation')
    await openPanel(page, 'flows')

    // The eight default flows carry a `nameKey`, so they follow the UI
    // language instead of rendering the English strings stored in the plan.
    const list = page.getByTestId('cashflow-list')
    await expect(list).toContainText('Krankenversicherung')
    await expect(list).toContainText('Lebensmittel')
    await expect(list).not.toContainText('Health Insurance')
    await expect(list).not.toContainText('Groceries')
  })

  test('keeps a user-renamed flow verbatim in every language', async ({ page }) => {
    await gotoWorkspace(page)
    await openPanel(page, 'flows')

    const list = page.getByTestId('cashflow-list')
    // The seeded "Groceries" flow keeps the id `food`, so its edit form fields
    // are addressable directly — `.last()` would find the always-present add
    // form further down the card.
    await list.getByRole('button', { name: /^Edit: Groceries/ }).click()
    await page.locator('#cashflow-name-food').fill('Wocheneinkauf')
    await page.getByTestId('cashflow-save-food').click()
    await expect(list).toContainText('Wocheneinkauf')

    // Commit the working copy so the rename survives the reload.
    await page.getByTestId('command-save').click()
    await expect(page.getByTestId('command-save')).toHaveCount(0)

    // The open panel is part of the URL: the German page reopens it.
    await gotoWorkspace(page, '/de/simulation#assumptions:flows')
    await expect(page.getByTestId('edit-panel')).toHaveAttribute('data-panel', 'flows')
    // The user's own text wins over the seeded translation.
    await expect(page.getByTestId('cashflow-list')).toContainText('Wocheneinkauf')
    await expect(page.getByTestId('cashflow-list')).not.toContainText('Lebensmittel')
  })

  test('renders English translations on setup page', async ({ page }) => {
    await page.goto('/en/setup')
    await expect(page.getByRole('heading', { level: 1, name: 'Setup' })).toBeVisible()
    await expect(page.getByRole('spinbutton', { name: 'Current Age' })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible()
  })

  test('links setup input help text to the number field', async ({ page }) => {
    await page.goto('/en/setup')

    await expect(page.getByRole('spinbutton', { name: 'Current Age' })).toHaveAttribute(
      'aria-describedby',
      /currentAge-help/
    )
  })

  test('exposes setup progress to assistive technology', async ({ page }) => {
    await page.goto('/en/setup')

    const progressbar = page.getByRole('progressbar')
    const stepList = page.getByRole('list', { name: 'Setup steps' })

    await expect(stepList).toBeVisible()
    await expect(
      page.getByRole('button', { name: /Personal Information.*Current step/ })
    ).toHaveAttribute('aria-current', 'step')
    await expect(progressbar).toHaveAttribute('aria-valuenow', '25')

    await page.getByRole('button', { name: 'Next', exact: true }).click()
    await expect(
      page.getByRole('button', { name: /Assets & Income.*Current step/ })
    ).toHaveAttribute('aria-current', 'step')
    await expect(progressbar).toHaveAttribute('aria-valuenow', '50')
  })
})

test('<html lang> follows the page locale', async ({ page }) => {
  await page.goto('/de')
  await expect(page.locator('html')).toHaveAttribute('lang', 'de')
  await page.goto('/en')
  await expect(page.locator('html')).toHaveAttribute('lang', 'en')
})
