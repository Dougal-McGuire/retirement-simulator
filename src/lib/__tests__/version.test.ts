import { formatDeployTimestamp, getAppVersionInfo } from '../version'

describe('getAppVersionInfo', () => {
  it('returns CalVer release tag, short commit, and deploy timestamp from env', () => {
    const info = getAppVersionInfo({
      NEXT_PUBLIC_APP_VERSION: '2026.11.3',
      NEXT_PUBLIC_GIT_COMMIT: 'ba745cf1234567890abcdef',
      NEXT_PUBLIC_DEPLOYED_AT: '2026-11-26T17:40:00Z',
    })

    expect(info).toEqual({
      version: '2026.11.3',
      commit: 'ba745cf1234567890abcdef',
      shortCommit: 'ba745cf',
      deployedAt: '2026-11-26T17:40:00Z',
    })
  })

  it('falls back to NEXT_PUBLIC_BUILD_ID and dev defaults when unset', () => {
    expect(
      getAppVersionInfo({
        NEXT_PUBLIC_BUILD_ID: '2f9f5ac99999',
      })
    ).toEqual({
      version: 'dev',
      commit: '2f9f5ac99999',
      shortCommit: '2f9f5ac',
      deployedAt: '',
    })

    expect(getAppVersionInfo({})).toEqual({
      version: 'dev',
      commit: '',
      shortCommit: '',
      deployedAt: '',
    })
  })
})

describe('formatDeployTimestamp', () => {
  it('formats UTC ISO timestamps in DD-MMM-YYYY HH:mm for a given timezone', () => {
    expect(formatDeployTimestamp('2026-11-26T17:40:00Z', 'UTC')).toBe('26-Nov-2026 17:40')
    expect(formatDeployTimestamp('2026-11-26T17:40:00Z', 'Europe/Berlin')).toBe(
      '26-Nov-2026 18:40'
    )
    expect(formatDeployTimestamp('2026-01-05T08:05:00Z', 'UTC')).toBe('05-Jan-2026 08:05')
  })

  it('formats valid timestamps in the runtime local timezone when timeZone is omitted', () => {
    const formatted = formatDeployTimestamp('2026-11-26T17:40:00Z')
    expect(formatted).toMatch(/^\d{2}-[A-Z][a-z]{2}-\d{4} \d{2}:\d{2}$/)
  })

  it('returns an empty string for empty or invalid timestamps', () => {
    expect(formatDeployTimestamp('')).toBe('')
    expect(formatDeployTimestamp('not-a-date')).toBe('')
  })
})
