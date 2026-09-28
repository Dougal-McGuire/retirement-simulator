import type { Page } from '@playwright/test'
import {
  duplicateFromResult,
  enterCompare,
  expect,
  expectNoHorizontalOverflow,
  gotoWorkspace,
  isPainted,
  openPanel,
  openPlanMenu,
  openSection,
  readPersistedState,
  sectionHeading,
  SECTIONS,
  settledTop,
  successRate,
  test,
  waitForResults,
  waitForScrollSettled,
  type PanelId,
} from './helpers/workspace'

/**
 * The one-page workspace (spec docs/specs/2026-09-28-one-page-workspace.md,
 * §9.3). Phase 1 wrote tests 1–9; lane D extended them with the remaining
 * contract behaviour (deep-link sources, compare exits, Escape layering,
 * cards, reset, page-level save, scroll anchoring). Numbers tween, so values
 * are read from `data-value` and polled rather than matched as text.
 */

test('1 · docked panel: title focus, Tab to a field, Escape returns focus; the page stays live', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/de/simulation')
  await waitForResults(page)

  const edit = page.getByTestId('edit-savings')
  await edit.click()
  const panel = page.getByTestId('edit-panel')
  await expect(panel).toHaveAttribute('data-mode', 'docked')
  await expect(page.getByTestId('edit-panel-title')).toBeFocused()
  await expect(page.getByTestId('edit-panel-title')).toHaveText('Vermögen & Sparen')
  await expect(page).toHaveURL(/#assumptions:savings$/)
  await expect(edit).toHaveAttribute('aria-expanded', 'true')

  const field = page.locator('#editor-currentAssets')
  for (let i = 0; i < 8; i++) {
    if (await field.evaluate((el) => el === document.activeElement)) break
    await page.keyboard.press('Tab')
  }
  await expect(field).toBeFocused()

  // Clicking the page does not dismiss a docked panel.
  await page.getByRole('heading', { level: 2, name: 'Annahmen' }).click()
  await expect(panel).toBeVisible()

  // Escape from inside the panel closes it and returns focus to the card.
  await field.focus()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(edit).toBeFocused()
  await expect(page).toHaveURL(/#assumptions$/)
})

for (const width of [1100, 820]) {
  test(`2 · overlay panel at ${width}px: under the bar, page inert, bar live, scrim closes`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/en/simulation')
    await waitForResults(page)

    const edit = page.getByTestId('edit-savings')
    await edit.click()
    const panel = page.getByTestId('edit-panel')
    await expect(panel).toHaveAttribute('data-mode', 'overlay')
    const bar = (await page.getByTestId('result-bar').boundingBox())!
    const box = (await panel.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1)
    await expect(page.locator('.ws-main')).toHaveAttribute('inert', '')
    await expect(page.getByTestId('result-bar')).not.toHaveAttribute('inert', /.*/)

    // Edit in the panel; the bar goes dirty and Save works with the panel open.
    const savings = page.locator('#editor-annualSavings')
    await savings.fill('20000')
    await savings.blur()
    await expect(page.getByTestId('command-save')).toBeVisible()
    await page.getByTestId('command-save').click()
    await expect(page.getByTestId('command-save')).toHaveCount(0)
    await expect(panel).toBeVisible()

    await page.getByTestId('edit-panel-scrim').click({ position: { x: 10, y: 200 } })
    await expect(panel).toHaveCount(0)
    await expect(page.locator('.ws-main')).not.toHaveAttribute('inert', /.*/)
    await expect(edit).toBeFocused()
  })
}

test('3 · phone bottom sheet covers the index and carries the live result', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/de/simulation')
  await waitForResults(page)

  await page.getByTestId('edit-person').click()
  const panel = page.getByTestId('edit-panel')
  await expect(panel).toHaveAttribute('data-mode', 'sheet')
  await expect(panel).toHaveAttribute('aria-modal', 'true')
  const sheet = (await panel.boundingBox())!
  const index = (await page.getByTestId('section-index').boundingBox())!
  expect(sheet.y).toBeLessThanOrEqual(index.y)
  expect(sheet.y + sheet.height).toBeGreaterThanOrEqual(index.y + index.height - 1)
  await expect(page.getByTestId('result-bar')).toHaveAttribute('inert', '')

  const mini = page.getByTestId('edit-panel-mini-result')
  await expect(mini).toHaveAttribute('data-value', (await successRate(page))!)
  await page.locator('#editor-retirementAge [role="slider"]').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('success-delta')).toBeAttached()
  await expect
    .poll(async () => (await mini.getAttribute('data-value')) === (await successRate(page)))
    .toBe(true)

  await page.getByTestId('edit-panel-done').click()
  await expect(panel).toHaveCount(0)
  await expect(page.getByTestId('edit-person')).toBeFocused()
})

