/**
 * "Is the user really signed out?" — asked of the server, not of Auth.js.
 *
 * Auth.js' client answers `null` for *any* failed `/api/auth/session` request:
 * offline, a 5xx, an aborted fetch all look exactly like "no session". It
 * refetches whenever another tab asks it to, so a single hiccup turns a
 * signed-in tab into a signed-out one — and once it holds `null` it never asks
 * again on its own. For this app that meant the account's workspace was
 * swapped for the anonymous one, and stayed swapped.
 *
 * So a session that *disappears* is treated as a claim to verify: only an
 * HTTP 200 with an empty session is a sign-out. Everything else is "don't
 * know", which changes nothing and is asked again later.
 */

import { isRecord } from '@/lib/isRecord'

export type SessionProbe =
  /** HTTP 200 and a session with a user. */
  | 'signed-in'
  /** HTTP 200 and no session: the server says nobody is signed in. */
  | 'signed-out'
  /** No answer (network error, non-200, unreadable body): nothing is known. */
  | 'unknown'

export const SESSION_ENDPOINT = '/api/auth/session'

/** Delays between probes while there is no answer; the last one repeats. */
export const SESSION_RETRY_DELAYS_MS: readonly number[] = [2_000, 5_000, 15_000, 60_000]

/** One direct request to the session endpoint. Never throws. */
export async function probeSession(fetchImpl: typeof fetch = fetch): Promise<SessionProbe> {
  try {
    const response = await fetchImpl(SESSION_ENDPOINT, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      cache: 'no-store',
      credentials: 'same-origin',
    })
    // Only a 200 is an answer. A 5xx, a gateway's error page or a 404 during
    // a deploy says nothing about the session.
    if (response.status !== 200) return 'unknown'

    // A body that is not JSON (a captive portal answers 200 with HTML) throws
    // here and stays "unknown".
    const body = (await response.json()) as unknown
    return isRecord(body) && isRecord(body.user) ? 'signed-in' : 'signed-out'
  } catch {
    return 'unknown'
  }
}

export interface SignOutWatchOptions {
  /** The server confirmed there is no session. */
  onSignedOut: () => void
  /** The server still has a session: the report of a sign-out was wrong. */
  onStillSignedIn: () => void
  /** Wait before the first probe (used to back off after a failed recovery). */
  initialDelayMs?: number
  probe?: () => Promise<SessionProbe>
  delays?: readonly number[]
}

/**
 * Verifies a reported sign-out. Probes at once (or after `initialDelayMs`),
 * then keeps probing with growing pauses until the server answers either way;
 * a browser `online` event cuts the current pause short. Exactly one of the
 * callbacks fires, at most once. Returns a function that stops the watch.
 */
export function watchSignOut({
  onSignedOut,
  onStillSignedIn,
  initialDelayMs = 0,
  probe = probeSession,
  delays = SESSION_RETRY_DELAYS_MS,
}: SignOutWatchOptions): () => void {
  let stopped = false
  let attempt = 0
  let timer: ReturnType<typeof setTimeout> | null = null
  const target =
    typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null

  const stop = () => {
    stopped = true
    if (timer !== null) clearTimeout(timer)
    timer = null
    target?.removeEventListener('online', probeNow)
  }

  const run = async () => {
    timer = null
    const answer = await probe()
    if (stopped) return

    if (answer === 'unknown') {
      const delay = delays[Math.min(attempt, delays.length - 1)] ?? 60_000
      attempt += 1
      timer = setTimeout(() => void run(), delay)
      return
    }

    stop()
    if (answer === 'signed-out') onSignedOut()
    else onStillSignedIn()
  }

  /** The network is back: do not sit out the rest of the pause. */
  function probeNow() {
    if (stopped || timer === null) return
    clearTimeout(timer)
    void run()
  }

  target?.addEventListener('online', probeNow)
  if (initialDelayMs > 0) timer = setTimeout(() => void run(), initialDelayMs)
  else void run()

  return stop
}
