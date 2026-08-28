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

    // Duplicate asks for a name up front (and suggests a numbered sibling)
    // instead of silently minting "Retire at 60 (copy)".
    await page.getByTestId('plan-duplicate').click()
    const copyName = page.getByLabel('Name for the copy')
    await expect(copyName).toHaveValue('Retire at 60 2')
    await copyName.fill('Retire at 62')
    await page.getByRole('button', { name: 'Duplicate plan' }).click()
    await expect(switcher).toContainText('Retire at 62')

    // Rename
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
    await page.getByTestId('plan-section-pill-income').click()
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
    await page.getByTestId('plan-section-pill-income').click()
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
      return parsed.state.plans.map(
        (plan: { params: { annualSavings: number } }) => plan.params.annualSavings
      )
    })
    // The abandoned edit never reached either stored plan.
    expect(savingsPerPlan.every((value: number) => value === 48000)).toBe(true)
  })

  test('confirms before resetting a plan and offers an undo', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByTestId('tab-plan').click()
    await page.getByTestId('plan-section-pill-income').click()

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

    const age = page.getByRole('spinbutton', { name: 'Current Age' })
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

test.describe('market model and glide path', () => {
  test('switches to a historical backtest and freezes the inputs it ignores', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByTestId('tab-plan').click()
    await page.getByTestId('plan-section-pill-market').click()

    await page.getByTestId('market-model-historical').click()
    await expect(page.getByTestId('market-model-historical-notice')).toContainText(
      '125 start years'
    )

    // The assumptions the record supplies are visible but inert.
    await expect(page.locator('#editor-averageROI')).toHaveAttribute('aria-disabled', 'true')
    await expect(page.locator('#editor-simulationRuns')).toBeDisabled()

    const badge = page.getByTestId('market-model-badge')
    await expect(badge).toBeVisible()
    await expect(badge).toContainText('125 paths')

    // Deterministic: the same plan replayed gives exactly the same number.
    const readRate = () =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem('retirement-simulator-store')
        return raw ? (JSON.parse(raw).state?.results?.successRate ?? null) : null
      })

    await expect.poll(readRate).not.toBeNull()
    const first = await readRate()
    await page.reload()
    await expect(page.getByTestId('market-model-badge')).toBeVisible()
    await expect.poll(readRate).toBe(first)
  })

  test('narrows the outcome band when the glide path is switched on', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByTestId('tab-plan').click()
    await page.getByTestId('plan-section-pill-market').click()

    const spread = () =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem('retirement-simulator-store')
        if (!raw) return null
        const results = JSON.parse(raw).state?.results
        if (!results) return null
        const last = results.ages.length - 1
        return Math.round(results.assetPercentiles.p90[last] - results.assetPercentiles.p10[last])
      })

    await expect.poll(spread).not.toBeNull()
    const allEquity = (await spread()) as number

    await page.getByTestId('glide-path-toggle').click()
    await expect(page.getByTestId('equity-glide-sparkline')).toBeVisible()
    await expect.poll(spread).toBeLessThan(allEquity)
  })
})

