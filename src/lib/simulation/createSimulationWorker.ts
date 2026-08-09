/**
 * Isolated so that `workerClient` stays free of `import.meta`, which the CJS
 * test transform cannot parse. This module is only ever imported dynamically,
 * from the browser branch of `runSimulationInClient`, so the bundler still sees
 * the static `new URL(..., import.meta.url)` pattern it needs to emit the
 * worker chunk while tests never load it.
 */
export function createSimulationWorker(): Worker {
  return new Worker(new URL('./simulation.worker.ts', import.meta.url), {
    type: 'module',
  })
}