test('4 · the result bar and the fan chart update live while a panel is open', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/en/simulation')
  await waitForResults(page)
  const before = await successRate(page)

  // Life stage "Retirement" deep-links to the retirement-age slider.
  await page.getByTestId('life-stage-retirement').click()
  const panel = page.getByTestId('edit-panel')
  await expect(panel).toHaveAttribute('data-panel', 'person')
  const thumb = page.locator('#editor-retirementAge [role="slider"]')
  await expect(thumb).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')

  await expect.poll(() => successRate(page), { timeout: 15000 }).not.toBe(before)
  await expect(page.getByTestId('success-delta')).toBeVisible()
  await expect(page.getByTestId('fan-chart')).toBeInViewport()
  await expect(panel).toBeVisible()
  await expect(page.getByTestId('result-bar')).toContainText('Unsaved')
})

test('5 · scroll-spy marks the section being read and replaces (never pushes) the hash', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/en')
  await page.goto('/en/simulation')
  await waitForResults(page)

  await page.locator('#cashflow').evaluate((el) => el.scrollIntoView())
  await expect(page.getByTestId('section-link-cashflow')).toHaveAttribute(
    'aria-current',
    'location'
  )
  await expect(page).toHaveURL(/#cashflow$/)
  await page.locator('#levers').evaluate((el) => el.scrollIntoView())
  await expect(page).toHaveURL(/#levers$/)
  await expect(page.getByTestId('section-link-levers')).toHaveAttribute('aria-current', 'location')
  await expect(page.locator('[aria-current="location"]')).toHaveCount(1)

  await page.goBack()
  await expect(page).toHaveURL(/\/en$/)
})

test('6 · hash deep links land under the bar, open panels, accept aliases, ignore others', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/de/simulation#levers')
  await waitForResults(page)
  const heading = page.locator('#levers-title')
  await expect(heading).toBeInViewport()
  await waitForScrollSettled(page)
  const bar = (await page.getByTestId('result-bar').boundingBox())!
  expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(bar.y + bar.height)
  await expect(page.getByTestId('section-link-levers')).toHaveAttribute('aria-current', 'location')

  await page.goto('/de/simulation#assumptions:flows')
  await waitForResults(page)
  await expect(page.getByTestId('edit-panel')).toHaveAttribute('data-panel', 'flows')
  await expect(page.locator('#plan-editor-expenses')).toBeVisible()

  await page.goto('/de/simulation#ergebnis')
  await waitForResults(page)
  await expect(page.getByTestId('section-link-result')).toHaveAttribute('aria-current', 'location')
  await expect(page.locator('#result-title')).toBeInViewport()

  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/de/simulation#main-content')
  await waitForResults(page)
  expect(errors).toEqual([])
  await expect(page.getByTestId('edit-panel')).toHaveCount(0)
  await expect(page.getByTestId('compare-view')).toHaveCount(0)
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(80)

  // An in-page hash change on a phone: the sections the scroll passes mount
  // on the way and push the target down, so the landing keeps re-aiming (the
  // popstate/hashchange pair must not cancel that).
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/de/simulation')
  await waitForResults(page)
  await page.goto('/de/simulation#levers')
  const gapBelowBar = async () => {
    const box = (await page.getByTestId('result-bar').boundingBox())!
    return (await heading.boundingBox())!.y - (box.y + box.height)
  }
  await expect.poll(gapBelowBar, { timeout: 10000 }).toBeLessThan(64)
  await waitForScrollSettled(page)
  expect(await gapBelowBar()).toBeGreaterThanOrEqual(0)
  expect(await gapBelowBar()).toBeLessThan(64)
})

test('compare re-entered with Forward: "Exit compare" steps back, so Back then leaves the page', async ({
  page,
}) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.goto('/en')
  await gotoWorkspace(page)
  await enterCompare(page)
  await page.goBack()
  await expect(page.getByTestId('compare-view')).toHaveCount(0)
  await page.goForward()
  await expect(page).toHaveURL(/#compare$/)
  await expect(page.getByTestId('compare-view')).toBeVisible()
  const entries = await page.evaluate(() => window.history.length)

  await page.getByTestId('compare-exit').click()
  await expect(page.getByTestId('compare-view')).toHaveCount(0)
  await expect(page.locator('.ws-sections')).toBeVisible()
  await expect(page).not.toHaveURL(/#compare/)
  expect(await page.evaluate(() => window.history.length)).toBe(entries)
  // No duplicate of the page in between: one Back leaves it.
  await page.goBack()
  await expect(page).toHaveURL(/\/en$/)
})

test('compare opened from a #compare link exits in place: Back still leaves the page', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1024, height: 900 })
  await page.goto('/en')
  await gotoWorkspace(page, '/en/simulation#compare')
  await expect(page.getByTestId('compare-view')).toBeVisible()
  await page.getByTestId('compare-exit').click()
  await expect(page.getByTestId('compare-view')).toHaveCount(0)
  // Still on the workspace (a Back here would have left it).
  await expect(page).toHaveURL(/\/en\/simulation$/)
  await expect(page.locator('.ws-sections')).toBeVisible()
  await page.goBack()
  await expect(page).toHaveURL(/\/en$/)
})

