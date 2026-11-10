/**
 * Whether an error is a failed code-split load (a chunk that did not arrive:
 * flaky network, a deploy that removed the old build's files, an offline
 * iPad). Webpack names it `ChunkLoadError`; Turbopack and native `import()`
 * only say so in the message.
 */
export function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false
  if (error.name === 'ChunkLoadError') return true
  return /Loading (?:CSS )?chunk [\w-]+ failed|Failed to load chunk|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    error.message
  )
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Runs a dynamic import, retrying a failed chunk load a few times with a
 * short backoff before giving up. Any other error is passed on at once.
 */
export async function importWithRetry<T>(
  load: () => Promise<T>,
  { retries = 2, delayMs = 400 }: { retries?: number; delayMs?: number } = {}
): Promise<T> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await load()
    } catch (error) {
      if (attempt >= retries || !isChunkLoadError(error)) throw error
      await wait(delayMs * (attempt + 1))
    }
  }
}
