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
