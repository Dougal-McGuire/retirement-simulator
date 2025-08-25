import { pdf } from '@react-pdf/renderer'
import { SimulationResults } from '@/types'
import { RetirementReport } from './RetirementReport'
import { ClientChartGenerator } from './services/clientChartGenerator'

export interface PDFGenerationOptions {
  filename?: string
  includeCover?: boolean
  includeCharts?: boolean
  qualityLevel?: 'draft' | 'standard' | 'high'
}

export class PDFService {
  private static generateReportId(): string {
    const timestamp = Date.now().toString(36)
    const randomStr = Math.random().toString(36).substring(2, 7)
    return `RPT-${timestamp}-${randomStr}`.toUpperCase()
  }

  private static formatDate(date: Date): string {
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long', 
      day: 'numeric',
    }).format(date)
  }

  /**
   * Generate a PDF report from simulation results
   */
  static async generatePDF(
    results: SimulationResults,
    options: PDFGenerationOptions = {}
  ): Promise<Blob> {
    const {
      includeCover = true,
      includeCharts = true,
      qualityLevel = 'standard'
    } = options

    const reportDate = this.formatDate(new Date())
    const reportId = this.generateReportId()

    try {
      // Generate charts if needed
      let chartImages
      if (includeCharts) {
        console.log('Generating charts for PDF...')
        chartImages = await ClientChartGenerator.generateAllCharts(results)
        console.log('Charts generated successfully')
      }

      // Create the PDF document
      const doc = RetirementReport({
        results,
        reportDate,
        reportId,
        includeCover,
        includeCharts,
        qualityLevel,
        chartImages,
      })

      // Generate the PDF blob
      const pdfBlob = await pdf(doc).toBlob()
      return pdfBlob
    } catch (error) {
      console.error('Error generating PDF:', error)
      throw new Error('Failed to generate PDF report. Please try again.')
    }
  }

  /**
   * Download a PDF report
   */
  static async downloadPDF(
    results: SimulationResults,
    options: PDFGenerationOptions = {}
  ): Promise<void> {
    const { filename = `retirement-analysis-${Date.now()}` } = options

    try {
      const pdfBlob = await this.generatePDF(results, options)
      
      // Create download link
      const url = URL.createObjectURL(pdfBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${filename}.pdf`
      
      // Trigger download
      document.body.appendChild(link)
      link.click()
      
      // Cleanup
      document.body.removeChild(link)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Error downloading PDF:', error)
      throw new Error('Failed to download PDF report. Please try again.')
    }
  }

  /**
   * Get PDF as blob URL for preview
   */
  static async getPDFBlobURL(
    results: SimulationResults,
    options: PDFGenerationOptions = {}
  ): Promise<string> {
    try {
      const pdfBlob = await this.generatePDF(results, options)
      return URL.createObjectURL(pdfBlob)
    } catch (error) {
      console.error('Error generating PDF blob URL:', error)
      throw new Error('Failed to generate PDF preview. Please try again.')
    }
  }

  /**
   * Validate simulation results for PDF generation
   */
  static validateResults(results: SimulationResults): boolean {
    try {
      if (!results) {
        console.warn('PDF validation: No results provided')
        return false
      }
      
      if (!results.params) {
        console.warn('PDF validation: No parameters in results')
        return false
      }
      
      if (!results.ages || results.ages.length === 0) {
        console.warn('PDF validation: No age data in results')
        return false
      }
      
      if (!results.assetPercentiles || !results.spendingPercentiles) {
        console.warn('PDF validation: Missing percentile data')
        return false
      }
      
      if (typeof results.successRate !== 'number' || isNaN(results.successRate)) {
        console.warn('PDF validation: Invalid success rate')
        return false
      }

      // Validate data consistency
      const expectedLength = results.ages.length
      if (results.assetPercentiles.p10.length !== expectedLength ||
          results.assetPercentiles.p50.length !== expectedLength ||
          results.assetPercentiles.p90.length !== expectedLength) {
        console.warn('PDF validation: Inconsistent asset percentile data lengths')
        return false
      }

      if (results.spendingPercentiles.p10.length !== expectedLength ||
          results.spendingPercentiles.p50.length !== expectedLength ||
          results.spendingPercentiles.p90.length !== expectedLength) {
        console.warn('PDF validation: Inconsistent spending percentile data lengths')
        return false
      }

      // Validate parameter ranges
      const { params } = results
      if (params.currentAge < 18 || params.currentAge > 100 ||
          params.retirementAge < params.currentAge ||
          params.endAge < params.retirementAge) {
        console.warn('PDF validation: Invalid age parameters')
        return false
      }

      return true
    } catch (error) {
      console.error('PDF validation error:', error)
      return false
    }
  }

  /**
   * Get estimated PDF generation time
   */
  static getEstimatedGenerationTime(
    results: SimulationResults,
    options: PDFGenerationOptions = {}
  ): number {
    const baseTime = 2000 // 2 seconds base
    const chartTime = options.includeCharts ? 3000 : 0 // 3 seconds for charts
    const qualityMultiplier = options.qualityLevel === 'high' ? 1.5 : 
                            options.qualityLevel === 'draft' ? 0.7 : 1
    
    return Math.round((baseTime + chartTime) * qualityMultiplier)
  }
}