'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { FileText, Download, Loader2, Settings } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { SimulationResults } from '@/types'
import { PDFService, PDFGenerationOptions } from '@/lib/pdf/pdfService'

interface GenerateReportButtonProps {
  results: SimulationResults | null
  disabled?: boolean
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'sm' | 'default' | 'lg'
}

export const GenerateReportButton: React.FC<GenerateReportButtonProps> = ({
  results,
  disabled = false,
  variant = 'default',
  size = 'default',
}) => {
  const [isGenerating, setIsGenerating] = useState(false)
  const [showOptions, setShowOptions] = useState(false)
  const [options, setOptions] = useState<PDFGenerationOptions>({
    includeCover: true,
    includeCharts: true,
    qualityLevel: 'standard',
  })
  const [error, setError] = useState<string | null>(null)

  const canGenerate = results && !disabled && PDFService.validateResults(results)

  const handleGeneratePDF = async () => {
    if (!canGenerate) return

    setIsGenerating(true)
    setError(null)

    try {
      const filename = `retirement-analysis-${new Date().toISOString().split('T')[0]}`
      await PDFService.downloadPDF(results, { ...options, filename })
    } catch (error) {
      console.error('PDF generation failed:', error)
      setError(error instanceof Error ? error.message : 'Failed to generate PDF')
    } finally {
      setIsGenerating(false)
      setShowOptions(false)
    }
  }

  const handleQuickGenerate = async () => {
    if (!canGenerate) return

    setIsGenerating(true)
    setError(null)

    try {
      const filename = `retirement-analysis-${new Date().toISOString().split('T')[0]}`
      await PDFService.downloadPDF(results, { filename })
    } catch (error) {
      console.error('PDF generation failed:', error)
      setError(error instanceof Error ? error.message : 'Failed to generate PDF')
    } finally {
      setIsGenerating(false)
    }
  }

  const estimatedTime = canGenerate ? 
    PDFService.getEstimatedGenerationTime(results, options) : 0

  if (!canGenerate) {
    return (
      <Button variant={variant} size={size} disabled>
        <FileText className="w-4 h-4 mr-2" />
        {!results ? 'No Data' : 'Run Simulation First'}
      </Button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      {/* Quick Generate Button */}
      <Button
        variant={variant}
        size={size}
        onClick={handleQuickGenerate}
        disabled={isGenerating}
      >
        {isGenerating ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Download className="w-4 h-4 mr-2" />
        )}
        {isGenerating ? 'Generating...' : 'Generate Report'}
      </Button>

      {/* Options Dialog */}
      <Dialog open={showOptions} onOpenChange={setShowOptions}>
        <DialogTrigger asChild>
          <Button variant="outline" size="sm" disabled={isGenerating}>
            <Settings className="w-4 h-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>PDF Report Options</DialogTitle>
            <DialogDescription>
              Customize your retirement planning report before generating.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6">
            {/* Content Options */}
            <div className="space-y-4">
              <Label className="text-base font-semibold">Content Options</Label>
              
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeCover"
                  checked={options.includeCover}
                  onChange={(e) =>
                    setOptions(prev => ({ ...prev, includeCover: e.target.checked }))
                  }
                />
                <Label htmlFor="includeCover" className="text-sm">
                  Include cover page
                </Label>
              </div>

              <div className="flex items-center space-x-2">
                <Checkbox
                  id="includeCharts"
                  checked={options.includeCharts}
                  onChange={(e) =>
                    setOptions(prev => ({ ...prev, includeCharts: e.target.checked }))
                  }
                />
                <Label htmlFor="includeCharts" className="text-sm">
                  Include charts and visualizations
                </Label>
              </div>
            </div>

            {/* Quality Settings */}
            <div className="space-y-4">
              <Label className="text-base font-semibold">Quality Level</Label>
              <Select
                value={options.qualityLevel}
                onValueChange={(value: 'draft' | 'standard' | 'high') =>
                  setOptions(prev => ({ ...prev, qualityLevel: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft (Faster)</SelectItem>
                  <SelectItem value="standard">Standard</SelectItem>
                  <SelectItem value="high">High Quality (Slower)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">
                Estimated generation time: {Math.round(estimatedTime / 1000)} seconds
              </p>
            </div>

            {/* Error Display */}
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">{error}</p>
              </div>
            )}

            {/* Generate Button */}
            <Button
              onClick={handleGeneratePDF}
              disabled={isGenerating}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Generating PDF...
                </>
              ) : (
                <>
                  <FileText className="w-4 h-4 mr-2" />
                  Generate Custom Report
                </>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}