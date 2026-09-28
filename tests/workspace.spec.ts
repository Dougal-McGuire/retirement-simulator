import { expect, test } from '@playwright/test'

test('tablet overview, editor shortcuts and variants remain reachable', async ({ page }, info) => {
  await page.setViewportSize({ width: 1366, height: 1000 })
  await page.goto('/de/simulation')
  await expect(page.getByTestId('success-pill')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Überblick', exact: true })).toBeVisible()
  await expect(page.getByRole('slider', { name: 'Jährliche Sparrate' })).not.toBeVisible()
  await page.screenshot({ path: info.outputPath('workspace-overview.png'), fullPage: true })
  await page.getByRole('button', { name: /Vermögen heute/ }).click()
  await expect(page.locator('#editor-currentAssets')).toBeVisible()
  await expect(page.getByRole('heading', { level: 1 })).toBeFocused()
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport()
  await page.screenshot({ path: info.outputPath('workspace-editor.png'), fullPage: true })
  await page.getByTestId('tab-scenarios').click()
  await page.getByTestId('enter-compare').click()
  await expect(page.getByTestId('compare-view')).toBeVisible()
  await expect(page.getByTestId('compare-fan-chart')).toBeVisible()
  await page.screenshot({ path: info.outputPath('workspace-comparison.png'), fullPage: true })
})
test('mobile workspace and menu fit the screen', async ({ page }, info) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/de/simulation')
  await expect(page.getByTestId('success-pill')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await page.screenshot({ path: info.outputPath('workspace-mobile.png'), fullPage: true })
  await page.getByTestId('dashboard-tools').click()
  const box = await page.getByRole('dialog').boundingBox()
  expect(box!.y).toBeGreaterThanOrEqual(0)
  expect(box!.y + box!.height).toBeLessThanOrEqual(844)
  await page.screenshot({ path: info.outputPath('workspace-menu.png') })
})

test('navigation labels and toolbar controls fit at intermediate and narrow widths', async ({
  page,
}) => {
  await page.goto('/de/simulation')
  await expect(page.getByTestId('success-pill')).toBeVisible()
  for (const width of [820, 768, 390, 320]) {
    await page.setViewportSize({ width, height: 1000 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      width
    )
    const controls = page.locator('.workspace-actions > button')
    for (const control of await controls.all()) {
      await expect(control).toHaveCSS('font-size', '14px')
      await expect(control).toHaveCSS('height', '40px')
    }
    for (const label of await page.locator('.workspace-navigation button').all()) {
      const dimensions = await label.evaluate((button) => ({
        width: button.clientWidth,
        content: button.scrollWidth,
      }))
      expect(dimensions.content, `Navigation fits at ${width}px`).toBeLessThanOrEqual(
        dimensions.width
      )
    }
  }
})

test('what-if strip explains drafts and marks a changed working copy', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 1000 })
  await page.goto('/de/simulation')
  await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })

  const strip = page.getByTestId('whatif-strip')
  await expect(strip.getByTestId('whatif-draft')).toHaveCount(0)
  await strip.getByText('Was wäre, wenn …?', { exact: true }).click()
  await expect(strip.getByTestId('whatif-note')).toContainText(
    'Änderungen hier sind Entwürfe – sie gelten erst für deinen Plan, wenn du speicherst.'
  )

  await strip.getByRole('slider').first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(strip.getByTestId('whatif-draft')).toHaveText('Entwurf')
  await expect(strip).toHaveAttribute('data-dirty', 'true')

  await expect(strip.getByTestId('whatif-note')).toContainText(
    'Speichern oder verwerfen kannst du sie oben in der Kopfzeile.'
  )

  // One save/discard path: the strip has no buttons of its own, the header's
  // Save clears the marker; the plan now holds the change.
  await expect(strip.getByRole('button', { name: /speichern|verwerfen/i })).toHaveCount(0)
  await page.getByTestId('command-save').click()
  await expect(strip.getByTestId('whatif-draft')).toHaveCount(0)
})

