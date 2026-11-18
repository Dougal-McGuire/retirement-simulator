import { expect, gotoWorkspace, successRate, test } from './helpers/workspace'

test('opens shortfall details by keyboard and measures a lifestyle minimum independently', async ({
  page,
}) => {
  await gotoWorkspace(page, '/en/simulation')
  const before = await successRate(page)
  const details = page.getByTestId('shortfall-details')
  await details.locator('summary').focus()
  await page.keyboard.press('Enter')
  await expect(details.getByRole('heading', { name: 'Unpaid planned spending' })).toBeVisible()
  await details.getByRole('button', { name: 'Set monthly minimum' }).click()
  const floor = page.getByLabel('Monthly lifestyle minimum (today’s euros)', { exact: true })
  await expect(floor).toBeFocused()
  await floor.fill('12000')
  await floor.blur()
  await expect(details).toContainText('monthly minimum in today’s euros', { timeout: 15000 })
  await expect(details).toContainText('Age at first gap')
  expect(await successRate(page)).toBe(before)
})
