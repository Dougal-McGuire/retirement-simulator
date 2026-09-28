import { expect, test, type Locator, type Page } from '@playwright/test'

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

  test('setup: workspace toolbar with plan, overview link and menu in one row', async ({
    page,
  }) => {
    await page.goto('/en/setup')

    // The wizard shares the workspace chrome: plan context on the left, the
    // way back to the overview and the account/language menu on the right.
    const toolbar = page.locator('.setup-toolbar')
    await expect(toolbar).toBeVisible()
    const actions = toolbar.locator('.workspace-actions')
    const rowCenters = await Promise.all(
      [page.getByTestId('wizard-plan-context'), ...(await actions.locator(':scope > *').all())].map(
        async (item) => {
          const box = (await item.boundingBox())!
          return box.y + box.height / 2
        }
      )
    )
    expect(rowCenters).toHaveLength(3)
    expect(Math.max(...rowCenters) - Math.min(...rowCenters)).toBeLessThan(8)
    await expect(actions.locator(':scope > *').first()).toHaveText('Skip for now')
    await expect(actions.locator(':scope > *').last()).toHaveText('Menu')
    await expect(page.getByTestId('app-header-actions')).toHaveCount(0)

    await page.getByTestId('setup-menu').click()
    await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Language' })).toBeVisible()
  })

  // The simulation page no longer uses the shared header (compact redesign);
  // its chrome is covered in dashboard.spec.ts.

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