test('overview offers a variant, then opens compare with both plans lined up', async ({ page }) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 1366, height: 1000 })
  await page.goto('/en/simulation')
  await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })

  // One plan: the overview points to duplication instead of a comparison.
  await expect(page.getByTestId('overview-compare')).toHaveCount(0)
  await page.getByTestId('overview-duplicate').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Duplicate plan' }).click()

  const entry = page.getByTestId('overview-compare')
  await expect(entry).toContainText('Compare with another plan')
  await expect(entry).toContainText('Base plan 2 side by side with Base plan')
  await entry.click()

  await expect(page.getByTestId('tab-scenarios')).toHaveAttribute('data-state', 'active')
  await expect(page.getByTestId('enter-compare')).toHaveAttribute('aria-pressed', 'true')
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

test.describe('workspace header', () => {
  test('phone first screen shows the heading and the headline result', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/de/simulation')
    const kpi = page.getByTestId('success-pill')
    await expect(kpi).toBeVisible({ timeout: 30000 })
    await expect(page.getByRole('heading', { level: 1, name: 'Überblick' })).toBeInViewport()

    // The workflow tabs are a fixed bottom bar; the first result sits above it.
    const bar = page.getByRole('tablist', { name: 'Bereiche der Ruhestandsplanung' })
    await expect(bar).toHaveCSS('position', 'fixed')
    const barBox = (await bar.boundingBox())!
    expect(barBox.y + barBox.height).toBeCloseTo(844, 0)
    const kpiBox = (await kpi.boundingBox())!
    expect(kpiBox.y + kpiBox.height).toBeLessThan(barBox.y)
    await expect(bar.getByRole('tab', { name: 'Zahlungen' })).toBeVisible()

    // The euro switch moved from the header into the menu.
    await expect(page.getByTestId('display-toggle')).toBeHidden()
    await page.getByTestId('dashboard-tools').click()
    await expect(page.getByRole('dialog').getByTestId('menu-display-toggle')).toBeVisible()
  })

  test('plan menu lists plans and creates, duplicates, renames and switches', async ({ page }) => {
    await page.goto('/en/simulation')
    await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })
    const trigger = page.getByTestId('plan-menu-trigger')
    await expect(trigger).toHaveAccessibleName('Current plan: Base plan')

    // Keyboard: ArrowDown opens on the active plan, Escape returns to the trigger.
    await trigger.focus()
    await page.keyboard.press('ArrowDown')
    const menu = page.getByRole('menu', { name: 'Plans' })
    await expect(menu.getByRole('menuitemradio', { name: /Base plan/ })).toBeFocused()
    await expect(menu.getByRole('menuitemradio', { name: /Base plan/ })).toContainText('success')
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

    // "Manage plans …" opens the Menu on the plan manager; closing it returns
    // focus to the plan picker, not to the Menu button.
    await trigger.click()
    await menu.getByRole('menuitem', { name: 'Manage plans …' }).click()
    await expect(page.getByTestId('plan-switcher-select')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(trigger).toBeFocused()

    // Unsaved edits: switching asks first.
    await page.getByText('What if …?', { exact: true }).click()
    await page.getByRole('slider', { name: 'Retirement age' }).focus()
    await page.keyboard.press('ArrowRight')
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
    await page.goto('/en/simulation')
    await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })
    await expect(page.getByTestId('command-discard')).toHaveCount(0)

    await page.getByText('What if …?', { exact: true }).click()
    const slider = page.getByRole('slider', { name: 'Retirement age' })
    await slider.focus()
    await page.keyboard.press('ArrowRight')
    await expect(slider).toHaveAttribute('aria-valuenow', '61')
    const toolbar = page.locator('.workspace-toolbar')
    await expect(toolbar).toContainText('Unsaved changes')

    await page.getByTestId('command-discard').click()
    await expect(slider).toHaveAttribute('aria-valuenow', '60')
    await expect(toolbar).toContainText('Plan saved')
    await page.getByTestId('plan-discarded-toast-undo').click()
    await expect(slider).toHaveAttribute('aria-valuenow', '61')
    await expect(toolbar).toContainText('Unsaved changes')
  })

  test('recalculate stays quiet while results are current; runs show a status', async ({
    page,
  }) => {
    await page.goto('/en/simulation')
    await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })
    const status = page.getByTestId('run-status')
    const run = page.getByTestId('run-button')
    await expect(status).toHaveText('Updated')
    await expect(run).not.toHaveClass(/workspace-button-primary/)

    await page.getByText('What if …?', { exact: true }).click()
    await page.getByRole('slider', { name: 'Annual savings' }).focus()
    await page.keyboard.press('ArrowRight')
    // Held for at least 400 ms, so it is there to be read.
    await expect(status).toHaveText('Recalculating …')
    await expect(page.locator('main')).toHaveAttribute('data-run-status', 'running')
    await expect(status).toHaveText('Updated')
    await expect(run).not.toHaveClass(/workspace-button-primary/)
  })

  test('menu focuses a real control and nested dialogs unwind one Escape at a time', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/en/simulation')
    await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })

    await page.getByTestId('dashboard-tools').click()
    const menu = page.getByRole('dialog', { name: 'Plans and tools' })
    await expect(menu.getByRole('button', { name: 'Generate Report' })).toBeFocused()
    await expect(page.locator('[data-slot="tooltip-content"]')).toHaveCount(0)

    await menu.getByTestId('plan-duplicate').click()
    await expect(page.getByLabel('Name for the copy')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Duplicate plan' })).toHaveCount(0)
    await expect(menu).toBeVisible()
    await expect(menu.getByTestId('plan-duplicate')).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(menu).toHaveCount(0)
    await expect(page.getByTestId('dashboard-tools')).toBeFocused()
  })
})

