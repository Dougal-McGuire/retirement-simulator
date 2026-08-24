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

test.describe('plan tab navigation and collapse', () => {
  test('jumps to a section and highlights the one being read', async ({ page }) => {
    // Single column, which is where the audit measured its 5,400px scroll.
    await page.setViewportSize({ width: 1100, height: 900 })
    await page.goto('/en/simulation')
    await page.getByTestId('tab-plan').click()

    const nav = page.getByTestId('plan-section-nav')
    await expect(nav).toBeVisible()
    await expect(nav.getByRole('button')).toHaveCount(5)

    await page.getByTestId('plan-section-pill-withdrawal').click()

    const planner = page.getByTestId('withdrawal-planner')
    await expect(planner).toBeInViewport()
    await expect(page.getByTestId('plan-section-pill-withdrawal')).toHaveAttribute(
      'aria-current',
      'true'
    )

    // Scrolling elsewhere moves the highlight with the reader.
    await page.evaluate(() => document.getElementById('plan-editor-income')?.scrollIntoView())
    await expect(page.getByTestId('plan-section-pill-income')).toHaveAttribute(
      'aria-current',
      'true'
    )
  })

  test('folds a section away, keeps its summary, and remembers the choice', async ({ page }) => {
    await page.goto('/en/simulation')
    await page.getByTestId('tab-plan').click()

    const toggle = page.getByTestId('plan-editor-market-toggle')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await toggle.click()

    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#plan-editor-market-body')).toBeHidden()
    // The header and the chips survive: collapsing is for skimming, not hiding.
    await expect(page.locator('#plan-editor-market')).toContainText('Market & rules')

    await page.reload()
    await page.getByTestId('tab-plan').click()
    await expect(page.locator('#plan-editor-market-body')).toBeHidden()
  })

  test('points at the withdrawal planner from the scenarios tab', async ({ page }) => {
    await page.goto('/en/simulation')

    await page.getByRole('tab', { name: 'Scenarios & advice' }).click()
    const jump = page.getByTestId('scenarios-withdrawal-jump')
    await expect(jump).toBeVisible()

    await page.getByTestId('scenarios-withdrawal-jump-action').click()
    await expect(page.getByRole('tab', { name: 'Plan' })).toHaveAttribute('data-state', 'active')
    await expect(page.getByTestId('withdrawal-planner')).toBeInViewport()
  })
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

test.describe('what the gauge is a percentage of', () => {
  test('names the legacy goal inside the gauge card', async ({ page }) => {
    await page.goto('/en/simulation')

    const qualifier = page.getByTestId('hero-success-qualifier')
    await expect(qualifier).toHaveAttribute('data-definition', 'depletion')
    await expect(qualifier).toContainText('no legacy goal set')

    const target = page.locator('#editor-legacyTargetReal')
    await target.fill('150000')
    await target.blur()

    await expect(qualifier).toHaveAttribute('data-definition', 'legacyConditioned', {
      timeout: 20000,
    })
    await expect(qualifier).toContainText('Incl. legacy goal')
    // ...with plain survival kept as the secondary line.
    await expect(qualifier).toContainText('Money lasts on its own in')
  })
})
