export interface AppVersionInfo {
  /** CalVer release tag (e.g. `2026.11.1`) or `'dev'` / `'preview'`. */
  version: string
  /** Full commit SHA when available, else empty string. */
  commit: string
  /** Abbreviated 7-character commit SHA for display. */
  shortCommit: string
  /** UTC ISO 8601 build/deploy timestamp, or empty string when unavailable. */
  deployedAt: string
}

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

/**
 * Reads build-time version metadata inlined by `next.config.ts`.
 * Safe in both server and browser bundles.
 */
export function getAppVersionInfo(
  env: {
    NEXT_PUBLIC_APP_VERSION?: string
    NEXT_PUBLIC_GIT_COMMIT?: string
    NEXT_PUBLIC_BUILD_ID?: string
    NEXT_PUBLIC_DEPLOYED_AT?: string
  } = {
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION,
    NEXT_PUBLIC_GIT_COMMIT: process.env.NEXT_PUBLIC_GIT_COMMIT,
    NEXT_PUBLIC_BUILD_ID: process.env.NEXT_PUBLIC_BUILD_ID,
    NEXT_PUBLIC_DEPLOYED_AT: process.env.NEXT_PUBLIC_DEPLOYED_AT,
  }
): AppVersionInfo {
  const version = env.NEXT_PUBLIC_APP_VERSION?.trim() || 'dev'
  const commit = (env.NEXT_PUBLIC_GIT_COMMIT || env.NEXT_PUBLIC_BUILD_ID || '').trim()
  const shortCommit = commit ? commit.slice(0, 7) : ''
  const deployedAt = env.NEXT_PUBLIC_DEPLOYED_AT?.trim() || ''
  return { version, commit, shortCommit, deployedAt }
}

/**
 * Formats an ISO 8601 UTC timestamp in the user's local time zone using the
 * house `DD-MMM-YYYY HH:mm` format (e.g. `26-Nov-2026 18:45`).
 * Passing an explicit `timeZone` (e.g. `'UTC'`) makes formatting deterministic in tests.
 */
export function formatDeployTimestamp(isoTimestamp: string, timeZone?: string): string {
  if (!isoTimestamp) return ''
  const date = new Date(isoTimestamp)
  if (Number.isNaN(date.getTime())) return ''

  if (timeZone) {
    const parts = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).formatToParts(date)
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((part) => part.type === type)?.value ?? ''
    const monthIndex = Number(get('month')) - 1
    const month = SHORT_MONTHS[monthIndex] ?? get('month')
    return `${get('day')}-${month}-${get('year')} ${get('hour')}:${get('minute')}`
  }

  const day = String(date.getDate()).padStart(2, '0')
  const month = SHORT_MONTHS[date.getMonth()]
  const year = date.getFullYear()
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${day}-${month}-${year} ${hour}:${minute}`
}
