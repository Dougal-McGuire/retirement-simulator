import { expect, test, type Page } from '@playwright/test'

const readPersistedState = (page: Page) =>
  page.evaluate(() => {
    const raw = window.localStorage.getItem('retirement-simulator-store')
    if (!raw) return null
    const state = JSON.parse(raw).state
    const plan = state.plans?.find((candidate: { id: string }) => candidate.id === state.activePlanId)
    return {
      working: state.draftParams ?? state.params,
      storedPlan: plan?.params,
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

    await slider.focus()
    await slider.press('ArrowRight')

    const reset = page.getByRole('button', { name: 'Reset Annual savings' })
    await expect(reset).toBeVisible()

    const changed = await readPersistedState(page)
    const baseline = changed?.storedPlan?.annualSavings
    expect(typeof baseline).toBe('number')
    expect(changed?.working?.annualSavings).not.toBe(baseline)

    await reset.click()

    await expect.poll(async () => (await readPersistedState(page))?.working?.annualSavings).toBe(baseline)
    await expect(reset).toHaveCount(0)
  })

  test('resets spending by restoring the plan expense streams exactly', async ({ page }) => {
    await page.goto('/en/simulation')
    const slider = page.getByRole('slider', { name: 'Monthly spending' })

    await slider.focus()
    await slider.press('ArrowLeft')

    const reset = page.getByRole('button', { name: 'Reset Monthly spending' })
    await expect(reset).toBeVisible()

    const changed = await readPersistedState(page)
    const baselineExpenses = changed?.storedPlan?.customExpenses
    const baselineFlows = changed?.storedPlan?.cashFlows
    expect(Array.isArray(baselineExpenses)).toBe(true)
    expect(Array.isArray(baselineFlows)).toBe(true)
    expect(changed?.working?.customExpenses).not.toEqual(baselineExpenses)
    expect(changed?.working?.cashFlows).not.toEqual(baselineFlows)

    await reset.click()

    await expect.poll(async () => (await readPersistedState(page))?.working?.customExpenses).toEqual(baselineExpenses)
    await expect.poll(async () => (await readPersistedState(page))?.working?.cashFlows).toEqual(baselineFlows)
    await expect(reset).toHaveCount(0)
  })
})
