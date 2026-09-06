import { expect, test } from '@playwright/test'
import { stubSignedIn } from './helpers/auth'

for (const viewport of [
  { width: 1366, height: 900 },
  { width: 390, height: 600 },
]) {
  test(`menu stays inside the viewport at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await stubSignedIn(page)
    await page.goto('/de/simulation')
    await page.getByTestId('dashboard-tools').click()
    const dialog = page.getByRole('dialog', { name: 'Pläne und Werkzeuge' })
    await expect(dialog).toBeVisible()
    await expect(dialog).toHaveCSS('position', 'fixed')
    const box = await dialog.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.y).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width)
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height)
    await expect(dialog.getByRole('button', { name: 'Dialog schließen' })).toBeInViewport()
    await dialog.getByRole('button', { name: 'Dialog schließen' }).click()
    await expect(dialog).toHaveCount(0)
  })
}
