import { expect, test, type Locator, type Page } from '@playwright/test'

/** Every visible child of the strip must sit on one line. */
async function expectSingleRow(strip: Locator) {
  const centers = await strip.evaluate((el) =>
    Array.from(el.children)
      .map((child) => child.getBoundingClientRect())
      .filter((box) => box.width > 0 && box.height > 0)
      .map((box) => box.top + box.height / 2)
  )
  expect(centers.length).toBeGreaterThan(2)
  expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(8)
}

/**
 * Hover until the tooltip shows. Under parallel workers the first hover can
 * land before hydration, when no handler is attached yet.
 */
async function expectTooltip(page: Page, trigger: Locator, text: string) {
  await expect(async () => {
    await page.mouse.move(0, 0)
    await trigger.hover()
    await expect(page.getByRole('tooltip')).toContainText(text, { timeout: 1500 })
  }).toPass({ timeout: 15000 })
}

test.describe('shared app header', () => {
  test.use({ viewport: { width: 1440, height: 900 } })

  test('setup: controls form one row and the page action comes last', async ({ page }) => {
    await page.goto('/en/setup')

    const strip = page.getByTestId('app-header-actions')
    await expect(strip).toBeVisible()
    await expectSingleRow(strip)
    await expect(strip.getByRole('combobox', { name: 'Theme' })).toBeVisible()
    await expect(strip.getByRole('combobox', { name: 'Language' })).toBeVisible()
    await expect(strip.locator(':scope > *').last()).toHaveText('Go to Simulation')
  })

  test('dashboard: same shell, report and setup actions at the end', async ({ page }) => {
    await page.goto('/en/simulation')

    const strip = page.getByTestId('app-header-actions')
    await expect(strip).toBeVisible()
    await expectSingleRow(strip)
    await expect(strip.getByRole('combobox', { name: 'Theme' })).toBeVisible()
    await expect(strip.getByRole('link', { name: 'Setup' })).toBeVisible()
  })

  test('setup header keeps plan context as one chip and folds the hints away', async ({ page }) => {
    await page.goto('/en/setup')

    const chip = page.getByTestId('wizard-plan-context')
    await expect(chip).toBeVisible()
    await expect(chip).not.toHaveAttribute('data-dirty', 'true')
    // The working-copy explanation is a tooltip, not a paragraph.
    await expect(page.getByText('Your answers stay in a working copy')).toHaveCount(0)
    await expectTooltip(page, chip.getByRole('button'), 'working copy')

    const age = page.getByRole('spinbutton', { name: 'Current Age' })
    await age.fill('44')
    await age.blur()
    await expect(chip).toHaveAttribute('data-dirty', 'true')
    await expect(chip).toContainText('Unsaved changes')
  })

  test('field help moves into tooltips but stays wired for assistive technology', async ({
    page,
  }) => {
    await page.goto('/en/setup')

    const help = 'How old are you now?'
    // Still in the DOM for `aria-describedby`, but visually hidden. (Playwright
    // counts a 1×1 px sr-only box as "visible", hence the class check.)
    const helpNode = page.getByText(help, { exact: true })
    await expect(helpNode).toBeAttached()
    await expect(helpNode).toHaveClass(/sr-only/)
    await expect(page.getByRole('spinbutton', { name: 'Current Age' })).toHaveAttribute(
      'aria-describedby',
      /currentAge-help/
    )

    await expectTooltip(page, page.getByRole('button', { name: 'Help: Current Age' }), help)
  })
})
