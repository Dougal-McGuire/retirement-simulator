import config from '../../playwright.config'

describe('playwright config', () => {
  it('starts the app automatically for local and CI runs', () => {
    expect(config.webServer).toBeDefined()

    const webServer = Array.isArray(config.webServer) ? config.webServer[0] : config.webServer

    expect(webServer?.command).toContain('pnpm')
    expect(webServer?.url).toBe('http://localhost:3000')
  })
})
