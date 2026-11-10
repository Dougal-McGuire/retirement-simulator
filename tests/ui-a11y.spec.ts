import { devices } from '@playwright/test'
import { expect, gotoWorkspace, groupHeader, test, waitForResults } from './helpers/workspace'

/**
 * Help tips on touch, the € display radio group and the cash-flow form's
 * validation (UI review, lane "ui").
 */

test.describe('help tips on a touch screen (iPad)', () => {
  test.use({
    viewport: { width: 1024, height: 1366 },
    hasTouch: true,
    isMobile: true,
    userAgent: devices['iPad Pro 11'].userAgent,
  })

  test('tap toggles the tip; it stays inside the panel; outside tap and Escape close it', async ({
    page,
  }) => {
    await page.goto('/de/simulation#assumptions:market')
    await waitForResults(page)
    // An iPad in portrait: the column is a drawer, open from this width.
    const panel = page.getByTestId('edit-panel')
    await expect(panel).toHaveAttribute('data-mode', 'drawer')
    await expect(groupHeader(page, 'market')).toHaveAttribute('aria-expanded', 'true')
    const trigger = page.locator('#plan-editor-market [data-slot="info-tip"]').first()
    await expect(trigger).toBeVisible()
    await trigger.scrollIntoViewIfNeeded()
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')

    const tip = page.locator('[data-slot="info-tip-content"]')
    await trigger.tap()
    await expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await expect(tip).toBeVisible()
    await expect(tip).toHaveAttribute('role', 'tooltip')

    // Inside the panel and the viewport.
    const box = (await tip.boundingBox())!
    const area = (await panel.boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(area.x - 0.5)
    expect(box.x + box.width).toBeLessThanOrEqual(area.x + area.width + 0.5)
    expect(box.y).toBeGreaterThanOrEqual(0)
    expect(box.y + box.height).toBeLessThanOrEqual(1366)

    // Tap again: closed.
    await trigger.tap()
    await expect(tip).toHaveCount(0)
    await expect(trigger).toHaveAttribute('aria-expanded', 'false')

    // Outside tap closes; the panel stays.
    await trigger.tap()
    await expect(tip).toBeVisible()
    await page.getByTestId('edit-panel-title').tap()
    await expect(tip).toHaveCount(0)
    await expect(panel).toBeVisible()

    // Escape closes the tip first, not the drawer.
    await trigger.tap()
    await expect(tip).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(tip).toHaveCount(0)
    await expect(panel).toBeVisible()
    await expect(page.getByTestId('edit-panel-toggle')).toHaveAttribute('aria-expanded', 'true')
    await expect(trigger).toBeVisible()
  })
})

test('help tips open on hover and keyboard focus with a mouse and keyboard', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/de/simulation#assumptions:market')
  await waitForResults(page)
  const trigger = page.locator('#plan-editor-market [data-slot="info-tip"]').first()
  const tip = page.locator('[data-slot="info-tip-content"]')
  await trigger.scrollIntoViewIfNeeded()
  await trigger.hover()
  await expect(tip).toBeVisible()
  await page.mouse.move(0, 0)
  await expect(tip).toHaveCount(0)

  // Keyboard: focus opens, Tab away closes; nothing inside takes focus.
  await trigger.focus()
  await page.keyboard.press('Shift+Tab')
  await page.keyboard.press('Tab')
  await expect(trigger).toBeFocused()
  await expect(tip).toBeVisible()
  await page.keyboard.press('Tab')
  await expect(tip).toHaveCount(0)
})

