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
