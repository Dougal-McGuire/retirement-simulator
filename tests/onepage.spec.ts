import {
  closePanel,
  duplicateActivePlan,
  enterCompare,
  expect,
  expectNoHorizontalOverflow,
  gotoWorkspace,
  groupHeader,
  isPainted,
  openPanel,
  openPlanMenu,
  openSection,
  PANELS,
  readPersistedState,
  sectionHeading,
  SECTIONS,
  settledTop,
  showColumn,
  successRate,
  test,
  waitForResults,
  waitForScrollSettled,
} from './helpers/workspace'

/**
 * The one-page workspace as a frame: bar, result canvas, dock and control
 * column (docs/specs/2026-11-10-result-in-view.md). This file covers the
 * frame's mechanics — how the column presents per width, the hash, compare
 * as a page mode, focus and landmarks. That the result stays in view while
 * editing is `result-in-view.spec.ts`. Numbers tween, so values are read from
 * `data-value` and polled rather than matched as text.
 *
 * Migrated from the edit-panel version of this spec. Tests of things that no
 * longer exist were deleted rather than bent: the scrim, the panel's
 * previous / next / Done walk and its phone mini result, the rail folding to
 * icons, Escape closing a docked panel, the overlay's Tab cycle through an
 * inert page, and the scroll anchoring that kept a card in place while the
 * page column re-flowed (the column is permanent now: nothing re-flows).
 */

/** The bottom edge of the pinned chrome at the top: the dock when it is pinned, else the bar. */
async function pinnedBottom(page: import('@playwright/test').Page): Promise<number> {
  const dock = page.getByTestId('result-dock')
  const pinned = (await dock.getAttribute('data-pinned')) === 'true'
  const box = (await (pinned ? dock : page.getByTestId('result-bar')).boundingBox())!
  return box.y + box.height
}

