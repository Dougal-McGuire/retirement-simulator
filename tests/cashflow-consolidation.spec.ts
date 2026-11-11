import {
  expect,
  expectNoHorizontalOverflow,
  gotoWorkspace,
  openPanel,
  openSection,
  sectionHeading,
  test,
} from './helpers/workspace'

/**
 * Migrated to the two-pane workspace (docs/specs/2026-11-10-result-in-view.md).
 * Deleted with the quick levers: "spending can increase again after the quick
 * slider reaches zero" — the slider that scaled every expense is gone (each
 * amount is set in its own row), and with it the code the test guarded.
 */

test('the anchors are keyboard-reachable and the column has one set of controls', async ({
  page,
}) => {
  await gotoWorkspace(page, '/de/simulation')

  // Plain links under the head: Tab walks them in order, Enter jumps and
  // focuses the heading.
  const cashflow = page.getByTestId('section-link-cashflow')
  await cashflow.focus()
  await page.keyboard.press('Tab')
  const withdrawal = page.getByTestId('section-link-withdrawal')
  await expect(withdrawal).toBeFocused()
  await page.keyboard.press('Enter')
  const heading = sectionHeading(page, 'withdrawal')
  await expect(heading).toBeFocused()
  await expect(heading).toHaveText('Entnahme')
  await expect(withdrawal).toHaveAttribute('aria-current', 'location')

  // The column holds each input once: no section switcher, no copy of the
  // result's figures and no Save button inside it.
  const column = await openPanel(page, 'person')
  await expect(page.getByRole('complementary', { name: 'Annahmen' })).toBeVisible()
  await expect(column.getByTestId('plan-section-nav')).toHaveCount(0)
  await expect(column.getByTestId('quick-levers')).toHaveCount(0)
  await expect(column.getByTestId('kpi-strip')).toHaveCount(0)
  await expect(column.getByTestId('command-save')).toHaveCount(0)
  await expect(column.getByRole('button', { name: 'Speichern', exact: true })).toHaveCount(0)
  await expect(page.locator('[id="editor-retirementAge"]')).toHaveCount(1)
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

test('the menu holds language, account and appearance; the report sits in the bar, setup in the column', async ({
  page,
}) => {
  await gotoWorkspace(page)
  // One click from anywhere: the PDF export is a button of the bar.
  await expect(
    page.getByTestId('bar-report').getByRole('button', { name: 'Generate Report' })
  ).toBeVisible()

  await page.getByTestId('dashboard-tools').click()
  const menu = page.getByRole('dialog', { name: 'Settings' })
  await expect(menu.getByRole('combobox', { name: 'Language' })).toBeVisible()
  await expect(menu.getByRole('button', { name: 'Sign in with Google' })).toBeVisible()
  await expect(menu.getByTestId('appearance-switch')).toBeVisible()
  // Not a second copy of the report button where the bar shows it.
  await expect(menu.getByRole('button', { name: 'Generate Report' })).toBeHidden()
  // Plans are managed from the plan menu; the guided setup sits at the foot
  // of the column.
  await expect(menu.getByTestId('plan-switcher')).toHaveCount(0)
  await expect(menu.getByTestId('setup-link')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)

  await expect(page.getByTestId('edit-panel').getByTestId('setup-link')).toHaveAttribute(
    'href',
    '/en/setup'
  )
})

test('historical mode disables the assumptions it ignores', async ({ page }) => {
  await gotoWorkspace(page)
  // Model controls are in the group "Market & taxes".
  await openPanel(page, 'market')
  await page.getByTestId('market-model-historical').click()
  await expect(page.getByTestId('market-model-historical-notice')).toBeVisible()
  // Radix marks a disabled thumb with data-disabled and takes it out of the
  // tab order.
  for (const field of ['editor-averageROI', 'editor-roiVolatility', 'editor-averageInflation']) {
    await expect(page.locator(`#${field} [role="slider"]`)).toHaveAttribute('data-disabled', '')
  }
  // The group's header says which model the plan runs on.
  await expect(page.getByTestId('assumption-card-market')).toContainText(/^Historical \d{4}–\d{4}$/)
})

test('mobile cash flows and summary fit the viewport', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await gotoWorkspace(page, '/de/simulation')
  await expect(page.getByTestId('dashboard-tools')).toBeInViewport()
  await openSection(page, 'cashflow')
  await expect(page.getByTestId('cashflow-ledger')).toBeVisible()
  // The Menu stays reachable in the pinned bar after scrolling.
  await expect(page.getByTestId('dashboard-tools')).toBeInViewport()
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: testInfo.outputPath('cashflows-mobile.png'), fullPage: true })
})
