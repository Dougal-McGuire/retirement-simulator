import type { PlaywrightTestConfig } from '@playwright/test'
import packageJson from '../../package.json'

// Playwright refuses to be required twice, and every isolated config load
// would do that: hand each one the same, once-loaded module.
const mockPlaywright = jest.requireActual('@playwright/test')
jest.mock('@playwright/test', () => mockPlaywright)

const ENV_KEYS =['CI', 'PW_REUSE', 'PW_DEV_SERVER', 'PLAYWRIGHT_CHROMIUM_PATH'] as const

/** Loads playwright.config.ts afresh with the given env (it reads env at import). */
function loadConfig(env: Partial<Record<(typeof ENV_KEYS)[number], string>>): PlaywrightTestConfig {
  const saved = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]))
  for (const key of ENV_KEYS) delete process.env[key]
  Object.assign(process.env, env)
  try {
    let config: PlaywrightTestConfig | undefined
    jest.isolateModules(() => {
      config = require('../../playwright.config').default
    })
    return config!
  } finally {
    for (const key of ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key]
      else process.env[key] = saved[key]
    }
  }
}

function webServerOf(config: PlaywrightTestConfig) {
  return Array.isArray(config.webServer) ? config.webServer[0] : config.webServer
}

describe('playwright config', () => {
  it('starts a dev server locally and never reuses a stray one unless asked', () => {
    const local = webServerOf(loadConfig({}))
    expect(local?.command).toBe('pnpm dev:port')
    expect(local?.url).toBe('http://localhost:3000')
    expect(local?.reuseExistingServer).toBe(false)
    expect(webServerOf(loadConfig({ PW_REUSE: '1' }))?.reuseExistingServer).toBe(true)
  })

  it('gates CI on a production build with retries, forbidOnly and evidence', () => {
    const config = loadConfig({ CI: '1' })
    expect(webServerOf(config)?.command).toBe('pnpm build && pnpm start')
    expect(webServerOf(config)?.reuseExistingServer).toBe(false)
    expect(config.retries).toBe(2)
    expect(config.forbidOnly).toBe(true)
    expect(config.use?.trace).toBe('on-first-retry')
    expect(config.use?.screenshot).toBe('only-on-failure')
    expect(JSON.stringify(config.reporter)).toContain('html')
    // The dev-only perf spec runs against `next dev` even in CI.
    expect(webServerOf(loadConfig({ CI: '1', PW_DEV_SERVER: '1' }))?.command).toBe(
      'pnpm dev:port'
    )
  })

  it('passes placeholder auth env and a build id to the server', () => {
    const env = webServerOf(loadConfig({}))?.env ?? {}
    expect(env.AUTH_SECRET).toBeTruthy()
    expect(env.GOOGLE_CLIENT_ID).toBeTruthy()
    expect(env.NEXT_PUBLIC_BUILD_ID).toBeTruthy()
  })

  it('keeps the Chromium override on the chromium project and adds a WebKit iPad project', () => {
    const config = loadConfig({ PLAYWRIGHT_CHROMIUM_PATH: '/opt/chromium' })
    const chromium = config.projects?.find((project) => project.name === 'chromium')
    const webkit = config.projects?.find((project) => project.name === 'webkit-ipad')
    expect(chromium?.use?.launchOptions?.executablePath).toBe('/opt/chromium')
    expect(webkit?.use?.defaultBrowserType).toBe('webkit')
    expect(webkit?.use?.launchOptions?.executablePath).toBeUndefined()
    expect(config.use?.launchOptions).toBeUndefined()
  })

  it('runs only chromium by default; WebKit has its own script', () => {
    expect(packageJson.scripts['test:e2e']).toContain('--project=chromium')
    expect(packageJson.scripts['test:e2e:webkit']).toContain('--project=webkit-ipad')
  })
})