test('1 · the column is a permanent pane at 1366: groups toggle, the hash names the group, the canvas stays live', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/de/simulation')
  await waitForResults(page)

  const column = page.getByTestId('edit-panel')
  await expect(column).toBeVisible()
  await expect(column).toHaveAttribute('data-mode', 'docked')
  // Beside the canvas, under the bar, 480 px wide (R1).
  const box = (await column.boundingBox())!
  const bar = (await page.getByTestId('result-bar').boundingBox())!
  expect(box.width).toBe(480)
  expect(box.x + box.width).toBe(1366)
  expect(box.y).toBe(bar.y + bar.height)
  const canvas = (await page.locator('.ws-main').boundingBox())!
  expect(canvas.x + canvas.width).toBeLessThanOrEqual(box.x + 1)

  // "Zeit" and "Einnahmen & Ausgaben" are open; the others show their key figure.
  await expect(groupHeader(page, 'person')).toHaveAttribute('aria-expanded', 'true')
  await expect(groupHeader(page, 'flows')).toHaveAttribute('aria-expanded', 'true')
  const savings = groupHeader(page, 'savings')
  await expect(savings).toHaveAttribute('aria-expanded', 'false')
  await expect(savings).toContainText('Vermögen & Sparen')
  await expect(page.locator('#plan-editor-income')).toHaveCount(0)

  await savings.click()
  await expect(savings).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#plan-editor-income')).toBeVisible()
  await expect(page).toHaveURL(/#result:savings$/)
  // Several groups stay open side by side.
  await expect(groupHeader(page, 'person')).toHaveAttribute('aria-expanded', 'true')

  // Tab walks from the header into the group's fields.
  await savings.focus()
  const field = page.locator('#editor-currentAssets')
  for (let i = 0; i < 8; i++) {
    if (await field.evaluate((el) => el === document.activeElement)) break
    await page.keyboard.press('Tab')
  }
  await expect(field).toBeFocused()

  // The canvas is never inert: its controls work with the column in use.
  await expect(page.locator('.ws-main')).not.toHaveAttribute('inert', /.*/)
  await page.getByTestId('section-link-cashflow').click()
  await expect(sectionHeading(page, 'cashflow')).toBeFocused()
  await expect(column).toBeVisible()

  // Closing the group the hash names takes it out of the hash.
  await savings.click()
  await expect(savings).toHaveAttribute('aria-expanded', 'false')
  await expect(page).toHaveURL(/#cashflow$/)
})

for (const [width, openAtFirst] of [
  [1100, true],
  [820, false],
] as const) {
  test(`2 · drawer at ${width}px: below the dock, no scrim, canvas and bar live, folds to a rail`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/en/simulation')
    await waitForResults(page)

    const column = page.getByTestId('edit-panel')
    const toggle = page.getByTestId('edit-panel-toggle')
    await expect(column).toHaveAttribute('data-mode', 'drawer')
    // Unfolded by default from 1000 px, a rail below.
    await expect(toggle).toHaveAttribute('aria-expanded', String(openAtFirst))
    await showColumn(page)
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')

    // It starts under the dock and never covers it; nothing dims the page.
    const dock = (await page.getByTestId('result-dock').boundingBox())!
    const box = (await column.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(dock.y + dock.height - 1)
    expect(box.width).toBe(Math.min(440, width - 64))
    expect(box.x + box.width).toBe(width)
    await expect(page.getByTestId('edit-panel-scrim')).toHaveCount(0)
    await expect(page.locator('.ws-main')).not.toHaveAttribute('inert', /.*/)
    await expect(page.getByTestId('result-bar')).not.toHaveAttribute('inert', /.*/)

    // Edit in the drawer; the bar goes dirty and Save works with it open.
    await openPanel(page, 'savings')
    const savings = page.locator('#editor-annualSavings')
    await savings.fill('20000')
    await savings.blur()
    await expect(page.getByTestId('command-save')).toBeVisible()
    await page.getByTestId('command-save').click()
    await expect(page.getByTestId('command-save')).toHaveCount(0)
    await expect(column).toBeVisible()

    // Folded: a 48 px rail with the one control that brings it back. The
    // canvas keeps its width either way — the open drawer lies over it.
    const canvasOpen = (await page.locator('.ws-main').boundingBox())!.width
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#edit-panel-body')).toBeHidden()
    expect((await column.boundingBox())!.width).toBe(48)
    expect((await page.locator('.ws-main').boundingBox())!.width).toBe(canvasOpen)
    await expect(toggle).toBeVisible()
    await toggle.click()
    await expect(page.locator('#edit-panel-body')).toBeVisible()
    await expectNoHorizontalOverflow(page)
  })
}

test('3 · phone: "Stellen" shows the column between the pinned dock and the mode bar; the dock carries the live result', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/de/simulation')
  await waitForResults(page)

  const column = page.getByTestId('edit-panel')
  await expect(column).toBeHidden()
  await expect(page.getByTestId('mode-view')).toHaveAttribute('aria-pressed', 'true')

  await page.getByTestId('mode-edit').click()
  await expect(column).toBeVisible()
  await expect(column).toHaveAttribute('data-mode', 'sheet')
  await expect(page.getByTestId('mode-edit')).toHaveAttribute('aria-pressed', 'true')
  // The canvas is behind the column: out of the tab order while it is.
  await expect(page.locator('.ws-main')).toHaveAttribute('inert', '')

  const dock = (await page.getByTestId('result-dock').boundingBox())!
  const modes = (await page.getByTestId('mode-bar').boundingBox())!
  const sheet = (await column.boundingBox())!
  expect(sheet.y).toBeGreaterThanOrEqual(dock.y + dock.height - 1)
  expect(sheet.y + sheet.height).toBeLessThanOrEqual(modes.y + 1)
  expect(sheet.width).toBe(390)
  await expect(page.getByTestId('result-bar')).not.toHaveAttribute('inert', /.*/)

  // The dock above the column is the result: it moves with the edit.
  const before = await successRate(page)
  await expect(page.getByTestId('success-pill')).toBeInViewport({ ratio: 1 })
  await page.locator('#editor-retirementAge [role="slider"]').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('success-delta')).toBeVisible()
  await expect.poll(() => successRate(page), { timeout: 15000 }).not.toBe(before)
  expect(await isPainted(page.getByTestId('success-pill'))).toBe(true)

  // The draft row sits above the mode bar, in both modes.
  const save = page.getByTestId('command-save')
  await expect(save).toBeInViewport({ ratio: 1 })
  expect((await save.boundingBox())!.y + (await save.boundingBox())!.height).toBeLessThanOrEqual(
    modes.y + 1
  )

  await page.getByTestId('mode-view').click()
  await expect(column).toBeHidden()
  await expect(page.locator('.ws-main')).not.toHaveAttribute('inert', /.*/)
  await expect(save).toBeInViewport({ ratio: 1 })
  await expectNoHorizontalOverflow(page)
})

