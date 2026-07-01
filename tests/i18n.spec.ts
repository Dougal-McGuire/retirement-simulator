import { expect, test } from '@playwright/test'

test.describe('i18n routing', () => {
  test('redirects root to default locale', async ({ page }) => {
    await page.goto('/')
    await page.waitForURL((url) => url.pathname === '/en/setup', { timeout: 5000 })
    await expect(page.getByRole('heading', { level: 1, name: 'Setup' })).toBeVisible()
  })

  test('renders German translations on simulation page', async ({ page }) => {
    await page.goto('/de/simulation')
    await expect(
      page.getByRole('heading', { level: 1, name: 'Ruhestandssimulation' })
    ).toBeVisible()
    await expect(page.getByText('Vermögens- und Ausgabenprojektion')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Keine Daten' })).toBeVisible()
  })

  test('renders English translations on setup page', async ({ page }) => {
    await page.goto('/en/setup')
    await expect(page.getByRole('heading', { level: 1, name: 'Setup' })).toBeVisible()
    await expect(page.getByLabel('Current Age')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Next', exact: true })).toBeVisible()
  })

  test('links setup input help text to the number field', async ({ page }) => {
    await page.goto('/en/setup')

    await expect(page.getByLabel('Current Age')).toHaveAttribute(
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
