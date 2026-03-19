import config from '../../playwright.config'

describe('playwright config', () => {
  it('starts the app automatically for local and CI runs', () => {
    expect(config.webServer).toBeDefined()
    expect(config.webServer?.command).toContain('pnpm')
    expect(config.webServer?.url).toBe('http://localhost:3000')
  })
})