test('7 · compare is a page mode: #compare, Back restores the page, exit returns focus', async ({
  page,
}) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/en/simulation')
  await waitForResults(page)

  await page.getByTestId('section-link-assumptions').click()
  await waitForScrollSettled(page)
  const scrollY = await page.evaluate(() => window.scrollY)
  expect(scrollY).toBeGreaterThan(200)

  const trigger = page.getByTestId('plan-menu-trigger')
  await trigger.click()
  await page.getByTestId('plan-menu-compare').click()
  await expect(page).toHaveURL(/#compare$/)
  await expect(page.getByTestId('compare-view')).toBeVisible()
  await expect(page.locator('.ws-sections')).toBeHidden()
  await expect(page.locator('#compare-title')).toBeFocused()
  await expect(page.locator('[aria-current="location"]')).toHaveCount(0)

  await page.goBack()
  await expect(page.getByTestId('compare-view')).toHaveCount(0)
  await expect(page.locator('.ws-sections')).toBeVisible()
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(scrollY - 50)
  expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollY)).toBeLessThanOrEqual(50)
  await expect(page).not.toHaveURL(/#compare/)

  await trigger.click()
  await page.getByTestId('plan-menu-compare').click()
  await expect(page.locator('#compare-title')).toBeFocused()
  await page.getByTestId('compare-exit').click()
  await expect(page.getByTestId('compare-view')).toHaveCount(0)
  await expect(trigger).toBeFocused()
  await expect(page).not.toHaveURL(/#compare/)
})

