'use client'

import { useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useSimulationStore, useSimulationParams, useSimulationResults, useSimulationLoading } from '@/lib/stores/simulationStore'
import { SimulationChart } from '@/components/charts/SimulationChart'
import { SuccessRateCard } from '@/components/charts/SuccessRateCard'
import { ParameterControls } from '@/components/forms/ParameterControls'

export default function SimulationPage() {
  const params = useSimulationParams()
  const results = useSimulationResults()
  const isLoading = useSimulationLoading()
  const runSimulation = useSimulationStore((state) => state.runSimulation)

  // Run initial simulation
  useEffect(() => {
    if (!results) {
      runSimulation()
    }
  }, [results, runSimulation])

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div className="flex items-center space-x-4">
              <Button variant="ghost" asChild>
                <Link href="/" className="flex items-center space-x-2">
                  <ArrowLeft className="h-4 w-4" />
                  <span>Back to Home</span>
                </Link>
              </Button>
              <div className="h-6 w-px bg-gray-300" />
              <h1 className="text-2xl font-bold text-gray-900">Monte Carlo Simulation</h1>
            </div>
            <Button asChild>
              <Link href="/setup">Setup Wizard</Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Parameter Controls Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-8">
              <ParameterControls />
            </div>
          </div>

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* Success Rate Card */}
            <SuccessRateCard 
              successRate={results?.successRate || 0} 
              isLoading={isLoading}
              simulationRuns={params.simulationRuns}
            />

            {/* Simulation Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Asset Projections & Spending Analysis</CardTitle>
                <CardDescription>
                  Monte Carlo simulation showing asset levels and spending over time with 10th, 50th, and 90th percentiles
                </CardDescription>
              </CardHeader>
              <CardContent>
                <SimulationChart 
                  results={results} 
                  isLoading={isLoading} 
                />
              </CardContent>
            </Card>

            {/* Statistics Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Current Age</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-blue-600">
                    {params.currentAge}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Years until retirement: {params.retirementAge - params.currentAge}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Total Monthly Expenses</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    €{Object.values(params.monthlyExpenses).reduce((sum, expense) => sum + expense, 0)}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Annual: €{(Object.values(params.monthlyExpenses).reduce((sum, expense) => sum + expense, 0) * 12)}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Simulation Runs</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">
                    {params.simulationRuns}
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Monte Carlo iterations
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Information Card */}
            <Card className="bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-blue-800">How This Simulation Works</CardTitle>
              </CardHeader>
              <CardContent className="text-blue-700">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-semibold mb-2">Monte Carlo Method</h4>
                    <p className="text-sm">
                      Runs thousands of scenarios with random market returns and inflation rates 
                      based on your specified averages and volatility parameters.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Two-Phase Modeling</h4>
                    <p className="text-sm">
                      Models both accumulation phase (working years with savings) and 
                      distribution phase (retirement years with expenses and pension income).
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Success Rate</h4>
                    <p className="text-sm">
                      Percentage of simulations where you don't run out of money before age {params.endAge}.
                      Higher is better for retirement confidence.
                    </p>
                  </div>
                  <div>
                    <h4 className="font-semibold mb-2">Percentile Analysis</h4>
                    <p className="text-sm">
                      Shows 10th (pessimistic), 50th (median), and 90th (optimistic) percentiles 
                      to understand the range of possible outcomes.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}