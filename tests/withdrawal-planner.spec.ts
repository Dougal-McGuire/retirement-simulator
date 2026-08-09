import { expect, test } from '@playwright/test'

/**
 * The Dynamic Spending Planner.
 *
 * The plan editor is not force-mounted, so every test opens the Plan tab first.
 * Strategy comparison runs four full simulations and is given a generous
 * timeout for the same reason the plan comparison is.
 */
test.describe('withdrawal planner', () => {
  test('offers four strategies and reacts to the withdrawal rate', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByTestId('tab-plan').click()

    const planner = page.getByTestId('withdrawal-planner')
    await expect(planner).toBeVisible()

    // All four rules, with the shipped plan on the Vanguard guardrails.
    for (const strategy of [
      'fixedReal',
      'vanguardDynamic',
      'guytonKlinger',
      'percentOfPortfolio',
    ]) {
      await expect(planner.getByTestId(`withdrawal-strategy-${strategy}`)).toBeVisible()
    }
    await expect(planner.getByTestId('withdrawal-strategy-vanguardDynamic')).toHaveAttribute(
      'aria-pressed',
      'true'
    )

    // The corridor and the four readouts are there from the start.
    await expect(planner.getByTestId('spending-corridor-chart')).toBeVisible()
    await expect(planner.getByTestId('withdrawal-stat-floor')).toBeVisible()
    await expect(planner.getByTestId('withdrawal-stat-volatility')).toBeVisible()

    const successBefore = await planner.getByTestId('withdrawal-stat-success').innerText()

    // Scrub the withdrawal rate: the readouts follow the re-run.
    const slider = planner.locator('#planner-dsWithdrawalRate [role="slider"]').first()
    await slider.focus()
    for (let i = 0; i < 8; i++) await slider.press('ArrowRight')

    await expect
      .poll(async () => planner.getByTestId('withdrawal-stat-success').innerText(), {
        timeout: 15000,
      })
      .not.toBe(successBefore)
  })

  test('swaps the strategy parameters when the rule changes', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByTestId('tab-plan').click()

    const planner = page.getByTestId('withdrawal-planner')
    await expect(planner.locator('#planner-dsCeilingRate')).toBeVisible()

    // Fixed real reads no parameters at all.
    await planner.getByTestId('withdrawal-strategy-fixedReal').click()
    await expect(planner.locator('#planner-dsWithdrawalRate')).toHaveCount(0)
    await expect(planner).toContainText('no settings')

    // The percentage rule swaps the guardrails for a euro floor.
    await planner.getByTestId('withdrawal-strategy-percentOfPortfolio').click()
    await expect(planner.locator('#planner-dsCeilingRate')).toHaveCount(0)
    const floor = planner.locator('#planner-spendingFloorReal')
    await expect(floor).toBeVisible()

    await floor.fill('36000')
    await floor.blur()
    await expect
      .poll(async () => planner.getByTestId('withdrawal-stat-floor').innerText(), {
        timeout: 15000,
      })
      .toContain('3,000')
  })

  test('compares all four strategies over the same market paths', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByTestId('tab-plan').click()

    const planner = page.getByTestId('withdrawal-planner')
    await planner.getByTestId('strategy-compare-run').click()

    await expect(planner.getByTestId('strategy-compare-row')).toHaveCount(4, { timeout: 60000 })
    await expect(planner.getByTestId('strategy-compare-table')).toContainText('Success rate')
    // Best-per-column marking: at least one winner is called out.
    await expect(planner.getByTestId('strategy-compare-table')).toContainText('Best')

    // The table can drive the plan.
    await planner.getByTestId('strategy-compare-apply-guytonKlinger').click()
    await expect(planner.getByTestId('withdrawal-strategy-guytonKlinger')).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    await expect(planner.getByTestId('strategy-compare-stale')).toBeVisible()
  })

  test('renders the planner in German', async ({ page }) => {
    await page.goto('/de/simulation')
    await page.getByTestId('tab-plan').click()

    const planner = page.getByTestId('withdrawal-planner')
    await expect(planner).toContainText('Entnahmeplaner')
    await expect(planner).toContainText('Prozent vom Depot')
    await expect(planner).toContainText('Guyton-Klinger-Leitplanken')
    await expect(planner.getByTestId('spending-corridor-chart')).toBeVisible()
  })
})
