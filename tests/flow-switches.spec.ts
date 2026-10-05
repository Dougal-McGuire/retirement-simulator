import { existsSync, readFileSync } from 'node:fs'
import type { Locator, Page } from '@playwright/test'
import {
  expect,
  expectNoHorizontalOverflow,
  gotoWorkspace,
  openPanel,
  openPlanMenu,
  openSection,
  readPersistedState,
  successRate,
  test,
  waitForResults,
} from './helpers/workspace'

/**
 * Flow switches: every income, expense and pension can be switched off. A
 * switched-off flow stays in the plan (list, storage, sync) but counts in no
 * figure; switching is an ordinary draft edit, the draft can become a plan of
 * its own, and Stellschrauben measures what each uncertain item is worth.
 */

/** The furnished example plan: part-time income, inheritance, roof, care. */
async function openDemoPlan(page: Page) {
  await page.goto('/de')
  await page.getByTestId('explore-example-plan').first().click()
  await page.waitForURL(/\/de\/simulation/)
  await waitForResults(page)
}

const flowsBody = (page: Page) => page.locator('#plan-editor-expenses')
const flowRow = (page: Page, id: string) => flowsBody(page).getByTestId(`cashflow-row-${id}`)
const flowSwitch = (page: Page, id: string) => flowsBody(page).getByTestId(`cashflow-switch-${id}`)

/** The draft's stored flow list. */
async function storedFlow(page: Page, id: string) {
  const state = await readPersistedState(page)
  const flows = (state?.working?.cashFlows ?? []) as Array<{ id: string; enabled?: boolean }>
  return flows.find((flow) => flow.id === id)
}

async function closePanel(page: Page) {
  await page.getByTestId('edit-panel-done').click()
  await expect(page.getByTestId('edit-panel')).toHaveCount(0)
}