test.describe('unified cash flows', () => {
  test('adds a windowed income and a one-off expense, and moves the plan', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByTestId('tab-plan').click()
    await page.getByTestId('plan-section-pill-cashFlows').click()

    const card = page.locator('#plan-editor-expenses')
    await expect(card.getByTestId('cashflow-timeline')).toBeVisible()

    // A rental income that runs from 62 to 70 — the thing the old expenses-only
    // editor could not express at all.
    await card.getByTestId('cashflow-kind-income').click()
    await card.locator('#cashflow-name-new').fill('Rental income')
    await card.locator('#cashflow-amount-new').fill('900')
    await card.locator('#cashflow-start-new').fill('62')
    await card.locator('#cashflow-end-new').fill('70')
    await card.getByTestId('cashflow-add').click()

    await expect(card.getByRole('cell', { name: /Income Rental income/i })).toBeVisible()
    // Uppercased by CSS, so match case-insensitively.
    await expect(card.getByRole('cell', { name: /age 62.70/i })).toBeVisible()

    // ...and a single roof repair at 64.
    await card.getByTestId('cashflow-kind-expense').click()
    await card.locator('#cashflow-name-new').fill('Roof renovation')
    await card.locator('#cashflow-amount-new').fill('30000')
    await card.locator('#cashflow-frequency-new').click()
    await page.getByRole('option', { name: 'One-off' }).click()
    await card.locator('#cashflow-start-new').fill('64')
    await card.getByTestId('cashflow-add').click()

    await expect(card.getByRole('cell', { name: /at age 64/i })).toBeVisible()

    const stored = () =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem('retirement-simulator-store')
        if (!raw) return null
        const parsed = JSON.parse(raw)
        const params = parsed.state?.draftParams ?? parsed.state?.params
        if (!params) return null
        return {
          version: parsed.version,
          flows: params.cashFlows?.length ?? 0,
          // The legacy projections must stay in sync — every older consumer
          // (report, insights, saved plans) still reads them.
          expenses: params.customExpenses?.length ?? 0,
          windowed: (params.cashFlows ?? []).filter(
            (flow: { startAge?: number }) => flow.startAge !== undefined
          ).length,
        }
      })

    await expect.poll(stored).toEqual({ version: 3, flows: 11, expenses: 8, windowed: 2 })
  })
})

test.describe('German taxes and the legacy goal', () => {
  test('edits German tax assumptions and reports the resulting tax drag', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByTestId('tab-plan').click()
    await page.getByTestId('plan-section-pill-market').click()

    const tax = page.getByTestId('tax-block')
    await expect(tax).toBeVisible()
    // The real terms, not a generic "tax rate" euphemism.
    await expect(tax).toContainText('Sparerpauschbetrag')
    await expect(tax).toContainText('Teilfreistellung')
    await expect(tax).toContainText('Abgeltungsteuer')

    // The allowance readout follows the assessment switch.
    await expect(tax).toContainText('€1,000 per year')
    await page.getByTestId('household-type-couple').click()
    await expect(tax).toContainText('€2,000 per year')

    // The drag is measured by the engine, so it has to be a real percentage.
    await expect(page.getByTestId('tax-drag-readout')).toContainText(/≈\d/)
  })

  test('scores a legacy goal separately from plain survival', async ({ page }) => {
    await page.goto('/en/simulation')

    const card = page.getByTestId('legacy-goal-card')
    await expect(card).toBeVisible()
    // No goal: the two rates agree and the card says the goal is off.
    await expect(page.getByTestId('legacy-goal-disabled-hint')).toBeVisible()
    const funded = card.getByTestId('legacy-goal-funded-value')
    const survives = card.getByTestId('legacy-goal-survives-value')
    await expect
      .poll(async () => (await funded.innerText()) === (await survives.innerText()))
      .toBe(true)

    const target = page.locator('#editor-legacyTargetReal')
    await target.fill('300000')
    await target.blur()

    // The goal is a strictly harder bar, and the gauge caption says so.
    await expect(page.getByTestId('legacy-goal-disabled-hint')).toHaveCount(0)
    await expect(card).toContainText(/above target|below target|Right on target/)
    await expect(page.getByTestId('hero-depletion-detail')).toBeVisible()
    await expect
      .poll(async () => (await funded.innerText()) === (await survives.innerText()))
      .toBe(false)
  })
})

