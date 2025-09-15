'use client'

import { useEffect } from 'react'
// streamlined header: no back link
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  useSimulationStore,
  useSimulationParams,
  useSimulationResults,
  useSimulationLoading,
} from '@/lib/stores/simulationStore'
import { SimulationChart } from '@/components/charts/SimulationChart'
import { SuccessRateCard } from '@/components/charts/SuccessRateCard'
import { ParameterSidebar } from '@/components/navigation/ParameterSidebar'
import { GenerateReportButton } from '@/components/GenerateReportButton'
import { ChartSkeleton, SuccessRateCardSkeleton } from '@/components/ui/skeleton'

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
    <div className="min-h-screen bg-retirement-50">
      {/* Header */}
      <header id="navigation" className="bg-white border-b border-retirement-200 shadow-soft">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <h1 className="text-lg sm:text-2xl font-bold text-gray-900">Retirement Simulation</h1>
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="hidden sm:block">
                <GenerateReportButton results={results} params={params} disabled={isLoading} />
              </div>
              <Button size="sm" asChild>
                <a href="/setup">
                  <span className="hidden sm:inline">Setup</span>
                  <span className="sm:hidden">Setup</span>
                </a>
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main id="main-content" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Parameter Controls Sidebar */}
          <ParameterSidebar />

          {/* Main Content */}
          <div className="lg:col-span-3 space-y-6">
            {/* Success Rate Card */}
            {isLoading ? (
              <Card>
                <SuccessRateCardSkeleton />
              </Card>
            ) : (
              <SuccessRateCard
                successRate={results?.successRate || 0}
                isLoading={isLoading}
                simulationRuns={params.simulationRuns}
              />
            )}

            {/* Simulation Chart */}
            <Card className="bg-white border-retirement-200 shadow-soft">
              <CardHeader>
                <CardTitle className="text-retirement-800">
                  Asset Projections & Spending Analysis
                </CardTitle>
                <CardDescription className="text-retirement-600">
                  Monte Carlo simulation showing asset levels and spending over time with 10th,
                  50th, and 90th percentiles
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <ChartSkeleton />
                ) : (
                  <SimulationChart results={results} isLoading={isLoading} />
                )}
              </CardContent>
            </Card>

            {/* Statistics Cards (removed)
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {isLoading ? (
                <>
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                  <StatCardSkeleton />
                </>
              ) : (
                <>
                  <Card className="group bg-gradient-to-br from-info-50 to-info-100 border-info-200 shadow-soft hover:shadow-glow hover:-translate-y-1 transition-all duration-300 cursor-pointer animate-scale-in">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between">
                      <CardTitle className="text-lg text-info-800 group-hover:text-info-900 transition-colors">Current Age</CardTitle>
                      <div className="w-10 h-10 bg-info-200 rounded-full flex items-center justify-center group-hover:bg-info-300 transition-all duration-300 group-hover:scale-110">
                        <span className="text-info-700 font-bold text-sm">👤</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center space-x-3">
                        <div className="text-3xl font-bold text-info-600 group-hover:text-info-700 transition-colors">
                          {params.currentAge}
                        </div>
                        <div className="text-info-500 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
                          <span className="text-sm font-medium">years</span>
                        </div>
                      </div>
                      <p className="text-sm text-info-700 mt-2 group-hover:text-info-800 transition-colors">
                        Years until retirement: <span className="font-semibold">{params.retirementAge - params.currentAge}</span>
                      </p>
                      <div className="mt-3 h-1 bg-info-200 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-gradient-to-r from-info-400 to-info-600 rounded-full transition-all duration-1000 group-hover:from-info-500 group-hover:to-info-700"
                          style={{ 
                            width: `${Math.min(100, ((params.currentAge - 20) / (params.retirementAge - 20)) * 100)}%` 
                          }}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="group bg-gradient-to-br from-success-50 to-success-100 border-success-500/20 shadow-soft hover:shadow-success hover:-translate-y-1 transition-all duration-300 cursor-pointer animate-scale-in">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between">
                      <CardTitle className="text-lg text-success-700 group-hover:text-success-800 transition-colors">Monthly Expenses</CardTitle>
                      <div className="w-10 h-10 bg-success-100 rounded-full flex items-center justify-center group-hover:bg-success-200 transition-all duration-300 group-hover:scale-110 shadow-sm">
                        <span className="text-success-600 font-bold text-sm">💰</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center space-x-2">
                        <div className="text-3xl font-bold text-success-600 group-hover:text-success-700 transition-colors">
                          €{calculateCombinedExpenses(params.monthlyExpenses, params.annualExpenses).combinedMonthly.toFixed(0)}
                        </div>
                        <div className="text-success-500 opacity-0 group-hover:opacity-100 transition-all duration-300 transform scale-75 group-hover:scale-100">
                          <span className="text-xs font-medium">/month</span>
                        </div>
                      </div>
                      <div className="mt-2 space-y-1">
                        <p className="text-sm text-success-700 group-hover:text-success-800 transition-colors">
                          Annual: <span className="font-semibold">€{calculateCombinedExpenses(params.monthlyExpenses, params.annualExpenses).combinedAnnual.toFixed(0)}</span>
                        </p>
                        <div className="flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-2 group-hover:translate-y-0">
                          <div className="w-2 h-2 bg-success-500 rounded-full animate-pulse-soft"></div>
                          <p className="text-xs text-success-600">
                            Includes monthly + annual/12
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="group bg-gradient-to-br from-warning-50 to-warning-100 border-warning-500/20 shadow-soft hover:shadow-warning hover:-translate-y-1 transition-all duration-300 cursor-pointer animate-scale-in">
                    <CardHeader className="pb-3 flex flex-row items-center justify-between">
                      <CardTitle className="text-lg text-warning-700 group-hover:text-warning-800 transition-colors">Simulation Runs</CardTitle>
                      <div className="w-10 h-10 bg-warning-100 rounded-full flex items-center justify-center group-hover:bg-warning-200 transition-all duration-300 group-hover:scale-110 group-hover:rotate-12 shadow-sm">
                        <span className="text-warning-600 font-bold text-sm">🎯</span>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <div className="flex items-center space-x-3">
                        <div className="text-3xl font-bold text-warning-600 group-hover:text-warning-700 transition-colors">
                          {formatNumber(params.simulationRuns)}
                        </div>
                        <div className="text-warning-500 opacity-0 group-hover:opacity-100 transition-all duration-300 transform -translate-x-2 group-hover:translate-x-0">
                          <div className="flex space-x-1">
                            <div className="w-1 h-1 bg-warning-500 rounded-full animate-ping" />
                            <div className="w-1 h-1 bg-warning-500 rounded-full animate-ping" style={{ animationDelay: '0.2s' }} />
                            <div className="w-1 h-1 bg-warning-500 rounded-full animate-ping" style={{ animationDelay: '0.4s' }} />
                          </div>
                        </div>
                      </div>
                      <p className="text-sm text-warning-700 mt-2 group-hover:text-warning-800 transition-colors">
                        Monte Carlo iterations
                      </p>
                      <div className="mt-3 flex items-center space-x-2 opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-y-2 group-hover:translate-y-0">
                        <div className="flex-1 h-1 bg-warning-200 rounded-full">
                          <div className="h-full bg-gradient-to-r from-warning-400 to-warning-600 rounded-full w-full transition-all duration-1000" />
                        </div>
                        <span className="text-xs text-warning-600 font-medium">100%</span>
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>
            */}

            {/* Information Card (removed)
            <Card className="group bg-gradient-to-br from-retirement-50 via-retirement-100 to-info-50 border-retirement-200 shadow-medium hover:shadow-strong transition-all duration-500 overflow-hidden relative animate-fade-in">
              <div className="absolute inset-0 bg-gradient-to-br from-retirement-100/30 to-info-100/20 opacity-0 group-hover:opacity-100 transition-opacity duration-500"></div>
              <CardHeader className="relative">
                <CardTitle className="text-retirement-800 group-hover:text-retirement-900 transition-colors flex items-center space-x-3">
                  <span className="text-2xl">🧠</span>
                  <span>How This Simulation Works</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-blue-700 relative">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="group/item bg-white/50 p-4 rounded-lg border border-blue-200/50 hover:bg-white/70 hover:border-blue-300/70 transition-all duration-300 hover:shadow-md hover:-translate-y-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-8 h-8 bg-blue-200 group-hover/item:bg-blue-300 rounded-full flex items-center justify-center transition-all duration-300 group-hover/item:scale-110">
                        <span className="text-blue-700 text-sm">🎲</span>
                      </div>
                      <h4 className="font-semibold text-blue-800 group-hover/item:text-blue-900 transition-colors">Monte Carlo Method</h4>
                    </div>
                    <p className="text-sm text-blue-700 group-hover/item:text-blue-800 transition-colors leading-relaxed">
                      Runs thousands of scenarios with random market returns and inflation rates 
                      based on your specified averages and volatility parameters.
                    </p>
                    <div className="mt-3 opacity-0 group-hover/item:opacity-100 transition-all duration-300 transform translate-y-2 group-hover/item:translate-y-0">
                      <div className="flex items-center space-x-2 text-xs text-blue-600">
                        <div className="w-2 h-2 bg-blue-400 rounded-full animate-pulse"></div>
                        <span>Simulates market uncertainty</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="group/item bg-white/50 p-4 rounded-lg border border-indigo-200/50 hover:bg-white/70 hover:border-indigo-300/70 transition-all duration-300 hover:shadow-md hover:-translate-y-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-8 h-8 bg-indigo-200 group-hover/item:bg-indigo-300 rounded-full flex items-center justify-center transition-all duration-300 group-hover/item:scale-110">
                        <span className="text-indigo-700 text-sm">⚡</span>
                      </div>
                      <h4 className="font-semibold text-indigo-800 group-hover/item:text-indigo-900 transition-colors">Two-Phase Modeling</h4>
                    </div>
                    <p className="text-sm text-indigo-700 group-hover/item:text-indigo-800 transition-colors leading-relaxed">
                      Models both accumulation phase (working years with savings) and 
                      distribution phase (retirement years with expenses and pension income).
                    </p>
                    <div className="mt-3 opacity-0 group-hover/item:opacity-100 transition-all duration-300 transform translate-y-2 group-hover/item:translate-y-0">
                      <div className="flex items-center space-x-2 text-xs text-indigo-600">
                        <div className="w-2 h-2 bg-indigo-400 rounded-full animate-pulse"></div>
                        <span>Accumulation → Distribution</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="group/item bg-white/50 p-4 rounded-lg border border-purple-200/50 hover:bg-white/70 hover:border-purple-300/70 transition-all duration-300 hover:shadow-md hover:-translate-y-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-8 h-8 bg-purple-200 group-hover/item:bg-purple-300 rounded-full flex items-center justify-center transition-all duration-300 group-hover/item:scale-110">
                        <span className="text-purple-700 text-sm">🎯</span>
                      </div>
                      <h4 className="font-semibold text-purple-800 group-hover/item:text-purple-900 transition-colors">Success Rate</h4>
                    </div>
                    <p className="text-sm text-purple-700 group-hover/item:text-purple-800 transition-colors leading-relaxed">
                      Percentage of simulations where you don't run out of money before age {params.endAge}.
                      Higher is better for retirement confidence.
                    </p>
                    <div className="mt-3 opacity-0 group-hover/item:opacity-100 transition-all duration-300 transform translate-y-2 group-hover/item:translate-y-0">
                      <div className="flex items-center space-x-2 text-xs text-purple-600">
                        <div className="w-2 h-2 bg-purple-400 rounded-full animate-pulse"></div>
                        <span>Measures plan reliability</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="group/item bg-white/50 p-4 rounded-lg border border-teal-200/50 hover:bg-white/70 hover:border-teal-300/70 transition-all duration-300 hover:shadow-md hover:-translate-y-1">
                    <div className="flex items-center space-x-3 mb-3">
                      <div className="w-8 h-8 bg-teal-200 group-hover/item:bg-teal-300 rounded-full flex items-center justify-center transition-all duration-300 group-hover/item:scale-110">
                        <span className="text-teal-700 text-sm">📊</span>
                      </div>
                      <h4 className="font-semibold text-teal-800 group-hover/item:text-teal-900 transition-colors">Percentile Analysis</h4>
                    </div>
                    <p className="text-sm text-teal-700 group-hover/item:text-teal-800 transition-colors leading-relaxed">
                      Shows 10th (pessimistic), 50th (median), and 90th (optimistic) percentiles 
                      to understand the range of possible outcomes.
                    </p>
                    <div className="mt-3 opacity-0 group-hover/item:opacity-100 transition-all duration-300 transform translate-y-2 group-hover/item:translate-y-0">
                      <div className="flex items-center space-x-2 text-xs text-teal-600">
                        <div className="w-2 h-2 bg-teal-400 rounded-full animate-pulse"></div>
                        <span>Shows outcome range</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
            */}
          </div>
        </div>
      </main>
    </div>
  )
}
