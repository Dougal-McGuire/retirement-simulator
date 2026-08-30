import { expect, test, type Page } from '@playwright/test'

const readWorkingState = (page: Page) =>
  page.evaluate(() => {
    const raw = window.localStorage.getItem('retirement-simulator-store')
    if (!raw) return null
    const state = JSON.parse(raw).state
    return state.draftParams ?? state.params
  })

test.describe('quick access command bar', () => {
  test('keeps commands and quick levers in separate accessible rows', async ({ page }) => {
    await page.goto('/en/simulation')

    const primary = page.getByTestId('command-primary-row')
    const quick = page.getByTestId('command-quick-row')
    await expect(primary).toBeVisible()
    await expect(quick).toBeVisible()

    for (const name of ['Retirement age', 'Annual savings', 'Monthly spending', 'Expected return']) {
      await expect(quick.getByRole('slider', { name })).toBeVisible()
    }

    const display = primary.getByTestId('display-toggle')
    await display.getByRole('radio', { name: "Today's €" }).click()
    await expect(display.getByRole('radio', { name: "Today's €" })).toHaveAttribute('data-selected', 'true')
  })

  test('resets a quick annual-savings what-if to the stored plan value', async ({ page }) => {
    await page.goto('/en/simulation')
    const slider = page.getByRole('slider', { name: 'Annual savings' })

    // A freshly loaded simulation renders the stored active plan. Capture that
    // clean working value as the baseline rather than reaching through the
    // persistence/migration representation of the plan list.
    const before = await readWorkingState(page)
    const baseline = before?.annualSavings
    expect(typeof baseline).toBe('number')

    await slider.focus()
    await slider.press('ArrowRight')

    const reset = page.getByRole('button', { name: 'Reset Annual savings' })
    await expect(reset).toBeVisible()
    await reset.click()

    await expect.poll(async () => (await readWorkingState(page))?.annualSavings).toBe(baseline)
    await expect(reset).toHaveCount(0)
  })

  test('resets spending by restoring the plan expense streams exactly', async ({ page }) => {
    await page.goto('/en/simulation')
    const slider = page.getByRole('slider', { name: 'Monthly spending' })

    // The expense streams themselves are the source of truth. Capture the
    // clean plan's streams, perturb them through the quick scaler, then require
    // reset to restore the exact original structures and amounts.
    const before = await readWorkingState(page)
    const baseline = before?.customExpenses
    expect(Array.isArray(baseline)).toBe(true)

    await slider.focus()
    await slider.press('ArrowLeft')

    const reset = page.getByRole('button', { name: 'Reset Monthly spending' })
    await expect(reset).toBeVisible()
    await reset.click()

    await expect.poll(async () => (await readWorkingState(page))?.customExpenses).toEqual(baseline)
    await expect(reset).toHaveCount(0)
  })
})