test('the € display switch is one radio group with arrow keys', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await gotoWorkspace(page, '/de/simulation')
  const radios = page.getByTestId('display-toggle').getByRole('radio')
  await expect(radios).toHaveCount(2)
  for (const radio of await radios.all()) await expect(radio).toHaveAttribute('type', 'button')
  // One tab stop: the checked radio.
  const tabIndexes = await radios.evaluateAll((els) => els.map((el) => el.getAttribute('tabindex')))
  expect(tabIndexes.filter((value) => value === '0')).toHaveLength(1)

  const checked = page.getByTestId('display-toggle').getByRole('radio', { checked: true })
  await checked.focus()
  const before = await checked.textContent()
  await page.keyboard.press('ArrowRight')
  const now = page.getByTestId('display-toggle').getByRole('radio', { checked: true })
  await expect(now).not.toHaveText(before ?? '')
  await expect(now).toBeFocused()
  await page.keyboard.press('ArrowLeft')
  await expect(page.getByTestId('display-toggle').getByRole('radio', { checked: true })).toHaveText(
    before ?? ''
  )
  // Tab leaves the group instead of visiting the other radio.
  await page.keyboard.press('Tab')
  const inGroup = await page.evaluate(
    () =>
      document.activeElement?.closest('[data-testid="display-toggle"]') !== null &&
      document.activeElement?.closest('[data-testid="display-toggle"]') !== undefined
  )
  expect(inGroup).toBe(false)
})

test.describe('cash-flow form keeps invalid input', () => {
  test('a missing name or amount keeps the form open, marked and focused', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/de/simulation#assumptions:flows')
    await waitForResults(page)
    // "+ Posten" leads the group and opens the form right there, on its name.
    const add = page.getByTestId('cashflow-add-open')
    await expect(add).toHaveText('Posten')
    await add.click()
    await expect(add).toHaveAttribute('aria-expanded', 'true')
    const name = page.locator('#cashflow-name-new')
    const amount = page.locator('#cashflow-amount-new')
    await expect(name).toBeFocused()

    // Amount but no name.
    await amount.fill('250')
    await page.getByTestId('cashflow-add').click()
    await expect(name).toHaveAttribute('aria-invalid', 'true')
    await expect(name).toBeFocused()
    await expect(amount).toHaveValue('250')
    const describedBy = await name.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    await expect(page.locator(`#${describedBy!.split(' ')[0]}`)).toBeVisible()

    // Name but a zero amount.
    await name.fill('Hörgeräte')
    await expect(name).not.toHaveAttribute('aria-invalid', 'true')
    await amount.fill('0')
    await page.getByTestId('cashflow-add').click()
    await expect(amount).toHaveAttribute('aria-invalid', 'true')
    await expect(amount).toBeFocused()
    await expect(name).toHaveValue('Hörgeräte')

    // A one-off with a month but no year is refused too (the month input used
    // to drop anything it could not parse without a word).
    await amount.fill('250')
    await page.locator('#cashflow-frequency-new').click()
    await page.getByRole('option', { name: 'Einmalig' }).click()
    await page.locator('#cashflow-date-new').selectOption('03')
    await page.getByTestId('cashflow-add').click()
    await expect(page.locator('#cashflow-date-new')).toHaveAttribute('aria-invalid', 'true')
    await expect(page.locator('#cashflow-date-new')).toBeFocused()
    await expect(page.getByTestId('cashflow-date-new-error')).toBeVisible()
    const year = String(new Date().getFullYear() + 2)
    await page.locator('#cashflow-date-year-new').selectOption(year)
    await expect(page.locator('#cashflow-date-new')).not.toHaveAttribute('aria-invalid', 'true')

    // Fixed: added. The form folds away and the new row takes focus in view.
    await page.getByTestId('cashflow-add').click()
    await expect(page.getByTestId('cashflow-composer')).toHaveCount(0)
    await expect(add).toHaveAttribute('aria-expanded', 'false')
    const row = page.locator('tr[data-testid^="cashflow-row-"]', { hasText: 'Hörgeräte' })
    await expect(row).toBeInViewport()
    await expect(row.getByRole('switch')).toBeFocused()
    // Opened again, the form starts empty.
    await add.click()
    await expect(name).toHaveValue('')
  })
})
