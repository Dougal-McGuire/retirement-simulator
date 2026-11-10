import {
  closePanel,
  expect,
  gotoWorkspace,
  groupHeader,
  openPanel,
  test,
  waitForResults,
} from './helpers/workspace'

/**
 * The structural fixes from the UX audit: inline validation instead of silent
 * clamping, every assumption in one place (now the control column's groups),
 * and a live readout in the wizard.
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

// The panel walk (one panel at a time, "Next"/"Previous", Escape back to the
// Annahmen card) went with the edit panel: the control column shows five
// groups, several open at once, so there is nothing to walk and no card to
// return to. What replaces it is tested here.
test.describe('control column', () => {
  test('holds five groups, several open at once, and restores the linked one from the hash', async ({
    page,
  }) => {
    await gotoWorkspace(page)
    // "Time" and "Income & spending" are open to begin with.
    for (const [panel, open] of [
      ['person', 'true'],
      ['savings', 'false'],
      ['flows', 'true'],
      ['rule', 'false'],
      ['market', 'false'],
    ] as const) {
      await expect(groupHeader(page, panel)).toHaveAttribute('aria-expanded', open)
    }
    await expect(page.locator('#plan-editor-personal')).toBeVisible()
    await expect(page.locator('#plan-editor-expenses')).toBeVisible()
    // A closed group does not mount its body.
    await expect(page.locator('#plan-editor-income')).toHaveCount(0)

    // Opening one leaves the others as they are.
    const column = await openPanel(page, 'market')
    await expect(page.locator('#plan-editor-personal')).toBeVisible()
    await expect(page.locator('#plan-editor-expenses')).toBeVisible()
    // The Entnahme rule is a group of the column; its outcome stays a section.
    await openPanel(page, 'rule')
    await expect(column.getByTestId('withdrawal-strategy-picker')).toBeVisible()
    await expect(column.getByTestId('withdrawal-planner')).toHaveCount(0)
    await expect(page.locator('#withdrawal').getByTestId('withdrawal-strategy-picker')).toHaveCount(
      0
    )

    await closePanel(page, 'person')
    await expect(page.locator('#plan-editor-personal')).toHaveCount(0)

    // The group opened last lives in the URL, so a reload opens it again (the
    // others return to their defaults).
    await expect(page).toHaveURL(/#result:rule$/)
    await page.reload()
    await waitForResults(page)
    await expect(groupHeader(page, 'rule')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#plan-editor-withdrawal')).toBeVisible()
    await expect(groupHeader(page, 'person')).toHaveAttribute('aria-expanded', 'true')
    await expect(groupHeader(page, 'market')).toHaveAttribute('aria-expanded', 'false')

    // A deep link names a group: it opens, takes focus and stays in the URL.
    await gotoWorkspace(page, '/en/simulation#assumptions:market')
    await expect(groupHeader(page, 'market')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#plan-editor-market')).toBeVisible()
    await expect(groupHeader(page, 'market')).toBeFocused()
    // Closing it takes it out of the URL.
    await closePanel(page, 'market')
    await expect(page).not.toHaveURL(/:market$/)
  })

  test('Escape folds the drawer and gives focus back to what opened it', async ({ page }) => {
    await page.setViewportSize({ width: 900, height: 800 })
    await gotoWorkspace(page)
    // Below 1000 px the drawer starts folded: the canvas has the width.
    const toggle = page.getByTestId('edit-panel-toggle')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')

    // A pointer on the canvas opens the group it names …
    const pointer = page.getByTestId('withdrawal-rule-link')
    await pointer.scrollIntoViewIfNeeded()
    await pointer.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expect(groupHeader(page, 'rule')).toHaveAttribute('aria-expanded', 'true')
    await expect(groupHeader(page, 'rule')).toBeFocused()
    // … under the dock, which stays in view.
    const dock = (await page.getByTestId('result-dock').boundingBox())!
    const column = (await page.getByTestId('edit-panel').boundingBox())!
    expect(column.y).toBeGreaterThanOrEqual(dock.y + dock.height - 1)

    // … and Escape goes back to it.
    await page.keyboard.press('Escape')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(pointer).toBeFocused()
  })

  // The persisted "open plan section" (displayStore.planSection) was dropped
  // (spec §1.4 #34): the URL hash restores the linked group instead, as above.
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
