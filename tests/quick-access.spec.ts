import { expect, gotoWorkspace, openSection, readPersistedState, test } from './helpers/workspace'

test.describe('quick levers', () => {
  test('keeps commands and quick levers in separate accessible regions', async ({ page }) => {
    await gotoWorkspace(page)
    await openSection(page, 'levers')

    // Commands stay in the result bar; the levers live in Stellschrauben.
    const bar = page.getByTestId('result-bar')
    const quick = page.locator('#levers').getByTestId('quick-levers')
    await expect(bar).toBeVisible()
    await expect(quick).toBeVisible()
    await expect(bar.getByRole('slider')).toHaveCount(0)

    for (const name of [
      'Retirement age',
      'Annual savings',
      'Monthly spending',
      'Expected return',
    ]) {
      await expect(quick.getByRole('slider', { name, exact: true })).toBeVisible()
    }

    const display = page.getByTestId('display-toggle')
    await display.getByRole('radio', { name: "Today's €" }).click()
    await expect(display.getByRole('radio', { name: "Today's €" })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })

  test('resets a quick annual-savings what-if to the stored plan value', async ({ page }) => {
    await gotoWorkspace(page)
    await openSection(page, 'levers')
    const quick = page.getByTestId('quick-levers')
    const slider = quick.getByRole('slider', { name: 'Annual savings', exact: true })

    await slider.focus()
    await slider.press('ArrowRight')

    // The reset label comes from i18n (it used to be hard-coded English).
    const reset = quick.getByRole('button', { name: 'Reset Annual savings' })
    await expect(reset).toBeVisible()

    const changed = await readPersistedState(page)
    const baseline = changed?.storedPlan?.annualSavings
    expect(typeof baseline).toBe('number')
    expect(changed?.working?.annualSavings).not.toBe(baseline)

    await reset.click()

    await expect
      .poll(async () => (await readPersistedState(page))?.working?.annualSavings)
      .toBe(baseline)
    await expect(reset).toHaveCount(0)
  })

  test('resets spending by restoring the plan expense streams exactly', async ({ page }) => {
    await gotoWorkspace(page)
    await openSection(page, 'levers')
    const quick = page.getByTestId('quick-levers')
    const slider = quick.getByRole('slider', { name: 'Monthly spending', exact: true })

    await slider.focus()
    await slider.press('ArrowLeft')

    const reset = quick.getByRole('button', { name: 'Reset Monthly spending' })
    await expect(reset).toBeVisible()

    const changed = await readPersistedState(page)
    const baselineExpenses = changed?.storedPlan?.customExpenses
    const baselineFlows = changed?.storedPlan?.cashFlows
    expect(Array.isArray(baselineExpenses)).toBe(true)
    expect(Array.isArray(baselineFlows)).toBe(true)
    expect(changed?.working?.customExpenses).not.toEqual(baselineExpenses)
    expect(changed?.working?.cashFlows).not.toEqual(baselineFlows)

    await reset.click()

    await expect
      .poll(async () => (await readPersistedState(page))?.working?.customExpenses)
      .toEqual(baselineExpenses)
    await expect
      .poll(async () => (await readPersistedState(page))?.working?.cashFlows)
      .toEqual(baselineFlows)
    await expect(reset).toHaveCount(0)
  })

  test('localises the reset labels in German', async ({ page }) => {
    await gotoWorkspace(page, '/de/simulation')
    await openSection(page, 'levers')
    const quick = page.getByTestId('quick-levers')
    const slider = quick.getByRole('slider', { name: 'Jährliche Sparrate', exact: true })
    await slider.focus()
    await slider.press('ArrowRight')
    await expect(
      quick.getByRole('button', { name: 'Jährliche Sparrate zurücksetzen' })
    ).toBeVisible()
  })
})
