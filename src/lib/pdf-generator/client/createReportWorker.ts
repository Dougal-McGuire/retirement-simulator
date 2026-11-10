/**
 * Isolated so that the rest of the client pipeline stays free of
 * `import.meta`, which the CommonJS test transform cannot parse (compare
 * `src/lib/simulation/createSimulationWorker.ts`). The bundler needs the static
 * `new Worker(new URL(..., import.meta.url))` pattern to emit the worker
 * bundle — which is where react-pdf lives.
 */
export function createReportWorker(): Worker {
  return new Worker(new URL('./report.worker.ts', import.meta.url), { type: 'module' })
}
