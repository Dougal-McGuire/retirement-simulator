import {
  expect,
  expectNoHorizontalOverflow,
  gotoWorkspace,
  leverSlider,
  openPanel,
  openSection,
  sectionHeading,
  test,
} from './helpers/workspace'

test('the index is keyboard-reachable and the panel has one set of controls', async ({ page }) => {
  await gotoWorkspace(page, '/de/simulation')
  const first = page.getByTestId('section-link-result')
  await expect(first).toHaveAttribute('aria-current', 'location')

  // Plain links: Tab walks them in order, Enter jumps and focuses the heading.
  await first.focus()
  await page.keyboard.press('Tab')
  const assumptions = page.getByTestId('section-link-assumptions')
  await expect(assumptions).toBeFocused()
  await page.keyboard.press('Enter')
  const heading = sectionHeading(page, 'assumptions')
  await expect(heading).toBeFocused()
  await expect(heading).toHaveText('Annahmen')
  await expect(assumptions).toHaveAttribute('aria-current', 'location')

  // The person card opens its panel: one editor, no section switcher, no
  // second copy of the levers, the KPIs or a Save button inside it.
  const panel = await openPanel(page, 'person')
  await expect(page.getByRole('dialog', { name: 'Person & Zeitachse' })).toBeVisible()
  await expect(page.getByTestId('plan-section-nav')).toHaveCount(0)
  await expect(panel.getByTestId('quick-levers')).toHaveCount(0)
  await expect(panel.getByTestId('kpi-strip')).toHaveCount(0)
  await expect(panel.getByTestId('command-save')).toHaveCount(0)
  await expect(panel.getByRole('button', { name: 'Speichern', exact: true })).toHaveCount(0)
})

test('shows actual tax deductions and changes the selected year', async ({ page }, testInfo) => {
  await gotoWorkspace(page, '/de/simulation#cashflow')
  const ledger = page.getByTestId('cashflow-ledger')
  await expect(ledger).toContainText('Kapitalertragsteuer')
  await expect(ledger).toContainText('Depotentnahme netto')
  await expect(ledger).toContainText('nicht der Median')
  await ledger.getByRole('combobox', { name: 'Alter' }).selectOption('67')
  await expect(ledger.getByTestId('cashflow-tax-total')).not.toContainText('insgesamt: 0 €')
  await ledger.getByText('Alle Jahre anzeigen', { exact: true }).click()
  await expect(
    ledger.getByRole('region', { name: 'Alle Jahre anzeigen' }).getByRole('table')
  ).toContainText('Steuern auf Renten')
  await page.screenshot({ path: testInfo.outputPath('cashflows-desktop.png'), fullPage: true })
})

test('the menu holds report, language, account and appearance; setup moved to Annahmen', async ({
  page,
}) => {
  await gotoWorkspace(page)
  await page.getByTestId('dashboard-tools').click()
  const menu = page.getByRole('dialog', { name: 'Report and settings' })
  await expect(menu.getByRole('button', { name: 'Generate Report' })).toBeVisible()
  await expect(menu.getByRole('combobox', { name: 'Language' })).toBeVisible()
  await expect(menu.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
  await expect(menu.getByTestId('appearance-switch')).toBeVisible()
  // Plans are managed from the plan menu; the guided setup sits in Annahmen.
  await expect(menu.getByTestId('plan-switcher')).toHaveCount(0)
  await expect(menu.getByTestId('setup-link')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  await expect(page.locator('#assumptions').getByTestId('setup-link')).toHaveAttribute(
    'href',
    '/en/setup'
  )
})

test('spending can increase again after the quick slider reaches zero', async ({ page }) => {
  await gotoWorkspace(page)
  await openSection(page, 'levers')
  const slider = leverSlider(page, 'Monthly spending')
  await expect(slider).toBeVisible()
  await slider.focus()
  await slider.press('Home')
  await expect(slider).toHaveAttribute('aria-valuenow', '0')
  await slider.press('ArrowRight')
  await expect(slider).not.toHaveAttribute('aria-valuenow', '0')
})

test('historical mode disables the assumptions it ignores', async ({ page }) => {
  await gotoWorkspace(page)
  // Model controls are in the Market & taxes panel.
  await openPanel(page, 'market')
  await page.getByTestId('market-model-historical').click()
  await page.keyboard.press('Escape')
  await expect(page.getByTestId('edit-panel')).toHaveCount(0)

  await openSection(page, 'levers')
  await expect(leverSlider(page, 'Expected return')).toHaveAttribute('data-disabled', '')
  await page.getByTestId('more-sliders-toggle').click()
  await expect(
    page.getByTestId('advanced-params').getByRole('slider', { name: 'Return volatility' })
  ).toHaveAttribute('data-disabled', '')
})

test('mobile cash flows and summary fit the viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await gotoWorkspace(page, '/de/simulation')
  await expect(page.getByTestId('dashboard-tools')).toBeInViewport()
  await openSection(page, 'cashflow')
  await expect(page.getByTestId('cashflow-ledger')).toBeVisible()
  // The Menu stays reachable in the pinned KPI row after scrolling.
  await expect(page.getByTestId('dashboard-tools')).toBeInViewport()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('cashflows-mobile.png'), fullPage: true })
})