test.describe('flow switches in the flow list', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 890 })
  })

  test('a switched-off flow leaves every figure but stays in the plan', async ({ page }) => {
    await openDemoPlan(page)
    const before = await successRate(page)
    await openPanel(page, 'flows')

    const row = flowRow(page, 'demo-inheritance')
    const toggle = row.getByRole('switch', { name: '„Erbschaft“ in der Berechnung' })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    // The switch is the row's first control.
    const first = await row.evaluate(
      (element) => element.querySelector('button, input, select, a[href]')?.id ?? null
    )
    expect(first).toBe('cashflow-switch-demo-inheritance')

    // Keyboard: Space flips it, like any switch.
    await toggle.focus()
    await page.keyboard.press('Space')
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(toggle).toBeFocused()

    // An ordinary draft edit: unsaved, delta against the saved plan, recomputed.
    const bar = page.getByTestId('result-bar')
    await expect(bar).toHaveAttribute('data-dirty', 'true')
    await expect(bar.getByTestId('success-delta')).toBeVisible()
    await expect.poll(() => successRate(page)).not.toBe(before)

    // Muted, tagged, counted apart — and still listed.
    await expect(row).toHaveAttribute('data-enabled', 'false')
    await expect(row.getByTestId('cashflow-off-demo-inheritance')).toHaveText('Aus')
    await expect(flowsBody(page).getByTestId('cashflow-group-income')).toContainText(
      'Einnahmen · 2 · 1 ausgeschaltet'
    )
    await expect(flowsBody(page).getByTestId('cashflow-switched-off-summary')).toContainText(
      '1 Posten ausgeschaltet'
    )
    await expect(
      flowsBody(page).getByTestId('cashflow-timeline').locator('[data-flow-off]')
    ).toHaveCount(1)

    // Stored as a flag on the flow; the legacy projection drops it.
    expect(await storedFlow(page, 'demo-inheritance')).toMatchObject({ enabled: false })
    const state = await readPersistedState(page)
    expect(state?.working?.oneTimeIncomes).toEqual([])

    await closePanel(page)
    await expect(page.getByTestId('assumption-card-flows')).toContainText('1 ausgeschaltet')

    // Verwerfen undoes it.
    await page.getByTestId('command-discard').click()
    await expect(bar).not.toHaveAttribute('data-dirty', 'true')
    await expect.poll(() => successRate(page)).toBe(before)
    await openPanel(page, 'flows')
    await expect(flowSwitch(page, 'demo-inheritance')).toHaveAttribute('aria-checked', 'true')
  })

  test('the statutory pension can be switched off, saved and switched back on', async ({
    page,
  }) => {
    await openDemoPlan(page)
    const card = page.getByTestId('assumption-card-flows')
    await expect(card).toContainText('Renten mit 67: 5.000 € brutto/Monat')

    await openPanel(page, 'flows')
    await flowSwitch(page, 'pension-statutory').click()
    await expect(flowSwitch(page, 'pension-statutory')).toHaveAttribute('aria-checked', 'false')
    await closePanel(page)
    // Said as what it is, not as a "0 €" pension that reads like a missing input.
    await expect(card).toContainText('Gesetzliche Rente ausgeschaltet')
    await expect(card).not.toContainText('Renten mit 67')

    // The pension slider cannot reach a switched-off pension.
    await openSection(page, 'levers')
    await page.getByTestId('more-sliders-toggle').click()
    const slider = page.locator('#levers').getByRole('slider', {
      name: 'Monatliche gesetzliche Rente',
    })
    await expect(slider).toHaveAttribute('aria-valuetext', 'Gesetzliche Rente ausgeschaltet')
    // Radix marks a disabled thumb with data-disabled and takes it out of the
    // tab order.
    await expect(slider).toHaveAttribute('data-disabled', '')

    // Saved and reloaded, the pension is still there, still off, amount kept.
    await page.getByTestId('command-save').click()
    await expect(page.getByTestId('result-bar')).not.toHaveAttribute('data-dirty', 'true')
    await page.reload()
    await waitForResults(page)
    const state = await readPersistedState(page)
    expect(state?.storedPlan?.monthlyPension).toBe(0)
    expect(await storedFlow(page, 'pension-statutory')).toMatchObject({
      enabled: false,
      amount: 5000,
    })

    await openPanel(page, 'flows')
    await flowSwitch(page, 'pension-statutory').click()
    await closePanel(page)
    await expect(card).toContainText('Renten mit 67: 5.000 € brutto/Monat')
  })

  test('works in the phone sheet', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openDemoPlan(page)
    await openPanel(page, 'flows')
    const toggle = flowSwitch(page, 'demo-care')
    await toggle.scrollIntoViewIfNeeded()
    const box = (await toggle.boundingBox())!
    expect(box.width).toBeGreaterThanOrEqual(24)
    expect(box.height).toBeGreaterThanOrEqual(24)
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(page.getByTestId('result-bar')).toHaveAttribute('data-dirty', 'true')
    await expectNoHorizontalOverflow(page)
    const fits = await flowsBody(page).evaluate(
      (element) => element.scrollWidth <= element.clientWidth + 1
    )
    expect(fits).toBe(true)
  })
})

