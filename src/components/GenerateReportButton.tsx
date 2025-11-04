'use client'

import React, { useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FileText, Download, Loader2 } from 'lucide-react'
import { SimulationResults, SimulationParams } from '@/types'

interface GenerateReportButtonProps {
  results: SimulationResults | null
  params?: SimulationParams | null
  disabled?: boolean
  variant?: 'default' | 'outline' | 'ghost' | 'secondary' | 'destructive'
  size?: 'sm' | 'default' | 'lg'
  buttonClassName?: string
  wrapperClassName?: string
}

export const GenerateReportButton: React.FC<GenerateReportButtonProps> = ({
  results,
  params = null,
  disabled = false,
  variant = 'default',
  size = 'default',
  buttonClassName,
  wrapperClassName,
}) => {
  const t = useTranslations('report')
  const locale = useLocale()
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canGenerate = results && !disabled

  const generatePDF = async () => {
    const response = await fetch('/api/generate-pdf', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        params: params || results?.params,
        results,
        locale,
      }),
    })

    if (!response.ok) {
      const errorData = await response.json()
      console.error('PDF generation error response:', errorData)
      throw new Error(
        errorData.details || errorData.error ||
          t('errors.requestFailed', { status: response.statusText })
      )
    }

    const blob = await response.blob()
    const filename = `retirement-report-${new Date().toISOString().split('T')[0]}.pdf`

    // Create download link
    const url = window.URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    window.URL.revokeObjectURL(url)
  }

  const handleGenerate = async () => {
    if (!canGenerate) return

    setIsGenerating(true)
    setError(null)

    try {
      await generatePDF()
    } catch (error) {
      console.error('PDF generation failed:', error)
      setError(error instanceof Error ? error.message : t('errors.generic'))
    } finally {
      setIsGenerating(false)
    }
  }

  if (!canGenerate) {
    return (
      <Button variant={variant} size={size} disabled className={cn(buttonClassName)}>
        <FileText className="mr-2 h-4 w-4" />
        {!results ? t('disabled.noData') : t('disabled.runSimulation')}
      </Button>
    )
  }

  return (
    <div className={cn('flex flex-col items-center gap-2', wrapperClassName)}>
      <Button
        variant={variant}
        size={size}
        onClick={handleGenerate}
        disabled={isGenerating}
        className={cn(buttonClassName)}
      >
        {isGenerating ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Download className="mr-2 h-4 w-4" />
        )}
        {isGenerating ? t('actions.generating') : t('actions.generate')}
      </Button>

      {error && (
        <div className="max-w-xs text-center text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-neo-red">
          {error}
        </div>
      )}
    </div>
  )
}
