import { defineConfig, devices } from '@playwright/test'

const CI = !!process.env.CI

export default defineConfig({
  testDir: './tests',
  timeout: 30000,
  expect: {
    timeout: 7000,
  },
  // A stray `test.only` must not turn the CI gate into a one-test run.
  forbidOnly: CI,
  // One flaky test must not hold production back; a real failure fails all
  // three attempts, and the retry records a trace.
  retries: CI ? 2 : 0,
  reporter: CI ? [['github'], ['list'], ['html', { open: 'never' }]] : 'list',
  webServer: {
    // CI gates the bundle that ships: a production build, not `next dev`.
    // `tests/perf-render.spec.ts` needs React's development build and skips
    // there; CI runs it in a separate dev-server step (see the workflow).
    command: CI && !process.env.PW_DEV_SERVER ? 'pnpm build && pnpm start' : 'pnpm dev:port',
    url: 'http://localhost:3000',
    // Opt-in: a server already on :3000 (possibly without the auth env below,
    // which would silently skip the auth specs) is only reused with PW_REUSE=1.
    reuseExistingServer: !CI && process.env.PW_REUSE === '1',
    timeout: CI ? 300000 : 120000,
    // Placeholder OAuth credentials so the server Playwright starts itself
    // runs the auth-*enabled* code path (SessionProvider mounted, sign-in
    // control rendered). Nothing ever reaches Google: the specs stub
    // `/api/auth/session` in the browser. Real values in the environment win.
    env: {
      AUTH_SECRET: process.env.AUTH_SECRET ?? 'playwright-only-secret-not-for-production',
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? 'playwright-client-id',
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ?? 'playwright-client-secret',
      AUTH_TRUST_HOST: process.env.AUTH_TRUST_HOST ?? 'true',
      // A build id, so the "newer build on the server" hint is testable
      // (`tests/cloud-sync-guard.spec.ts`). Inlined at build time, so the
      // production build above picks it up too.
      NEXT_PUBLIC_BUILD_ID: process.env.NEXT_PUBLIC_BUILD_ID ?? 'playwright-build',
    },
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    headless: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Sandboxed dev environments ship a pre-installed Chromium; CI leaves this unset.
        launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
          ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
          : {},
      },
    },
    {
      // Non-blocking in CI (its own job, continue-on-error). Run it locally
      // with `pnpm test:e2e:webkit` after `pnpm exec playwright install webkit`.
      name: 'webkit-ipad',
      use: { ...devices['iPad Pro 11 landscape'] },
    },
  ],
})
