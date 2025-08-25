'use client'

import React, { useState, useEffect } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Download, Eye, Loader2, X } from 'lucide-react'
import { SimulationResults } from '@/types'
import { PDFService, PDFGenerationOptions } from '@/lib/pdf/pdfService'

interface ReportPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  results: SimulationResults
  options: PDFGenerationOptions
}

export const ReportPreviewModal: React.FC<ReportPreviewModalProps> = ({
  isOpen,
  onClose,
  results,
  options,
}) => {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isOpen && !pdfUrl) {
      generatePreview()
    }

    return () => {
      if (pdfUrl) {
        URL.revokeObjectURL(pdfUrl)
      }
    }
  }, [isOpen])

  const generatePreview = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const url = await PDFService.getPDFBlobURL(results, options)
      setPdfUrl(url)
    } catch (error) {
      console.error('Preview generation failed:', error)
      setError(error instanceof Error ? error.message : 'Failed to generate preview')
    } finally {
      setIsLoading(false)
    }
  }

  const handleDownload = async () => {
    try {
      const filename = `retirement-analysis-${new Date().toISOString().split('T')[0]}`
      await PDFService.downloadPDF(results, { ...options, filename })
      onClose()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to download PDF')
    }
  }

  const handleClose = () => {
    if (pdfUrl) {
      URL.revokeObjectURL(pdfUrl)
      setPdfUrl(null)
    }
    onClose()
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle>Report Preview</DialogTitle>
              <DialogDescription>
                Preview your retirement planning report before downloading
              </DialogDescription>
            </div>
            <div className="flex items-center space-x-2">
              <Button onClick={handleDownload} disabled={!pdfUrl || isLoading}>
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 p-6 pt-0">
          {isLoading && (
            <div className="flex items-center justify-center h-96 bg-gray-50 rounded-lg">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
                <p className="text-gray-600">Generating PDF preview...</p>
                <p className="text-sm text-gray-500 mt-1">This may take a few moments</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-96 bg-red-50 rounded-lg border-2 border-red-200">
              <div className="text-center">
                <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <X className="w-6 h-6 text-red-600" />
                </div>
                <p className="text-red-800 font-medium mb-2">Preview Failed</p>
                <p className="text-sm text-red-600 max-w-md">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={generatePreview}
                  className="mt-4"
                >
                  Try Again
                </Button>
              </div>
            </div>
          )}

          {pdfUrl && !isLoading && !error && (
            <div className="h-96 lg:h-[600px] border rounded-lg overflow-hidden">
              <iframe
                src={pdfUrl}
                className="w-full h-full"
                title="PDF Preview"
              />
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}