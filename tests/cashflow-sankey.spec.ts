import { expect, test } from '@playwright/test'

test('cash-flow diagram follows the selected year and speaks German', async ({ page }) => {
  await page.goto('/de/simulation')
  await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })
  await page.getByTestId('tab-cashflow').click()
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

test('ledger labels open the matching plan-editor section', async ({ page }) => {
  await page.goto('/en/simulation')
  await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })
  await page.getByTestId('tab-cashflow').click()
  await page.getByRole('button', { name: /Capital gains tax – edit in/ }).click()
  await expect(page.getByTestId('tab-plan')).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('#plan-editor-market')).toBeVisible()
})

test('phones get the stacked flows without sideways scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/de/simulation')
  await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })
  await page.getByTestId('tab-cashflow').click()
  const sankey = page.getByTestId('cashflow-sankey')
  await expect(sankey.locator('[data-layout]')).toHaveAttribute('data-layout', 'stacked')
  await expect(page.getByTestId('cashflow-sankey-in')).toContainText('Woher')
  await expect(page.getByTestId('cashflow-sankey-out')).toContainText('Wohin')
  const width = await page.evaluate(() => ({
    viewport: innerWidth,
    content: document.documentElement.scrollWidth,
  }))
  expect(width.content).toBeLessThanOrEqual(width.viewport + 1)
})
