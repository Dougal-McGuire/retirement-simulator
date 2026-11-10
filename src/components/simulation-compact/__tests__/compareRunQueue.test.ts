import { createCompareRunQueue, type CompareRunJob } from '../compareRunQueue'

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

/**
 * Drives the queue the way CompareView does: ask for every stale plan, and ask
 * again for the rest each time a result lands (a landed result is state, and
 * the effect re-runs on it).
 */
function harness() {
  const runs: string[] = []
  const results = new Map<string, string>()
  let wanted: CompareRunJob<string>[] = []
  const running: boolean[] = []

  const stale = () => wanted.filter((job) => results.get(job.id) !== job.fingerprint)
  const queue = createCompareRunQueue<string, string>({
    run: async (params) => {
      runs.push(params)
      await flush()
      return `result:${params}`
    },
    onResult: (id, fingerprint) => {
      results.set(id, fingerprint)
      // The effect's re-run after the result lands.
      queue.request(stale())
    },
    onRunningChange: (value) => running.push(value),
  })

  const show = (jobs: CompareRunJob<string>[]) => {
    wanted = jobs
    queue.request(stale())
  }
  const settle = async () => {
    for (let i = 0; i < 50 && queue.busy(); i++) await flush()
  }
  return { runs, results, running, queue, show, settle }
}

const job = (id: string, fingerprint = 'v1'): CompareRunJob<string> => ({
  id,
  fingerprint,
  params: `${id}@${fingerprint}`,
})

describe('compare run queue', () => {
  it.each([1, 2, 3])('runs %i plans exactly once each', async (count) => {
    const { runs, results, show, settle } = harness()
    const jobs = ['a', 'b', 'c'].slice(0, count).map((id) => job(id))
    show(jobs)
    await settle()
    expect(runs).toEqual(jobs.map((entry) => entry.params))
    expect(results.size).toBe(count)
  })

  it('ignores repeated requests for a run that is queued, in flight or answered', async () => {
    const { runs, show, queue, settle } = harness()
    show([job('a'), job('b')])
    queue.request([job('a'), job('b')])
    queue.request([job('b')])
    await settle()
    queue.request([job('a'), job('b')])
    await settle()
    expect(runs).toEqual(['a@v1', 'b@v1'])
  })

  it('re-runs only the plan that changed mid-run, and drops its outdated result', async () => {
    const { runs, results, show, settle } = harness()
    show([job('a'), job('b')])
    // While a@v1 runs, plan b is edited before its turn and plan a after.
    show([job('a'), job('b', 'v2')])
    show([job('a', 'v2'), job('b', 'v2')])
    await settle()
    expect(runs).toEqual(['a@v1', 'b@v2', 'a@v2'])
    expect(results.get('a')).toBe('v2')
    expect(results.get('b')).toBe('v2')
  })

  it('reports running while work is queued and stops after dispose', async () => {
    const { running, show, queue, runs, settle } = harness()
    show([job('a'), job('b')])
    queue.dispose()
    await settle()
    expect(running).toEqual([true])
    expect(runs).toEqual(['a@v1'])
  })
})
