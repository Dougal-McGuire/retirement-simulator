import type { Locator, Page } from '@playwright/test'
import {
  duplicateActivePlan,
  enterCompare,
  expect,
  expectNoHorizontalOverflow,
  gotoWorkspace,
  isInViewport,
  leverSlider,
  nudgeLever,
  openPanel,
  openPlanMenu,
  openSection,
  scrollToTop,
  sectionHeading,
  test,
  type SectionId,
} from './helpers/workspace'

/**
 * The workspace shell: the bar, the canvas beside the control column, compare
 * mode and the plan menu, across widths.
 *
 * Migrated to the two-pane workspace (docs/specs/2026-11-10-result-in-view.md).
 * What changed, test by test:
 * - "tablet overview …": the five-section page with Annahmen cards is now a
 *   canvas of four sections beside the column; the test walks that.
 * - "navigation labels and result-bar controls fit …": the rail / chip row /
 *   bottom index are gone (anchors and mode bar are covered in onepage.spec);
 *   this keeps the bar's control sizes at every width.
 * - "a long plan name …": the KPIs left the bar; the clusters are now plan,
 *   draft and tools.
 * - "levers explain drafts …": the quick levers and their note are gone; the
 *   one save/discard path is asserted from a column edit.
 * - "the result section offers a variant …" and the phone comparison test used
 *   the head's compare entry (`overview-compare` / `overview-duplicate`), which
 *   is gone: both go through the plan menu now.
 * - "result bar keeps one row …": no KPI moves in the bar any more; it asserts
 *   that neither the bar's tools nor the result's figures move when the plan
 *   turns dirty. The idle run status is no longer hidden while dirty (it sits
 *   in the head, away from Save).
 */

/** Vertical centres of the bar's visible clusters. */
function clusterCentres(bar: Locator) {
  return bar.evaluate((element) =>
    [...element.children]
      .filter((child) => {
        const style = getComputedStyle(child)
        const box = child.getBoundingClientRect()
        return style.position !== 'fixed' && box.width > 1 && box.height > 1
      })
      .map((child) => {
        const box = child.getBoundingClientRect()
        return box.top + box.height / 2
      })
  )
}

/** True when the element or an ancestor inside the result bar clips its text. */
function isClipped(locator: Locator) {
  return locator.evaluate((element) => {
    let node: HTMLElement | null = element as HTMLElement
    while (node && node.dataset.testid !== 'result-bar') {
      if (node.clientWidth > 0 && node.scrollWidth > node.clientWidth + 1) return true
      node = node.parentElement
    }
    return false
  })
}

/**
 * Where the things that must not move sit, once the page is at rest (the dock
 * slides in over 200 ms when a resize pins it): the bar's tools, the result's
 * figure, and the mini chart beside the dock's figures.
 */
async function fixedPoints(page: Page) {
  const read = () =>
    page.evaluate(() => {
      const box = (testId: string) =>
        document.querySelector(`[data-testid="${testId}"]`)?.getBoundingClientRect()
      const pill = box('success-pill')
      const chart = box('dock-chart')
      const fan = box('fan-chart')
      return {
        plan: Math.round(box('plan-menu-trigger')?.x ?? -1),
        euro: Math.round(box('display-toggle')?.x ?? -1),
        menu: Math.round(box('dashboard-tools')?.x ?? -1),
        pillX: Math.round(pill?.x ?? -1),
        pillY: Math.round(pill?.y ?? -1),
        dockChartX: Math.round(chart?.x ?? -1),
        dockChartWidth: Math.round(chart?.width ?? -1),
        // The head: its chart keeps its size and the anchors under it their place.
        fanTop: Math.round((fan?.y ?? -1) + window.scrollY),
        fanHeight: Math.round(fan?.height ?? -1),
        anchorsTop: Math.round((box('section-index')?.y ?? -1) + window.scrollY),
      }
    })
  let previous = await read()
  for (let attempt = 0; attempt < 20; attempt++) {
    await page.waitForTimeout(120)
    const next = await read()
    if (JSON.stringify(next) === JSON.stringify(previous)) return next
    previous = next
  }
  return previous
}