test.describe('saving the draft as a new plan', () => {
  test('keeps the source as saved and compares both', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 890 })
    await openDemoPlan(page)

    // Clean: nothing to save as a new plan.
    let menu = await openPlanMenu(page)
    await expect(menu.getByTestId('plan-menu-saveAsNew')).toHaveCount(0)
    await page.keyboard.press('Escape')

    await openPanel(page, 'flows')
    await flowSwitch(page, 'demo-inheritance').click()
    await closePanel(page)
    const bar = page.getByTestId('result-bar')
    await expect(bar).toHaveAttribute('data-dirty', 'true')
    // At this width the bar keeps its controls; the plan menu offers it.
    await expect(bar.getByTestId('command-save-as-new')).toBeHidden()

    menu = await openPlanMenu(page)
    await menu.getByTestId('plan-menu-saveAsNew').click()
    const dialog = page.getByTestId('save-draft-dialog')
    await expect(dialog).toBeVisible()
    const changes = dialog.getByTestId('scenario-plan-changes')
    await expect(changes).toContainText('Erbschaft')
    await expect(changes).toContainText('berücksichtigt')
    await expect(changes).toContainText('ausgeschaltet')
    // The switch is the only change: nothing else is listed.
    await expect(changes.getByRole('listitem')).toHaveCount(1)
    await expect(dialog.getByLabel('Name des neuen Plans')).toHaveValue('Ohne Erbschaft')
    await dialog.getByTestId('save-draft-confirm').click()

    // The source is clean, active and unchanged; the new plan holds the draft.
    const toast = page.getByTestId('plan-created-toast')
    await expect(toast).toContainText('„Ohne Erbschaft“ gespeichert')
    await expect(bar).not.toHaveAttribute('data-dirty', 'true')
    await expect(page.getByTestId('plan-menu-trigger')).toContainText('Beispielplan')
    const plans = await page.evaluate(() => {
      const state = JSON.parse(window.localStorage.getItem('retirement-simulator-store')!).state
      return state.plans.map(
        (plan: {
          name: string
          params: { cashFlows: Array<{ id: string; enabled?: boolean }> }
        }) => ({
          name: plan.name,
          inheritance: plan.params.cashFlows.find((flow) => flow.id === 'demo-inheritance')
            ?.enabled,
        })
      )
    })
    expect(plans).toContainEqual({ name: 'Ohne Erbschaft', inheritance: false })
    expect(plans.filter((plan: { name: string }) => plan.name !== 'Ohne Erbschaft')).toContainEqual(
      expect.objectContaining({ inheritance: undefined })
    )

    // "Vergleichen": compare mode with the source and the new plan.
    await toast.getByTestId('plan-created-toast-compare').click()
    await expect(page).toHaveURL(/#compare$/)
    const view = page.getByTestId('compare-view')
    await expect(view.getByRole('button', { name: 'Ohne Erbschaft' })).toHaveAttribute(
      'aria-pressed',
      'true'
    )
    const switchRow = view.getByRole('row', { name: /^Erbschaft/ })
    await expect(switchRow).toContainText('berücksichtigt')
    await expect(switchRow).toContainText('ausgeschaltet')
  })

  test('the bar offers it beside Save where it has room', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 890 })
    await openDemoPlan(page)
    await openPanel(page, 'flows')
    await flowSwitch(page, 'demo-roof').click()
    await closePanel(page)
    const button = page.getByTestId('command-save-as-new')
    await expect(button).toBeVisible()
    await expect(button).toHaveAccessibleName('Als neuen Plan speichern …')
    await button.click()
    await expect(page.getByTestId('save-draft-dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(button).toBeFocused()

    // Dirty, the bar still fits every width it was tuned for, and the plan
    // name is never cut to make room for the extra button.
    for (const width of [1024, 1280, 1366, 1440, 1600]) {
      await page.setViewportSize({ width, height: 890 })
      const bar = page.getByTestId('result-bar')
      const overflow = await bar.evaluate((element) => element.scrollWidth - element.clientWidth)
      expect(overflow, `result bar fits at ${width}px`).toBeLessThanOrEqual(0)
      if (width >= 1366) {
        const name = page.getByTestId('plan-menu-trigger').locator('.workspace-plan-trigger-name')
        const clipped = await name.evaluate((element) => element.scrollWidth > element.clientWidth)
        expect(clipped, `plan name whole at ${width}px`).toBe(false)
      }
      await expect(button).toBeVisible({ visible: width >= 1600 })
    }
  })
})

test.describe('saving the draft as a new plan at the plan limit', () => {
  test('the bar button says why it does nothing', async ({ page }) => {
    await page.setViewportSize({ width: 1600, height: 890 })
    await openDemoPlan(page)
    // Fill the plan list to its limit (12) with copies of the example.
    await page.evaluate(() => {
      const key = 'retirement-simulator-store'
      const parsed = JSON.parse(window.localStorage.getItem(key)!)
      const state = parsed.state
      const active = state.plans.find((plan: { id: string }) => plan.id === state.activePlanId)
      for (let index = 1; state.plans.length < 12; index++) {
        state.plans.push({ ...active, id: `limit-copy-${index}`, name: `Kopie ${index}` })
      }
      window.localStorage.setItem(key, JSON.stringify(parsed))
    })
    await page.reload()
    await waitForResults(page)

    await openPanel(page, 'flows')
    await flowSwitch(page, 'demo-roof').click()
    await closePanel(page)
    const bar = page.getByTestId('result-bar')
    await expect(bar).toHaveAttribute('data-dirty', 'true')

    const button = page.getByTestId('command-save-as-new')
    await expect(button).toBeVisible()
    await expect(button).toHaveAttribute('aria-disabled', 'true')
    await expect(button).toHaveAttribute('title', /Planlimit erreicht \(12\)/)
    await expect(button).toHaveAccessibleDescription(/Planlimit erreicht \(12\)/)
    // aria-disabled keeps it focusable with its hint; a click does nothing.
    await button.click({ force: true })
    await expect(page.getByTestId('save-draft-dialog')).toHaveCount(0)
    await expect(bar).toHaveAttribute('data-dirty', 'true')

    // The plan menu's item agrees.
    const menu = await openPlanMenu(page)
    await expect(menu.getByTestId('plan-menu-saveAsNew')).toHaveAttribute('aria-disabled', 'true')
    await expect(menu).toContainText('Planlimit erreicht (12)')
  })
})

