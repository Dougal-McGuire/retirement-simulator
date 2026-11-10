import type { Page } from '@playwright/test'
import {
  expect,
  gotoWorkspace,
  leverSlider,
  openPanel,
  readPersistedState,
  successRate,
  test,
} from './helpers/workspace'

/**
 * Change chips: while the plan has unsaved changes the head lists them
 * ("Geändert: Ruhestart 60 → 62 ✕"), the saved plan stays on the chart as a
 * ghost, and ✕ takes exactly that change back.
 *
 * This file replaces `quick-access.spec.ts`, which tested the quick levers
 * under Stellschrauben and their per-slider "Reset". The sliders are gone
 * (every input lives once, in the control column); what their reset did —
 * put one value back to the saved plan's without discarding the rest — is
 * what a chip's ✕ does, for every input instead of four.
 */

const chips = (page: Page) => page.getByTestId('change-row').getByTestId('change-chip')

/** Sets the annual savings in the group "Assets & savings". */
async function setAnnualSavings(page: Page, value: string) {
  await openPanel(page, 'savings')
  const field = page.locator('#editor-annualSavings')
  await field.fill(value)
  await field.blur()
}

test.describe('change chips', () => {
  test('commands stay in the bar, inputs in the column, and the canvas has neither', async ({
    page,
  }) => {
    await gotoWorkspace(page)
    const bar = page.getByTestId('result-bar')
    await expect(bar.getByRole('slider')).toHaveCount(0)
    await expect(page.locator('main').getByRole('slider')).toHaveCount(0)
    await expect(page.getByTestId('quick-levers')).toHaveCount(0)
    // Clean: no chips, no ghost — and the row keeps its place for them.
    await expect(chips(page)).toHaveCount(0)
    await expect(page.getByTestId('fan-ghost')).toHaveCount(0)
    const row = page.getByTestId('change-row')
    expect((await row.boundingBox())!.height).toBe(44)

    await openPanel(page, 'person')
    await expect(leverSlider(page)).toBeVisible()

    const display = bar.getByTestId('display-toggle')
    await display.getByRole('radio', { name: "Today's €" }).click()
    await expect(display.getByRole('radio', { name: "Today's €" })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    // How euros are shown is not a change to the plan.
    await expect(bar).not.toHaveAttribute('data-dirty', 'true')
    await expect(chips(page)).toHaveCount(0)
  })

  test('✕ puts annual savings back to the saved value and nothing else', async ({ page }) => {
    await gotoWorkspace(page)
    const cleanRate = await successRate(page)
    const anchorsTop = (await page.getByTestId('section-index').boundingBox())!.y

    // Two changes: the retirement age and the savings.
    await openPanel(page, 'person')
    await leverSlider(page).focus()
    await page.keyboard.press('ArrowRight')
    await expect(chips(page)).toHaveCount(1)
    await expect(chips(page).first()).toHaveText(/Retirement start 60 → 61/)
    await expect.poll(() => successRate(page)).not.toBe(cleanRate)
    await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'updated')
    const rateWithAge = await successRate(page)

    await setAnnualSavings(page, '20000')
    await expect(chips(page)).toHaveCount(2)
    const savings = page.locator('[data-testid="change-chip"][data-change="field:annualSavings"]')
    await expect(savings).toContainText('Saving per year')
    await expect(savings).toContainText('→')
    // The saved plan stays on the chart, and the legend names both.
    await expect(page.getByTestId('fan-ghost-median')).toHaveCount(1)
    await expect(page.getByTestId('fan-legend')).toContainText('now')
    await expect(page.getByTestId('fan-legend-saved')).toContainText('saved')
    // The group that holds the change is marked.
    await expect(page.getByTestId('edit-savings-changed')).toBeVisible()
    // Nothing under the row moved when it filled.
    expect((await page.getByTestId('section-index').boundingBox())!.y).toBe(anchorsTop)

    const changed = await readPersistedState(page)
    const baseline = changed?.storedPlan?.annualSavings
    expect(typeof baseline).toBe('number')
    expect(changed?.working?.annualSavings).toBe(20000)

    // ✕ on the savings chip: that value goes back, the other change stays.
    const revert = savings.getByTestId('change-revert')
    await expect(revert).toHaveAccessibleName(/^Take back this change: Saving per year /)
    await revert.click()
    await expect
      .poll(async () => (await readPersistedState(page))?.working?.annualSavings)
      .toBe(baseline)
    await expect(chips(page)).toHaveCount(1)
    await expect(page.getByTestId('edit-savings-changed')).toHaveCount(0)
    await expect(page.locator('#editor-annualSavings')).toHaveValue(/48/)
    expect((await readPersistedState(page))?.working?.retirementAge).toBe(61)
    // The result is the one the remaining change gave before.
    await expect.poll(() => successRate(page)).toBe(rateWithAge)
    await expect(page.getByTestId('result-bar')).toHaveAttribute('data-dirty', 'true')

    // ✕ on the last chip: the plan is clean again, the ghost goes, and the
    // rate is the saved plan's.
    await chips(page).first().getByTestId('change-revert').click()
    await expect(chips(page)).toHaveCount(0)
    await expect(page.getByTestId('result-bar')).not.toHaveAttribute('data-dirty', 'true')
    await expect(page.getByTestId('fan-ghost')).toHaveCount(0)
    await expect.poll(() => successRate(page)).toBe(cleanRate)
    expect((await readPersistedState(page))?.draft).toBeNull()
  })

  test('✕ on a changed expense restores the plan expense streams exactly', async ({ page }) => {
    await gotoWorkspace(page)
    await openPanel(page, 'flows')
    const list = page.getByTestId('cashflow-list')
    await list.getByRole('button', { name: /^Edit: Groceries/ }).click()
    await page.locator('#cashflow-amount-food').fill('900')
    await page.getByTestId('cashflow-save-food').click()

    // The chip names the flow and both amounts, with the unit.
    const chip = chips(page).first()
    await expect(chips(page)).toHaveCount(1)
    await expect(chip).toHaveText(/^Groceries €[\d,]+ → €900\/mo/)

    const changed = await readPersistedState(page)
    const baselineExpenses = changed?.storedPlan?.customExpenses
    const baselineFlows = changed?.storedPlan?.cashFlows
    expect(Array.isArray(baselineExpenses)).toBe(true)
    expect(Array.isArray(baselineFlows)).toBe(true)
    expect(changed?.working?.customExpenses).not.toEqual(baselineExpenses)
    expect(changed?.working?.cashFlows).not.toEqual(baselineFlows)

    await chip.getByTestId('change-revert').click()

    await expect
      .poll(async () => (await readPersistedState(page))?.working?.customExpenses)
      .toEqual(baselineExpenses)
    await expect
      .poll(async () => (await readPersistedState(page))?.working?.cashFlows)
      .toEqual(baselineFlows)
    await expect(chips(page)).toHaveCount(0)
    await expect(page.getByTestId('result-bar')).not.toHaveAttribute('data-dirty', 'true')
  })

  test('more than three changes fold into "+n"; the dock lists them all', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 890 })
    await gotoWorkspace(page)
    await openPanel(page, 'person')
    await leverSlider(page).focus()
    await page.keyboard.press('ArrowRight')
    await setAnnualSavings(page, '20000')
    const assets = page.locator('#editor-currentAssets')
    await assets.fill('700000')
    await assets.blur()
    await openPanel(page, 'flows')
    await page.locator('#plan-editor-expenses [data-testid="cashflow-switch-vacations"]').click()

    await expect(chips(page)).toHaveCount(3)
    const more = page.getByTestId('change-more')
    await expect(more).toHaveText('+1')
    await expect(page.getByTestId('bar-dirty')).toContainText('4 changes')
    await more.click()
    await expect(chips(page)).toHaveCount(4)
    await expect(more).toHaveAttribute('aria-expanded', 'true')

    // Down the canvas the dock carries the same list behind "4 changes ▾".
    await page.getByTestId('section-link-levers').click()
    await expect(page.getByTestId('result-dock')).toHaveAttribute('data-pinned', 'true')
    const trigger = page.getByTestId('change-menu-trigger')
    await expect(trigger).toHaveAccessibleName('4 changes')
    await trigger.click()
    const menu = page.getByTestId('change-menu')
    await expect(menu.getByTestId('change-chip')).toHaveCount(4)
    await menu
      .locator('[data-change="field:currentAssets"]')
      .getByTestId('change-revert')
      .click()
    await expect(trigger).toHaveAccessibleName('3 changes')
    expect((await readPersistedState(page))?.working?.currentAssets).toBe(
      (await readPersistedState(page))?.storedPlan?.currentAssets
    )

    // "Discard" still drops all of them at once.
    await page.getByTestId('command-discard').click()
    await expect(page.getByTestId('result-bar')).not.toHaveAttribute('data-dirty', 'true')
    await expect(page.getByTestId('change-menu-trigger')).toHaveCount(0)
  })

  test('reads German', async ({ page }) => {
    await gotoWorkspace(page, '/de/simulation')
    await openPanel(page, 'person')
    await leverSlider(page).focus()
    await page.keyboard.press('ArrowRight')
    const row = page.getByTestId('change-row')
    await expect(row).toContainText('Geändert:')
    const chip = chips(page).first()
    await expect(chip).toHaveText(/Ruhestart 60 → 61/)
    await expect(chip.getByTestId('change-revert')).toHaveAccessibleName(
      'Änderung zurücknehmen: Ruhestart 60 → 61'
    )
    await expect(page.getByTestId('fan-legend')).toContainText('jetzt')
    await expect(page.getByTestId('fan-legend-saved')).toContainText('gespeichert')
    await expect(page.getByTestId('bar-dirty')).toContainText('1 Änderung')
  })
})
