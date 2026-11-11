import type { Page } from '@playwright/test'
import {
  expect,
  expectNoHorizontalOverflow,
  gotoWorkspace,
  groupHeader,
  openSection,
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

test('ledger labels open the matching group and field in the control column', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await gotoWorkspace(page, '/en/simulation#cashflow')
  const year = page.getByTestId('cashflow-year-select')
  // The table lists what the year holds: a pension year has both taxes.
  await year.selectOption('67')
  // Each label names the group it leads to, as the column names it.
  await expect(
    page
      .getByTestId('cashflow-ledger')
      .getByRole('button', { name: 'Capital gains tax – edit in “Market & taxes”' })
  ).toBeVisible()

  // Field deep links: the group opens on the field that sets the number.
  await editFromLedger(page, 'Capital gains tax')
  await expect(groupHeader(page, 'market')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#editor-capitalGainsTax')).toBeFocused()

  // The pension-tax field lives in a disclosure, which opens for it.
  await editFromLedger(page, 'Income tax')
  await expect(page.locator('#editor-pensionTaxablePortion')).toBeFocused()

  // Group-only targets focus the group's header; the groups opened before
  // stay open beside it.
  for (const label of ['Pensions \\(gross\\)', 'Regular spending', 'Spending budget']) {
    await editFromLedger(page, label)
    await expect(groupHeader(page, 'flows')).toHaveAttribute('aria-expanded', 'true')
    await expect(groupHeader(page, 'flows')).toBeFocused()
    await expect(groupHeader(page, 'flows')).toBeInViewport({ ratio: 1 })
  }
  await expect(groupHeader(page, 'market')).toHaveAttribute('aria-expanded', 'true')

  // A working year: the savings contribution.
  await year.selectOption('55')
  await editFromLedger(page, 'Savings contribution')
  await expect(groupHeader(page, 'savings')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#editor-annualSavings')).toBeFocused()

  // The withdrawal line is set by the rule: the column's Entnahme group.
  await year.selectOption('67')
  await editFromLedger(page, 'Portfolio sale \\(gross\\)')
  await expect(groupHeader(page, 'rule')).toHaveAttribute('aria-expanded', 'true')
  await expect(groupHeader(page, 'rule')).toBeFocused()
  await expect(
    page.locator('[data-testid="withdrawal-strategy-picker"] [aria-pressed="true"]')
  ).toBeVisible()
  // The canvas has not left Geldfluss for any of it: the table is still there.
  await expect(page.getByTestId('cashflow-ledger')).toBeInViewport()
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
