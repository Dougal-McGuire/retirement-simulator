import {
  BASE_PARAMS_KEY,
  BASE_SAVED_SETUPS_KEY,
  BASE_STORE_KEY,
  getActiveAuthUserId,
  hashUserId,
  namespaceStorageKey,
  setActiveAuthUserId,
  storageKey,
} from '../persistenceKey'

describe('persistence key resolution', () => {
  afterEach(() => {
    setActiveAuthUserId(null)
  })

  describe('namespaceStorageKey', () => {
    it('returns the untouched base key for signed-out users', () => {
      expect(namespaceStorageKey(BASE_STORE_KEY, null)).toBe(BASE_STORE_KEY)
      expect(namespaceStorageKey(BASE_STORE_KEY, undefined)).toBe(BASE_STORE_KEY)
    })

    it('treats blank / whitespace-only ids as signed out', () => {
      expect(namespaceStorageKey(BASE_STORE_KEY, '')).toBe(BASE_STORE_KEY)
      expect(namespaceStorageKey(BASE_STORE_KEY, '   ')).toBe(BASE_STORE_KEY)
    })

    it('suffixes the base key for a signed-in user', () => {
      const key = namespaceStorageKey(BASE_STORE_KEY, '104729000000000000001')

      expect(key.startsWith(`${BASE_STORE_KEY}::u-`)).toBe(true)
      expect(key).not.toBe(BASE_STORE_KEY)
    })

    it('is stable across calls for the same user', () => {
      const first = namespaceStorageKey(BASE_STORE_KEY, 'user-a')
      const second = namespaceStorageKey(BASE_STORE_KEY, 'user-a')

      expect(first).toBe(second)
    })

    it('ignores surrounding whitespace when deriving the namespace', () => {
      expect(namespaceStorageKey(BASE_STORE_KEY, '  user-a  ')).toBe(
        namespaceStorageKey(BASE_STORE_KEY, 'user-a')
      )
    })

    it('separates different users', () => {
      const a = namespaceStorageKey(BASE_STORE_KEY, 'user-a')
      const b = namespaceStorageKey(BASE_STORE_KEY, 'user-b')

      expect(a).not.toBe(b)
    })

    it('separates different base keys for the same user', () => {
      const store = namespaceStorageKey(BASE_STORE_KEY, 'user-a')
      const params = namespaceStorageKey(BASE_PARAMS_KEY, 'user-a')
      const setups = namespaceStorageKey(BASE_SAVED_SETUPS_KEY, 'user-a')

      expect(new Set([store, params, setups]).size).toBe(3)
    })

    it('never leaks the raw account id into the key', () => {
      const email = 'someone@example.com'
      const key = namespaceStorageKey(BASE_STORE_KEY, email)

      expect(key).not.toContain(email)
      expect(key).not.toContain('someone')
      expect(key).not.toContain('example.com')
    })
  })

  describe('hashUserId', () => {
    it('produces a 16-char lowercase hex digest', () => {
      expect(hashUserId('user-a')).toMatch(/^[0-9a-f]{16}$/)
      expect(hashUserId('')).toMatch(/^[0-9a-f]{16}$/)
    })

    it('is deterministic', () => {
      expect(hashUserId('user-a')).toBe(hashUserId('user-a'))
    })

    it('avoids collisions across a realistic set of account ids', () => {
      const ids = Array.from({ length: 2000 }, (_, index) => `1047290000000000${index}`)
      const hashes = new Set(ids.map(hashUserId))

      expect(hashes.size).toBe(ids.length)
    })
  })

  describe('active user tracking', () => {
    it('defaults to signed out, resolving to base keys', () => {
      expect(getActiveAuthUserId()).toBeNull()
      expect(storageKey(BASE_STORE_KEY)).toBe(BASE_STORE_KEY)
      expect(storageKey(BASE_PARAMS_KEY)).toBe(BASE_PARAMS_KEY)
      expect(storageKey(BASE_SAVED_SETUPS_KEY)).toBe(BASE_SAVED_SETUPS_KEY)
    })

    it('namespaces every key once a user is active', () => {
      setActiveAuthUserId('user-a')

      expect(getActiveAuthUserId()).toBe('user-a')
      expect(storageKey(BASE_STORE_KEY)).toBe(namespaceStorageKey(BASE_STORE_KEY, 'user-a'))
      expect(storageKey(BASE_PARAMS_KEY)).toBe(namespaceStorageKey(BASE_PARAMS_KEY, 'user-a'))
      expect(storageKey(BASE_SAVED_SETUPS_KEY)).toBe(
        namespaceStorageKey(BASE_SAVED_SETUPS_KEY, 'user-a')
      )
    })

    it('restores the original keys on sign-out so existing data stays reachable', () => {
      setActiveAuthUserId('user-a')
      expect(storageKey(BASE_STORE_KEY)).not.toBe(BASE_STORE_KEY)

      setActiveAuthUserId(null)
      expect(storageKey(BASE_STORE_KEY)).toBe(BASE_STORE_KEY)
    })

    it('normalizes blank ids to signed out', () => {
      setActiveAuthUserId('   ')

      expect(getActiveAuthUserId()).toBeNull()
      expect(storageKey(BASE_STORE_KEY)).toBe(BASE_STORE_KEY)
    })
  })
})
