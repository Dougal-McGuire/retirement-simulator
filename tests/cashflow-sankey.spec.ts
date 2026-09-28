import type { Page } from '@playwright/test'
import {
  expect,
  expectNoHorizontalOverflow,
  gotoWorkspace,
  openSection,
  sectionHeading,
  test,
} from './helpers/workspace'

test('cash-flow diagram follows the selected year and speaks German', async ({ page }) => {
  await gotoWorkspace(page, '/de/simulation#cashflow')
  const sankey = page.getByTestId('cashflow-sankey')
  await expect(sankey).toBeVisible()

  // Default: the first retirement year, drawn as a sankey on desktop. One
  // control row says which year and which euros; the sentence reading the
  // diagram is its caption; what the amounts are is said once, under it.
  const select = page.getByTestId('cashflow-year-select')
  await expect(select).toHaveValue('60')
  await expect(page.getByTestId('cashflow-unit')).toHaveText('Jahresbeträge · nominale Euro')
  const caption = page.getByTestId('cashflow-sankey-summary')
  await expect(caption).toContainText('Im Jahr mit 60:')
  await expect(page.getByTestId('cashflow-sankey-note')).toContainText('nicht der Median')
  await expect(page.locator('#cashflow').getByText(/nicht der Median/)).toHaveCount(1)
  const diagram = sankey.locator('[data-layout]')
  await expect(diagram).toHaveAttribute('data-layout', 'sankey')
  await expect(caption).toHaveText(/^Im Jahr mit 60: .*Depotentnahme/)
  // The drawing is one labelled group of focusable nodes; the table under it
  // is its full equivalent.
  await expect(diagram).toHaveAttribute('role', 'group')
  await expect(sankey.locator('[data-node="capitalGainsTax"]')).toContainText('Kapitalertragsteuer')
  await expect(sankey.locator('[data-node="available"]')).toContainText('Verfügbar nach Steuern')

  // A working year: savings flow into the portfolio.
  await select.selectOption('55')
  await expect(caption).toContainText('Im Jahr mit 55:')
  await expect(sankey.locator('[data-node="savings"]')).toContainText('Sparbeitrag')
  await expect(sankey.locator('[data-node="reinvested"]')).toContainText('Einzahlung ins Depot')
  await expect(sankey.locator('[data-node="capitalGainsTax"]')).toHaveCount(0)

  // The whole retirement, summed.
  await select.selectOption({ label: 'Ganzer Ruhestand (Summe)' })
  await expect(caption).toContainText('Über den ganzen Ruhestand (Alter 60–90)')
  await expect(page.getByTestId('cashflow-sum-heading')).toBeVisible()

  // One table under the drawing, grouped like it, always there.
  const table = page.getByTestId('cashflow-table')
  await expect(table).toContainText('Renten (brutto)')
  await expect(table.locator('caption')).toContainText('Alter 60–90, aufsummiert')

  // Choosing a row in the yearly ledger selects that year for the diagram.
  await page.getByText('Alle Jahre anzeigen', { exact: true }).click()
  await page.getByRole('button', { name: 'Alter 70 im Diagramm zeigen' }).click()
  await expect(select).toHaveValue('70')
  await expect(caption).toContainText('Im Jahr mit 70:')
})

/** Clicks a ledger ✎ label by its accessible name ("<label> – edit in “<panel>”"). */
async function editFromLedger(page: Page, label: string) {
  await page
    .getByTestId('cashflow-ledger')
    .getByRole('button', { name: new RegExp(`^${label} – edit in`) })
    .click()
}

test('ledger labels open the matching panel and field', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await gotoWorkspace(page, '/en/simulation#cashflow')
  const panel = page.getByTestId('edit-panel')
  const title = page.getByTestId('edit-panel-title')
  const year = page.getByTestId('cashflow-year-select')
  // The table lists what the year holds: a pension year has both taxes.
  await year.selectOption('67')

  // Field deep links: the panel opens on the field that sets the number.
  await editFromLedger(page, 'Capital gains tax')
  await expect(title).toHaveText('Market & taxes')
  await expect(page.locator('#editor-capitalGainsTax')).toBeFocused()

  // The pension-tax field lives in a disclosure, which opens for it.
  await editFromLedger(page, 'Income tax')
  await expect(panel).toHaveAttribute('data-panel', 'market')
  await expect(page.locator('#editor-pensionTaxablePortion')).toBeFocused()

  // Panel-only targets focus the panel title; one panel at a time, swapped
  // in place.
  for (const label of ['Pensions \\(gross\\)', 'Regular spending', 'Spending budget']) {
    await editFromLedger(page, label)
    await expect(panel).toHaveAttribute('data-panel', 'flows')
    await expect(title).toHaveText('Income & spending')
    await expect(title).toBeFocused()
  }

  // A working year: the savings contribution.
  await year.selectOption('55')
  await editFromLedger(page, 'Savings contribution')
  await expect(panel).toHaveAttribute('data-panel', 'savings')
  await expect(title).toHaveText('Assets & savings')
  await expect(page.locator('#editor-annualSavings')).toBeFocused()

  // The withdrawal line has no panel: it closes the editor and goes to Entnahme.
  await year.selectOption('67')
  await editFromLedger(page, 'Portfolio sale \\(gross\\)')
  await expect(panel).toHaveCount(0)
  await expect(sectionHeading(page, 'withdrawal')).toBeInViewport()
  await expect(
    page.locator('[data-testid="withdrawal-strategy-picker"] [aria-pressed="true"]')
  ).toBeFocused()
})

test('phones get the stacked flows without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await gotoWorkspace(page, '/de/simulation')
  await openSection(page, 'cashflow')
  const sankey = page.getByTestId('cashflow-sankey')
  await expect(sankey.locator('[data-layout]')).toHaveAttribute('data-layout', 'stacked')
  await expect(page.getByTestId('cashflow-sankey-in')).toContainText('Woher')
  await expect(page.getByTestId('cashflow-sankey-out')).toContainText('Wohin')
  await expectNoHorizontalOverflow(page)
})
