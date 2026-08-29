'use client'

import React, { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import { FileText, Download, Loader2 } from 'lucide-react'
import { planDisplayName } from '@/lib/plans/planName'
import { useActivePlanId, usePlans } from '@/lib/stores/simulationStore'
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

/** Filename-safe slug of a plan name, e.g. "Retire 2 years later" → "retire-2-years-later". */
export function planFilenameSlug(name: string | undefined | null): string {
  if (!name) return ''
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
}

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
  const plans = usePlans()
  const activePlanId = useActivePlanId()

  // The report is about a *named* plan; without this the PDF reads like a
  // generic document and several exports are indistinguishable in a folder.
  const activePlanName = useMemo(() => {
    if (planName) return planName
    const active = plans.find((plan) => plan.id === activePlanId)
    return active ? planDisplayName(active, (key) => tPlans(key)) : undefined
  }, [planName, plans, activePlanId, tPlans])

  const canGenerate = results && !disabled

  const generatePDF = async () => {
    // Create abort controller for timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 60000) // 60 second timeout

    try {
      const response = await fetch('/api/generate-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          params: results?.params || params,
          results,
          locale,
          planName: activePlanName,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const errorData = await response.json()
        console.error('PDF generation error response:', errorData)
        throw new Error(
          errorData.details || errorData.error ||
            t('errors.requestFailed', { status: response.statusText })
        )
      }

      const blob = await response.blob()
      const slug = planFilenameSlug(activePlanName)
      const filename = `retirement-report${slug ? `-${slug}` : ''}-${
        new Date().toISOString().split('T')[0]
      }.pdf`

      // Create download link
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = filename
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
    } catch (error) {
      clearTimeout(timeoutId)
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(t('errors.timeout'))
      }
      throw error
    }
  }

  const handleGenerate = async () => {
    if (!canGenerate) return

    setIsGenerating(true)
    setError(null)

    // A toast carries the feedback even when the button sits in a menu that
    // closes, or off-screen after a scroll.
    const toastId = toast.loading(t('actions.generating'))

    try {
      await generatePDF()
      toast.success(t('actions.ready'), { id: toastId })
    } catch (error) {
      console.error('PDF generation failed:', error)
      const message = error instanceof Error ? error.message : t('errors.generic')
      setError(message)
      toast.error(message, { id: toastId })
    } finally {
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
        <div className="max-w-xs text-center text-[0.65rem] font-semibold   text-danger">
          {error}
        </div>
      )}
    </div>
  )
}