test('comparison stacks chart above table on phones without overlap', async ({ page }) => {
  test.setTimeout(90000)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/en/simulation')
  await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })
  await page.getByTestId('overview-duplicate').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Duplicate plan' }).click()
  await page.getByTestId('overview-compare').click()

  const compare = page.getByTestId('compare-view')
  const chart = compare.getByTestId('compare-fan-chart')
  const table = compare.locator('.compare-table table')
  await expect(chart).toBeVisible({ timeout: 30000 })
  await expect(compare.getByRole('button', { name: 'Exit compare' })).toBeVisible()
  // Both plans computed: parameter column plus one column per plan.
  await expect(table.locator('thead th')).toHaveCount(3, { timeout: 30000 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
  await expect
    .poll(async () => {
      const chartBox = (await chart.boundingBox())!
      const tableBox = (await table.boundingBox())!
      return tableBox.y - (chartBox.y + chartBox.height)
    })
    .toBeGreaterThanOrEqual(0)
})

test('header keeps one row from 761px up and a whole unsaved marker at 320px', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/de/simulation')
  await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })
  const toolbar = page.locator('.workspace-toolbar')
  const trigger = page.getByTestId('plan-menu-trigger')
  const runStatus = page.getByTestId('run-status')
  const cleanX = (await trigger.boundingBox())!.x

  await page.getByText('Was wäre, wenn …?', { exact: true }).click()
  await page.getByTestId('whatif-strip').getByRole('slider').first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(toolbar).toHaveAttribute('data-dirty', 'true')
  await expect(runStatus).toHaveAttribute('data-state', 'updated')

  // The picker does not move when the plan becomes dirty.
  expect((await trigger.boundingBox())!.x, 'picker x stable across dirty toggle').toBeCloseTo(
    cleanX,
    0
  )

  const marker = page.locator('.workspace-dirty .workspace-save-status')
  for (const width of [761, 850, 950, 1000, 1101, 1200, 1366]) {
    await page.setViewportSize({ width, height: 900 })
    const rows = await toolbar.evaluate((bar) => {
      const tops = [...bar.children]
        .filter((child) => child.getClientRects().length)
        .map((child) => {
          const box = child.getBoundingClientRect()
          return box.top + box.height / 2
        })
      return Math.max(...tops) - Math.min(...tops)
    })
    expect(rows, `one header row at ${width}px`).toBeLessThan(8)
    await expect(page.getByTestId('command-save')).toBeInViewport()
    // A worded unsaved marker at every width …
    await expect(marker, `unsaved marker at ${width}px`).toBeVisible()
    await expect(marker).toContainText('Ungespeichert')
    // … and no green "updated" check next to Save while the plan is unsaved:
    // the idle run status is visually hidden (it stays a live region).
    const status = (await runStatus.boundingBox())!
    expect(status.width, `run-status check hidden at ${width}px`).toBeLessThanOrEqual(1)
    await expect(page.getByTestId('command-discard')).toHaveAttribute('title', 'Verwerfen')
    await expect(page.getByTestId('command-discard')).toHaveAccessibleName(/verwerfen/i)
  }

  // Saving brings the check back and still leaves the picker where it was.
  await page.getByTestId('command-save').click()
  await expect(toolbar).not.toHaveAttribute('data-dirty', 'true')
  expect((await runStatus.boundingBox())!.width).toBeGreaterThan(1)
  expect((await trigger.boundingBox())!.x).toBeCloseTo(cleanX, 0)

  // Phones: the dirty actions take a second row, the plan name keeps its
  // room on the first, and the heading stays on the first screen.
  await page.getByTestId('whatif-strip').getByRole('slider').first().focus()
  await page.keyboard.press('ArrowRight')
  await expect(toolbar).toHaveAttribute('data-dirty', 'true')
  await page.setViewportSize({ width: 390, height: 844 })
  await page.evaluate(() => window.scrollTo(0, 0))
  await expect(runStatus).toHaveAttribute('data-state', 'updated')
  const phoneRows = await toolbar.evaluate(
    (bar) =>
      new Set(
        [...bar.children]
          .filter((child) => child.getBoundingClientRect().width > 1)
          .map((child) => Math.round(child.getBoundingClientRect().top))
      ).size
  )
  expect(phoneRows).toBe(2)
  const nameClipped = await trigger
    .locator('.workspace-plan-trigger-name')
    .evaluate((el) => el.scrollWidth > el.clientWidth)
  expect(nameClipped, 'plan name not truncated at 390px').toBe(false)
  await expect(page.getByRole('heading', { level: 1, name: 'Überblick' })).toBeInViewport()

  await page.setViewportSize({ width: 320, height: 700 })
  const shortMarker = page.locator('.workspace-save-status-short')
  await expect(shortMarker).toHaveText('Ungespeichert')
  const clipped = await marker.evaluate((el) => el.scrollWidth > el.clientWidth + 1)
  expect(clipped).toBe(false)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(320)
})

test('the discard toast leaves with a plan switch', async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 900 })
  await page.goto('/en/simulation')
  await expect(page.getByTestId('success-pill')).toBeVisible({ timeout: 30000 })
  await page.getByTestId('overview-duplicate').click()
  await page.getByRole('dialog').getByRole('button', { name: 'Duplicate plan' }).click()
  const trigger = page.getByTestId('plan-menu-trigger')
  await expect(trigger).toHaveText('Base plan 2')

  await page.getByText('What if …?', { exact: true }).click()
  await page.getByRole('slider', { name: 'Retirement age' }).focus()
  await page.keyboard.press('ArrowRight')
  await page.getByTestId('command-discard').click()
  const toast = page.getByTestId('plan-discarded-toast')
  await expect(toast).toBeVisible()

  // Its Undo could only apply to "Base plan 2", so switching plans removes it.
  await trigger.click()
  await page
    .getByRole('menu', { name: 'Plans' })
    .getByRole('menuitemradio', { name: /^Base plan(?! 2)/ })
    .click()
  await expect(trigger).toHaveText('Base plan')
  // Dismissed (gone after the ~1 s exit), well inside its own 8 s lifetime.
  await expect(toast).toHaveCount(0, { timeout: 3000 })
})