for (const width of [320, 390]) {
  test(`compare on a ${width}px phone: "Exit compare" stays pinned under the bar`, async ({
    page,
  }) => {
    test.setTimeout(90000)
    await page.setViewportSize({ width, height: 700 })
    await gotoWorkspace(page)
    await duplicateFromResult(page)
    const compare = await enterCompare(page)
    // The chart and the table below it arrive with the comparison runs.
    await expect(compare.getByRole('table')).toBeVisible({ timeout: 45000 })
    await expectNoHorizontalOverflow(page)

    const exit = page.getByTestId('compare-exit')
    // To the end of the comparison (it grows as its chart mounts).
    await expect
      .poll(() =>
        page.evaluate(() => {
          window.scrollTo({ top: document.documentElement.scrollHeight, behavior: 'instant' })
          return window.scrollY
        })
      )
      .toBeGreaterThan(600)
    await waitForScrollSettled(page)
    await expect(exit).toBeInViewport({ ratio: 1 })
    // Under the result bar, above the bottom index, and not covered by either.
    const bar = (await page.getByTestId('result-bar').boundingBox())!
    const index = (await page.getByTestId('section-index').boundingBox())!
    const box = (await exit.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(bar.y + bar.height - 1)
    expect(box.y + box.height).toBeLessThanOrEqual(index.y)
    expect(await isPainted(exit)).toBe(true)
    // Compact: the pinned strip is not the whole wrapped header.
    const header = (await page.locator('.compare-header').boundingBox())!
    expect(header.y + header.height - (bar.y + bar.height)).toBeLessThan(80)
    await expectNoHorizontalOverflow(page)

    // A keyboard focus in the rows that slid away brings them back.
    await exit.focus()
    await page.keyboard.press('Shift+Tab')
    const add = page.getByRole('button', { name: /Add plan/ })
    await expect(add).toBeFocused()
    await expect(add).toBeInViewport({ ratio: 1 })
    expect(await isPainted(add)).toBe(true)

    await exit.click()
    await expect(page.getByTestId('compare-view')).toHaveCount(0)
  })
}

for (const width of [390, 1280]) {
  test(`"Result" in the index goes back to the very top at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await gotoWorkspace(page, '/de/simulation')
    await openSection(page, 'cashflow')
    if (width <= 760) await expect(page.getByTestId('plan-menu-trigger')).not.toBeInViewport()

    // The heading takes focus as for any section, but the page goes all the
    // way up — on a phone that brings the plan picker back.
    await openSection(page, 'result')
    expect(await page.evaluate(() => window.scrollY)).toBe(0)
    await expect(page.getByTestId('plan-menu-trigger')).toBeInViewport({ ratio: 1 })
    await expect(page).toHaveURL(/#result$/)
    // Scroll-spy agrees once it resumes.
    await page.evaluate(() => window.dispatchEvent(new Event('scroll')))
    await expect(page.getByTestId('section-link-result')).toHaveAttribute(
      'aria-current',
      'location'
    )
  })
}

test('8 · charts below the fold mount lazily', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/en/simulation')
  await waitForResults(page)
  await expect(page.getByTestId('cashflow-sankey')).toHaveCount(0)
  await expect(page.locator('#cashflow [data-lazy-state]').first()).toHaveAttribute(
    'data-lazy-state',
    'pending'
  )
  await page.locator('#cashflow').evaluate((el) => el.scrollIntoView())
  await expect(page.getByTestId('cashflow-sankey')).toBeVisible()
  await expect(page.locator('#cashflow [data-lazy-state]').first()).toHaveAttribute(
    'data-lazy-state',
    'mounted'
  )
})

test('9 · reduced motion: no panel transition, index jumps instantly', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/en/simulation')
  await waitForResults(page)

  await page.getByTestId('edit-market').click()
  const panel = page.getByTestId('edit-panel')
  await expect(panel).toBeVisible()
  expect(await panel.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s')
  expect(await panel.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  await page.getByTestId('edit-panel-close').click()

  const landed = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const link = document.querySelector<HTMLElement>('[data-testid="section-link-levers"]')!
        link.click()
        requestAnimationFrame(() =>
          resolve(document.getElementById('levers')!.getBoundingClientRect().top)
        )
      })
  )
  const bar = (await page.getByTestId('result-bar').boundingBox())!
  expect(landed).toBeLessThan(bar.y + bar.height + 40)
  expect(landed).toBeGreaterThanOrEqual(bar.y + bar.height)
})

test('exactly one section index is visible, where each width expects it', async ({ page }) => {
  await page.goto('/de/simulation')
  await waitForResults(page)
  for (const [width, position] of [
    [1440, 'relative'],
    [1280, 'relative'],
    [1024, 'relative'],
    [1023, 'sticky'],
    [820, 'sticky'],
    [761, 'sticky'],
    [760, 'fixed'],
    [390, 'fixed'],
    [320, 'fixed'],
  ] as const) {
    await page.setViewportSize({ width, height: 900 })
    const index = page.getByTestId('section-index')
    await expect(index).toHaveCount(1)
    await expect(index).toBeVisible()
    await expect(page.getByRole('navigation', { name: 'Abschnitte' })).toHaveCount(1)
    await expect(index).toHaveCSS('position', position)
    const box = (await index.boundingBox())!
    // ≥1024 the index sits in the rail (in flow, positioned only for its marker).
    if (position === 'relative') expect(box.x).toBeLessThan(184)
    if (position === 'fixed') expect(box.y + box.height).toBeCloseTo(900, 0)
    for (const link of await index.getByRole('link').all()) {
      const fits = await link.evaluate((el) => el.scrollWidth <= el.clientWidth)
      expect(fits, `section link fits at ${width}px`).toBe(true)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width
    )
    // The € switch: rail at ≥1024, otherwise only in the Menu.
    await expect(page.getByTestId('display-toggle')).toBeVisible({ visible: width >= 1024 })
  }
})

test('Menu holds report and settings; plans are managed from the plan menu', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 900 })
  await page.goto('/en/simulation')
  await waitForResults(page)

  await page.getByTestId('dashboard-tools').click()
  const menu = page.getByRole('dialog', { name: 'Report and settings' })
  await expect(menu.getByRole('button', { name: 'Generate Report' })).toBeFocused()
  await expect(menu.getByTestId('plan-switcher')).toHaveCount(0)
  await expect(menu.getByTestId('setup-link')).toHaveCount(0)
  await expect(menu.getByTestId('menu-display-toggle')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.locator('#assumptions').getByTestId('setup-link')).toHaveAttribute(
    'href',
    '/en/setup'
  )

  const trigger = page.getByTestId('plan-menu-trigger')
  await trigger.click()
  await expect(page.getByTestId('plan-menu-compare')).toHaveText('Compare plans')
  await page.getByTestId('plan-menu-manage').click()
  const manager = page.getByTestId('plan-manager')
  await expect(manager).toBeVisible()
  await expect(page.getByRole('dialog', { name: 'Manage plans' })).toBeVisible()
  await expect(page.getByTestId('plan-switcher-select')).toBeFocused()
  await manager.getByTestId('plan-duplicate').click()
  await expect(page.getByLabel('Name for the copy')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(manager).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(manager).toHaveCount(0)
  await expect(trigger).toBeFocused()
})

test('ledger labels open the matching panel and field, or the Entnahme section', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/en/simulation#cashflow')
  await waitForResults(page)

  await page.getByRole('button', { name: /^Capital gains tax – edit in/ }).click()
  await expect(page.getByTestId('edit-panel-title')).toHaveText('Market & taxes')
  await expect(page.locator('#editor-capitalGainsTax')).toBeFocused()
  await page.getByTestId('edit-panel-close').click()

  await page.getByRole('button', { name: /^Portfolio sale \(gross\) – edit in/ }).click()
  await expect(page.getByTestId('edit-panel')).toHaveCount(0)
  await expect(page.locator('#withdrawal-title')).toBeInViewport()
  await expect(
    page.locator('[data-testid="withdrawal-strategy-picker"] [aria-pressed="true"]')
  ).toBeFocused()
})

test('edit panel walks the four panels and Ctrl/Cmd+S saves from inside it', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/en/simulation')
  await waitForResults(page)

  await page.getByTestId('edit-person').click()
  for (const panel of ['savings', 'flows', 'market']) {
    await page.getByTestId('edit-panel-next').click()
    await expect(page.getByTestId('edit-panel')).toHaveAttribute('data-panel', panel)
    await expect(page.getByTestId('edit-panel-title')).toBeFocused()
  }
  await expect(page.getByTestId('edit-panel-next')).toHaveCount(0)
  await expect(page.locator('#plan-editor-personal')).toHaveCount(0)
  await page.getByTestId('edit-panel-previous').click()
  await expect(page.getByTestId('edit-panel')).toHaveAttribute('data-panel', 'flows')

  await page.getByTestId('edit-panel-next').click()
  const runs = page.locator('#editor-simulationRuns')
  await runs.fill('600')
  await runs.blur()
  await expect(page.getByTestId('command-save')).toBeVisible()
  await page.locator('#editor-simulationRuns').focus()
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('command-save')).toHaveCount(0)
  await expect(page.getByTestId('edit-panel')).toBeVisible()
})

test('compare: the section index and "Edit assumptions" leave compare for a section', async ({
  page,
}) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await gotoWorkspace(page)
  await duplicateFromResult(page)

  // Every index item still works in compare mode: leave, then go there.
  await enterCompare(page)
  await page.getByTestId('section-link-cashflow').click()
  await expect(page.getByTestId('compare-view')).toHaveCount(0)
  await expect(page.locator('.ws-sections')).toBeVisible()
  await expect(sectionHeading(page, 'cashflow')).toBeFocused()
  await waitForScrollSettled(page)
  await expect(sectionHeading(page, 'cashflow')).toBeInViewport()
  await expect(page.getByTestId('section-link-cashflow')).toHaveAttribute(
    'aria-current',
    'location'
  )
  await expect(page).toHaveURL(/#cashflow$/)

  // "Edit assumptions" leaves compare for the Annahmen section (no panel).
  const compare = await enterCompare(page)
  await expect(compare.getByRole('table')).toBeVisible({ timeout: 45000 })
  await compare.getByRole('button', { name: /Edit assumptions/ }).click()
  await expect(page.getByTestId('compare-view')).toHaveCount(0)
  await expect(sectionHeading(page, 'assumptions')).toBeFocused()
  await waitForScrollSettled(page)
  await expect(sectionHeading(page, 'assumptions')).toBeInViewport()
  await expect(page.getByTestId('edit-panel')).toHaveCount(0)
  await expect(page).not.toHaveURL(/#compare/)
})

test('Escape belongs to the layer that has focus, not to the docked panel', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await gotoWorkspace(page)
  const panel = await openPanel(page, 'savings')

  // The plan menu over a docked panel: Escape closes the menu only.
  const menu = await openPlanMenu(page)
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(page.getByTestId('plan-menu-trigger')).toBeFocused()
  await expect(panel).toBeVisible()

  // Focus outside the panel: Escape leaves it open.
  await page.keyboard.press('Escape')
  await expect(panel).toBeVisible()

  // The Menu dialog over a docked panel: Escape closes the Menu only.
  await page.getByTestId('dashboard-tools').click()
  const tools = page.getByRole('dialog', { name: 'Report and settings' })
  await expect(tools).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tools).toHaveCount(0)
  await expect(panel).toBeVisible()

  // From inside the panel, Escape closes it.
  await page.locator('#editor-currentAssets').focus()
  await page.keyboard.press('Escape')
  await expect(panel).toHaveCount(0)
  await expect(page.getByTestId('edit-savings')).toBeFocused()
})

test('an open panel keeps the heading order and adds no second banner', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await gotoWorkspace(page)
  for (const id of ['person', 'savings', 'flows', 'market'] as const) {
    const panel = await openPanel(page, id)
    // The panel title is an h2; everything under it is h3.
    await expect(panel.getByRole('heading', { level: 2 })).toHaveCount(1)
    await expect(panel.locator('h1, h4, h5, h6')).toHaveCount(0)
    // Docked beside the page: the result bar stays the only banner.
    await expect(page.getByRole('banner')).toHaveCount(1)
    await page.getByTestId('edit-panel-close').click()
    await expect(panel).toHaveCount(0)
  }
  await openPanel(page, 'market')
  await expect(page.getByTestId('edit-panel').getByRole('heading', { level: 3 })).not.toHaveCount(0)
})

test('deep links: life stages, the withdrawal fact and the savings pointer', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await gotoWorkspace(page)
  const panel = page.getByTestId('edit-panel')
  const title = page.getByTestId('edit-panel-title')

  // Life stages open the field that sets them.
  await page.getByTestId('life-stage-today').click()
  await expect(panel).toHaveAttribute('data-panel', 'person')
  await expect(page.locator('#editor-currentAge')).toBeFocused()
  await page.getByTestId('life-stage-horizon').click()
  await expect(page.locator('#editor-endAge')).toBeFocused()
  await page.getByTestId('life-stage-pension').click()
  await expect(panel).toHaveAttribute('data-panel', 'flows')
  await expect(title).toBeFocused()

  // Savings panel → "Go to Income & spending" switches the panel in place.
  await page.getByTestId('edit-panel-previous').click()
  await expect(panel).toHaveAttribute('data-panel', 'savings')
  await panel.getByRole('button', { name: /Go to Income & spending/ }).click()
  await expect(panel).toHaveAttribute('data-panel', 'flows')
  await expect(page.locator('#plan-editor-expenses')).toBeVisible()

  // The Ergebnis fact "monthly portfolio draw" links to Entnahme too.
  await openSection(page, 'result')
  await page.getByTestId('kpi-strip').getByRole('button').click()
  await expect(sectionHeading(page, 'withdrawal')).toBeFocused()
  await waitForScrollSettled(page)
  await expect(sectionHeading(page, 'withdrawal')).toBeInViewport()
})

test("the Market panel's withdrawal pointer closes the panel and lands on the rule", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await gotoWorkspace(page)
  // Reached by walking the panels, the way a reader goes through them.
  await page.getByTestId('life-stage-pension').click()
  const panel = page.getByTestId('edit-panel')
  await expect(panel).toHaveAttribute('data-panel', 'flows')
  await page.getByTestId('edit-panel-next').click()
  await expect(panel).toHaveAttribute('data-panel', 'market')

  await panel.getByRole('button', { name: /Go to Withdrawal/ }).click()
  await expect(panel).toHaveCount(0)
  await waitForScrollSettled(page)
  await expect(sectionHeading(page, 'withdrawal')).toBeInViewport()
  // Focus goes to the current rule (§3.3), not back to the Market card.
  const strategy = page.locator('[data-testid="withdrawal-strategy-picker"] [aria-pressed="true"]')
  await expect(strategy).toBeFocused()
  await expect(page.getByTestId('edit-market')).not.toBeFocused()
})

test('assumption cards show plan inputs, carry the panel state and ignore the € display', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await gotoWorkspace(page)

  const person = page.getByTestId('assumption-card-person')
  await expect(person).toContainText('Planned retirement')
  await expect(person).toContainText('At age 60')
  await expect(person).toContainText('Today 55 · planned to 90')
  await expect(person).toContainText('State pension from 67')
  const savings = page.getByTestId('assumption-card-savings')
  await expect(savings).toContainText('€630,000')
  await expect(page.getByTestId('assumption-card-flows')).toContainText('per month')
  await expect(page.getByTestId('assumption-card-market')).toContainText('return')
  await expect(page.locator('#assumptions')).toContainText("Starting values in today's euros")

  for (const id of ['person', 'savings', 'flows', 'market']) {
    const edit = page.getByTestId(`edit-${id}`)
    await expect(edit).toHaveAttribute('aria-controls', 'edit-panel')
    await expect(edit).toHaveAttribute('aria-expanded', 'false')
  }
  await expect(page.getByTestId('edit-person')).toHaveAccessibleName('Edit Personal & timeline')

  // Plan inputs are today's euros: the display switch leaves them alone.
  const toggle = page.getByTestId('display-toggle')
  await toggle.getByRole('radio', { name: "Today's €" }).click()
  await expect(toggle.getByRole('radio', { name: "Today's €" })).toHaveAttribute(
    'aria-checked',
    'true'
  )
  await expect(savings).toContainText('€630,000')

  // One card is expanded at a time, following the open panel.
  await openPanel(page, 'savings')
  await expect(page.getByTestId('edit-savings')).toHaveAttribute('aria-expanded', 'true')
  await page.getByTestId('edit-panel-next').click()
  await expect(page.getByTestId('edit-flows')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('edit-savings')).toHaveAttribute('aria-expanded', 'false')
})

for (const width of [1280, 1440]) {
  test(`docked panel at ${width}px: every open and close keeps the clicked card where it was`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 800 })
    await gotoWorkspace(page)
    await openSection(page, 'assumptions')
    const panel = page.getByTestId('edit-panel')

    // Open → close → a different card → close → the same card again: the
    // page column narrows and widens each time, and the card must not move
    // (Radix mounts the panel a commit later on every open after the first).
    const steps: [PanelId, 'close' | 'Escape'][] = [
      ['person', 'close'],
      ['market', 'Escape'],
      ['market', 'close'],
      ['person', 'Escape'],
    ]
    for (const [id, how] of steps) {
      const edit = page.getByTestId(`edit-${id}`)
      const before = await settledTop(page, edit)
      await edit.click()
      await expect(panel).toHaveAttribute('data-mode', 'docked')
      await expect(page.getByTestId('edit-panel-title')).toBeFocused()
      const opened = await settledTop(page, edit)
      expect(Math.abs(opened - before), `${id}: open`).toBeLessThanOrEqual(2)

      if (how === 'close') await page.getByTestId('edit-panel-close').click()
      else await page.keyboard.press('Escape')
      await expect(panel).toHaveCount(0)
      await expect(edit).toBeFocused()
      const closed = await settledTop(page, edit)
      expect(Math.abs(closed - before), `${id}: ${how}`).toBeLessThanOrEqual(2)
    }
  })
}

test('docked panel folds the rail to icons and hands the € switch to the Menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await gotoWorkspace(page)
  const index = page.getByTestId('section-index')
  const fullWidth = (await index.boundingBox())!.width
  const display = page.getByTestId('display-toggle')
  await expect(display).toBeVisible()

  // Open: icons only — the names stay the links' accessible names — and the
  // panel gets the room (≈520px at 1366, not the old 400).
  const panel = await openPanel(page, 'flows')
  await expect.poll(async () => (await index.boundingBox())!.width).toBeLessThan(64)
  await expect(index.getByRole('link', { name: 'Money flow' })).toBeVisible()
  expect((await panel.boundingBox())!.width).toBeGreaterThan(500)
  await expect(display).toBeHidden()
  await page.getByTestId('dashboard-tools').click()
  const menu = page.getByRole('dialog', { name: 'Report and settings' })
  await expect(menu.getByTestId('menu-display-toggle')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(panel).toBeVisible()

  // Close: the full rail and its switch come back.
  await page.getByTestId('edit-panel-close').click()
  await expect(panel).toHaveCount(0)
  await expect(display).toBeVisible()
  expect((await index.boundingBox())!.width).toBeCloseTo(fullWidth, 0)

  // Wide enough for rail, page column and panel side by side: the rail stays.
  await page.setViewportSize({ width: 1920, height: 1000 })
  await openPanel(page, 'flows')
  await expect(display).toBeVisible()
  expect((await index.boundingBox())!.width).toBeCloseTo(fullWidth, 0)
})

test('docked panel: a ledger ✎ link keeps its line in place, opened twice', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await gotoWorkspace(page)
  await openSection(page, 'cashflow')
  const link = page.getByRole('button', { name: /^Capital gains tax – edit in/ })
  await link.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
  const panel = page.getByTestId('edit-panel')

  for (const round of [1, 2]) {
    const before = await settledTop(page, link)
    await link.click()
    await expect(panel).toHaveAttribute('data-mode', 'docked')
    await expect(page.locator('#editor-capitalGainsTax')).toBeFocused()
    const opened = await settledTop(page, link)
    expect(Math.abs(opened - before), `open #${round}`).toBeLessThanOrEqual(2)

    await page.keyboard.press('Escape')
    await expect(panel).toHaveCount(0)
    await expect(link).toBeFocused()
    const closed = await settledTop(page, link)
    expect(Math.abs(closed - before), `close #${round}`).toBeLessThanOrEqual(2)
  }
})