test.describe('Stellschrauben: uncertain items', () => {
  async function waitMeasured(list: Locator) {
    await list.scrollIntoViewIfNeeded()
    await expect(list).toHaveAttribute('data-measure', 'ready', { timeout: 60000 })
  }

  test('lists the events with their measured impact and the same switch', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 890 })
    await openDemoPlan(page)
    await openSection(page, 'levers')
    const list = page.locator('#levers').getByTestId('uncertain-flows')
    await waitMeasured(list)

    // The four events of the example, not its living costs or state pension.
    const rows = list.getByTestId('uncertain-flow')
    await expect(rows).toHaveCount(4)
    const ids = await rows.evaluateAll((items) =>
      items.map((item) => item.getAttribute('data-flow-id'))
    )
    expect([...ids].sort()).toEqual(['demo-care', 'demo-inheritance', 'demo-parttime', 'demo-roof'])
    for (const delta of await list.getByTestId('uncertain-flow-delta').all()) {
      await expect(delta).toHaveText(/^ohne: [+−±]\d+,\d Pkt\.$/)
    }
    // Largest effect first.
    const magnitudes = await list
      .getByTestId('uncertain-flow-delta')
      .evaluateAll((chips) =>
        chips.map((chip) => Math.abs(Number(chip.getAttribute('data-value'))))
      )
    expect(magnitudes).toEqual([...magnitudes].sort((a, b) => b - a))

    // The switch is a draft edit; the impact is re-measured the other way round.
    const inheritance = list.locator('[data-flow-id="demo-inheritance"]')
    await inheritance.getByRole('switch', { name: '„Erbschaft“ in der Berechnung' }).click()
    await expect(page.getByTestId('result-bar')).toHaveAttribute('data-dirty', 'true')
    await expect(inheritance).toHaveAttribute('data-enabled', 'false')
    await waitMeasured(list)
    await expect(inheritance.getByTestId('uncertain-flow-delta')).toHaveText(/^mit: /)

    // The name opens the item's row in the flow list, on its switch.
    await inheritance.getByTestId('uncertain-flow-open').click()
    await expect(page.getByTestId('edit-panel')).toHaveAttribute('data-panel', 'flows')
    await expect(flowSwitch(page, 'demo-inheritance')).toBeFocused()
  })

  test('says when the figures turn to worst-decile euros', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 890 })
    await openDemoPlan(page)
    await openSection(page, 'levers')
    const list = page.locator('#levers').getByTestId('uncertain-flows')
    await waitMeasured(list)
    // Below 100 %: points and a rate, no callout, no unit.
    await expect(list.getByTestId('uncertain-flows-saturated')).toHaveCount(0)
    await expect(list.getByTestId('worst-decile-unit')).toHaveCount(0)

    // Without the care costs the example succeeds (nearly) always: every row
    // now compares the worst decile's end assets — and says so.
    const care = list.locator('[data-flow-id="demo-care"]')
    await care.getByTestId('uncertain-flow-switch').click()
    await expect(care).toHaveAttribute('data-enabled', 'false')
    await waitMeasured(list)
    const callout = list.getByTestId('uncertain-flows-saturated')
    await expect(callout).toBeVisible()
    await expect(callout).toContainText(
      /^Erfolgsquote bereits [\d,]+\s% — verglichen wird das Vermögen im schlechtesten Zehntel\.$/
    )
    await expect(care.getByTestId('uncertain-flow-delta')).toHaveText(/^mit: [+−±][\d.,]+/)
    await expect(care.getByTestId('worst-decile-unit')).toHaveText('schlechtestes Zehntel')
    await expect(care.locator('.sr-only')).toHaveText(
      /^Mit „Pflegekosten“: Vermögen im schlechtesten Zehntel [+−±].+\s€, ergibt .+\s€$/
    )
    await expect(care.locator('.sr-only')).not.toContainText('Erfolgsquote')
    const inheritance = list.locator('[data-flow-id="demo-inheritance"]')
    await expect(inheritance.locator('.sr-only')).toHaveText(
      /^Ohne „Erbschaft“: Vermögen im schlechtesten Zehntel /
    )
    // The stress levers above say the same, with one shared sentence.
    const levers = page.locator('#levers').getByTestId('lever-list')
    await levers.scrollIntoViewIfNeeded()
    await expect(levers).toHaveAttribute('data-measure', 'ready', { timeout: 60000 })
    await expect(levers.getByTestId('stress-lever-saturated')).toHaveText(await callout.innerText())

    // Labelled figures still fit a phone (polled: charts re-measure after a resize).
    for (const width of [390, 320]) {
      await page.setViewportSize({ width, height: 844 })
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), {
          message: `no horizontal overflow at ${width}px`,
        })
        .toBeLessThanOrEqual(0)
      await expect
        .poll(
          () =>
            list.evaluate(
              (element) =>
                [...element.querySelectorAll('.ws-levers-flow')].filter(
                  (row) => row.scrollWidth > row.clientWidth + 1
                ).length
            ),
          { message: `uncertain rows fit at ${width}px` }
        )
        .toBe(0)
    }
  })

  test('says so when the plan has no uncertain items', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 890 })
    await gotoWorkspace(page, '/de/simulation')
    await openSection(page, 'levers')
    const empty = page.locator('#levers').getByTestId('uncertain-flows-empty')
    await expect(empty).toContainText('Keine einmaligen oder befristeten Posten im Plan.')
    await empty.getByTestId('uncertain-flows-add').click()
    await expect(page.getByTestId('edit-panel')).toHaveAttribute('data-panel', 'flows')
  })

  test('fits a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await openDemoPlan(page)
    await openSection(page, 'levers')
    const list = page.locator('#levers').getByTestId('uncertain-flows')
    await waitMeasured(list)
    await expectNoHorizontalOverflow(page)
    const fits = await list.evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    expect(fits).toBe(true)
  })
})