test('4 · the head and its chart update live while a value is changed in the column', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/en/simulation')
  await waitForResults(page)
  const before = await successRate(page)

  const thumb = page.locator('#editor-retirementAge [role="slider"]')
  await thumb.focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')

  await expect.poll(() => successRate(page), { timeout: 15000 }).not.toBe(before)
  await expect(page.getByTestId('success-delta')).toBeVisible()
  await expect(page.getByTestId('fan-chart')).toBeInViewport()
  await expect(page.getByTestId('result-bar')).toContainText('1 change')
  await expect(page.getByTestId('verdict')).toContainText('of 100 paths')
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

test('6 · hash deep links land under the pinned chrome, open groups, accept aliases, ignore others', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/de/simulation#levers')
  await waitForResults(page)
  const heading = page.locator('#levers-title')
  await expect(heading).toBeInViewport()
  await waitForScrollSettled(page)
  // Below the bar and the dock, which is pinned this far down the canvas.
  await expect(page.getByTestId('result-dock')).toHaveAttribute('data-pinned', 'true')
  expect((await heading.boundingBox())!.y).toBeGreaterThanOrEqual(await pinnedBottom(page))
  await expect(page.getByTestId('section-link-levers')).toHaveAttribute('aria-current', 'location')

  await page.goto('/de/simulation#assumptions:market')
  await waitForResults(page)
  await expect(groupHeader(page, 'market')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#plan-editor-market')).toBeVisible()
  await expect(groupHeader(page, 'market')).toBeFocused()

  await page.goto('/de/simulation#ergebnis')
  await waitForResults(page)
  await expect(page.getByTestId('fan-chart')).toBeInViewport()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)

  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto('/de/simulation#main-content')
  await waitForResults(page)
  expect(errors).toEqual([])
  // A foreign hash changes nothing: the column and its open groups stay.
  await expect(page.getByTestId('edit-panel')).toBeVisible()
  await expect(groupHeader(page, 'market')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.getByTestId('compare-view')).toHaveCount(0)
  expect(await page.evaluate(() => window.scrollY)).toBeLessThan(80)

  // An in-page hash change on a phone: the sections the scroll passes mount
  // on the way and push the target down, so the landing keeps re-aiming (the
  // popstate/hashchange pair must not cancel that).
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/de/simulation')
  await waitForResults(page)
  await page.goto('/de/simulation#levers')
  const gapBelowDock = async () => (await heading.boundingBox())!.y - (await pinnedBottom(page))
  await expect.poll(gapBelowDock, { timeout: 10000 }).toBeLessThan(64)
  await waitForScrollSettled(page)
  expect(await gapBelowDock()).toBeGreaterThanOrEqual(0)
  expect(await gapBelowDock()).toBeLessThan(64)
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

test('7 · compare is a page mode: #compare, the column gives way, Back restores the page, exit returns focus', async ({
  page,
}) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/en/simulation')
  await waitForResults(page)

  await openSection(page, 'cashflow')
  const scrollY = await page.evaluate(() => window.scrollY)
  expect(scrollY).toBeGreaterThan(200)

  const trigger = page.getByTestId('plan-menu-trigger')
  await trigger.click()
  await page.getByTestId('plan-menu-compare').click()
  await expect(page).toHaveURL(/#compare$/)
  await expect(page.getByTestId('compare-view')).toBeVisible()
  await expect(page.locator('.ws-sections')).toBeHidden()
  await expect(page.locator('#compare-title')).toBeFocused()
  // The comparison takes the page: no column, and the dock keeps the result.
  await expect(page.getByTestId('edit-panel')).toBeHidden()
  await expect(page.getByTestId('result-dock')).toHaveAttribute('data-pinned', 'true')
  await expect(page.getByTestId('success-pill')).toBeVisible()

  await page.goBack()
  await expect(page.getByTestId('compare-view')).toHaveCount(0)
  await expect(page.locator('.ws-sections')).toBeVisible()
  await expect(page.getByTestId('edit-panel')).toBeVisible()
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
  test(`compare on a ${width}px phone: "Exit compare" stays pinned under the dock`, async ({
    page,
  }) => {
    test.setTimeout(90000)
    await page.setViewportSize({ width, height: 700 })
    await gotoWorkspace(page)
    await duplicateActivePlan(page)
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
    // Under the dock, above the mode bar, and not covered by either.
    const top = await pinnedBottom(page)
    const modes = (await page.getByTestId('mode-bar').boundingBox())!
    const box = (await exit.boundingBox())!
    expect(box.y).toBeGreaterThanOrEqual(top - 1)
    expect(box.y + box.height).toBeLessThanOrEqual(modes.y)
    expect(await isPainted(exit)).toBe(true)
    // Compact: the pinned strip is not the whole wrapped header.
    const header = (await page.locator('.compare-header').boundingBox())!
    expect(header.y + header.height - top).toBeLessThan(80)
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
  test(`the dock's mini chart goes back to the head at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    await gotoWorkspace(page, '/de/simulation')
    await openSection(page, 'cashflow')
    await expect(page.getByTestId('result-dock')).toHaveAttribute('data-pinned', 'true')
    await expect(page.getByTestId('fan-chart')).not.toBeInViewport({ ratio: 0.5 })

    await page.getByTestId('dock-chart').click()
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0)
    await expect(page.getByTestId('fan-chart')).toBeInViewport({ ratio: 0.9 })
    await expect(sectionHeading(page, 'result')).toBeFocused()
    await expect(page).toHaveURL(/#result$/)
    // From 1180 px the head is the result surface again and the dock steps back.
    if (width >= 1180) {
      await expect(page.getByTestId('result-dock')).toHaveAttribute('data-pinned', 'false')
      await expect(page.getByTestId('result-dock')).toBeHidden()
    }
  })
}

test('8 · sections below the fold mount lazily', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 })
  await page.goto('/en/simulation')
  await waitForResults(page)
  await expect(page.getByTestId('lever-list')).toHaveCount(0)
  await expect(page.locator('#levers [data-lazy-state]').first()).toHaveAttribute(
    'data-lazy-state',
    'pending'
  )
  await page.locator('#levers').evaluate((el) => el.scrollIntoView())
  await expect(page.getByTestId('lever-list')).toBeVisible()
  await expect(page.locator('#levers [data-lazy-state]').first()).toHaveAttribute(
    'data-lazy-state',
    'mounted'
  )
})

test('9 · reduced motion: no column or dock transition, anchors jump instantly', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/en/simulation')
  await waitForResults(page)

  await openPanel(page, 'market')
  const column = page.getByTestId('edit-panel')
  expect(await column.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s')
  const body = page.locator('#edit-market-body')
  expect(await body.evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
  const dock = page.getByTestId('result-dock')
  expect(await dock.evaluate((el) => getComputedStyle(el).transitionDuration)).toMatch(/^0s/)

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
  const stickyTop = bar.y + bar.height + 96
  expect(landed).toBeLessThan(stickyTop + 40)
  expect(landed).toBeGreaterThanOrEqual(stickyTop)
})

test('one set of anchors under the head, the mode bar only on phones, the € switch in the bar at every width', async ({
  page,
}) => {
  await page.goto('/de/simulation')
  await waitForResults(page)
  for (const width of [1920, 1440, 1280, 1180, 1179, 1024, 820, 761, 760, 390, 320]) {
    await page.setViewportSize({ width, height: 900 })
    const anchors = page.getByTestId('section-index')
    await expect(anchors).toHaveCount(1)
    await expect(page.getByRole('navigation', { name: 'Abschnitte' })).toHaveCount(1)
    await expect(anchors.getByRole('link')).toHaveText(['Geldfluss', 'Entnahme', 'Wirkung'])
    for (const link of await anchors.getByRole('link').all()) {
      const fits = await link.evaluate((el) => el.scrollWidth <= el.clientWidth)
      expect(fits, `section link fits at ${width}px`).toBe(true)
    }

    const modes = page.getByTestId('mode-bar')
    if (width <= 760) {
      await expect(modes).toBeVisible()
      await expect(modes).toHaveCSS('position', 'fixed')
      const box = (await modes.boundingBox())!
      expect(box.y + box.height).toBeCloseTo(900, 0)
    } else {
      await expect(modes).toBeHidden()
    }

    // How the column presents follows the width (R1).
    await expect(page.locator('.ws-page')).toHaveAttribute(
      'data-panel-mode',
      width >= 1180 ? 'docked' : width > 760 ? 'drawer' : 'sheet'
    )
    // One place for the € switch, always: the bar.
    const toggle = page.getByTestId('display-toggle')
    await expect(toggle).toHaveCount(1)
    await expect(toggle).toBeVisible()
    expect(await toggle.evaluate((el) => Boolean(el.closest('[data-testid="result-bar"]')))).toBe(
      true
    )
    await expectNoHorizontalOverflow(page)
  }
})

test('Menu holds the settings; the PDF and the € switch are in the bar; plans are managed from the plan menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: 820, height: 900 })
  await page.goto('/en/simulation')
  await waitForResults(page)

  // The export is one click from the bar, not a trip through the Menu.
  const report = page.getByTestId('bar-report').getByRole('button', { name: 'Generate Report' })
  await expect(report).toBeVisible()
  await expect(report).toBeEnabled()

  await page.getByTestId('dashboard-tools').click()
  const menu = page.getByRole('dialog', { name: 'Settings' })
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('button', { name: 'Generate Report' })).toBeHidden()
  await expect(menu.getByTestId('plan-switcher')).toHaveCount(0)
  await expect(menu.getByTestId('setup-link')).toHaveCount(0)
  await expect(menu.getByTestId('menu-display-toggle')).toHaveCount(0)
  await page.keyboard.press('Escape')
  // The guided setup is at the foot of the control column.
  await expect(page.getByTestId('edit-panel').getByTestId('setup-link')).toHaveAttribute(
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

test('phones carry the PDF export in the Menu, where the bar has no room for it', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await gotoWorkspace(page)
  await expect(page.getByTestId('bar-report')).toBeHidden()
  await page.getByTestId('dashboard-tools').click()
  const menu = page.getByRole('dialog', { name: 'Settings' })
  await expect(menu.getByRole('button', { name: 'Generate Report' })).toBeFocused()
})

test('ledger labels open the matching group and field in the column; the canvas stays where it is', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/en/simulation#cashflow')
  await waitForResults(page)

  const tax = page.getByRole('button', { name: /^Capital gains tax – edit in/ })
  // A reader scrolls with the wheel, which ends the landing's hold on
  // `#cashflow` (it re-aims while sections mount, for up to five seconds);
  // a scripted scroll alone would be undone by it on a slow machine.
  await page.mouse.move(400, 500)
  await page.mouse.wheel(0, 40)
  await tax.evaluate((el) => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await expect(tax).toBeInViewport({ ratio: 1 })
  for (const round of [1, 2]) {
    const before = await settledTop(page, tax)
    await tax.click()
    await expect(groupHeader(page, 'market')).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator('#editor-capitalGainsTax')).toBeFocused()
    await expect(page.locator('#editor-capitalGainsTax')).toBeInViewport({ ratio: 1 })
    // Only the column scrolled: the line that was clicked has not moved.
    expect(Math.abs((await settledTop(page, tax)) - before), `round ${round}`).toBeLessThanOrEqual(
      2
    )
    await closePanel(page, 'market')
  }

  // The portfolio draw is set by the Entnahme rule: its group opens.
  await page.getByRole('button', { name: /^Portfolio sale \(gross\) – edit in “Withdrawal”/ }).click()
  await expect(groupHeader(page, 'rule')).toHaveAttribute('aria-expanded', 'true')
  await expect(groupHeader(page, 'rule')).toBeFocused()
  await expect(page.getByTestId('withdrawal-strategy-picker')).toBeVisible()
  await expect(page).toHaveURL(/#cashflow:rule$/)
})

test('several groups stay open at once and Ctrl/Cmd+S saves from inside the column', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/en/simulation')
  await waitForResults(page)

  for (const panel of PANELS) await openPanel(page, panel)
  for (const panel of PANELS) {
    await expect(groupHeader(page, panel)).toHaveAttribute('aria-expanded', 'true')
  }
  // Every input exists exactly once.
  await expect(page.locator('#editor-retirementAge')).toHaveCount(1)
  await expect(page.locator('#planner-dsWithdrawalRate')).toHaveCount(1)
  await expect(page.getByTestId('withdrawal-strategy-picker')).toHaveCount(1)

  const runs = page.locator('#editor-simulationRuns')
  await runs.fill('600')
  await runs.blur()
  await expect(page.getByTestId('command-save')).toBeVisible()
  // The group that holds the change is marked.
  await expect(page.getByTestId('edit-market-changed')).toBeVisible()
  await expect(page.getByTestId('edit-person-changed')).toHaveCount(0)
  await page.locator('#editor-simulationRuns').focus()
  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('command-save')).toHaveCount(0)
  await expect(page.getByTestId('edit-market-changed')).toHaveCount(0)
  await expect(groupHeader(page, 'market')).toHaveAttribute('aria-expanded', 'true')
})

test('compare: "Edit assumptions" leaves the comparison for the control column', async ({
  page,
}) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1280, height: 900 })
  await gotoWorkspace(page)
  await duplicateActivePlan(page)

  const compare = await enterCompare(page)
  await expect(compare.getByRole('table')).toBeVisible({ timeout: 45000 })
  await compare.getByRole('button', { name: /Edit assumptions/ }).click()
  await expect(page.getByTestId('compare-view')).toHaveCount(0)
  await expect(page.locator('.ws-sections')).toBeVisible()
  await expect(page.getByTestId('edit-panel')).toBeVisible()
  await expect(page.getByTestId('edit-panel-title')).toBeFocused()
  await expect(page).not.toHaveURL(/#compare/)
})

test('the column keeps the heading order and adds no second banner', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await gotoWorkspace(page)
  const column = page.getByTestId('edit-panel')
  for (const id of PANELS) await openPanel(page, id)
  // One h2 names the column, each group is an h3, and nothing skips a level.
  await expect(column.getByRole('heading', { level: 2 })).toHaveCount(1)
  await expect(column.locator('h3.ws-group-heading')).toHaveCount(5)
  await expect(column.locator('h1, h5, h6')).toHaveCount(0)
  // A pane beside the canvas: the bar stays the only banner, the canvas the only main.
  await expect(page.getByRole('banner')).toHaveCount(1)
  await expect(page.getByRole('main')).toHaveCount(1)
  await expect(page.getByRole('complementary', { name: 'Assumptions' })).toHaveCount(1)
})

test('deep links: the withdrawal fact, the savings pointer and the market pointer', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await gotoWorkspace(page)

  // Savings group → "Go to Income & spending" shows that group.
  await closePanel(page, 'flows')
  const column = await openPanel(page, 'savings')
  await column.getByRole('button', { name: /Go to Income & spending/ }).click()
  await expect(groupHeader(page, 'flows')).toHaveAttribute('aria-expanded', 'true')
  await expect(page.locator('#plan-editor-expenses')).toBeVisible()
  await expect(groupHeader(page, 'flows')).toBeFocused()

  // Market group → the withdrawal rule's own group, not a section far away.
  await openPanel(page, 'market')
  await column.getByRole('button', { name: /Go to the withdrawal rule/ }).click()
  await expect(groupHeader(page, 'rule')).toHaveAttribute('aria-expanded', 'true')
  await expect(groupHeader(page, 'rule')).toBeFocused()
  await expect(page.getByTestId('withdrawal-strategy-picker')).toBeVisible()

  // The head's fact "first withdrawal" leads to the Entnahme outcome.
  await page.getByTestId('kpi-strip').getByRole('button').click()
  await expect(sectionHeading(page, 'withdrawal')).toBeFocused()
  await waitForScrollSettled(page)
  await expect(sectionHeading(page, 'withdrawal')).toBeInViewport()
})

