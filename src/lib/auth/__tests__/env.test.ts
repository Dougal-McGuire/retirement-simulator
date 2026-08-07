const AUTH_ENV_KEYS = [
  'AUTH_SECRET',
  'NEXTAUTH_SECRET',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'AUTH_GOOGLE_ID',
  'AUTH_GOOGLE_SECRET',
] as const

describe('auth env resolution', () => {
  const original: Record<string, string | undefined> = {}

  beforeEach(() => {
    AUTH_ENV_KEYS.forEach((key) => {
      original[key] = process.env[key]
      delete process.env[key]
    })
  })

  afterEach(() => {
    AUTH_ENV_KEYS.forEach((key) => {
      if (original[key] === undefined) delete process.env[key]
      else process.env[key] = original[key]
    })
  })

  const load = () => require('../env') as typeof import('../env')

  it('reports unconfigured when nothing is set', () => {
    const { isAuthConfigured, getGoogleCredentials, getAuthSecret } = load()

    expect(isAuthConfigured()).toBe(false)
    expect(getGoogleCredentials()).toBeNull()
    expect(getAuthSecret()).toBeNull()
  })

  it('reports unconfigured when only some variables are set', () => {
    const { isAuthConfigured, missingAuthEnvVars } = load()

    process.env.AUTH_SECRET = 'secret'
    expect(isAuthConfigured()).toBe(false)
    expect(missingAuthEnvVars()).toEqual(['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'])

    process.env.GOOGLE_CLIENT_ID = 'id'
    expect(isAuthConfigured()).toBe(false)
    expect(missingAuthEnvVars()).toEqual(['GOOGLE_CLIENT_SECRET'])
  })

  it('treats blank values as unset', () => {
    const { isAuthConfigured } = load()

    process.env.AUTH_SECRET = '   '
    process.env.GOOGLE_CLIENT_ID = 'id'
    process.env.GOOGLE_CLIENT_SECRET = 'secret'

    expect(isAuthConfigured()).toBe(false)
  })

  it('reports configured once all three are set', () => {
    const { isAuthConfigured, getGoogleCredentials, missingAuthEnvVars } = load()

    process.env.AUTH_SECRET = 'secret'
    process.env.GOOGLE_CLIENT_ID = 'id'
    process.env.GOOGLE_CLIENT_SECRET = 'client-secret'

    expect(isAuthConfigured()).toBe(true)
    expect(missingAuthEnvVars()).toEqual([])
    expect(getGoogleCredentials()).toEqual({ clientId: 'id', clientSecret: 'client-secret' })
  })

  it('accepts the AUTH_* aliases', () => {
    const { isAuthConfigured } = load()

    process.env.NEXTAUTH_SECRET = 'secret'
    process.env.AUTH_GOOGLE_ID = 'id'
    process.env.AUTH_GOOGLE_SECRET = 'client-secret'

    expect(isAuthConfigured()).toBe(true)
  })
})
