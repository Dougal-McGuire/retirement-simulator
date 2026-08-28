import { expect, test } from '@playwright/test'

/**
 * The four structural fixes from the UX audit: inline validation instead of
 * silent clamping, a navigable/collapsible Plan tab, a live readout in the
 * wizard, and a gauge that says what its percentage is a percentage of.
 */

test.describe('inline validation instead of silent clamping', () => {
  test('keeps an out-of-range age on screen, explains it, and never commits it', async ({
    page,
  }) => {
    await page.goto('/en/simulation')
    await page.getByTestId('tab-plan').click()

    const age = page.locator('#editor-currentAge')
    await expect(age).toHaveValue('55')

    await age.fill('150')
    await age.blur()

    // The entry stays visible — clamping it to 100 behind the user's back is
    // the bug this replaces.
    await expect(age).toHaveValue('150')
    await expect(age).toHaveAttribute('aria-invalid', 'true')
    await expect(page.getByTestId('editor-currentAge-validation-message')).toContainText(
      'Enter an age between 16 and 100.'
    )

    // The derived chips admit they describe the last accepted entry.
    await expect(page.getByTestId('plan-editor-personal-stats-stale')).toBeVisible()

    // ...and the simulation is still running on the last valid age.
    const storedAge = await page.evaluate(() => {
      const raw = window.localStorage.getItem('retirement-simulator-store')
      return raw ? (JSON.parse(raw).state.params.currentAge as number) : null
    })
    expect(storedAge).toBe(55)

    // Correcting it clears everything without needing another blur.
    await age.fill('45')
    await expect(page.getByTestId('editor-currentAge-validation-message')).toHaveCount(0)
    await expect(page.getByTestId('plan-editor-personal-stats-stale')).toHaveCount(0)
  })

  test('calls out ages that contradict each other', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByTestId('tab-plan').click()

    // Valid on its own, impossible next to a retirement age of 60.
    await page.locator('#editor-currentAge').fill('66')
    await page.locator('#editor-currentAge').blur()

    const callout = page.getByTestId('editor-timeline-issues')
    await expect(callout).toBeVisible()
    await expect(callout).toContainText('later than your current age')
  })

  test('shows the same field message in the wizard', async ({ page }) => {
    await page.goto('/en/setup')
    // A computed preview proves client JS is running the form; typing into the
    // server-rendered markup before that is simply overwritten by hydration.
    await expect(page.getByTestId('wizard-live-result')).not.toHaveAttribute(
      'data-success-rate',
      '',
      { timeout: 20000 }
    )

    const age = page.locator('#currentAge')
    await age.fill('12')
    await age.blur()

    await expect(age).toHaveValue('12')
    await expect(page.getByTestId('currentAge-validation-message')).toContainText(
      'Enter an age between 16 and 100.'
    )
    await expect(page.getByTestId('wizard-timeline-chip')).toHaveAttribute('data-stale', 'true')
  })
})

test.describe('plan tab sections', () => {
  test('shows one section at a time and remembers the open one', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByTestId('tab-plan').click()

    const nav = page.getByTestId('plan-section-nav')
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('tab')).toHaveCount(5)

    // Personal opens by default; nothing else is mounted.
    await expect(page.locator('#plan-editor-personal')).toBeVisible()
    await expect(page.getByTestId('withdrawal-planner')).toHaveCount(0)

    await page.getByTestId('plan-section-pill-withdrawal').click()
    await expect(page.getByTestId('plan-section-pill-withdrawal')).toHaveAttribute(
      'data-state',
      'active'
    )
    await expect(page.getByTestId('withdrawal-planner')).toBeVisible()
    await expect(page.locator('#plan-editor-personal')).toHaveCount(0)

    // The footer walks backwards through the plan…
    await expect(page.getByTestId('plan-section-next')).toHaveCount(0)
    await page.getByTestId('plan-section-previous').click()
    await expect(page.locator('#plan-editor-market')).toBeVisible()

    // …and the open page survives a reload.
    await page.reload()
    await page.getByTestId('tab-plan').click()
    await expect(page.locator('#plan-editor-market')).toBeVisible()
    await expect(page.getByTestId('plan-section-pill-market')).toHaveAttribute(
      'data-state',
      'active'
    )
  })

  // The hero's edit-shortcut pencils and the scenarios-tab withdrawal pointer
  // were dashboard chrome the compact redesign removed; their tests went too.
})

test.describe('wizard live preview', () => {
  test('reports a success rate that moves when a field does', async ({ page }) => {
    await page.goto('/en/setup')

    const strip = page.getByTestId('wizard-live-result')
    await expect(strip).toBeVisible()

    const successRate = async () => Number((await strip.getAttribute('data-success-rate')) || 'NaN')

    await expect.poll(successRate, { timeout: 20000 }).not.toBeNaN()
    const before = await successRate()

    await page.getByRole('button', { name: /Assets & Income/ }).click()
    const savings = page.locator('#annualSavings')
    await savings.fill('2000')
    await savings.blur()

    await expect.poll(successRate, { timeout: 20000 }).not.toBe(before)
    await expect(page.getByTestId('wizard-live-median')).not.toHaveText('—')
  })
})

// The hero gauge (and its success-definition qualifier) was removed with the
// compact redesign; the KPI strip's success cell is covered in dashboard.spec.