test.describe('onboarding, overlays and template ergonomics', () => {
  test('greets a first-time visitor once and never again', async ({ page }) => {
    await page.goto('/en/simulation')

    const strip = page.getByTestId('welcome-strip')
    await expect(strip).toBeVisible()

    // Each chip names where the thing it describes actually lives.
    await strip.getByTestId('welcome-chip-compare').click()
    await expect(page.getByRole('tab', { name: 'Scenarios & advice' })).toHaveAttribute(
      'data-state',
      'active'
    )

    await strip.getByTestId('welcome-dismiss').click()
    await expect(strip).toHaveCount(0)

    // The dismissal is persisted, so a reload does not bring it back.
    await page.reload()
    await expect(page.getByTestId('welcome-strip')).toHaveCount(0)
  })

  test('renders toasts as a fixed overlay rather than inside the page flow', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByRole('tab', { name: 'Scenarios & advice' }).click()
    await page.getByTestId('stress-lever-save').first().click()
    await page.getByTestId('scenario-plan-dialog').getByTestId('scenario-plan-confirm').click()

    const toast = page.getByTestId('plan-created-toast')
    await expect(toast).toBeVisible()

    // Bottom-right of the viewport, out of the reading column — not wedged
    // over the tab strip where it used to land.
    const box = (await toast.boundingBox())!
    const viewport = page.viewportSize()!
    expect(box.y).toBeGreaterThan(viewport.height / 2)
    expect(box.x + box.width).toBeGreaterThan(viewport.width * 0.6)

    // And it is inside a `position: fixed` container, so scrolling cannot move
    // it into the content.
    const positioned = await toast.evaluate((node) => {
      let el: HTMLElement | null = node as HTMLElement
      while (el) {
        if (getComputedStyle(el).position === 'fixed') return true
        el = el.parentElement
      }
      return false
    })
    expect(positioned).toBe(true)
  })

  test('adds a second pension with its own start age next to the statutory one', async ({
    page,
  }) => {
    await page.goto('/en/simulation')
    await page.getByTestId('tab-plan').click()
    await page.getByTestId('plan-section-pill-cashFlows').click()

    const card = page.locator('#plan-editor-expenses')
    const list = card.getByTestId('cashflow-list')
    // The seeded pension is an income row like any other, incomes first.
    await expect(list).toContainText('Statutory pension')
    await expect(list.getByTestId('cashflow-group-income')).toContainText('Income · 1')
    await expect(list.getByTestId('cashflow-group-expense')).toContainText('Expenses · 8')
    await expect(list).toContainText('From age 67')

    await card.getByTestId('cashflow-kind-pension').click()
    // A pension cannot be a one-off payment, so that option is gone.
    await card.locator('#cashflow-frequency-new').click()
    await expect(page.getByRole('option', { name: 'One-off' })).toHaveCount(0)
    await page.keyboard.press('Escape')

    await card.locator('#cashflow-name-new').fill('Company pension')
    await card.locator('#cashflow-amount-new').fill('400')
    await card.locator('#cashflow-start-new').fill('70')
    await card.getByTestId('cashflow-add').click()

    await expect(list).toContainText('Company pension')
    await expect(list).toContainText('From age 70')
    await expect(list.getByTestId('cashflow-group-income')).toContainText('Income · 2')
    // Two pensions in the plan; at 67 only the statutory one pays out yet.
    await expect(card).toContainText('2 pensions')
    await expect(card).toContainText('€5,000')
  })

  test('opens a cash-flow template in edit mode and lets the add be undone', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByTestId('tab-plan').click()
    await page.getByTestId('plan-section-pill-cashFlows').click()

    const list = page.getByTestId('cashflow-list')
    const rowsBefore = await list.locator('tbody tr').count()

    await list.getByRole('button', { name: /Care costs/ }).click()

    // The new row opens straight into its form with the age window focused —
    // "80–90" is a guess about this person, not an answer.
    // The edit row's field is keyed by the new flow's id; `cashflow-start-new`
    // belongs to the always-present add form further down.
    const startField = page.locator('input[id^="cashflow-start-flow-"]')
    await expect(startField).toBeFocused()
    await expect(startField).toHaveValue(/\d+/)

    const toast = page.getByTestId('cashflow-template-toast')
    await expect(toast).toBeVisible()
    await toast.getByTestId('cashflow-template-undo').click()

    await expect(list.locator('tbody tr')).toHaveCount(rowsBefore)
  })

  test('states what the monthly-expenses lever actually scales', async ({ page }) => {
    await page.goto('/en/simulation')

    // The lever writes the lifetime expenses only; the caption has to say so
    // and show the total it covers.
    await expect(page.getByTestId('quick-adjust')).toContainText(/Scales the \d+ lifetime expenses/)
  })

  test('jumps from the differences chip to the first differing row', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByRole('tab', { name: 'Scenarios & advice' }).click()

    await page.getByTestId('stress-lever-save').first().click()
    await page.getByTestId('scenario-plan-dialog').getByTestId('scenario-plan-confirm').click()
    await page.getByTestId('plan-created-toast').getByRole('button', { name: 'Dismiss' }).click()

    await page.getByRole('button', { name: /Run comparison|Run again/ }).click()

    const chip = page.getByTestId('plan-comparison-differences-chip')
    await expect(chip).toBeVisible()
    await chip.click()

    // The table opens and the first highlighted row is brought into view.
    const row = page.locator('tr[data-differs="true"]').first()
    await expect(row).toBeInViewport()
  })
})