/** Which live part of the page holds focus: the bar, the panel, a toast — or the page. */
async function focusZone(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return 'body'
    if (el.closest('[data-testid="result-bar"]')) return 'bar'
    if (el.closest('#edit-panel')) return 'panel'
    if (el.closest('[data-rht-toaster]')) return 'toast'
    return `page:${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}`
  })
}

for (const width of [1024, 800]) {
  test(`overlay panel at ${width}px: Tab runs between the panel and the live bar, never into the page`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 768 })
    await gotoWorkspace(page)
    const panel = await openPanel(page, 'savings')
    await expect(panel).toHaveAttribute('data-mode', 'overlay')
    const savings = page.locator('#editor-annualSavings')
    await savings.fill('20000')
    await savings.blur()
    const save = page.getByTestId('command-save')
    await expect(save).toBeVisible()

    // Past the panel's last control ("Done") Tab enters the bar instead of
    // looping back to ✕, and walks on to Save.
    await page.getByTestId('edit-panel-done').focus()
    await page.keyboard.press('Tab')
    expect(await focusZone(page)).toBe('bar')
    for (let i = 0; i < 10 && !(await save.evaluate((el) => el === document.activeElement)); i++) {
      await page.keyboard.press('Tab')
      expect(await focusZone(page)).toBe('bar')
    }
    await expect(save).toBeFocused()
    await page.keyboard.press('Enter')
    await expect(save).toHaveCount(0)
    expect((await readPersistedState(page))?.storedPlan?.annualSavings).toBe(20000)
    await expect(panel).toBeVisible()

    // From the bar's last control (Menu) Tab goes back into the panel; from
    // the panel's first control Shift+Tab goes to the bar's last.
    const menu = page.getByTestId('dashboard-tools')
    await menu.focus()
    await page.keyboard.press('Tab')
    await expect(page.getByTestId('edit-panel-close')).toBeFocused()
    await page.keyboard.press('Shift+Tab')
    await expect(menu).toBeFocused()

    // Both directions cycle through the bar and the panel only: the inert
    // page behind the scrim is never reached.
    for (const key of ['Tab', 'Shift+Tab']) {
      const zones = new Set<string>()
      for (let i = 0; i < 40; i++) {
        await page.keyboard.press(key)
        zones.add(await focusZone(page))
      }
      expect([...zones].sort(), key).toEqual(['bar', 'panel'])
    }
  })
}

