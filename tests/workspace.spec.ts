import type { Locator, Page } from '@playwright/test'
import {
  expect,
  expectNoHorizontalOverflow,
  duplicateFromResult,
  enterCompare,
  gotoWorkspace,
  isInViewport,
  isPainted,
  leverSlider,
  nudgeLever,
  openPlanMenu,
  openSection,
  scrollToTop,
  sectionHeading,
  test,
  type SectionId,
} from './helpers/workspace'

/**
 * The workspace shell: result bar, section index, edit panel entry points,
 * compare mode and the plan menu, across widths (spec §9.1, workspace.spec).
 */

/** Spread of the vertical centres of the result bar's visible clusters. */
function clusterCentres(bar: Locator) {
  return bar.evaluate((element) =>
    [...element.children]
      .filter((child) => {
        const box = child.getBoundingClientRect()
        return box.width > 1 && box.height > 1
      })
      .map((child) => {
        const box = child.getBoundingClientRect()
        return box.top + box.height / 2
      })
  )
}

/** Distinct rows among a list of vertical centres (within 8px is one row). */
function countRows(centres: number[]) {
  const rows: number[] = []
  for (const centre of [...centres].sort((a, b) => a - b)) {
    if (!rows.length || centre - rows[rows.length - 1] > 8) rows.push(centre)
  }
  return rows.length
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

async function pillX(page: Page) {
  return (await page.getByTestId('success-pill').boundingBox())!.x
}

test('tablet overview, editor shortcuts and variants remain reachable', async ({ page }, info) => {
  test.setTimeout(60000)
  await page.setViewportSize({ width: 1366, height: 1000 })
  await gotoWorkspace(page, '/de/simulation')
  await expect(page.getByTestId('result-bar').getByTestId('success-pill')).toBeVisible()

  // One page, five sections in reading order.
  const titles = ['Ergebnis', 'Annahmen', 'Geldfluss', 'Entnahme', 'Stellschrauben']
  const ids: SectionId[] = ['result', 'assumptions', 'cashflow', 'withdrawal', 'levers']
  let previous = -Infinity
  for (const [i, id] of ids.entries()) {
    const heading = sectionHeading(page, id)
    await expect(heading).toHaveText(titles[i])
    const y = (await heading.boundingBox())!.y
    expect(y, `${id} below the previous section`).toBeGreaterThan(previous)
    previous = y
  }
  // The quick levers wait at the end of the page, not on the first screen.
  expect(await isInViewport(leverSlider(page, 'Jährliche Sparrate'))).toBe(false)
  await page.screenshot({ path: info.outputPath('workspace-overview.png'), fullPage: true })

  // The savings card opens its panel docked beside the page.
  await page.getByTestId('edit-savings').click()
  await expect(page.getByTestId('edit-panel')).toHaveAttribute('data-mode', 'docked')
  await expect(page.getByTestId('edit-panel')).toBeVisible()
  await expect(page.getByTestId('edit-panel-title')).toBeFocused()
  await expect(page.locator('#editor-currentAssets')).toBeVisible()
  await page.screenshot({ path: info.outputPath('workspace-editor.png'), fullPage: true })

  // Plan menu → "Pläne vergleichen": compare is a mode of the same page.
  const compare = await enterCompare(page)
  await expect(page.getByTestId('edit-panel')).toHaveCount(0)
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

test('navigation labels and result-bar controls fit at every width', async ({ page }) => {
  await gotoWorkspace(page, '/de/simulation')
  for (const width of [1280, 1024, 820, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    await expectNoHorizontalOverflow(page)

    // Exactly one index, where this width expects it.
    const index = page.getByTestId('section-index')
    await expect(index).toHaveCount(1)
    await expect(index).toBeVisible()
    const box = (await index.boundingBox())!
    if (width >= 1024) {
      const rail = await page.evaluate(() =>
        parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--ui-rail-width') || '184'
        )
      )
      expect(box.x, `index in the rail at ${width}px`).toBeLessThan(rail)
    } else if (width > 760) {
      await expect(index).toHaveCSS('position', 'sticky')
      const bar = (await page.getByTestId('result-bar').boundingBox())!
      expect(
        Math.abs(box.y - (bar.y + bar.height)),
        `chip row under the bar at ${width}px`
      ).toBeLessThanOrEqual(1)
    } else {
      await expect(index).toHaveCSS('position', 'fixed')
      expect(box.y + box.height, `bottom bar at ${width}px`).toBeCloseTo(1000, 0)
    }
    for (const link of await index.getByRole('link').all()) {
      const fits = await link.evaluate((el) => el.scrollWidth <= el.clientWidth)
      expect(fits, `section link fits at ${width}px`).toBe(true)
    }

    // Result-bar buttons keep a 40px target and the 14px control font.
    const buttons = page.getByTestId('result-bar').getByRole('button')
    for (const button of await buttons.all()) {
      if (!(await button.isVisible())) continue
      const size = await button.evaluate((el) => ({
        height: el.getBoundingClientRect().height,
        font: getComputedStyle(el).fontSize,
        name: el.getAttribute('data-testid') ?? el.textContent,
      }))
      expect(size.height, `${size.name} height at ${width}px`).toBeGreaterThanOrEqual(40)
      expect(size.font, `${size.name} font at ${width}px`).toBe('14px')
    }
  }
})

test('levers explain drafts; the result bar marks and saves them', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 })
  await gotoWorkspace(page, '/de/simulation')

  await openSection(page, 'levers')
  const levers = page.locator('#levers')
  const note = levers.getByTestId('levers-note')
  await expect(note).toContainText(
    'Änderungen hier sind Entwürfe – sie gelten erst für deinen Plan, wenn du speicherst.'
  )
  await expect(note).not.toContainText('Ergebnisleiste')

  const bar = page.getByTestId('result-bar')
  await levers.getByTestId('quick-levers').getByRole('slider').first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(bar).toHaveAttribute('data-dirty', 'true')
  await expect(bar.getByText(/^Ungespeichert/).filter({ visible: true })).toHaveCount(1)
  await expect(note).toContainText(
    'Speichern oder verwerfen kannst du sie oben in der Ergebnisleiste.'
  )

  // One save/discard path: the section has no buttons of its own.
  await expect(levers.getByTestId('command-save')).toHaveCount(0)
  await expect(levers.getByTestId('command-discard')).toHaveCount(0)
  await expect(levers.getByRole('button', { name: /^(Speichern|Verwerfen)$/ })).toHaveCount(0)
  await expect(levers.getByRole('button', { name: /^Ungespeicherte Änderungen/ })).toHaveCount(0)

  await page.getByTestId('command-save').click()
  await expect(bar).not.toHaveAttribute('data-dirty', 'true')
  await expect(bar.getByText(/^Ungespeichert/).filter({ visible: true })).toHaveCount(0)
  await expect(note).not.toContainText('Ergebnisleiste')
})

