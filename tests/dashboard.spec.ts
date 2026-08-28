import { expect, test, type Page } from '@playwright/test'

/**
 * The compact simulation dashboard (design handoff screens 1b + 1c): merged
 * command bar with inline sliders, KPI strip, SVG fan chart, bottom strip,
 * and the plan-compare view — plus the plan-editor flows that survive
 * unchanged under the new chrome.
 *
 * The previous dashboard chrome (plan-switcher dialogs, hero gauge, welcome
 * strip, quick-adjust card, overview chart cards) was removed with the
 * redesign, and its tests went with it.
 */

/** The persisted store the dashboard writes through. */
const readStoredParams = (page: Page) =>
  page.evaluate(() => {
    const raw = window.localStorage.getItem('retirement-simulator-store')
    return raw ? (JSON.parse(raw).state.params as Record<string, unknown>) : null
  })

test.describe('compact simulation dashboard', () => {
  test('shows the command bar, KPI strip, fan chart and bottom strip', async ({ page }) => {
    await page.goto('/en/simulation')

    const bar = page.getByTestId('compact-command-bar')
    await expect(bar).toBeVisible()

    // All four inline levers, named on their thumbs where `role="slider"` is.
    for (const name of [
      'Retirement age',
      'Annual savings',
      'Monthly spending',
      'Expected return',
    ]) {
      await expect(bar.getByRole('slider', { name })).toBeVisible()
    }

    // The first run completes and the verdict arrives everywhere at once.
    await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })
    await expect(page.getByTestId('kpi-strip')).toBeVisible()
    await expect(page.getByTestId('fan-chart')).toBeVisible()
    await expect(page.getByTestId('bottom-strip')).toBeVisible()

    // KPI strip labels straight from the design.
    const kpis = page.getByTestId('kpi-strip')
    await expect(kpis).toContainText('Success')
    await expect(kpis).toContainText('Lasts to')
    await expect(kpis).toContainText('1st-yr draw')
    await expect(kpis).toContainText('Median end')
  })

  test('switches tabs under the compact chrome', async ({ page }) => {
    await page.goto('/en/simulation')

    await expect(page.getByTestId('tab-overview')).toHaveAttribute('aria-selected', 'true')

    await page.getByTestId('tab-plan').click()
    await expect(page.getByTestId('tab-plan')).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByTestId('plan-editor')).toBeVisible()

    await page.getByTestId('tab-cashflow').click()
    await expect(page.getByTestId('tab-cashflow')).toHaveAttribute('aria-selected', 'true')

    await page.getByTestId('tab-scenarios').click()
    await expect(page.getByTestId('tab-scenarios')).toHaveAttribute('aria-selected', 'true')

    await page.getByTestId('tab-overview').click()
    await expect(page.getByTestId('fan-chart')).toBeVisible({ timeout: 30000 })
  })

  test('scrubbing the age slider recomputes live into the working copy', async ({ page }) => {
    await page.goto('/en/simulation')
    await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })

    const slider = page.getByRole('slider', { name: 'Retirement age' })
    await slider.focus()
    await slider.press('ArrowRight')
    await slider.press('ArrowRight')

    // The lever's readout follows immediately…
    await expect(page.getByTestId('compact-command-bar')).toContainText('62')

    // …and the debounced auto-run persists the edit into the working copy.
    await expect(async () => {
      const params = await readStoredParams(page)
      expect(params?.retirementAge).toBe(62)
    }).toPass({ timeout: 10000 })
  })

  test('toggles the advanced parameter row', async ({ page }) => {
    await page.goto('/en/simulation')

    await expect(page.getByTestId('advanced-params')).toHaveCount(0)
    await page.getByRole('button', { name: /Advanced/ }).click()

    const advanced = page.getByTestId('advanced-params')
    await expect(advanced).toBeVisible()
    await expect(advanced.getByRole('slider', { name: 'Return volatility' })).toBeVisible()
    await expect(advanced.getByRole('checkbox')).toBeVisible()

    await page.getByRole('button', { name: /Advanced/ }).click()
    await expect(page.getByTestId('advanced-params')).toHaveCount(0)
  })

  test('measures the recommendation chips and applies one on click', async ({ page }) => {
    test.setTimeout(90000) // three extra scenario runs behind a debounce
    await page.goto('/en/simulation')
    await expect(page.getByTestId('bottom-strip')).toBeVisible({ timeout: 30000 })

    // Chips arrive once the extra scenario runs settle, each with a delta.
    const strip = page.getByTestId('bottom-strip')
    const retireChip = strip.getByRole('button', { name: /^Retire 62/ })
    await expect(retireChip).toBeVisible({ timeout: 45000 })
    await expect(retireChip).toContainText('pp')

    await retireChip.click()

    // The lever landed in the working copy, same as dragging the slider.
    await expect(async () => {
      const params = await readStoredParams(page)
      expect(params?.retirementAge).toBe(62)
    }).toPass({ timeout: 10000 })
  })

  test('switches the fan chart between nominal and real terms', async ({ page }) => {
    await page.goto('/en/simulation')

    const chart = page.getByTestId('fan-chart')
    await expect(chart).toBeVisible({ timeout: 30000 })

    const real = chart.getByRole('button', { name: 'Real' })
    await expect(real).toHaveAttribute('aria-pressed', 'false')
    await real.click()
    await expect(real).toHaveAttribute('aria-pressed', 'true')
    await expect(chart.getByRole('button', { name: 'Nominal' })).toHaveAttribute(
      'aria-pressed',
      'false'
    )
  })

  test('enters compare, gains a challenger plan and shows delta KPIs', async ({ page }) => {
    test.setTimeout(90000) // both compared plans re-run in full
    await page.goto('/en/simulation')
    await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })

    await page.getByTestId('enter-compare').click()
    const compare = page.getByTestId('compare-view')
    await expect(compare).toBeVisible()

    // One plan only: "+ Add plan" forks the base so there is a challenger.
    await compare.getByRole('button', { name: /Add plan/ }).click()

    // Both plans re-run; the delta strip and the diff table arrive together.
    await expect(compare.getByText('Success rate')).toBeVisible({ timeout: 45000 })
    await expect(compare.getByText('Median end wealth')).toBeVisible()
    await expect(compare.getByRole('table')).toContainText('Retirement age')
    await expect(compare.getByRole('table')).toContainText('Withdrawal rule')

    await compare.getByRole('button', { name: 'Exit compare' }).click()
    await expect(page.getByTestId('compact-command-bar')).toBeVisible()
  })

  test('runs on demand from the Run button', async ({ page }) => {
    await page.goto('/en/simulation')
    await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })

    // The meta line only gains a duration once a run has been timed.
    await page.getByTestId('run-button').click()
    await expect(page.getByText(/\d[.,]\d s/)).toBeVisible({ timeout: 30000 })
  })
})