test('reset to defaults is a draft with an undo', async ({ page }) => {
  await gotoWorkspace(page)
  // Save a plan that differs from the defaults first.
  await openPanel(page, 'savings')
  const assets = page.locator('#editor-currentAssets')
  await assets.fill('900000')
  await assets.blur()
  await page.getByTestId('command-save').click()
  await expect(page.getByTestId('command-save')).toHaveCount(0)
  await page.getByTestId('edit-panel-done').click()

  await page.getByTestId('plan-editor-reset').click()
  const dialog = page.getByTestId('plan-reset-dialog')
  await expect(dialog).toBeVisible()
  await dialog.getByTestId('plan-reset-confirm').click()
  await expect(dialog).toHaveCount(0)

  // The working copy is back on the defaults, but nothing is saved yet.
  await expect
    .poll(async () => (await readPersistedState(page))?.working?.currentAssets)
    .toBe(630000)
  expect((await readPersistedState(page))?.storedPlan?.currentAssets).toBe(900000)
  await expect(page.getByTestId('result-bar')).toHaveAttribute('data-dirty', 'true')

  await page.getByTestId('plan-reset-toast').getByTestId('plan-reset-toast-undo').click()
  await expect
    .poll(async () => (await readPersistedState(page))?.working?.currentAssets)
    .toBe(900000)
})

