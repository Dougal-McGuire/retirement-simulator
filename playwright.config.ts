import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: {
    timeout: 7000,
  },
  webServer: {
    command: 'pnpm dev:port',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
    // Placeholder OAuth credentials so the server Playwright starts itself
    // runs the auth-*enabled* code path (SessionProvider mounted, sign-in
    // control rendered). Nothing ever reaches Google: the specs stub
    // `/api/auth/session` in the browser. Real values in the environment win.
    env: {
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'playwright-only-secret-not-for-production',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? 'playwright-client-id',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? 'playwright-client-secret',
      AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST ?? 'true',
    },
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    headless: true,
    trace: 'on-first-retry',
    // Sandboxed dev environments ship a pre-installed Chromium; CI leaves this unset.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
})
