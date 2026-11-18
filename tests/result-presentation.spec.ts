import { expect, test } from '@playwright/test'

test('server-rendered dashboard never announces a sample success rate as the user result', async ({
  browser,
}) => {
  const page = await browser.newPage({ javaScriptEnabled: false })
  try {
    await page.goto('/en/simulation')
    const verdict = page.getByTestId('verdict')
    await expect(verdict).toBeVisible()
    await expect(verdict).not.toContainText(/\d+ of 100 paths/)
  } finally {
    await page.close()
  }
})

test('landing page explains the displayed percentile amounts in both languages', async ({
  page,
}) => {
  for (const locale of ['en', 'de']) {
    await page.goto('/' + locale)
    const spread = page.locator('main section').filter({
      has: page
        .getByRole('listitem')
        .filter({ hasText: locale === 'en' ? '90th percentile' : '90. Perzentil' }),
    })
    await expect(spread.getByText(/186/)).toBeVisible()
  }
})