test('iPad landscape: the canvas beside the column, and compare as a mode of the page', async ({
  page,
}, info) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 1366, height: 1000 })
  await gotoWorkspace(page, '/de/simulation')
  await expect(page.getByTestId('success-pill')).toBeInViewport()
  await expect(page.getByTestId('fan-chart')).toBeInViewport()

  // One canvas, four sections in reading order.
  const titles = ['Ergebnis', 'Geldfluss', 'Entnahme', 'Wirkung']
  const ids: SectionId[] = ['result', 'cashflow', 'withdrawal', 'levers']
  let previous = -Infinity
  for (const [i, id] of ids.entries()) {
    const heading = sectionHeading(page, id)
    await expect(heading).toHaveText(titles[i])
    const y = (await heading.boundingBox())!.y
    expect(y, `${id} below the previous section`).toBeGreaterThan(previous)
    previous = y
  }

  // The assumptions are a permanent column to the right of it, on the first
  // screen, with its own scroll.
  const column = page.getByTestId('edit-panel')
  await expect(column).toHaveAttribute('data-mode', 'docked')
  await expect(page.getByTestId('edit-panel-title')).toHaveText('Annahmen')
  const main = (await page.locator('#main-content').boundingBox())!
  const pane = (await column.boundingBox())!
  expect(pane.x).toBeGreaterThanOrEqual(main.x + main.width - 1)
  expect(pane.width).toBe(480)
  expect(pane.y + pane.height).toBeLessThanOrEqual(1000)
  expect(await isInViewport(leverSlider(page))).toBe(true)
  await page.screenshot({ path: info.outputPath('workspace-overview.png'), fullPage: true })

  // A group opens in place; the result stays where it is.
  await openPanel(page, 'savings')
  await expect(page.locator('#editor-currentAssets')).toBeVisible()
  await expect(page.getByTestId('fan-chart')).toBeInViewport()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await page.screenshot({ path: info.outputPath('workspace-editor.png'), fullPage: true })

  // Plan menu → "Pläne vergleichen": compare is a mode of the same page; the
  // column gives way to it.
  const compare = await enterCompare(page)
  await expect(column).toBeHidden()
  await expect(compare.getByTestId('compare-fan-chart')).toBeVisible()
  await page.screenshot({ path: info.outputPath('workspace-comparison.png'), fullPage: true })
})

test('mobile workspace and menu fit the screen', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await gotoWorkspace(page, '/de/simulation')
  await expectNoHorizontalOverflow(page)
  await page.screenshot({ path: info.outputPath('workspace-mobile.png'), fullPage: true })
  await page.getByTestId('dashboard-tools').click()
  const box = await page.getByRole('dialog').boundingBox()
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(844)
  await page.screenshot({ path: info.outputPath('workspace-menu.png') })
})