test('the result section offers a variant, then opens compare with both plans lined up', async ({
  page,
}) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1366, height: 1000 })
  await gotoWorkspace(page)
  const result = page.locator('#result')

  // One plan: the Ergebnis section points to duplication instead of a comparison.
  await expect(result.getByTestId('overview-compare')).toHaveCount(0)
  await duplicateFromResult(page)

  const entry = result.getByTestId('overview-compare')
  await expect(entry).toContainText('Compare with another plan')
  await expect(entry).toContainText('Base plan 2 side by side with Base plan')
  await entry.click()

  await expect(page).toHaveURL(/#compare$/)
  const compare = page.getByTestId('compare-view')
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
  test('phone first screen shows the result and the section index', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await gotoWorkspace(page, '/de/simulation')
    const kpi = page.getByTestId('success-pill')
    await expect(kpi).toBeInViewport()
    await expect(
      page.getByRole('heading', { level: 2, name: 'Ergebnis', exact: true })
    ).toBeInViewport()

    // The index is a fixed bottom bar; the headline result sits above it.
    const index = page.getByRole('navigation', { name: 'Abschnitte' })
    await expect(index).toHaveAttribute('data-testid', 'section-index')
    await expect(index).toHaveCSS('position', 'fixed')
    const indexBox = (await index.boundingBox())!
    expect(indexBox.y + indexBox.height).toBeCloseTo(844, 0)
    const kpiBox = (await kpi.boundingBox())!
    expect(kpiBox.y + kpiBox.height).toBeLessThan(indexBox.y)
    await expect(page.getByTestId('section-link-cashflow')).toBeVisible()
    await expect(page.getByTestId('section-link-cashflow')).toContainText('Geldfluss')

    // Every bottom-bar item jumps, the first one included.
    await openSection(page, 'levers')
    await openSection(page, 'result')
    await expect(page.locator('#result-title')).toBeInViewport()
    await expect(kpi).toBeInViewport()

    // The euro switch lives in the Menu below 1024px.
    await expect(page.getByTestId('display-toggle')).toBeHidden()
    await page.getByTestId('dashboard-tools').click()
    await expect(page.getByRole('dialog').getByTestId('menu-display-toggle')).toBeVisible()
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

  test('discard sits next to the unsaved marker and can be undone', async ({ page }) => {
    await gotoWorkspace(page)
    await expect(page.getByTestId('command-discard')).toHaveCount(0)

    const slider = await nudgeLever(page)
    await expect(slider).toHaveAttribute('aria-valuenow', '61')
    const bar = page.getByTestId('result-bar')
    await expect(bar).toContainText('Unsaved')

    await page.getByTestId('command-discard').click()
    await expect(slider).toHaveAttribute('aria-valuenow', '60')
    await expect(bar).toContainText('Plan saved')
    await expect(bar).not.toHaveAttribute('data-dirty', 'true')
    await page.getByTestId('plan-discarded-toast-undo').click()
    await expect(slider).toHaveAttribute('aria-valuenow', '61')
    await expect(bar).toContainText('Unsaved')
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

    await openSection(page, 'levers')
    await leverSlider(page, 'Annual savings').focus()
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
    const menu = page.getByRole('dialog', { name: 'Report and settings' })
    await expect(menu.getByRole('button', { name: 'Generate Report' })).toBeFocused()
    await expect(page.locator('[data-slot="tooltip-content"]')).toHaveCount(0)
    // Plans are managed from the plan menu; the guided setup sits in Annahmen.
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
  await duplicateFromResult(page)
  await page.getByTestId('overview-compare').click()

  const compare = page.getByTestId('compare-view')
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

  // The fixed bottom index never covers the way out.
  const exitBox = (await exit.boundingBox())!
  const indexBox = (await page.getByTestId('section-index').boundingBox())!
  expect(exitBox.y + exitBox.height).toBeLessThanOrEqual(indexBox.y)
})

test('result bar keeps one row from 761px up and a whole unsaved marker at 320px', async ({
  page,
}) => {
  test.setTimeout(90000)
  const widths = [761, 850, 950, 1023, 1024, 1200, 1279, 1280, 1366, 1440]
  await page.setViewportSize({ width: 1366, height: 900 })
  await gotoWorkspace(page, '/de/simulation')
  const bar = page.getByTestId('result-bar')
  const runStatus = page.getByTestId('run-status')
  const marker = bar.getByText(/^Ungespeichert/).filter({ visible: true })

  const cleanX = new Map<number, number>()
  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    cleanX.set(width, await pillX(page))
  }

  await page.setViewportSize({ width: 1366, height: 900 })
  await nudgeLever(page, 'Renteneintrittsalter')
  await expect(runStatus).toHaveAttribute('data-state', 'updated')

  for (const width of widths) {
    await page.setViewportSize({ width, height: 900 })
    const centres = await clusterCentres(bar)
    expect(Math.max(...centres) - Math.min(...centres), `one bar row at ${width}px`).toBeLessThan(8)
    await expect(page.getByTestId('command-save')).toBeInViewport()
    // A worded unsaved marker at every width …
    await expect(marker, `unsaved marker at ${width}px`).toHaveCount(1)
    await expect(marker).toContainText('Ungespeichert')
    // … and no green "updated" check next to Save while the plan is unsaved:
    // the idle run status is visually hidden (it stays a live region).
    expect(await isPainted(runStatus), `run-status check hidden at ${width}px`).toBe(false)
    await expect(page.getByTestId('command-discard')).toHaveAttribute('title', 'Verwerfen')
    await expect(page.getByTestId('command-discard')).toHaveAccessibleName(/verwerfen/i)
    // The success rate does not move when the draft cluster appears.
    expect(await pillX(page), `success-pill x stable at ${width}px`).toBeCloseTo(
      cleanX.get(width)!,
      0
    )
  }

  // Saving brings the check back and still leaves the KPI where it was.
  await page.getByTestId('command-save').click()
  await expect(bar).not.toHaveAttribute('data-dirty', 'true')
  expect(await isPainted(runStatus), 'run-status check back once saved').toBe(true)
  expect(await pillX(page)).toBeCloseTo(cleanX.get(1440)!, 0)

  // Phones: plan row, KPI row and draft row; the plan name keeps its room and
  // the Ergebnis heading stays on the first screen.
  await nudgeLever(page, 'Renteneintrittsalter')
  await page.setViewportSize({ width: 390, height: 844 })
  await scrollToTop(page)
  await expect(runStatus).toHaveAttribute('data-state', 'updated')
  expect(countRows(await clusterCentres(bar)), 'three bar rows at 390px').toBe(3)
  const nameClipped = await page
    .getByTestId('plan-menu-trigger')
    .evaluate((trigger) =>
      [trigger, ...trigger.querySelectorAll<HTMLElement>('*')].some(
        (el) =>
          el instanceof HTMLElement && el.clientWidth > 0 && el.scrollWidth > el.clientWidth + 1
      )
    )
  expect(nameClipped, 'plan name not truncated at 390px').toBe(false)
  await expect(page.locator('#result-title')).toBeInViewport()

  await page.setViewportSize({ width: 320, height: 700 })
  const shortMarker = bar.getByText('Ungespeichert', { exact: true })
  await expect(shortMarker).toBeVisible()
  expect(await isClipped(shortMarker), 'short marker whole at 320px').toBe(false)
  await expectNoHorizontalOverflow(page)
})

test('the discard toast leaves with a plan switch', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await gotoWorkspace(page)
  await duplicateFromResult(page)
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
// dropped by the spec (§1.3 #30, §1.6 #43); their replacements are the Annahmen
// cards (`edit-*`) and compare as a page mode, covered above and in
// onepage.spec.ts.
