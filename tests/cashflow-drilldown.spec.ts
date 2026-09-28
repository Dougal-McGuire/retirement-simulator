import type { Page } from '@playwright/test'
import {
  expect,
  expectNoHorizontalOverflow,
  gotoWorkspace,
  openPanel,
  openSection,
  test,
} from './helpers/workspace'

/*
 * Geldfluss drill-down (docs/specs/2026-09-28-cashflow-drilldown.md): a
 * category of the Sankey opens, in place, into the plan flows it is made of;
 * the table under it is grouped the same way and shares the open state; an
 * item leads to that flow in the flows panel.
 */

const node = (page: Page, id: string) => page.locator(`#cashflow [data-node="${id}"]`)
const items = (page: Page, category: string) =>
  page.locator(`#cashflow .ws-sankey-svg [data-node^="${category}:"]`)
const tableItems = (page: Page, category: string) =>
  page.locator(`[data-testid="cashflow-table"] tr[data-kind="item"][data-row^="${category}:"]`)

async function gotoCashflow(page: Page, locale = 'de') {
  await page.setViewportSize({ width: 1366, height: 900 })
  await gotoWorkspace(page, `/${locale}/simulation#cashflow`)
  await expect(page.getByTestId('cashflow-sankey')).toBeVisible()
}

test('a category opens into its flows — in the diagram and the table at once', async ({
  page,
}) => {
  await gotoCashflow(page)
  const toggle = page.getByTestId('cashflow-toggle-baselineSpending')
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(items(page, 'baselineSpending')).toHaveCount(0)

  // The eight living-cost items: the five largest and "Weitere (3)".
  await node(page, 'baselineSpending').click()
  await expect(items(page, 'baselineSpending')).toHaveCount(6)
  await expect(node(page, 'baselineSpending:health')).toContainText('Krankenversicherung')
  await expect(node(page, 'baselineSpending:more')).toContainText('Weitere (3)')
  await expect(page.locator('#cashflow [data-group="baselineSpending"]')).toContainText(
    'Laufende Ausgaben'
  )
  // The table follows and lists every item, with its share and period.
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  await expect(tableItems(page, 'baselineSpending')).toHaveCount(8)
  await expect(tableItems(page, 'baselineSpending').first()).toContainText(
    /Krankenversicherung.*Gesamter Plan · Monatlich · \d+\s% von „Laufende Ausgaben“/
  )

  // "Weitere" opens the category in full.
  await node(page, 'baselineSpending:more').click()
  await expect(items(page, 'baselineSpending')).toHaveCount(8)
  await expect(node(page, 'baselineSpending:more')).toHaveCount(0)

  // Remembered while stepping through the years.
  await page.getByTestId('cashflow-year-select').selectOption('70')
  await expect(items(page, 'baselineSpending')).toHaveCount(8)

  // The caption collapses it again; the table closes with it.
  await page.locator('#cashflow [data-group="baselineSpending"]').click()
  await expect(items(page, 'baselineSpending')).toHaveCount(0)
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(tableItems(page, 'baselineSpending')).toHaveCount(0)

  // …and the table opens the diagram.
  await toggle.click()
  await expect(items(page, 'baselineSpending')).toHaveCount(6)
})

test('"All items" opens every category that holds flows; "Overview" closes them', async ({
  page,
}) => {
  await gotoCashflow(page, 'en')
  await page.getByTestId('cashflow-year-select').selectOption('70')
  const all = page.getByTestId('cashflow-expand-all')
  await expect(all).toHaveText('All items')
  await all.click()
  await expect(all).toHaveText('Overview')
  await expect(items(page, 'pension')).toHaveCount(1)
  await expect(node(page, 'pension:pension-statutory')).toContainText('Statutory pension')
  await expect(items(page, 'baselineSpending')).toHaveCount(6)
  // Balanced: the items stand exactly for the categories they replace.
  const sources = await page
    .locator('#cashflow .ws-sankey-svg [data-kind]')
    .evaluateAll((els) => els.map((el) => el.getAttribute('data-node')))
  expect(sources).not.toContain('pension')
  expect(sources).not.toContain('baselineSpending')
  await all.click()
  await expect(all).toHaveText('All items')
  await expect(items(page, 'pension')).toHaveCount(0)
})

test('keyboard: one tab stop, arrows between nodes, Enter opens and closes', async ({
  page,
}) => {
  await gotoCashflow(page)
  const svg = page.locator('#cashflow .ws-sankey-svg')
  await expect(svg.locator('[tabindex="0"]')).toHaveCount(1)
  await node(page, 'withdrawal').focus()
  // Right: the middle column; right again: the uses.
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await expect(node(page, 'baselineSpending')).toBeFocused()
  await expect(node(page, 'baselineSpending')).toHaveAttribute('aria-expanded', 'false')
  await page.keyboard.press('Enter')
  const caption = page.locator('#cashflow [data-group="baselineSpending"]')
  await expect(caption).toBeFocused()
  await expect(caption).toHaveAttribute('aria-expanded', 'true')
  await expect(svg.locator('[tabindex="0"]')).toHaveCount(1)
  // Down into the items; the focused one shows its tooltip.
  await page.keyboard.press('ArrowDown')
  await expect(node(page, 'baselineSpending:health')).toBeFocused()
  await expect(page.locator('#cashflow .ws-sankey-frame')).toContainText(
    /Anteil an „Laufende Ausgaben“/
  )
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press(' ')
  await expect(node(page, 'baselineSpending')).toBeFocused()
  await expect(items(page, 'baselineSpending')).toHaveCount(0)
})

