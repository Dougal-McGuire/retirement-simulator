import { expect, gotoWorkspace, openPanel, test } from './helpers/workspace'

/**
 * The structural fixes from the UX audit: inline validation instead of silent
 * clamping, an assumption editor you can walk (now the edit panel), and a live
 * readout in the wizard.
 */

test.describe('inline validation instead of silent clamping', () => {
  test('keeps an out-of-range age on screen, explains it, and never commits it', async ({
    page,
  }) => {
    await gotoWorkspace(page)
    await openPanel(page, 'person')

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
    await gotoWorkspace(page)
    await openPanel(page, 'person')

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

test.describe('edit panel', () => {
  test('shows one panel at a time, walks them, and restores the open one from the hash', async ({
    page,
  }) => {
    await gotoWorkspace(page)
    const panel = await openPanel(page, 'person')
    await expect(page.locator('#plan-editor-personal')).toBeVisible()
    // The Entnahme rule is edited in its own section, never in the panel.
    await expect(panel.getByTestId('withdrawal-planner')).toHaveCount(0)

    // The footer walks forward through the four panels…
    for (const next of ['savings', 'flows', 'market']) {
      await page.getByTestId('edit-panel-next').click()
      await expect(panel).toHaveAttribute('data-panel', next)
    }
    await expect(page.locator('#plan-editor-market')).toBeVisible()
    for (const other of ['personal', 'income', 'expenses']) {
      await expect(page.locator(`#plan-editor-${other}`)).toHaveCount(0)
    }
    await expect(page.getByTestId('edit-panel-next')).toHaveCount(0)

    // …and backwards.
    await page.getByTestId('edit-panel-previous').click()
    await expect(panel).toHaveAttribute('data-panel', 'flows')
    await expect(page.locator('#plan-editor-expenses')).toBeVisible()
    await expect(page.locator('#plan-editor-market')).toHaveCount(0)

    // The open panel lives in the URL, so a reload restores it.
    await gotoWorkspace(page, '/en/simulation#assumptions:market')
    await expect(page.getByTestId('edit-panel')).toHaveAttribute('data-panel', 'market')
    await expect(page.locator('#plan-editor-market')).toBeVisible()
    await expect(page.getByTestId('edit-market')).toHaveAttribute('aria-expanded', 'true')

    // Escape closes it and puts focus on the card that edits it.
    await expect(page.getByTestId('edit-panel-title')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('edit-panel')).toHaveCount(0)
    await expect(page.getByTestId('edit-market')).toBeFocused()
    await expect(page).toHaveURL(/#assumptions$/)
  })

  // The persisted "open plan section" (displayStore.planSection) was dropped
  // (spec §1.4 #34): the URL hash restores an open panel instead, as above.
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
