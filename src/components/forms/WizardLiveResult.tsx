'use client'

import { useEffect, useRef, useState } from 'react'
import { useFormatter, useTranslations } from 'next-intl'
import { Loader2 } from 'lucide-react'
import { InfoTip } from '@/components/ui/info-tip'
import { useSimulationParams } from '@/lib/stores/simulationStore'
import { isPreviewable } from '@/lib/validation/fieldValidation'
import { useCompactCurrency } from '@/lib/hooks/useCompactCurrency'
import { cn } from '@/lib/utils'

/**
 * Run budget for the wizard strip.
 *
 * Small on purpose: this number exists to show which way a field moved the
 * plan, not to be the plan's published confidence. The dashboard re-runs at the
 * plan's real `simulationRuns` the moment the wizard hands over.
 */
const PREVIEW_RUNS = 300

/** How long a field has to sit still before the preview spends any CPU. */
const DEBOUNCE_MS = 450

interface PreviewState {
  successRate: number
  medianEndAssets: number
}

/**
 * A one-line live readout in the wizard header: success rate and median assets
 * at the end of the plan, recomputed after each committed field.
 *
 * The wizard suspends the store's auto-run (four steps of sliders would queue
 * dozens of full-size simulations), so this owns its own small run instead of
 * reading `results` — which during setup is either stale or absent.
 */
export function WizardLiveResult({ className }: { className?: string }) {
  const t = useTranslations('setup.liveResult')
  const format = useFormatter()
  const params = useSimulationParams()
  const formatCurrency = useCompactCurrency()

  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [isComputing, setIsComputing] = useState(false)
  const runIdRef = useRef(0)

  const ready = isPreviewable(params)

  useEffect(() => {
    if (!ready) {
      setPreview(null)
      setIsComputing(false)
      return
    }

    const runId = runIdRef.current + 1
    runIdRef.current = runId
    setIsComputing(true)

    const timer = setTimeout(async () => {
      try {
        const { runSimulationInClient } = await import('@/lib/simulation/workerClient')
        const results = await runSimulationInClient({
          ...params,
          simulationRuns: Math.min(params.simulationRuns, PREVIEW_RUNS),
        })
        if (runIdRef.current !== runId) return

        const series = results.assetPercentilesReal?.p50 ?? results.assetPercentiles.p50
        setPreview({
          successRate: results.successRate,
          medianEndAssets: Math.max(0, series[series.length - 1] ?? 0),
        })
      } catch (error) {
        console.error('Wizard preview failed:', error)
        if (runIdRef.current !== runId) return
        setPreview(null)
      } finally {
        if (runIdRef.current === runId) setIsComputing(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      clearTimeout(timer)
    }
    // `params` is a fresh object on every committed field, which is precisely
    // when the preview should start over.
  }, [ready, params])

  if (!ready) return null

  const successLabel =
    preview === null
      ? '—'
      : format.number(preview.successRate / 100, {
          style: 'percent',
          minimumFractionDigits: 0,
          maximumFractionDigits: preview.successRate % 1 === 0 ? 0 : 1,
        })

  return (
    <div
      data-testid="wizard-live-result"
      data-success-rate={preview?.successRate ?? ''}
      aria-live="polite"
      className={cn(
        'flex flex-wrap items-center gap-x-5 gap-y-2 border-3 border-neo-black bg-neo-white px-4 py-2.5 shadow-neo-sm',
        className
      )}
    >
      <span className="text-[0.58rem] font-extrabold uppercase tracking-[0.16em] text-muted-foreground">
        {t('label')}
      </span>

      <span className="flex items-baseline gap-1.5">
        <span className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {t('successRate')}
        </span>
        <span
          data-testid="wizard-live-success"
          className="text-sm font-black tabular-nums text-neo-black"
        >
          {successLabel}
        </span>
      </span>

      <span className="flex items-baseline gap-1.5">
        <span className="text-[0.58rem] font-bold uppercase tracking-[0.12em] text-muted-foreground">
          {t('medianEnd', { age: params.endAge })}
        </span>
        <span
          data-testid="wizard-live-median"
          className="text-sm font-black tabular-nums text-neo-black"
        >
          {preview === null ? '—' : formatCurrency(preview.medianEndAssets)}
        </span>
      </span>

      {isComputing && (
        <span className="flex items-center gap-1.5 text-[0.58rem] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" aria-hidden="true" />
          {t('computing')}
        </span>
      )}

      <InfoTip
        className="ml-auto"
        side="bottom"
        label={t('label')}
        content={t('note', { runs: format.number(Math.min(params.simulationRuns, PREVIEW_RUNS)) })}
      />
    </div>
  )
}