test.describe('dashboard quick wins', () => {
  test('lets a duplicate be named, or abandoned, before it exists', async ({ page }) => {
    await page.goto('/en/simulation')

    const switcher = page.getByTestId('plan-switcher')
    await expect(switcher).toContainText('Base plan')

    // Cancel leaves the plan list exactly as it was.
    await page.getByTestId('plan-duplicate').click()
    await expect(page.getByLabel('Name for the copy')).toHaveValue('Base plan 2')
    await page.getByRole('button', { name: 'Cancel' }).click()
    await expect(switcher).toContainText('1 of')
    await expect(switcher).toContainText('Base plan')

    // Confirming creates the copy under the typed name and switches to it —
    // no "(copy)" ever reaches a comparison legend or a PDF.
    await page.getByTestId('plan-duplicate').click()
    await page.getByLabel('Name for the copy').fill('Sequence risk')
    await page.getByRole('button', { name: 'Duplicate plan' }).click()
    await expect(switcher).toContainText('Sequence risk')
    await expect(switcher).toContainText('2 of')

    const names = await page.evaluate(() => {
      const parsed = JSON.parse(window.localStorage.getItem('retirement-simulator-store') as string)
      return parsed.state.plans.map((plan: { name: string }) => plan.name)
    })
    expect(names).toEqual(['Base plan', 'Sequence risk'])
  })

  test('names every quick-adjust slider and the chart range brush', async ({ page }) => {
    await page.goto('/en/simulation')

    const quickAdjust = page.getByTestId('quick-adjust')
    await expect(quickAdjust).toBeVisible()

    // `role="slider"` lives on the thumb, so that is the element that has to
    // carry the name — an aria-label on the Radix root names nothing.
    for (const name of [
      'Retirement age',
      'Annual savings',
      'Monthly expenses',
      'Expected return',
    ]) {
      await expect(quickAdjust.getByRole('slider', { name })).toHaveCount(1)
    }

    // Recharts names the brush handles from the row's `name` field, which this
    // chart has none of: it used to announce "Min value: undefined".
    const brushHandles = page.getByRole('slider', { name: /Age range shown/ })
    await expect(brushHandles.first()).toBeAttached()
    const labels = await page
      .getByRole('slider')
      .evaluateAll((nodes) => nodes.map((node) => node.getAttribute('aria-label') ?? ''))
    expect(labels.some((label) => label.includes('undefined'))).toBe(false)
  })

  test('offers the theme switcher on the dashboard, not only on the landing page', async ({
    page,
  }) => {
    await page.goto('/en/simulation')

    const themeSwitcher = page.getByRole('combobox', { name: 'Theme' })
    await expect(themeSwitcher).toBeVisible()

    await themeSwitcher.click()
    await page.getByRole('option', { name: /Clear/ }).click()
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'klar')
  })
})
