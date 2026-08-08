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
    await page.getByRole('option', { name: /Base plan/ }).click()
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

    // Assumptions are part of the comparison, not just outcomes.
    const assumptions = comparison.getByTestId('plan-comparison-assumptions')
    await expect(assumptions).toBeVisible()
    await assumptions.getByRole('button').first().click()
    await expect(assumptions).toContainText('Retirement age')
  })

  test('needs two plans selected before it can run a comparison', async ({ page }) => {
    await page.goto('/en/simulation')

    await page.getByTestId('plan-new').click()
    await page.getByLabel('Plan name').fill('Retire at 60')
    await page.getByRole('button', { name: 'Create plan' }).click()

    await page.getByRole('tab', { name: 'Scenarios & advice' }).click()

    const comparison = page.getByTestId('plan-comparison')
    const options = comparison.getByTestId('plan-comparison-option')

    // Chips start pre-selected, and the empty state says so.
    await expect(options.filter({ has: page.locator('[aria-checked="true"]') })).toHaveCount(0)
    await expect(comparison).toContainText('already selected')

    await options.first().click()
    await expect(page.getByTestId('plan-comparison-run')).toBeDisabled()
    await expect(page.getByTestId('plan-comparison-hint')).toContainText('at least 2')
  })

  test('turns a stress-test lever into a plan without switching to it', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByRole('tab', { name: 'Scenarios & advice' }).click()

    await page.getByTestId('stress-lever-save').first().click()

    // The dialog explains the lineage and the parameter change before saving.
    const dialog = page.getByTestId('scenario-plan-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Base plan')
    await expect(dialog.getByTestId('scenario-plan-changes')).toBeVisible()

    await dialog.getByTestId('scenario-plan-confirm').click()

    // The active plan is untouched; switching is offered in the toast.
    await expect(page.getByTestId('plan-switcher')).toContainText('Base plan')
    const toast = page.getByTestId('plan-created-toast')
    await expect(toast).toBeVisible()
    await toast.getByTestId('plan-created-toast-switch').click()
    await expect(page.getByTestId('plan-switcher')).not.toContainText('Base plan')
  })

  test('keeps edits in a working copy until they are saved to the plan', async ({ page }) => {
    await page.goto('/en/simulation')

    const badge = page.getByTestId('plan-dirty-badge')
    await expect(badge).toContainText('Saved')

    // Edit through the full plan editor.
    await page.getByTestId('tab-plan').click()
    const assets = page.locator('#editor-currentAssets')
    await assets.fill('900000')
    await assets.blur()

    await expect(badge).toContainText('Unsaved changes')
    await expect(page.getByTestId('plan-dirty-actions')).toBeVisible()

    // Revert throws the working copy away and restores the stored plan.
    await page.getByTestId('plan-revert-draft').click()
    await expect(badge).toContainText('Saved')
    await expect(assets).toHaveValue(/630/)

    // Saving writes the working copy into the plan.
    await assets.fill('700000')
    await assets.blur()
    await expect(badge).toContainText('Unsaved changes')
    await page.getByTestId('plan-save-draft').click()
    await expect(badge).toContainText('Saved')

    const stored = await page.evaluate(() => {
      const raw = window.localStorage.getItem('retirement-simulator-store')
      const parsed = JSON.parse(raw as string)
      return {
        planAssets: parsed.state.plans[0].params.currentAssets,
        draft: parsed.state.draftParams,
      }
    })
    expect(stored.planAssets).toBe(700000)
    expect(stored.draft).toBeNull()
  })

  test('asks before switching plans with unsaved changes', async ({ page }) => {
    await page.goto('/en/simulation')

    await page.getByTestId('plan-new').click()
    await page.getByLabel('Plan name').fill('Retire at 60')
    await page.getByRole('button', { name: 'Create plan' }).click()

    await page.getByTestId('tab-plan').click()
    const savings = page.locator('#editor-annualSavings')
    await savings.fill('12000')
    await savings.blur()
    await expect(page.getByTestId('plan-dirty-badge')).toContainText('Unsaved changes')

    await page.getByTestId('plan-switcher-select').click()
    await page.getByRole('option', { name: /Base plan/ }).click()

    const guard = page.getByTestId('plan-switch-guard')
    await expect(guard).toBeVisible()
    await guard.getByTestId('plan-switch-discard').click()

    await expect(page.getByTestId('plan-switcher')).toContainText('Base plan')
    const savingsPerPlan = await page.evaluate(() => {
      const parsed = JSON.parse(window.localStorage.getItem('retirement-simulator-store') as string)
      return parsed.state.plans.map((plan: { params: { annualSavings: number } }) => plan.params.annualSavings)
    })
    // The abandoned edit never reached either stored plan.
    expect(savingsPerPlan.every((value: number) => value === 48000)).toBe(true)
  })

  test('confirms before resetting a plan and offers an undo', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByTestId('tab-plan').click()

    const assets = page.locator('#editor-currentAssets')
    await assets.fill('900000')
    await assets.blur()

    await page.getByTestId('plan-editor-reset').click()
    const dialog = page.getByTestId('plan-reset-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog).toContainText('Reset THIS plan to defaults?')
    await dialog.getByTestId('plan-reset-confirm').click()

    await expect(assets).toHaveValue(/630/)
    await page.getByRole('button', { name: 'Undo' }).first().click()
    await expect(assets).toHaveValue(/900/)
  })

  test('does not touch a plan when the wizard session is abandoned', async ({ page }) => {
    await page.goto('/en/setup')
    await expect(page.getByTestId('wizard-plan-context')).toContainText('Base plan')

    const age = page.getByLabel('Current Age')
    await age.fill('44')
    await age.blur()

    // Walk away without finishing the wizard.
    await page.goto('/en/simulation')

    const state = await page.evaluate(() => {
      const parsed = JSON.parse(window.localStorage.getItem('retirement-simulator-store') as string)
      return {
        planAge: parsed.state.plans[0].params.currentAge,
        draftAge: parsed.state.draftParams?.currentAge ?? null,
      }
    })
    expect(state.planAge).toBe(55)
    expect(state.draftAge).toBe(44)
    await expect(page.getByTestId('plan-dirty-badge')).toContainText('Unsaved changes')
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
