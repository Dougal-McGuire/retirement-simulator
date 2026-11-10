'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { isUsableResults } from '@/lib/results/usableResults'
import { useSimulationStore } from '@/lib/stores/simulationStore'
import { useRunStatus } from './useRunStatus'
import { useSavedSuccessDelta } from './useSavedSuccessDelta'

/** Quiet time after the last run lands (and no edit follows) before speaking. */
export const ANNOUNCE_SETTLE_MS = 1500

/**
 * The workspace's one live region for results.
 *
 * Every keystroke and lever step auto-runs the simulation; announcing each
 * run (or its "Calculating …") talked over the user while they typed. This
 * speaks the settled result once per pause in editing — the run has landed
 * and nothing changed for `ANNOUNCE_SETTLE_MS` — and nothing for the first
 * result after load (that is the page, not the consequence of an edit).
 *
 * Mounted once by the page, outside every region that can go inert (the
 * result bar is inert behind the phone sheet), so the panel needs no
 * announcer of its own.
 */
export function ResultAnnouncer() {
  const t = useTranslations('workspace.editPanel')
  const format = useFormatter()
  const { status } = useRunStatus()
  const delta = useSavedSuccessDelta()
  const rate = useSimulationStore((state) =>
    isUsableResults(state.results) ? state.results.successRate : null
  )
  const [message, setMessage] = useState('')

  const latest = useRef<{ rate: number | null; delta: string | null }>({ rate, delta: null })
  useEffect(() => {
    latest.current = { rate, delta: delta.text }
  }, [rate, delta.text])

  // Armed by a run that started while results were already on screen.
  const armed = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const cancel = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  useEffect(() => {
    if (status === 'running') {
      cancel()
      if (latest.current.rate !== null) armed.current = true
      return
    }
    if (status !== 'updated' || !armed.current) return
    cancel()
    timer.current = setTimeout(() => {
      timer.current = null
      armed.current = false
      const { rate: value, delta: deltaText } = latest.current
      if (value === null) return
      const rateText = format.number(Math.round(value * 10) / 1000, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })
      const text = deltaText
        ? `${t('liveResult', { rate: rateText })} (${t('liveDelta', { delta: deltaText })})`
        : t('liveResult', { rate: rateText })
      // The same words again still have to change the region to be spoken.
      setMessage((previous) => (previous === text ? `${text} ` : text))
    }, ANNOUNCE_SETTLE_MS)
  }, [status, format, t])

  // Still editing (a keystroke whose run has not started yet): wait for it.
  useEffect(
    () =>
      useSimulationStore.subscribe((state, previous) => {
        if (state.params !== previous.params && timer.current) cancel()
      }),
    []
  )
  useEffect(() => cancel, [])

  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true" data-testid="result-announcer">
      {message}
    </p>
  )
}
