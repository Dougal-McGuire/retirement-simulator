'use client'

import { useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { SimulationResults, SimulationParams } from '@/types'
import { CoverPage } from './components/CoverPage'
import { ExecutiveSummary } from './components/ExecutiveSummary'
import { PersonalProfile } from './components/PersonalProfile'
import { AssetProjections } from './components/AssetProjections'
import { SpendingAnalysis } from './components/SpendingAnalysis'
import { RiskAnalysis } from './components/RiskAnalysis'
import { Recommendations } from './components/Recommendations'
import { TechnicalAppendix } from './components/TechnicalAppendix'
import { ReportHeader } from './components/ReportHeader'
import { TableOfContents } from './components/TableOfContents'

interface ReportPageProps {
  params: Promise<{ id: string }>
}

export default function ReportPage({ params }: ReportPageProps) {
  const [resolvedParams, setResolvedParams] = useState<{ id: string } | null>(null)
  const [simulationData, setSimulationData] = useState<{
    results: SimulationResults
    params: SimulationParams
  } | null>(null)
  
  const searchParams = useSearchParams()
  const router = useRouter()
  
  const isPrintMode = searchParams.get('print') === '1'
  const reportId = resolvedParams?.id || 'unknown'
  const reportDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })

  useEffect(() => {
    params.then(setResolvedParams)
  }, [params])

  useEffect(() => {
    // Try to get data from URL parameter (for PDF generation)
    const dataParam = searchParams.get('data')
    if (dataParam) {
      try {
        const decoded = atob(dataParam)
        const data = JSON.parse(decoded)
        setSimulationData(data)
      } catch (error) {
        console.error('Failed to decode simulation data:', error)
      }
    }
  }, [searchParams])

  // Check if we have simulation results
  if (!simulationData) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Report Not Available</h1>
          <p className="text-gray-600 mb-8">No simulation results found. Please run a simulation first.</p>
          <button
            onClick={() => router.push('/simulation')}
            className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700"
          >
            Go to Simulation
          </button>
        </div>
      </div>
    )
  }

  if (isPrintMode) {
    return (
      <div className="report-page bg-white">
        <CoverPage 
          params={simulationData.params} 
          reportDate={reportDate} 
          reportId={reportId} 
        />
        
        <div className="page-break-before">
          <TableOfContents 
            reportDate={reportDate} 
            reportId={reportId} 
          />
        </div>
        
        <div className="page-break-before">
          <ExecutiveSummary 
            results={simulationData.results} 
            reportDate={reportDate} 
            reportId={reportId} 
          />
        </div>
        
        <div className="page-break-before">
          <PersonalProfile 
            params={simulationData.params} 
            reportDate={reportDate} 
            reportId={reportId} 
          />
        </div>
        
        <div className="page-break-before">
          <AssetProjections 
            results={simulationData.results} 
            reportDate={reportDate} 
            reportId={reportId} 
          />
        </div>
        
        <div className="page-break-before">
          <SpendingAnalysis 
            results={simulationData.results} 
            reportDate={reportDate} 
            reportId={reportId} 
          />
        </div>
        
        <div className="page-break-before">
          <RiskAnalysis 
            results={simulationData.results} 
            reportDate={reportDate} 
            reportId={reportId} 
          />
        </div>
        
        <div className="page-break-before">
          <Recommendations 
            results={simulationData.results} 
            reportDate={reportDate} 
            reportId={reportId} 
          />
        </div>
        
        <div className="page-break-before">
          <TechnicalAppendix 
            params={simulationData.params} 
            reportDate={reportDate} 
            reportId={reportId} 
          />
        </div>
      </div>
    )
  }

  // Regular view (non-print)
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="no-print">
        <ReportHeader reportDate={reportDate} reportId={reportId} />
        
        <div className="max-w-4xl mx-auto py-8 px-4">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-6">
              Retirement Planning Analysis
            </h1>
            <p className="text-gray-600 mb-8">
              Your comprehensive financial projection report is ready. 
              Use the controls below to view or download the full report.
            </p>
            
            <div className="flex flex-wrap gap-4">
              <a
                href={`/api/report/${reportId}/pdf`}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 flex items-center gap-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                📄 Download PDF Report
              </a>
              
              <a
                href={`/reports/${reportId}?print=1`}
                className="bg-gray-600 text-white px-6 py-3 rounded-lg hover:bg-gray-700 flex items-center gap-2"
                target="_blank"
                rel="noopener noreferrer"
              >
                👁️ Preview Report
              </a>
              
              <button
                onClick={() => router.push('/simulation')}
                className="bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                📊 Back to Simulation
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}