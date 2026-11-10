import { DEFAULT_PARAMS } from '@/types'
import { runMonteCarloSimulation } from '@/lib/simulation/engine'
import { isUsableResults } from '@/lib/results/usableResults'
import { dropCachedResults } from '@/lib/recovery/dropCachedResults'
import { importWithRetry, isChunkLoadError } from '@/lib/lazy/chunkError'

const results = runMonteCarloSimulation({ ...DEFAULT_PARAMS, simulationRuns: 50 })
const clone = () => JSON.parse(JSON.stringify(results)) as Record<string, unknown>

describe('isUsableResults', () => {
  it('accepts a real run, also after a JSON round trip', () => {
    expect(isUsableResults(results)).toBe(true)
    expect(isUsableResults(clone())).toBe(true)
  })

  it.each<[string, (value: Record<string, unknown>) => void]>([
    ['assetPercentiles = {}', (value) => (value.assetPercentiles = {})],
    ['spendingPercentiles missing', (value) => delete value.spendingPercentiles],
    ['ages = []', (value) => (value.ages = [])],
    [
      'cashFlowMeans rows = {}',
      (value) => (value.cashFlowMeans = (value.cashFlowMeans as unknown[]).map(() => ({}))),
    ],
    [
      'cashFlowMeans shorter than ages',
      (value) => (value.cashFlowMeans = (value.cashFlowMeans as unknown[]).slice(0, 3)),
    ],
    ['sampleAssetPaths with null entries', (value) => (value.sampleAssetPaths = [null, null])],
    ['successRate = null', (value) => (value.successRate = null)],
    [
      'p50 with nulls (NaN serialised)',
      (value) => {
        const assets = value.assetPercentiles as { p50: (number | null)[] }
        assets.p50 = assets.p50.map((entry, index) => (index > 2 ? null : entry))
      },
    ],
    ['params missing', (value) => delete value.params],
  ])('rejects %s', (_name, mutate) => {
    const value = clone()
    mutate(value)
    expect(isUsableResults(value)).toBe(false)
  })

  it('rejects non-objects', () => {
    expect(isUsableResults(null)).toBe(false)
    expect(isUsableResults([])).toBe(false)
    expect(isUsableResults('results')).toBe(false)
  })
})

function memoryStorage(entries: Record<string, string>) {
  const map = new Map(Object.entries(entries))
  return {
    get length() {
      return map.size
    },
    key: (index: number) => Array.from(map.keys())[index] ?? null,
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, value),
    map,
  }
}

describe('dropCachedResults', () => {
  it('drops results from every namespace and keeps plans and everything else', () => {
    const state = { plans: [{ id: 'a' }], activePlanId: 'a', results: { ages: [1] } }
    const storage = memoryStorage({
      'retirement-simulator-store': JSON.stringify({ state, version: 3 }),
      'retirement-simulator-store::u-0123': JSON.stringify({ state, version: 3 }),
      'retirement-simulator-display': JSON.stringify({ state: { results: 'keep' } }),
      unrelated: 'x',
    })
    expect(dropCachedResults(storage)).toBe(2)
    for (const key of ['retirement-simulator-store', 'retirement-simulator-store::u-0123']) {
      const stored = JSON.parse(storage.map.get(key)!)
      expect(stored.state.results).toBeNull()
      expect(stored.state.plans).toEqual([{ id: 'a' }])
      expect(stored.state.activePlanId).toBe('a')
      expect(stored.version).toBe(3)
    }
    expect(JSON.parse(storage.map.get('retirement-simulator-display')!).state.results).toBe('keep')
    expect(storage.map.get('unrelated')).toBe('x')
  })

  it('survives unreadable entries and missing storage', () => {
    const storage = memoryStorage({ 'retirement-simulator-store': '{not json' })
    expect(dropCachedResults(storage)).toBe(0)
    expect(storage.map.get('retirement-simulator-store')).toBe('{not json')
    expect(dropCachedResults(null)).toBe(0)
  })
})

describe('chunk load errors', () => {
  const chunkError = () =>
    Object.assign(new Error('Loading chunk 123 failed.'), { name: 'ChunkLoadError' })

  it('recognises bundler and native messages', () => {
    expect(isChunkLoadError(chunkError())).toBe(true)
    expect(isChunkLoadError(new Error('Failed to load chunk /_next/static/chunks/a.js'))).toBe(true)
    expect(
      isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: x.js'))
    ).toBe(true)
    expect(
      isChunkLoadError(new TypeError("Cannot read properties of undefined (reading 'p50')"))
    ).toBe(false)
    expect(isChunkLoadError('Loading chunk 1 failed')).toBe(false)
  })

  it('retries a failed chunk load, but not other errors', async () => {
    let calls = 0
    const flaky = () => (++calls < 3 ? Promise.reject(chunkError()) : Promise.resolve('ok'))
    await expect(importWithRetry(flaky, { delayMs: 1 })).resolves.toBe('ok')
    expect(calls).toBe(3)

    let other = 0
    const broken = () => {
      other += 1
      return Promise.reject(new TypeError('boom'))
    }
    await expect(importWithRetry(broken, { delayMs: 1 })).rejects.toThrow('boom')
    expect(other).toBe(1)

    let always = 0
    const down = () => {
      always += 1
      return Promise.reject(chunkError())
    }
    await expect(importWithRetry(down, { retries: 2, delayMs: 1 })).rejects.toThrow('Loading chunk')
    expect(always).toBe(3)
  })
})
