'use client'

import React, { useMemo, useRef, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { FileText, Download, Loader2 } from 'lucide-react'
import { planDisplayName } from '@/lib/plans/planName'
import { useActivePlanId, usePlans } from '@/lib/stores/simulationStore'
import { useDisplayReal } from '@/lib/stores/displayStore'
import { euroUnitFilenameSuffix, resolveEuroUnit } from '@/lib/pdf-generator/euroUnit'
import { ReportGenerationError } from '@/lib/pdf-generator/client/reportErrors'
import { reportErrorKey, reportFilename } from '@/lib/pdf-generator/client/reportFile'
import { SimulationResults, SimulationParams } from '@/types'

interface GenerateReportButtonProps {
  results: SimulationResults | null
  params?: SimulationParams | null
  disabled?: boolean
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive'
  size?: 'sm' | 'default' | 'lg'
  buttonClassName?: string
  wrapperClassName?: string
  children?: React.ReactNode
  /** Overrides the plan name printed on the report (defaults to the active plan). */
  planName?: string
}

function saveBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Revoked a tick later: Safari cancels the download when the URL goes away
  // inside the click's own task.
  window.setTimeout(() => window.URL.revokeObjectURL(url), 1000)
}

/**
 * "Bericht erstellen": builds the PDF **in this browser** and saves it.
 *
 * The report pipeline (`client/generateReportPdf`) is a separate chunk that
 * is only fetched on the first click, and it renders in a worker, so the page
 * stays responsive while the file is built. The plan, its results and its
 * name are never sent anywhere.
 */
export const GenerateReportButton: React.FC<GenerateReportButtonProps> = ({
  results,
  params = null,
  disabled = false,
  variant = 'default',
  size = 'default',
  buttonClassName,
  wrapperClassName,
  children,
  planName,
}) => {
  const t = useTranslations('report')
  const tPlans = useTranslations('plans')
  const locale = useLocale()
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // A second click while a report is being built must not start another one
  // (state updates are asynchronous; the ref is not).
  const busyRef = useRef(false)
  const plans = usePlans()
  const activePlanId = useActivePlanId()
  // The report prints its euro figures in the unit the dashboard shows.
  const displayReal = useDisplayReal()

  // The report is about a *named* plan; without this the PDF reads like a
  // generic document and several exports are indistinguishable in a folder.
  const activePlanName = useMemo(() => {
    if (planName) return planName
    const active = plans.find((plan) => plan.id === activePlanId)
    return active ? planDisplayName(active, (key) => tPlans(key)) : undefined
  }, [planName, plans, activePlanId, tPlans])

  const canGenerate = results && !disabled

  const generatePDF = async (source: SimulationResults) => {
    const reportParams = source.params || params
    if (!reportParams) throw new Error('No parameters to report on')

    let reportModule: typeof import('@/lib/pdf-generator/client/generateReportPdf')
    try {
      reportModule = await import('@/lib/pdf-generator/client/generateReportPdf')
    } catch (cause) {
      // Offline, or a deploy replaced the chunk this tab still points at.
      throw new ReportGenerationError('chunkLoad', cause)
    }

    const blob = await reportModule.generateReportPdf({
      params: reportParams,
      results: source,
      locale: locale === 'en' ? 'en' : 'de',
      planName: activePlanName,
      displayReal,
    })

    // The same decision the report makes, so one that had to fall back to
    // nominal (results without real series) is not named as today's euros.
    const unitSuffix = euroUnitFilenameSuffix(resolveEuroUnit(source, displayReal), locale)
    saveBlob(blob, reportFilename(activePlanName, unitSuffix))
  }

  const handleGenerate = async () => {
    if (!results || disabled || busyRef.current) return

    busyRef.current = true
    setIsGenerating(true)
    setError(null)

    // A toast carries the feedback even when the button sits in a menu that
    // closes, or off-screen after a scroll.
    const toastId = toast.loading(t('actions.generating'))

    try {
      await generatePDF(results)
      toast.success(t('actions.ready'), { id: toastId })
    } catch (cause) {
      // For the console only; the reader gets a catalog sentence.
      console.error(
        'PDF generation failed:',
        cause,
        cause instanceof Error && cause.cause !== undefined ? cause.cause : ''
      )
      const message = t(`errors.${reportErrorKey(cause)}`)
      setError(message)
      toast.error(message, { id: toastId })
    } finally {
      busyRef.current = false
      setIsGenerating(false)
    }
  }

  if (!canGenerate) {
    // Same wrapper as the enabled branch: callers size this control through
    // `wrapperClassName` and a bare <Button> here would ignore that and blow
    // out the flex row it sits in.
    return (
      <div className={cn('flex flex-col items-center gap-2', wrapperClassName)}>
        <Button variant={variant} size={size} disabled className={cn(buttonClassName)}>
          {children || (
            <>
              <FileText className="mr-2 h-4 w-4" />
              {!results ? t('disabled.noData') : t('disabled.runSimulation')}
            </>
          )}
        </Button>
      </div>
    )
  }

  return (
    <div className={cn('flex flex-col items-center gap-2', wrapperClassName)}>
      <Button
        variant={variant}
        size={size}
        onClick={handleGenerate}
        disabled={isGenerating}
        aria-busy={isGenerating}
        data-testid="generate-report"
        className={cn(buttonClassName)}
      >
        {/* The busy state wins over any custom label: callers that pass their
            own children (the mobile menu) would otherwise show no feedback. */}
        {isGenerating ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" />
            <span className="flex-1 text-left">{t('actions.generating')}</span>
          </>
        ) : (
          children || (
            <>
              <Download className="mr-2 h-4 w-4" />
              {t('actions.generate')}
            </>
          )
        )}
      </Button>

      {error && (
        <div
          role="alert"
          data-testid="generate-report-error"
          className="max-w-xs text-center text-xs font-semibold text-danger"
        >
          {error}
        </div>
      )}
    </div>
  )
}