test('bar controls keep a 44 px target and the 14 px control font at every width', async ({
  page,
}) => {
  await gotoWorkspace(page, '/de/simulation')
  await nudgeLever(page)
  for (const width of [1440, 1280, 1024, 820, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await expectNoHorizontalOverflow(page)
    const bar = page.getByTestId('result-bar')
    if (width > 760) {
      expect((await bar.boundingBox())!.height, `bar height at ${width}px`).toBe(48)
    }

    // Buttons, the € switch's options, Save and Discard (in the draft row on
    // phones): all of them.
    const controls = bar.locator('button, [role="radio"]')
    let checked = 0
    for (const control of await controls.all()) {
      if (!(await control.isVisible())) continue
      const size = await control.evaluate((el) => ({
        height: el.getBoundingClientRect().height,
        width: el.getBoundingClientRect().width,
        font: getComputedStyle(el).fontSize,
        name: el.getAttribute('data-testid') ?? el.textContent,
      }))
      expect(size.height, `${size.name} height at ${width}px`).toBeGreaterThanOrEqual(44)
      expect(size.width, `${size.name} width at ${width}px`).toBeGreaterThanOrEqual(40)
      expect(size.font, `${size.name} font at ${width}px`).toBe('14px')
      checked += 1
    }
    expect(checked, `bar controls found at ${width}px`).toBeGreaterThanOrEqual(5)
  }
})

test("a long plan name uses the bar's free room, never the draft's or the tools'", async ({
  page,
}) => {
  const longName = 'S2 Kapitaloption 62 (Variante mit Erbschaft)'
  await page.setViewportSize({ width: 1920, height: 1000 })
  await gotoWorkspace(page, '/de/simulation')
  await page.evaluate((name) => {
    const key = 'retirement-simulator-store'
    const parsed = JSON.parse(window.localStorage.getItem(key)!)
    const plan = parsed.state.plans.find(
      (entry: { id: string }) => entry.id === parsed.state.activePlanId
    )
    plan.name = name
    delete plan.nameKey
    window.localStorage.setItem(key, JSON.stringify(parsed))
  }, longName)
  await page.reload()
  const bar = page.getByTestId('result-bar')
  const trigger = page.getByTestId('plan-menu-trigger')
  await expect(trigger).toContainText(longName)
  const name = trigger.locator('.workspace-plan-trigger-name')

  /** The visible clusters, left to right, never overlap; the bar never scrolls. */
  async function expectClustersApart(width: number, state: string) {
    const boxes = await bar.evaluate((element) =>
      ['.ws-bar-plan', '.ws-bar-draft', '.ws-bar-tools']
        .map((selector) => element.querySelector<HTMLElement>(selector))
        .filter((node): node is HTMLElement => !!node && node.getBoundingClientRect().width > 0)
        .map((node) => {
          const box = node.getBoundingClientRect()
          return { left: box.left, right: box.right }
        })
    )
    expect(boxes.length, `three clusters at ${width}px (${state})`).toBe(3)
    for (let index = 1; index < boxes.length; index++) {
      expect(
        boxes[index].left,
        `cluster ${index} clear of cluster ${index - 1} at ${width}px (${state})`
      ).toBeGreaterThanOrEqual(boxes[index - 1].right)
    }
    const overflow = await bar.evaluate((element) => element.scrollWidth - element.clientWidth)
    expect(overflow, `result bar fits at ${width}px (${state})`).toBeLessThanOrEqual(0)
  }

  // Clean: from 1280 up the whole name fits.
  for (const width of [1024, 1280, 1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 })
    await expectClustersApart(width, 'clean')
    if (width >= 1280) {
      expect(await name.evaluate((element) => element.scrollWidth > element.clientWidth)).toBe(
        false
      )
    }
  }

  // Dirty: the draft cluster takes its room from the name, never from the tools.
  await page.setViewportSize({ width: 1366, height: 1000 })
  await nudgeLever(page)
  const tools = async () => (await bar.locator('.ws-bar-tools').boundingBox())!
  for (const width of [1024, 1280, 1366, 1440, 1920]) {
    await page.setViewportSize({ width, height: 1000 })
    await expectClustersApart(width, 'dirty')
    await expect(page.getByTestId('command-save')).toBeInViewport()
    const box = await tools()
    expect(Math.round(box.x + box.width), `tools at the right edge at ${width}px`).toBeGreaterThan(
      width - 24
    )
  }
})

test('a draft is marked once, in the bar, and saved from there', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 })
  await gotoWorkspace(page, '/de/simulation')
  const bar = page.getByTestId('result-bar')
  await expect(page.getByTestId('bar-saved')).toHaveText('Plan gespeichert')

  await nudgeLever(page)
  const marker = page.getByTestId('bar-dirty')
  await expect(marker).toBeVisible()
  await expect(marker).toContainText('1 Änderung')
  await expect(page.getByTestId('bar-saved')).toHaveCount(0)
  // The group that holds the change says so too — a dot, not a second marker.
  await expect(page.getByTestId('edit-person-changed')).toBeVisible()

  // One save/discard path: neither the canvas nor the column has buttons of
  // their own.
  await expect(page.getByTestId('command-save')).toHaveCount(1)
  await expect(page.getByTestId('command-discard')).toHaveCount(1)
  for (const region of [page.locator('#main-content'), page.getByTestId('edit-panel')]) {
    await expect(region.getByRole('button', { name: /^(Speichern|Verwerfen)$/ })).toHaveCount(0)
    await expect(region.getByRole('button', { name: /^Ungespeicherte Änderungen/ })).toHaveCount(0)
  }

  await page.getByTestId('command-save').click()
  await expect(bar).not.toHaveAttribute('data-dirty', 'true')
  await expect(marker).toHaveCount(0)
  await expect(page.getByTestId('edit-person-changed')).toHaveCount(0)
  await expect(page.getByTestId('bar-saved')).toHaveText('Plan gespeichert')
})

