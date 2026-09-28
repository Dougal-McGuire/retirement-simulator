import { expect, test, type Page } from '@playwright/test'

const canvas = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor)
const scheme = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.documentElement).colorScheme)

test.describe('appearance', () => {
  test.use({ colorScheme: 'dark' })

  test('follows the OS by default and honours an explicit override across reloads', async ({
    page,
  }) => {
    await page.goto('/en?stay=1')
    await expect.poll(() => scheme(page)).toBe('dark')
    const darkCanvas = await canvas(page)

    const control = page.getByTestId('appearance-switch').last()
    await expect(control.getByRole('radio', { name: 'System' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await control.getByRole('radio', { name: 'Light' }).click()
    await expect.poll(() => scheme(page)).toBe('light')
    expect(await canvas(page)).not.toBe(darkCanvas)

    // The stored choice is applied by the inline head script, i.e. before
    // hydration: it is already in place when the DOM is parsed.
    await page.reload({ waitUntil: 'domcontentloaded' })
    expect(await page.evaluate(() => document.documentElement.dataset.colorScheme)).toBe('light')
    expect(await scheme(page)).toBe('light')

    // The server renders the switch on "System"; it shows the stored "Light"
    // only once hydrated. Wait for that, or the click lands on inert markup.
    const reloaded = page.getByTestId('appearance-switch').last()
    await expect(reloaded.getByRole('radio', { name: 'Light' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
    await reloaded.getByRole('radio', { name: 'System' }).click()
    await expect.poll(() => scheme(page)).toBe('dark')
    expect(
      await page.evaluate(() => document.documentElement.hasAttribute('data-color-scheme'))
    ).toBe(false)
  })

  test('the dashboard menu carries the switch', async ({ page }) => {
    await page.goto('/de/simulation')
    await page.getByTestId('dashboard-tools').click()
    const control = page.getByRole('dialog').getByTestId('appearance-switch')
    await control.getByRole('radio', { name: 'Hell' }).click()
    await expect.poll(() => scheme(page)).toBe('light')
    await control.getByRole('radio', { name: 'Dunkel' }).focus()
    await page.keyboard.press('ArrowLeft')
    await expect(control.getByRole('radio', { name: 'Hell' })).toHaveAttribute(
      'aria-checked',
      'true'
    )
  })
})