test('group headers show the plan inputs, carry the open state and ignore the € display', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await gotoWorkspace(page)

  await expect(page.getByTestId('assumption-card-person')).toHaveText('55 · 60 · 90')
  const savings = page.getByTestId('assumption-card-savings')
  await expect(savings).toHaveText('€630,000 · €48,000/yr')
  await expect(page.getByTestId('assumption-card-flows')).toHaveText('€5,242/mo')
  await expect(page.getByTestId('assumption-card-rule')).toHaveText('Dynamic · 4%')
  await expect(page.getByTestId('assumption-card-market')).toHaveText('7% return · 2.5% inflation')
  await expect(page.getByTestId('edit-panel')).toContainText("Starting values in today's euros")

  for (const id of PANELS) {
    const header = groupHeader(page, id)
    await expect(header).toHaveAttribute('aria-controls', `edit-${id}-body`)
    await expect(page.locator(`#edit-${id}-body`)).toHaveCount(1)
    await expect(header).toHaveAttribute(
      'aria-expanded',
      id === 'person' || id === 'flows' ? 'true' : 'false'
    )
  }
  await expect(groupHeader(page, 'person')).toHaveAccessibleName('Time 55 · 60 · 90')

  // Plan inputs are today's euros: the display switch leaves them alone.
  const toggle = page.getByTestId('display-toggle')
  await toggle.getByRole('radio', { name: "Today's €" }).click()
  await expect(toggle.getByRole('radio', { name: "Today's €" })).toHaveAttribute(
    'aria-checked',
    'true'
  )
  await expect(savings).toHaveText('€630,000 · €48,000/yr')

  // A header follows its value as it is edited.
  await page.locator('#editor-retirementAge [role="slider"]').focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByTestId('assumption-card-person')).toHaveText('55 · 61 · 90')
  await expect(page.getByTestId('edit-person-changed')).toBeVisible()
})