/**
 * axe-core is not a dependency of this repo; point AXE_CORE_PATH at an
 * `axe.min.js` (axe-core ≥ 4.10) to run the accessibility checks.
 */
const AXE_PATH = process.env.AXE_CORE_PATH

test.describe('accessibility', () => {
  test.skip(!AXE_PATH || !existsSync(AXE_PATH), 'set AXE_CORE_PATH to an axe.min.js')

  async function axeViolations(page: Page, selector: string) {
    await page.addScriptTag({ content: readFileSync(AXE_PATH!, 'utf8') })
    return page.evaluate(async (context) => {
      const axe = (window as unknown as { axe: { run: (...args: unknown[]) => Promise<unknown> } })
        .axe
      const result = (await axe.run(context, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      })) as { violations: Array<{ id: string; nodes: Array<{ target: unknown }> }> }
      return result.violations.map((violation) => ({
        id: violation.id,
        targets: violation.nodes.map((node) => node.target),
      }))
    }, selector)
  }

  for (const [width, height] of [
    [1366, 890],
    [390, 844],
  ] as const) {
    for (const scheme of ['light', 'dark'] as const) {
      test(`panel and levers group: no violations at ${width}px, ${scheme}`, async ({ page }) => {
        await page.emulateMedia({ colorScheme: scheme })
        await page.setViewportSize({ width, height })
        await openDemoPlan(page)
        await openPanel(page, 'flows')
        await flowSwitch(page, 'demo-inheritance').click()
        await expect(flowRow(page, 'demo-inheritance')).toHaveAttribute('data-enabled', 'false')
        // Measure settled colours: the run the switch started has landed (the
        // live figures dim while one is in flight) and the switch has moved.
        await expect(page.getByTestId('run-status')).toHaveAttribute('data-state', 'updated')
        await page.waitForTimeout(300)
        expect(await axeViolations(page, '[data-testid="edit-panel"]')).toEqual([])

        await closePanel(page)
        await openSection(page, 'levers')
        const list = page.locator('#levers').getByTestId('uncertain-flows')
        await list.scrollIntoViewIfNeeded()
        await expect(list).toHaveAttribute('data-measure', 'ready', { timeout: 60000 })
        expect(await axeViolations(page, '[data-testid="uncertain-flows"]')).toEqual([])
      })
    }
  }
})