test('Ctrl/Cmd+S saves a draft from anywhere on the page and says so', async ({ page }) => {
  await gotoWorkspace(page)
  // Nothing to save: the shortcut is swallowed quietly (no browser dialog).
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByText('Saved to “Base plan”')).toHaveCount(0)

  await openPanel(page, 'savings')
  const savings = page.locator('#editor-annualSavings')
  await savings.fill('20000')
  await savings.blur()
  await page.getByTestId('edit-panel-done').click()
  await expect(page.getByTestId('edit-panel')).toHaveCount(0)
  await expect(page.getByTestId('command-save')).toBeVisible()

  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('command-save')).toHaveCount(0)
  await expect(page.getByText('Saved to “Base plan”')).toBeVisible()
  expect((await readPersistedState(page))?.storedPlan?.annualSavings).toBe(20000)
})

test('the result bar lifts off the page once it scrolls', async ({ page }) => {
  await gotoWorkspace(page)
  const bar = page.getByTestId('result-bar')
  await expect(bar).not.toHaveAttribute('data-scrolled', /.*/)
  await openSection(page, 'cashflow')
  await expect(bar).toHaveAttribute('data-scrolled', 'true')
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect(bar).not.toHaveAttribute('data-scrolled', /.*/)
})

test('ids stay unique once every section has mounted', async ({ page }) => {
  await gotoWorkspace(page)
  // Visit each section so every lazily mounted chart and list is in the DOM.
  for (const id of SECTIONS.slice(1)) {
    await openSection(page, id)
    await expect(page.locator(`#${id} [data-lazy-state="pending"]`)).toHaveCount(0)
  }
  const duplicates = await page.evaluate(() => {
    const seen = new Map<string, number>()
    for (const el of document.querySelectorAll('[id]')) {
      seen.set(el.id, (seen.get(el.id) ?? 0) + 1)
    }
    return [...seen].filter(([, count]) => count > 1).map(([id]) => id)
  })
  expect(duplicates, 'duplicate element ids').toEqual([])
})
