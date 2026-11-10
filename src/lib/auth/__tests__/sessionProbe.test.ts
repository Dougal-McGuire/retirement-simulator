import {
  probeSession,
  SESSION_ENDPOINT,
  SESSION_RETRY_DELAYS_MS,
  watchSignOut,
  type SessionProbe,
} from '../sessionProbe'

const respond = (status: number, body: string) =>
  jest.fn(async () => ({ status, json: async () => JSON.parse(body) as unknown })) as unknown as
    typeof fetch & jest.Mock

describe('probeSession', () => {
  it('asks the session endpoint directly, uncached', async () => {
    const fetchMock = respond(200, 'null')

    await probeSession(fetchMock)

    expect(fetchMock).toHaveBeenCalledWith(
      SESSION_ENDPOINT,
      expect.objectContaining({ method: 'GET', cache: 'no-store' })
    )
  })

  it('reads a session with a user as signed in', async () => {
    const body = JSON.stringify({ user: { id: 'u1', name: 'Ada' }, expires: '2099-01-01' })

    await expect(probeSession(respond(200, body))).resolves.toBe('signed-in')
  })

  it.each([
    ['null', 'null'],
    ['an empty object', '{}'],
    ['a session without a user', '{"expires":"2099-01-01"}'],
  ])('reads HTTP 200 with %s as signed out', async (_label, body) => {
    await expect(probeSession(respond(200, body))).resolves.toBe('signed-out')
  })

  // The whole point: none of these says anything about the session.
  it.each([
    ['a 500', respond(500, 'null')],
    ['a 503 with a session-shaped body', respond(503, '{"user":{"id":"u1"}}')],
    ['a 404 during a deploy', respond(404, '{}')],
    ['a 200 that is not JSON (captive portal)', respond(200, '<html>Sign in to Wi-Fi</html>')],
    [
      'a network error',
      jest.fn(async () => {
        throw new TypeError('Failed to fetch')
      }) as unknown as typeof fetch,
    ],
  ])('reads %s as unknown', async (_label, fetchMock) => {
    await expect(probeSession(fetchMock)).resolves.toBe('unknown')
  })
})

describe('watchSignOut', () => {
  /** A probe answering from a script; the last answer repeats. */
  const scripted = (...answers: SessionProbe[]) => {
    let call = 0
    return jest.fn(async () => answers[Math.min(call++, answers.length - 1)])
  }

  const flush = async () => {
    for (let index = 0; index < 5; index += 1) await Promise.resolve()
  }

  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
    delete (globalThis as { window?: unknown }).window
  })

  it('confirms a real sign-out with the first probe, at once', async () => {
    const onSignedOut = jest.fn()
    const onStillSignedIn = jest.fn()

    watchSignOut({ onSignedOut, onStillSignedIn, probe: scripted('signed-out') })
    await flush()

    expect(onSignedOut).toHaveBeenCalledTimes(1)
    expect(onStillSignedIn).not.toHaveBeenCalled()
  })

  it('reports a session that is still there, so it can be picked up again', async () => {
    const onSignedOut = jest.fn()
    const onStillSignedIn = jest.fn()

    watchSignOut({ onSignedOut, onStillSignedIn, probe: scripted('signed-in') })
    await flush()

    expect(onStillSignedIn).toHaveBeenCalledTimes(1)
    expect(onSignedOut).not.toHaveBeenCalled()
  })

  it('does nothing while the server gives no answer, and keeps asking', async () => {
    const onSignedOut = jest.fn()
    const onStillSignedIn = jest.fn()
    const probe = scripted('unknown', 'unknown', 'unknown', 'signed-in')

    watchSignOut({ onSignedOut, onStillSignedIn, probe })
    await flush()
    expect(probe).toHaveBeenCalledTimes(1)

    // One pause short of the next probe: still nothing.
    jest.advanceTimersByTime(SESSION_RETRY_DELAYS_MS[0] - 1)
    await flush()
    expect(probe).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(1)
    await flush()
    expect(probe).toHaveBeenCalledTimes(2)

    jest.advanceTimersByTime(SESSION_RETRY_DELAYS_MS[1])
    await flush()
    expect(probe).toHaveBeenCalledTimes(3)
    expect(onSignedOut).not.toHaveBeenCalled()
    expect(onStillSignedIn).not.toHaveBeenCalled()

    jest.advanceTimersByTime(SESSION_RETRY_DELAYS_MS[2])
    await flush()
    expect(onStillSignedIn).toHaveBeenCalledTimes(1)
    expect(onSignedOut).not.toHaveBeenCalled()

    // Answered: the watch is over.
    jest.advanceTimersByTime(10 * 60_000)
    await flush()
    expect(probe).toHaveBeenCalledTimes(4)
  })

  it('never treats an hour offline as a sign-out', async () => {
    const onSignedOut = jest.fn()
    const probe = scripted('unknown')

    watchSignOut({ onSignedOut, onStillSignedIn: jest.fn(), probe })
    for (let minute = 0; minute < 60; minute += 1) {
      jest.advanceTimersByTime(60_000)
      await flush()
    }

    expect(onSignedOut).not.toHaveBeenCalled()
    // Capped at one probe a minute, not a request storm.
    expect(probe.mock.calls.length).toBeLessThanOrEqual(64)
    expect(probe.mock.calls.length).toBeGreaterThan(50)
  })

  it('stops asking when it is cancelled, and ignores an answer that comes late', async () => {
    const onSignedOut = jest.fn()
    let answer!: (value: SessionProbe) => void
    const probe = jest.fn(
      () =>
        new Promise<SessionProbe>((resolve) => {
          answer = resolve
        })
    )

    const stop = watchSignOut({ onSignedOut, onStillSignedIn: jest.fn(), probe })
    await flush()
    stop()
    answer('signed-out')
    await flush()
    jest.advanceTimersByTime(10 * 60_000)
    await flush()

    expect(onSignedOut).not.toHaveBeenCalled()
    expect(probe).toHaveBeenCalledTimes(1)
  })

  it('waits before the first probe when asked to', async () => {
    const probe = scripted('signed-out')
    const onSignedOut = jest.fn()

    watchSignOut({ onSignedOut, onStillSignedIn: jest.fn(), probe, initialDelayMs: 5_000 })
    await flush()
    expect(probe).not.toHaveBeenCalled()

    jest.advanceTimersByTime(5_000)
    await flush()
    expect(onSignedOut).toHaveBeenCalledTimes(1)
  })

  it('probes again as soon as the browser is back online', async () => {
    const listeners = new Map<string, () => void>()
    Object.defineProperty(globalThis, 'window', {
      value: {
        addEventListener: (type: string, listener: () => void) => listeners.set(type, listener),
        removeEventListener: (type: string) => listeners.delete(type),
      },
      configurable: true,
      writable: true,
    })
    const onStillSignedIn = jest.fn()
    const probe = scripted('unknown', 'signed-in')

    watchSignOut({ onSignedOut: jest.fn(), onStillSignedIn, probe })
    await flush()
    expect(probe).toHaveBeenCalledTimes(1)

    listeners.get('online')?.()
    await flush()

    expect(probe).toHaveBeenCalledTimes(2)
    expect(onStillSignedIn).toHaveBeenCalledTimes(1)
    // The watch is over, and it has let go of the listener.
    expect(listeners.has('online')).toBe(false)
  })
})