test.describe('the setup wizard one-off list', () => {
  test('keeps a switched-off one-off listed, dimmed, with the same switch', async ({ page }) => {
    await page.setViewportSize({ width: 1366, height: 890 })
    await openDemoPlan(page)
    await page.goto('/de/setup')
    // Hydrated: the live preview has computed.
    await expect(page.getByTestId('wizard-live-result')).not.toHaveAttribute(
      'data-success-rate',
      '',
      { timeout: 20000 }
    )

    // Switched off in the cash-flow step …
    await page.getByRole('button', { name: /Einnahmen & Ausgaben/ }).click()
    const flowToggle = page.getByTestId('cashflow-switch-demo-inheritance')
    await flowToggle.click()
    await expect(flowToggle).toHaveAttribute('aria-checked', 'false')

    // … it stays in the one-off list: muted, tagged, with its switch.
    await page.getByRole('button', { name: /Vermögen & Einkommen/ }).click()
    const row = page.getByTestId('one-time-income-row-demo-inheritance')
    await expect(row).toHaveAttribute('data-enabled', 'false')
    await expect(row).toContainText('Erbschaft')
    await expect(row.getByTestId('one-time-income-off-demo-inheritance')).toHaveText('Aus')
    await expect(page.getByTestId('one-time-income-switched-off-summary')).toContainText(
      '1 Posten ausgeschaltet'
    )
    const toggle = row.getByRole('switch', { name: '„Erbschaft“ in der Berechnung' })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    // The switch is the row's first control, as in the flow list.
    const first = await row.evaluate(
      (element) => element.querySelector('button, input, select, a[href]')?.id ?? null
    )
    expect(first).toBe('one-time-income-switch-demo-inheritance')

    // Editing a switched-off one-off keeps it switched off (and keeps the flow).
    await row.getByRole('button', { name: /^Einnahme bearbeiten/ }).click()
    const amount = page.getByRole('textbox', { name: /^Betrag \(€\): Erbschaft/ })
    await amount.fill('90000')
    await page.getByRole('button', { name: /^Änderungen speichern: Erbschaft/ }).click()
    await expect(row).toHaveAttribute('data-enabled', 'false')
    expect(await storedFlow(page, 'demo-inheritance')).toMatchObject({
      enabled: false,
      amount: 90000,
      nameKey: 'demoInheritance',
      startAge: 70,
    })

    // Switched back on from the one-off list.
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect(row).toHaveAttribute('data-enabled', 'true')
    await expect(row.getByTestId('one-time-income-off-demo-inheritance')).toHaveCount(0)
    await expect(page.getByTestId('one-time-income-switched-off-summary')).toHaveCount(0)
    const stored = await storedFlow(page, 'demo-inheritance')
    expect(stored).toMatchObject({ amount: 90000 })
    expect(stored?.enabled).toBeUndefined()
    const state = await readPersistedState(page)
    expect(state?.working?.oneTimeIncomes).toEqual([
      { name: 'Inheritance', age: 70, amount: 90000 },
    ])
    // One flow, never a re-added duplicate.
    const flows = (state?.working?.cashFlows ?? []) as Array<{ kind: string; frequency: string }>
    expect(
      flows.filter((flow) => flow.kind === 'income' && flow.frequency === 'once')
    ).toHaveLength(1)

    // The extra switch column still fits a phone: nothing clipped.
    await toggle.click()
    await page.setViewportSize({ width: 390, height: 844 })
    await expect(row).toHaveAttribute('data-enabled', 'false')
    const [tableWidth, frameWidth] = await row
      .locator('xpath=ancestor::table[1]')
      .evaluate((element) => [element.scrollWidth, element.parentElement!.clientWidth])
    expect(tableWidth).toBeLessThanOrEqual(frameWidth)
    await expectNoHorizontalOverflow(page)
  })
})

/**
 * A copy of the example plan that differs in flows: the inheritance switched
 * off, the roof gone, care dearer, a boat sale and eight one-off extras added.
 */