test('an item leads to its flow; rows and nodes light each other up', async ({ page }) => {
  await gotoCashflow(page)
  await page.getByTestId('cashflow-toggle-baselineSpending').click()

  // Hovering a table row lights its node and dims the rest.
  await page.locator('tr[data-row="baselineSpending:food"]').hover()
  await expect(node(page, 'baselineSpending:food')).toHaveAttribute('opacity', '1')
  await expect(node(page, 'withdrawal')).toHaveAttribute('opacity', '0.45')
  // …and hovering a node lights its row.
  await node(page, 'capitalGainsTax').hover()
  await expect(page.locator('tr[data-row="capitalGainsTax"]')).toHaveAttribute('data-active', 'true')

  // A diagram item opens the flows panel on that flow's row.
  await node(page, 'baselineSpending:food').click()
  const panel = page.getByTestId('edit-panel')
  await expect(panel).toHaveAttribute('data-panel', 'flows')
  const row = page.locator('#plan-editor-expenses [data-testid="cashflow-row-food"]')
  await expect(row.locator(':focus')).toHaveCount(1)
  await expect(row).toBeInViewport()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  // Focus returns to the node it came from.
  await expect(node(page, 'baselineSpending:food')).toBeFocused()

  // So does its table row.
  await page
    .getByTestId('cashflow-table')
    .getByRole('button', { name: /^Lebensmittel – im Plan bearbeiten$/ })
    .click()
  await expect(panel).toHaveAttribute('data-panel', 'flows')
})

test('switched-off flows are left out and named under the diagram', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await gotoWorkspace(page, '/de/simulation')
  // Switch "Urlaub" off in the flow list.
  await openPanel(page, 'flows')
  await page.locator('#plan-editor-expenses [data-testid="cashflow-switch-vacations"]').click()
  await page.getByTestId('edit-panel-done').click()
  await expect(page.getByTestId('edit-panel')).toHaveCount(0)
  await openSection(page, 'cashflow')
  const line = page.getByTestId('cashflow-disabled-flows')
  await expect(line).toHaveText('1 Posten ausgeschaltet – nicht berechnet')
  await page.getByTestId('cashflow-toggle-baselineSpending').click()
  await expect(tableItems(page, 'baselineSpending')).toHaveCount(7)
  await expect(page.getByTestId('cashflow-table')).not.toContainText('Urlaub')
  await line.getByRole('link').click()
  await expect(page.getByTestId('edit-panel')).toHaveAttribute('data-panel', 'flows')
})

test('phones open the stacked rows the same way', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await gotoWorkspace(page, '/de/simulation')
  await openSection(page, 'cashflow')
  const out = page.getByTestId('cashflow-sankey-out')
  const row = out.getByRole('button', { name: /^Laufende Ausgaben/ })
  await expect(row).toHaveAttribute('aria-expanded', 'false')
  await row.click()
  const caption = out.locator('[data-group="baselineSpending"] > button')
  await expect(caption).toHaveAttribute('aria-expanded', 'true')
  await expect(caption).toBeFocused()
  await expect(out.locator('[data-node^="baselineSpending:"]')).toHaveCount(6)
  await expectNoHorizontalOverflow(page)
  await out.getByRole('button', { name: /^Krankenversicherung/ }).click()
  await expect(page.getByTestId('edit-panel')).toHaveAttribute('data-panel', 'flows')
})

test('the table fits a phone: the share folds under the amount', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await gotoWorkspace(page, '/de/simulation')
  await openSection(page, 'cashflow')
  await page.getByTestId('cashflow-expand-all').click()
  const table = page.getByTestId('cashflow-table')
  await expect(table.locator('tr[data-kind="item"]').first()).toBeVisible()

  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 })
    await expectNoHorizontalOverflow(page)
    const fit = await table.evaluate((element) => {
      const wrap = element.parentElement!
      return { scroll: wrap.scrollWidth, client: wrap.clientWidth }
    })
    expect(fit.scroll, `Aufstellung scrolls sideways at ${width}px`).toBeLessThanOrEqual(fit.client)
    // Two columns: the share column is gone, its figure sits under the amount.
    await expect(table.locator('thead th').nth(2)).toBeHidden()
    const row = table.locator('tr[data-row="baselineSpending"]')
    await expect(row.locator('.ws-flowtable-share-inline')).toBeVisible()
    await expect(row.locator('.ws-flowtable-share-inline')).toHaveText(/^\d+(,\d)?\s%$/)
  }

  // With room again, the share has its own column and is said once.
  await page.setViewportSize({ width: 1366, height: 900 })
  await expect(table.locator('thead th').nth(2)).toBeVisible()
  await expect(table.locator('.ws-flowtable-share-inline').first()).toBeHidden()
})