test('reset to defaults is a draft with an undo', async ({ page }) => {
  await gotoWorkspace(page)
  // Save a plan that differs from the defaults first.
  await openPanel(page, 'savings')
  const assets = page.locator('#editor-currentAssets')
  await assets.fill('900000')
  await assets.blur()
  await page.getByTestId('command-save').click()
  await expect(page.getByTestId('command-save')).toHaveCount(0)

  // At the foot of the column.
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
  await expect(page.getByTestId('command-save')).toBeVisible()
  // From the canvas, not from a field.
  await page.getByTestId('section-link-cashflow').focus()

  await page.keyboard.press('ControlOrMeta+s')
  await expect(page.getByTestId('command-save')).toHaveCount(0)
  await expect(page.getByText('Saved to “Base plan”')).toBeVisible()
  expect((await readPersistedState(page))?.storedPlan?.annualSavings).toBe(20000)
})

test('"Speichern ▾": the button saves, the caret offers the same and the variant', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await gotoWorkspace(page)
  await page.locator('#editor-retirementAge [role="slider"]').focus()
  await page.keyboard.press('ArrowRight')
  const more = page.getByTestId('command-save-more')
  await expect(more).toBeVisible()

  // A menu button: arrow keys walk the two items, Escape returns to the caret.
  await more.click()
  const menu = page.getByTestId('command-save-menu')
  await expect(menu).toBeVisible()
  await expect(menu.getByRole('menuitem')).toHaveText(['Save', 'Save as a variant …'])
  await expect(page.getByTestId('command-save-plain')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(page.getByTestId('command-save-as-new')).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(menu).toHaveCount(0)
  await expect(more).toBeFocused()

  // "Save" in the menu does what the button does.
  await more.click()
  await page.getByTestId('command-save-plain').click()
  await expect(page.getByTestId('command-save')).toHaveCount(0)
  await expect(page.getByTestId('bar-saved')).toBeFocused()
  expect((await readPersistedState(page))?.storedPlan?.retirementAge).toBe(61)
})

test('the bar lifts off the page once it scrolls', async ({ page }) => {
  await gotoWorkspace(page)
  const bar = page.getByTestId('result-bar')
  await expect(bar).not.toHaveAttribute('data-scrolled', /.*/)
  await openSection(page, 'cashflow')
  await expect(bar).toHaveAttribute('data-scrolled', 'true')
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
  await expect(bar).not.toHaveAttribute('data-scrolled', /.*/)
})

test('F6 moves between the canvas and the control column', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await gotoWorkspace(page)
  await page.getByTestId('section-link-cashflow').focus()
  await page.keyboard.press('F6')
  await expect(page.getByTestId('edit-panel-title')).toBeFocused()
  await page.keyboard.press('F6')
  await expect(sectionHeading(page, 'result')).toBeFocused()
})

test('ids stay unique once every section and every group has mounted', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await gotoWorkspace(page)
  for (const panel of PANELS) await openPanel(page, panel)
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
