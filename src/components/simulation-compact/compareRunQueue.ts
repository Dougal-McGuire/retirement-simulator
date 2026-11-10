/**
 * Runs the compared plans' simulations one at a time, each (plan, fingerprint)
 * at most once.
 *
 * Compare mode asks again for every still-stale plan whenever a result lands
 * (the landed result is state, and state re-renders). Restarting the loop on
 * each such request ran every plan after the first twice — 2N−1 runs for N
 * plans. Here a request for a run that is already queued or in flight is a
 * no-op, and a newer fingerprint for a plan replaces its queued one, so N
 * plans cost N runs and an edit mid-run costs one more for that plan only. A
 * request for a result already handed out is a no-op too.
 */
export interface CompareRunJob<P> {
  id: string
  fingerprint: string
  params: P
}

export interface CompareRunQueueOptions<P, R> {
  run: (params: P) => Promise<R>
  onResult: (id: string, fingerprint: string, result: R) => void
  /** True when work starts, false once the queue is drained. */
  onRunningChange?: (running: boolean) => void
}

export interface CompareRunQueue<P> {
  /** Schedules each job unless that exact run is already queued or running. */
  request: (jobs: readonly CompareRunJob<P>[]) => void
  /** True while a run is queued or in flight. */
  busy: () => boolean
  /** Stops after the current run; its result is dropped. */
  dispose: () => void
}

export function createCompareRunQueue<P, R>(
  options: CompareRunQueueOptions<P, R>
): CompareRunQueue<P> {
  /** Latest fingerprint asked for, per plan: an older run's result is dropped. */
  const wanted = new Map<string, string>()
  /** Fingerprint whose result was handed out last, per plan. */
  const delivered = new Map<string, string>()
  const queue: CompareRunJob<P>[] = []
  let current: CompareRunJob<P> | null = null
  let pumping = false
  let disposed = false

  const pump = async () => {
    if (pumping) return
    pumping = true
    options.onRunningChange?.(true)
    try {
      while (queue.length > 0 && !disposed) {
        const job = queue.shift()!
        if (wanted.get(job.id) !== job.fingerprint) continue
        current = job
        let result: R
        try {
          result = await options.run(job.params)
        } catch {
          // A failed run leaves the plan without a result; the next request
          // (a later edit) tries again.
          continue
        } finally {
          current = null
        }
        if (disposed) return
        if (wanted.get(job.id) === job.fingerprint) {
          delivered.set(job.id, job.fingerprint)
          options.onResult(job.id, job.fingerprint, result)
        }
      }
    } finally {
      pumping = false
      if (!disposed) options.onRunningChange?.(false)
    }
  }

  return {
    request(jobs) {
      if (disposed) return
      for (const job of jobs) {
        wanted.set(job.id, job.fingerprint)
        // Already answered: a request racing the result's re-render.
        if (delivered.get(job.id) === job.fingerprint) {
          const queued = queue.findIndex((entry) => entry.id === job.id)
          if (queued !== -1) queue.splice(queued, 1)
          continue
        }
        if (current?.id === job.id && current.fingerprint === job.fingerprint) continue
        const queued = queue.findIndex((entry) => entry.id === job.id)
        if (queued === -1) queue.push(job)
        else queue[queued] = job
      }
      if (queue.length > 0) void pump()
    },
    busy: () => pumping,
    dispose() {
      disposed = true
      queue.length = 0
    },
  }
}
