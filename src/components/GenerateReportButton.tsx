'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileText, Download, Loader2 } from 'lucide-react'
import { SimulationResults, SimulationParams } from '@/types'

interface GenerateReportButtonProps {
  results: SimulationResults | null
  params?: SimulationParams | null
  disabled?: boolean
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'sm' | 'default' | 'lg'
}

export const GenerateReportButton: React.FC<GenerateReportButtonProps> = ({
  results,
  params = null,
  disabled = false,
  variant = 'default',
  size = 'default',
}) => {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canGenerate = results && !disabled

  const generatePDFUrl = async (reportId: string, simulationData: string) => {
    const response = await fetch(`/api/report/${reportId}/pdf?data=${simulationData}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/pdf',
      },
    })

    if (!response.ok) {
      throw new Error(`PDF generation failed: ${response.statusText}`)
    }

    const blob = await response.blob()
    const filename = `retirement-analysis-${new Date().toISOString().split('T')[0]}.pdf`
    
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
      // Generate a unique report ID for this session
      const reportId = Date.now().toString()
      
      // Encode simulation data as base64 for URL parameter
      const simulationData = btoa(JSON.stringify({
        results,
        params: params || results.params
      }))
      
      await generatePDFUrl(reportId, simulationData)
    } catch (error) {
      console.error('PDF generation failed:', error)
      setError(error instanceof Error ? error.message : 'Failed to generate PDF')
    } finally {
      setIsGenerating(false)
    }
  }

  if (!canGenerate) {
    return (
      <Button variant={variant} size={size} disabled>
        <FileText className="w-4 h-4 mr-2" />
        {!results ? 'No Data' : 'Run Simulation First'}
      </Button>
    )
  }

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        variant={variant}
        size={size}
        onClick={handleGenerate}
        disabled={isGenerating}
      >
        {isGenerating ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Download className="w-4 h-4 mr-2" />
        )}
        {isGenerating ? 'Generating...' : 'Generate Report'}
      </Button>

      {error && (
        <div className="text-sm text-red-600 max-w-xs text-center">
          {error}
        </div>
      )}
    </div>
  )
}