test.describe('working copy under the compact chrome', () => {
  test('keeps edits in a working copy until they are saved to the plan', async ({ page }) => {
    await page.goto('/en/simulation')

    // Edit through the full plan editor.
    await page.getByTestId('tab-plan').click()
    await page.getByTestId('plan-section-pill-income').click()
    const assets = page.locator('#editor-currentAssets')
    await assets.fill('900000')
    await assets.blur()

    // Revert throws the working copy away and restores the stored plan.
    await page.getByTestId('plan-editor-revert').click()
    await expect(assets).toHaveValue(/630/)

    // Saving writes the working copy into the plan.
    await assets.fill('700000')
    await assets.blur()
    await page.getByTestId('plan-editor-save').click()

    await expect(async () => {
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
    }).toPass({ timeout: 10000 })
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

    // Deterministic: the same plan replayed gives exactly the same number.
    const readRate = () =>
      page.evaluate(() => {
        const raw = window.localStorage.getItem('retirement-simulator-store')
        return raw ? (JSON.parse(raw).state?.results?.successRate ?? null) : null
      })

    await expect.poll(readRate).not.toBeNull()
    const first = await readRate()
    await page.reload()
    await expect(page.getByTestId('compact-command-bar')).toBeVisible()
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

test.describe('German taxes', () => {
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
})

test.describe('cash-flow ergonomics', () => {
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

  test('taxes a lump sum under the one-fifth rule and shows the net amount', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByTestId('tab-plan').click()
    await page.getByTestId('plan-section-pill-cashFlows').click()

    const card = page.locator('#plan-editor-expenses')
    await card.getByTestId('cashflow-kind-income').click()
    await card.locator('#cashflow-name-new').fill('Kapitaloption')
    await card.locator('#cashflow-amount-new').fill('300000')
    await card.locator('#cashflow-frequency-new').click()
    await page.getByRole('option', { name: 'One-off' }).click()
    // A calendar month pins the payment to a plan year; age 55 today → 2033
    // is eight years out, so the row lands at 63.
    const year = new Date().getFullYear() + 8
    await card.locator('#cashflow-date-new').fill(`${year}-01`)
    await card.getByRole('button', { name: 'Advanced options' }).click()
    await card.locator('#cashflow-tax-new').click()
    await page.getByRole('option', { name: /One-fifth rule/ }).click()
    await card.locator('#cashflow-note-new').fill('source: company pension, gross')
    await card.getByTestId('cashflow-add').click()

    const list = card.getByTestId('cashflow-list')
    await expect(list).toContainText('Kapitaloption')
    await expect(list).toContainText(`Jan ${year} · age 63`)
    await expect(list).toContainText(/tax €[\d,]+ · net €[\d,]+/)
    await expect(list).toContainText('source: company pension, gross')
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
})

test.describe('scenario levers', () => {
  test('renders toasts as a fixed overlay rather than inside the page flow', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByTestId('tab-scenarios').click()
    await page.getByTestId('stress-lever-save').first().click()
    await page.getByTestId('scenario-plan-dialog').getByTestId('scenario-plan-confirm').click()

    const toast = page.getByTestId('plan-created-toast')
    await expect(toast).toBeVisible()

    // Bottom-right of the viewport, out of the reading column.
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
})
