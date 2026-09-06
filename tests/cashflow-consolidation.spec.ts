import { expect, test } from '@playwright/test'

test('tabs support keyboard navigation and the editor has one set of controls', async ({
  page,
}) => {
  await page.goto('/de/simulation')
  const first = page.getByTestId('tab-overview')
  await expect(first).toHaveAttribute('aria-selected', 'true')
  await first.focus()
  await first.press('ArrowDown')
  await expect(page.getByTestId('tab-plan')).toBeFocused()
  await page.getByTestId('tab-plan').press('Enter')
  await expect(page.getByRole('tabpanel', { name: 'Mein Plan', exact: true })).toBeVisible()
  await expect(page.getByTestId('command-quick-row')).toHaveCount(0)
  await expect(page.getByTestId('kpi-strip')).toHaveCount(0)
})

test('shows actual tax deductions and changes the selected year', async ({ page }, testInfo) => {
  await page.goto('/de/simulation')
  await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })
  await page.getByTestId('tab-cashflow').click()
  const ledger = page.getByTestId('cashflow-ledger')
  await expect(ledger).toContainText('Kapitalertragsteuer')
  await expect(ledger).toContainText('Depotentnahme netto')
  await expect(ledger).toContainText('nicht der Median')
  await ledger.getByRole('combobox', { name: 'Alter' }).selectOption('67')
  await expect(ledger.getByTestId('cashflow-tax-total')).not.toContainText('insgesamt: 0 €')
  await ledger.getByText('Alle Jahre anzeigen', { exact: true }).click()
  await expect(ledger.getByRole('table')).toContainText('Steuern auf Renten')
  await page.screenshot({ path: testInfo.outputPath('cashflows-desktop.png'), fullPage: true })
})

test('menu restores report, account, language and plan management', async ({ page }) => {
  await page.goto('/en/simulation')
  await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })
  await page.getByTestId('dashboard-tools').click()
  const menu = page.getByRole('dialog')
  await expect(menu).toContainText('Plans and tools')
  await expect(menu.getByTestId('plan-switcher')).toBeVisible()
  await expect(menu.getByTestId('setup-link')).toBeVisible()
  await expect(menu.getByRole('button', { name: 'Generate Report' })).toBeVisible()
})

test('spending can increase again after the quick slider reaches zero', async ({ page }) => {
  await page.goto('/en/simulation')
  await page.getByText('What if …?', { exact: true }).click()
  const slider = page.getByRole('slider', { name: 'Monthly spending' })
  await expect(slider).toBeVisible()
  await slider.focus()
  await slider.press('Home')
  await expect(slider).toHaveAttribute('aria-valuenow', '0')
  await slider.press('ArrowRight')
  await expect(slider).not.toHaveAttribute('aria-valuenow', '0')
})

test('historical mode disables the assumptions it ignores', async ({ page }) => {
  await page.goto('/en/simulation')
  await page.getByTestId('tab-plan').click()
  // Model controls are on the market page of the plan editor.
  await page.getByTestId('plan-section-pill-market').click()
  await page.getByTestId('market-model-historical').click()
  await page.getByTestId('tab-overview').click()
  await page.getByText('What if …?', { exact: true }).click()
  await expect(page.getByRole('slider', { name: 'Expected return' })).toHaveAttribute(
    'data-disabled',
    ''
  )
  await page.getByRole('button', { name: /Advanced/ }).click()
  await expect(page.getByRole('slider', { name: 'Return volatility' })).toHaveAttribute(
    'data-disabled',
    ''
  )
})

test('mobile cash flows and summary fit the viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/de/simulation')
  await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })
  await expect(page.getByTestId('dashboard-tools')).toBeInViewport()
  await page.getByTestId('tab-cashflow').click()
  await expect(page.getByTestId('cashflow-ledger')).toBeVisible()
  const width = await page.evaluate(() => ({
    viewport: innerWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(width.content).toBeLessThanOrEqual(width.viewport + 1)
  await page.screenshot({ path: testInfo.outputPath('cashflows-mobile.png'), fullPage: true })
})
