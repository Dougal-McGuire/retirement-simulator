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
  await expect(sankey).toContainText('Woher das Geld kommt')

  // Default: the first retirement year, drawn as a sankey on desktop.
  const caption = page.getByTestId('cashflow-sankey-caption')
  await expect(caption).toContainText('Alter 60 · nominale Euro')
  await expect(caption).toContainText('nicht der Median')
  const diagram = sankey.locator('[data-layout]')
  await expect(diagram).toHaveAttribute('data-layout', 'sankey')
  await expect(diagram).toHaveAttribute('aria-label', /^Im Jahr mit 60: .*Depotentnahme/)
  await expect(sankey.locator('[data-node="capitalGainsTax"]')).toContainText('Kapitalertragsteuer')
  await expect(sankey.locator('[data-node="available"]')).toContainText('Verfügbar nach Steuern')

  // A working year: savings flow into the portfolio.
  const select = page.getByTestId('cashflow-year-select')
  await select.selectOption('55')
  await expect(caption).toContainText('Alter 55')
  await expect(sankey.locator('[data-node="savings"]')).toContainText('Sparbeitrag')
  await expect(sankey.locator('[data-node="reinvested"]')).toContainText('Einzahlung ins Depot')
  await expect(sankey.locator('[data-node="capitalGainsTax"]')).toHaveCount(0)

  // The whole retirement, summed.
  await select.selectOption({ label: 'Ganzer Ruhestand (Summe)' })
  await expect(caption).toContainText('Ganzer Ruhestand, Alter 60–90 (Summe)')
  await expect(page.getByTestId('cashflow-sum-heading')).toBeVisible()

  // The flows as a table, for keyboard and screen-reader users.
  // A disclosure: aria-controls always names a region that exists.
  const toggle = page.getByTestId('cashflow-sankey-table-toggle')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  const regionId = (await toggle.getAttribute('aria-controls'))!
  const region = page.locator(`[id="${regionId}"]`)
  await expect(region).toHaveCount(1)
  await expect(region).toBeHidden()
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(region).toBeVisible()
  await expect(page.getByTestId('cashflow-sankey-table')).toContainText('Renten (brutto)')

  // Choosing a row in the yearly ledger selects that year for the diagram.
  await page.getByText('Alle Jahre anzeigen', { exact: true }).click()
  await page.getByRole('button', { name: 'Alter 70 im Diagramm zeigen' }).click()
  await expect(select).toHaveValue('70')
  await expect(caption).toContainText('Alter 70')
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

  // Field deep links: the panel opens on the field that sets the number.
  await editFromLedger(page, 'Capital gains tax')
  await expect(title).toHaveText('Market & taxes')
  await expect(page.locator('#editor-capitalGainsTax')).toBeFocused()

  // One panel at a time: the next ledger link swaps the content in place.
  await editFromLedger(page, 'Savings from employment')
  await expect(panel).toHaveAttribute('data-panel', 'savings')
  await expect(title).toHaveText('Assets & savings')
  await expect(page.locator('#editor-annualSavings')).toBeFocused()

  // The pension-tax field lives in a disclosure, which opens for it.
  await editFromLedger(page, 'Tax on pensions and other income')
  await expect(panel).toHaveAttribute('data-panel', 'market')
  await expect(page.locator('#editor-pensionTaxablePortion')).toBeFocused()

  // Panel-only targets focus the panel title.
  for (const label of ['Gross pensions and other income', 'Spending budget']) {
    await editFromLedger(page, label)
    await expect(panel).toHaveAttribute('data-panel', 'flows')
    await expect(title).toHaveText('Income & spending')
    await expect(title).toBeFocused()
  }

  // The withdrawal line has no panel: it closes the editor and goes to Entnahme.
  await editFromLedger(page, 'Gross portfolio withdrawal')
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