test('a duplicate from the plan menu, then compare with both plans lined up', async ({ page }) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1366, height: 1000 })
  await gotoWorkspace(page)
  // The head has no compare entry of its own: plans live in the plan menu.
  await expect(page.getByTestId('overview-compare')).toHaveCount(0)
  await expect(page.getByTestId('overview-duplicate')).toHaveCount(0)

  await duplicateActivePlan(page)
  await expect(page.getByTestId('plan-menu-trigger')).toHaveText('Base plan 2')

  const compare = await enterCompare(page)
  await expect(compare).toBeInViewport()
  await expect(compare.getByRole('button', { name: 'Base plan 2', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(compare.getByRole('button', { name: 'Base plan', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
})

test('setup wizard sits in the workspace shell on phones and desktops', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/de/setup')
  await expect(page.locator('.workspace-brand')).toHaveText('Ruhestandsplanung')
  await expect(page.getByRole('list', { name: 'Setup-Schritte' })).toBeVisible()
  await expect(page.getByTestId('setup-overview-link')).toHaveAttribute('href', '/de/simulation')
  await page.getByTestId('setup-menu').click()
  // Focus lands on the first usable control, never on a (disabled) sign-in.
  await expect(page.getByRole('dialog').getByRole('combobox', { name: 'Sprache' })).toBeFocused()
  await expect(page.getByRole('dialog').getByTestId('appearance-switch')).toBeVisible()
  await page.keyboard.press('Escape')

  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  // One header row, no second copy of the account or language controls.
  await expect(page.locator('.workspace-brand')).toBeHidden()
  await expect(page.getByTestId('setup-menu')).toBeVisible()
  await expect(page.getByRole('combobox', { name: 'Sprache' })).toHaveCount(0)
  await expect(page.getByRole('progressbar')).toBeInViewport()
  await expect(page.getByRole('button', { name: 'Weiter', exact: true })).toBeInViewport()
})

test.describe('result bar', () => {
  test('phone first screen shows the result, its chart and the two modes', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoWorkspace(page, '/de/simulation')
    // The dock is pinned under the bar; the full chart is the first block.
    const kpi = page.getByTestId('success-pill')
    await expect(kpi).toBeInViewport()
    await expect(page.getByTestId('result-dock')).toBeInViewport()
    await expect(page.getByTestId('fan-chart')).toBeInViewport()

    // "Ansehen │ Stellen" is a fixed bottom bar; the result sits above it.
    const modes = page.getByRole('navigation', { name: 'Ansicht wechseln' })
    await expect(modes).toHaveAttribute('data-testid', 'mode-bar')
    await expect(modes).toHaveCSS('position', 'fixed')
    const modesBox = (await modes.boundingBox())!
    expect(modesBox.y + modesBox.height).toBeCloseTo(844, 0)
    const kpiBox = (await kpi.boundingBox())!
    expect(kpiBox.y + kpiBox.height).toBeLessThan(modesBox.y)
    await expect(page.getByTestId('mode-view')).toHaveText('Ansehen')
    await expect(page.getByTestId('mode-edit')).toHaveText('Stellen')
    await expect(page.getByTestId('section-link-cashflow')).toContainText('Geldfluss')

    // The anchors jump; the head is the top of the page.
    await openSection(page, 'levers')
    await expect(kpi).toBeInViewport()
    await openSection(page, 'result')
    await expect(page.getByTestId('fan-chart')).toBeInViewport()
    await expect(kpi).toBeInViewport()

    // The euro switch has one place at every width: the bar.
    await expect(page.getByTestId('result-bar').getByTestId('display-toggle')).toBeVisible()
    await page.getByTestId('dashboard-tools').click()
    await expect(page.getByRole('dialog').getByTestId('menu-display-toggle')).toHaveCount(0)
    await expect(page.getByRole('dialog').getByRole('radiogroup')).toHaveCount(1)
  })

  test('plan menu lists plans and creates, duplicates, renames, compares and switches', async ({
    page,
  }) => {
    await gotoWorkspace(page)
    const trigger = page.getByTestId('plan-menu-trigger')
    await expect(trigger).toHaveAccessibleName('Current plan: Base plan')

    // Keyboard: ArrowDown opens on the active plan, Escape returns to the trigger.
    await trigger.focus()
    await page.keyboard.press('ArrowDown')
    const menu = page.getByRole('menu', { name: 'Plans' })
    await expect(menu.getByRole('menuitemradio', { name: /Base plan/ })).toBeFocused()
    await expect(menu.getByRole('menuitemradio', { name: /Base plan/ })).toContainText('success')
    await expect(menu.getByRole('menuitem', { name: 'Compare plans' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(trigger).toBeFocused()

    await trigger.click()
    await menu.getByRole('menuitem', { name: 'New plan' }).click()
    await page.getByLabel('Plan name').fill('Retire at 58')
    await page.getByRole('button', { name: 'Create plan' }).click()
    await expect(trigger).toHaveText('Retire at 58')
    await expect(trigger).toBeFocused()

    await trigger.click()
    await menu.getByRole('menuitem', { name: 'Duplicate' }).click()
    await expect(page.getByLabel('Name for the copy')).toHaveValue('Retire at 58 2')
    await page.getByRole('button', { name: 'Duplicate plan' }).click()
    await expect(trigger).toHaveText('Retire at 58 2')

    await trigger.click()
    await menu.getByRole('menuitem', { name: 'Rename' }).click()
    await page.getByLabel('Plan name').fill('Variant B')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(trigger).toHaveText('Variant B')

    // "Manage plans …" opens the plan manager; closing it returns focus to
    // the plan picker.
    await trigger.click()
    await menu.getByRole('menuitem', { name: 'Manage plans …' }).click()
    await expect(page.getByRole('dialog', { name: 'Manage plans' })).toBeVisible()
    await expect(page.getByTestId('plan-manager')).toBeVisible()
    await expect(page.getByTestId('plan-switcher-select')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByTestId('plan-manager')).toHaveCount(0)
    await expect(trigger).toBeFocused()

    // Unsaved edits: switching asks first.
    await nudgeLever(page)
    await expect(trigger).toHaveAccessibleName('Current plan: Variant B, unsaved changes')
    await trigger.click()
    await expect(menu.getByRole('menuitemradio', { checked: true })).toContainText(
      'Unsaved changes'
    )
    await menu.getByRole('menuitemradio', { name: /Base plan/ }).click()
    await page.getByTestId('plan-switch-discard').click()
    await expect(trigger).toHaveText('Base plan')
  })

  test('discard sits next to the change marker and can be undone', async ({ page }) => {
    await gotoWorkspace(page)
    await expect(page.getByTestId('command-discard')).toHaveCount(0)

    const slider = await nudgeLever(page)
    await expect(slider).toHaveAttribute('aria-valuenow', '61')
    const bar = page.getByTestId('result-bar')
    const marker = page.getByTestId('bar-dirty')
    await expect(marker).toContainText('1 change')
    // Marker, Discard, Save: left to right, one cluster.
    const markerBox = (await marker.boundingBox())!
    const discardBox = (await page.getByTestId('command-discard').boundingBox())!
    const saveBox = (await page.getByTestId('command-save').boundingBox())!
    expect(discardBox.x).toBeGreaterThanOrEqual(markerBox.x + markerBox.width)
    expect(discardBox.x - (markerBox.x + markerBox.width)).toBeLessThanOrEqual(24)
    expect(saveBox.x).toBeGreaterThanOrEqual(discardBox.x + discardBox.width)

    await page.getByTestId('command-discard').click()
    await expect(slider).toHaveAttribute('aria-valuenow', '60')
    await expect(page.getByTestId('bar-saved')).toHaveText('Plan saved')
    await expect(bar).not.toHaveAttribute('data-dirty', 'true')
    await page.getByTestId('plan-discarded-toast-undo').click()
    await expect(slider).toHaveAttribute('aria-valuenow', '61')
    await expect(marker).toContainText('1 change')
    await expect(bar).toHaveAttribute('data-dirty', 'true')
  })

  test('recalculate stays quiet while results are current; runs show a status', async ({
    page,
  }) => {
    await gotoWorkspace(page)
    const status = page.getByTestId('run-status')
    const run = page.getByTestId('run-button')
    await expect(status).toHaveText('Updated')
    await expect(run).not.toHaveClass(/workspace-button-primary/)

    await openPanel(page, 'person')
    await leverSlider(page).focus()
    await page.keyboard.press('ArrowRight')
    // Held for at least 400 ms, so it is there to be read.
    await expect(status).toHaveText('Recalculating …')
    await expect(page.locator('#main-content')).toHaveAttribute('data-run-status', 'running')
    await expect(status).toHaveText('Updated')
    await expect(run).not.toHaveClass(/workspace-button-primary/)
  })

  test('menu focuses a real control and nested dialogs unwind one Escape at a time', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoWorkspace(page)

    await page.getByTestId('dashboard-tools').click()
    const menu = page.getByRole('dialog', { name: 'Settings' })
    // On phones the report is the Menu's first control (the bar has no room).
    await expect(menu.getByRole('button', { name: 'Generate Report' })).toBeFocused()
    await expect(page.locator('[data-slot="tooltip-content"]')).toHaveCount(0)
    // Plans are managed from the plan menu; the guided setup sits in the column.
    await expect(menu.getByTestId('plan-switcher')).toHaveCount(0)
    await expect(menu.getByTestId('setup-link')).toHaveCount(0)
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(page.getByTestId('dashboard-tools')).toBeFocused()

    await openPlanMenu(page)
    await page.getByTestId('plan-menu-manage').click()
    const manager = page.getByTestId('plan-manager')
    await expect(page.getByTestId('plan-switcher-select')).toBeFocused()
    await manager.getByTestId('plan-duplicate').click()
    await expect(page.getByLabel('Name for the copy')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Duplicate plan' })).toHaveCount(0)
    await expect(manager).toBeVisible()
    await expect(manager.getByTestId('plan-duplicate')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(manager).toHaveCount(0)
    await expect(page.getByTestId('plan-menu-trigger')).toBeFocused()
  })
})

test('comparison stacks chart above table on phones without overlap', async ({ page }) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 390, height: 844 })
  await gotoWorkspace(page)
  await duplicateActivePlan(page)
  const compare = await enterCompare(page)

  const chart = compare.getByTestId('compare-fan-chart')
  const table = compare.locator('.compare-table table')
  await expect(chart).toBeVisible({ timeout: 30000 })
  const exit = page.getByTestId('compare-exit')
  await expect(exit).toHaveAccessibleName('Exit compare')
  await expect(exit).toBeVisible()
  // Both plans computed: parameter column plus one column per plan.
  await expect(table.locator('thead th')).toHaveCount(3, { timeout: 30000 })
  await expectNoHorizontalOverflow(page)
  await expect
    .poll(async () => {
      const chartBox = (await chart.boundingBox())!
      const tableBox = (await table.boundingBox())!
      return tableBox.y - (chartBox.y + chartBox.height)
    })
    .toBeGreaterThanOrEqual(0)

  // The fixed mode bar never covers the way out.
  const exitBox = (await exit.boundingBox())!
  const modesBox = (await page.getByTestId('mode-bar').boundingBox())!
  expect(exitBox.y + exitBox.height).toBeLessThanOrEqual(modesBox.y)
})

test('the bar is one 48 px row from 761 px, and nothing moves when the plan turns dirty', async ({
  page,
}) => {
  test.setTimeout(120000)
  const widths = [761, 850, 950, 1023, 1024, 1179, 1180, 1280, 1366, 1440]
  await page.setViewportSize({ width: 1366, height: 900 })
  await gotoWorkspace(page, '/de/simulation')
  const bar = page.getByTestId('result-bar')
  const runStatus = page.getByTestId('run-status')
  const marker = page.getByTestId('bar-dirty')

  const phones = [320, 390]
  const clean = new Map<number, Awaited<ReturnType<typeof fixedPoints>>>()
  for (const width of [...phones, ...widths]) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.getByTestId('success-pill')).toBeVisible()
    clean.set(width, await fixedPoints(page))
  }

  await page.setViewportSize({ width: 1366, height: 900 })
  await nudgeLever(page)
  await expect(runStatus).toHaveAttribute('data-state', 'updated')

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    await expect(page.getByTestId('success-pill')).toBeVisible()
    expect((await bar.boundingBox())!.height, `bar height at ${width}px`).toBe(48)
    const centres = await clusterCentres(bar)
    expect(Math.max(...centres) - Math.min(...centres), `one bar row at ${width}px`).toBeLessThan(8)
    await expect(page.getByTestId('command-save')).toBeInViewport()
    // A worded marker at every width.
    await expect(marker, `change marker at ${width}px`).toBeVisible()
    await expect(marker).toHaveText('1 Änderung')
    await expect(page.getByTestId('command-discard')).toHaveAttribute('title', 'Verwerfen')
    await expect(page.getByTestId('command-discard')).toHaveAccessibleName(/verwerfen/i)
    // Neither the bar's tools nor the result's figure moved when the draft
    // cluster, the delta and the ghost appeared.
    expect(await fixedPoints(page), `fixed points at ${width}px`).toEqual(clean.get(width))
  }

  // Saving leaves everything where it was, too.
  await page.getByTestId('command-save').click()
  await expect(bar).not.toHaveAttribute('data-dirty', 'true')
  expect(await fixedPoints(page)).toEqual(clean.get(1440))

  // Phones: nothing in the dock or the head moves either …
  await nudgeLever(page)
  await expect(runStatus).toHaveAttribute('data-state', 'updated')
  for (const width of phones) {
    await page.setViewportSize({ width, height: 900 })
    await scrollToTop(page)
    await expect(page.getByTestId('change-menu-trigger')).toBeVisible()
    expect(await fixedPoints(page), `fixed points at ${width}px`).toEqual(clean.get(width))
  }

  // … the bar keeps to one row (plan, € switch, Menü); Save and Discard sit
  // in a row of their own above the mode bar, in both modes.
  await page.setViewportSize({ width: 390, height: 844 })
  await scrollToTop(page)
  await expect(runStatus).toHaveAttribute('data-state', 'updated')
  const phoneCentres = await clusterCentres(bar)
  expect(Math.max(...phoneCentres) - Math.min(...phoneCentres), 'one bar row at 390px').toBeLessThan(
    8
  )
  const nameClipped = await page
    .getByTestId('plan-menu-trigger')
    .evaluate((trigger) =>
      [trigger, ...trigger.querySelectorAll<HTMLElement>('*')].some(
        (el) =>
          el instanceof HTMLElement && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1
      )
    )
  expect(nameClipped, 'plan name not truncated at 390px').toBe(false)
  const modes = (await page.getByTestId('mode-bar').boundingBox())!
  for (const mode of ['mode-view', 'mode-edit']) {
    await page.getByTestId(mode).click()
    const save = (await page.getByTestId('command-save').boundingBox())!
    expect(save.y + save.height, `Save above the mode bar under ${mode}`).toBeLessThanOrEqual(
      modes.y
    )
    await expect(page.getByTestId('command-save')).toBeInViewport()
    await expect(page.getByTestId('result-dock')).toBeInViewport()
  }

  // The narrowest phone still says how much is unsaved, in full.
  await page.setViewportSize({ width: 320, height: 700 })
  await expect(marker).toBeVisible()
  await expect(marker).toHaveText('1 Änderung')
  expect(await isClipped(marker), 'change marker whole at 320px').toBe(false)
  await expect(page.getByTestId('command-save')).toBeInViewport()
  await expect(page.getByTestId('command-discard')).toBeInViewport()
  await expectNoHorizontalOverflow(page)
})

test('the discard toast leaves with a plan switch', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await gotoWorkspace(page)
  await duplicateActivePlan(page)
  const trigger = page.getByTestId('plan-menu-trigger')
  await expect(trigger).toHaveText('Base plan 2')

  await nudgeLever(page)
  await page.getByTestId('command-discard').click()
  const toast = page.getByTestId('plan-discarded-toast')
  await expect(toast).toBeVisible()

  // Its Undo could only apply to "Base plan 2", so switching plans removes it.
  const menu = await openPlanMenu(page)
  await menu.getByRole('menuitemradio', { name: /^Base plan(?! 2)/ }).click()
  await expect(trigger).toHaveText('Base plan')
  // Dismissed (gone after the ~1 s exit), well inside its own 8 s lifetime.
  await expect(toast).toHaveCount(0, { timeout: 3000 })
})

// The old "Überblick" h1 focus on a plan-assumption row and the Varianten tab's
// "Änderungen ausprobieren / Pläne vergleichen" switch (`enter-compare`) were
// dropped by the spec (§1.3 #30, §1.6 #43); their replacements are the control
// column's groups (`edit-*`) and compare as a page mode, covered above and in
// onepage.spec.ts.
