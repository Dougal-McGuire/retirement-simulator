import { expect, test } from '@playwright/test'

test.describe('simulation dashboard', () => {
  test('shows the plan health hero and tabbed content', async ({ page }) => {
    await page.goto('/en/simulation')

    // Hero tiles. NOTE: 'Success rate' needs exact matching — the sr-only live
    // region also contains the substring "Success rate:" and would otherwise
    // cause a strict-mode violation.
    await expect(page.getByText('Health score')).toBeVisible()
    await expect(page.getByText('Success rate', { exact: true })).toBeVisible()
    await expect(page.getByText('Assets last')).toBeVisible()

    // Tabs
    const overviewTab = page.getByRole('tab', { name: 'Overview' })
    await expect(overviewTab).toBeVisible()
    await expect(overviewTab).toHaveAttribute('data-state', 'active')

    await page.getByRole('tab', { name: 'Scenarios & advice' }).click()
    await expect(page.getByText('Recommendations', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Cashflow & details' }).click()
    await expect(page.getByRole('tab', { name: 'Cashflow & details' })).toHaveAttribute(
      'data-state',
      'active'
    )
  })

  test('creates, renames and switches plans', async ({ page }) => {
    await page.goto('/en/simulation')

    const switcher = page.getByTestId('plan-switcher')
    await expect(switcher).toBeVisible()
    await expect(switcher).toContainText('Base plan')

    // Create
    await page.getByTestId('plan-new').click()
    await page.getByLabel('Plan name').fill('Retire at 60')
    await page.getByRole('button', { name: 'Create plan' }).click()
    await expect(switcher).toContainText('Retire at 60')

    // Duplicate + rename
    await page.getByTestId('plan-duplicate').click()
    await page.getByTestId('plan-rename').click()
    await page.getByLabel('Plan name').fill('Barista FIRE')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(switcher).toContainText('Barista FIRE')

    // Switch back to the base plan
    await page.getByTestId('plan-switcher-select').click()
    await page.getByRole('option', { name: 'Base plan' }).click()
    await expect(switcher).toContainText('Base plan')
  })

  test('compares two plans side by side on demand', async ({ page }) => {
    await page.goto('/en/simulation')

    await page.getByTestId('plan-new').click()
    await page.getByLabel('Plan name').fill('Retire at 60')
    await page.getByRole('button', { name: 'Create plan' }).click()

    await page.getByRole('tab', { name: 'Scenarios & advice' }).click()

    const comparison = page.getByTestId('plan-comparison')
    await expect(comparison).toBeVisible()
    await expect(comparison.getByTestId('plan-comparison-row')).toHaveCount(0)

    await page.getByTestId('plan-comparison-run').click()
    await expect(comparison.getByTestId('plan-comparison-row')).toHaveCount(2, { timeout: 30000 })
    await expect(comparison).toContainText('Median assets at end')
  })

  test('turns a stress-test lever into a plan', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByRole('tab', { name: 'Scenarios & advice' }).click()

    await page.getByTestId('stress-lever-save').first().click()

    await expect(page.getByTestId('plan-switcher')).toContainText('Retire 2 years later')
  })

  test('surfaces warnings for a strained plan', async ({ page }) => {
    await page.addInitScript(() => {
      const params = {
        currentAge: 55,
        retirementAge: 60,
        legalRetirementAge: 67,
        endAge: 90,
        currentAssets: 10000,
        annualSavings: 0,
        annualSavingsGrowthRate: 0,
        monthlyPension: 0,
        oneTimeIncomes: [],
        averageROI: 0.03,
        roiVolatility: 0.15,
        averageInflation: 0.025,
        inflationVolatility: 0.01,
        capitalGainsTax: 26.25,
        customExpenses: [{ id: 'living', name: 'Living', amount: 3000, interval: 'monthly' }],
        withdrawalStrategy: 'vanguardDynamic',
        dsWithdrawalRate: 0.05,
        dsCeilingRate: 0.05,
        dsFloorRate: -0.025,
        simulationRuns: 200,
      }
      window.localStorage.setItem(
        'retirement-simulator-store',
        JSON.stringify({ state: { params, results: null, savedSetups: [] }, version: 0 })
      )
    })

    await page.goto('/en/simulation')

    await expect(page.getByText(/assets run out at age/i)).toBeVisible({ timeout: 20000 })
  })
})