async function seedFlowVariant(page: Page) {
  await page.evaluate(() => {
    const key = 'retirement-simulator-store'
    const parsed = JSON.parse(window.localStorage.getItem(key)!)
    const state = parsed.state
    const base = state.plans.find((plan: { id: string }) => plan.id === state.activePlanId)
    type Flow = { id: string; amount: number; enabled?: boolean } & Record<string, unknown>
    const cashFlows: Flow[] = (base.params.cashFlows as Flow[])
      .filter((flow) => flow.id !== 'demo-roof')
      .map((flow) =>
        flow.id === 'demo-inheritance'
          ? { ...flow, enabled: false }
          : flow.id === 'demo-care'
            ? { ...flow, amount: 2500 }
            : flow
      )
    cashFlows.push({
      id: 'variant-boat',
      kind: 'income',
      name: 'Bootsverkauf',
      amount: 15000,
      frequency: 'once',
      startAge: 75,
    })
    for (let index = 1; index <= 8; index++) {
      cashFlows.push({
        id: `variant-extra-${index}`,
        kind: 'expense',
        name: `Extra ${index}`,
        amount: 1000 * index,
        frequency: 'once',
        startAge: 70 + index,
      })
    }
    const { nameKey: _nameKey, ...plan } = base
    void _nameKey
    state.plans.push({
      ...plan,
      id: 'flow-variant',
      name: 'Variante',
      // The legacy projection, in step with the flows (the boat sale is the
      // only switched-on one-off income left).
      params: {
        ...base.params,
        cashFlows,
        oneTimeIncomes: [{ name: 'Bootsverkauf', age: 75, amount: 15000 }],
      },
    })
    window.localStorage.setItem(key, JSON.stringify(parsed))
  })
}

test.describe('compare: flows that set two plans apart', () => {
  test('lists flows only one plan has and changed amounts, capped', async ({ page }) => {
    test.setTimeout(90000)
    await page.setViewportSize({ width: 1366, height: 890 })
    await openDemoPlan(page)
    await seedFlowVariant(page)
    await page.goto('/de/simulation#compare')
    await page.reload()
    const view = page.getByTestId('compare-view')
    // Line up the example against the variant only.
    const variant = view.getByRole('button', { name: 'Variante' })
    await variant.click()
    await expect(variant).toHaveAttribute('aria-pressed', 'true')
    const other = view.getByRole('button', { name: 'Basisplan' })
    if ((await other.getAttribute('aria-pressed')) === 'true') await other.click()
    await expect(other).toHaveAttribute('aria-pressed', 'false')
    const rows = view.getByTestId('compare-flow-row')
    await expect(rows.first()).toBeVisible({ timeout: 45000 })

    // Eight rows, the switch flip first; the rest behind a button.
    await expect(rows).toHaveCount(8)
    const inheritance = view.getByRole('row', { name: /^Erbschaft/ })
    await expect(inheritance).toHaveAttribute('data-flow-change', 'switch')
    await expect(inheritance).toContainText('berücksichtigt')
    await expect(inheritance).toContainText('ausgeschaltet')

    // Only in the base plan: amount and when, "—" (nicht im Plan) on the other side.
    const roof = view.getByRole('row', { name: /^Dachsanierung/ })
    await expect(roof).toHaveAttribute('data-flow-change', 'presence')
    await expect(roof).toContainText(/28\.000\s€ einmalig/)
    await expect(roof).toContainText('Mit 64')
    await expect(roof).toContainText('nicht im Plan')
    // Only in the variant.
    const boat = view.getByRole('row', { name: /^Bootsverkauf/ })
    await expect(boat).toContainText(/15\.000\s€ einmalig/)
    await expect(boat.locator('td').nth(1)).toContainText('—')

    const more = view.getByTestId('compare-flow-more')
    await expect(more).toHaveText('4 weitere Posten zeigen')
    await more.click()
    await expect(rows).toHaveCount(12)
    // Same flow, other amount: both sides, with the window.
    const care = view.getByRole('row', { name: /^Pflegekosten/ })
    await expect(care).toHaveAttribute('data-flow-change', 'terms')
    await expect(care).toContainText(/2\.200\s€\/Mon\./)
    await expect(care).toContainText(/2\.500\s€\/Mon\./)
    await expect(care).toContainText('Alter 82–90')
    await expect(more).toHaveText('Weniger Posten zeigen')

    // Readable on a phone: nothing spills out of the page or the table.
    await page.setViewportSize({ width: 390, height: 844 })
    await care.scrollIntoViewIfNeeded()
    await expectNoHorizontalOverflow(page)
    const fits = await view
      .locator('.compare-table')
      .evaluate((element) => element.scrollWidth <= element.clientWidth + 1)
    expect(fits).toBe(true)
  })
})
