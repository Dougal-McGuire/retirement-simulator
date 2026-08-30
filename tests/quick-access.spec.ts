import { expect, test, type Page } from '@playwright/test'

const readWorkingState = (page: Page) =>
  page.evaluate(() => {
    const raw = window.localStorage.getItem('retirement-simulator-store')
    if (!raw) return null
    const state = JSON.parse(raw).state
    return {
      params: state.draftParams ?? state.params,
      plan: state.plans.find((plan: { id: string }) => plan.id === state.activePlanId)?.params,
    }
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

    const before = await readWorkingState(page)
    expect(before?.params?.annualSavings).toBe(before?.plan?.annualSavings)

    await slider.focus()
    await slider.press('ArrowRight')

    const reset = page.getByRole('button', { name: 'Reset Annual savings' })
    await expect(reset).toBeVisible()
    await reset.click()

    await expect.poll(async () => {
      const state = await readWorkingState(page)
      return state?.params?.annualSavings
    }).toBe(before?.plan?.annualSavings)
    await expect(reset).toHaveCount(0)
  })

  test('resets spending by restoring the plan expense streams exactly', async ({ page }) => {
    await page.goto('/en/simulation')
    const slider = page.getByRole('slider', { name: 'Monthly spending' })

    const before = await readWorkingState(page)
    expect(before?.params?.customExpenses).toEqual(before?.plan?.customExpenses)

    await slider.focus()
    await slider.press('ArrowLeft')

    const reset = page.getByRole('button', { name: 'Reset Monthly spending' })
    await expect(reset).toBeVisible()
    await reset.click()

    await expect.poll(async () => {
      const state = await readWorkingState(page)
      return state?.params?.customExpenses
    }).toEqual(before?.plan?.customExpenses)
    await expect(reset).toHaveCount(0)
  })
})
