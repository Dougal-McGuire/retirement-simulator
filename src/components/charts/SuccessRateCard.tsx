'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, AlertTriangle, Sparkles } from 'lucide-react'
import { AnimatedCounter } from '@/components/ui/animated-counter'

interface SuccessRateCardProps {
  successRate: number
  isLoading: boolean
  simulationRuns?: number
}

export function SuccessRateCard({ successRate, isLoading, simulationRuns = 1000 }: SuccessRateCardProps) {
  if (isLoading) {
    return (
      <Card className="relative overflow-hidden border-0 shadow-lg">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-50 to-gray-100"></div>
        <div className="relative">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center justify-between text-gray-700">
              <span>Retirement Success Rate</span>
              <div className="animate-pulse w-6 h-6 bg-gray-300 rounded"></div>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center space-x-3">
                  <div className="animate-pulse h-16 w-24 bg-gray-300 rounded-lg"></div>
                  <div className="animate-spin rounded-full h-8 w-8 border-2 border-gray-300 border-t-blue-500"></div>
                </div>
                <div className="animate-pulse h-4 w-48 bg-gray-300 rounded mt-3"></div>
              </div>
              <div className="text-right">
                <div className="animate-pulse h-3 w-20 bg-gray-300 rounded mb-1"></div>
                <div className="animate-pulse h-3 w-24 bg-gray-300 rounded"></div>
              </div>
            </div>
            <div className="mt-6">
              <div className="animate-pulse h-3 w-full bg-gray-300 rounded-full"></div>
            </div>
          </CardContent>
        </div>
      </Card>
    )
  }

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 90) return 'text-emerald-600'
    if (rate >= 75) return 'text-amber-600'
    return 'text-red-600'
  }

  const getSuccessRateIcon = (rate: number) => {
    if (rate >= 95) return <Sparkles className="h-6 w-6 text-emerald-500 animate-pulse" />
    if (rate >= 90) return <TrendingUp className="h-6 w-6 text-emerald-500" />
    if (rate >= 75) return <AlertTriangle className="h-6 w-6 text-amber-500" />
    return <TrendingDown className="h-6 w-6 text-red-500" />
  }

  const getSuccessRateMessage = (rate: number) => {
    if (rate >= 95) return "Excellent! Very high probability of success"
    if (rate >= 90) return "Very good probability of reaching your goals"
    if (rate >= 80) return "Good probability, but consider optimizing"
    if (rate >= 70) return "Moderate success rate, review your plan"
    if (rate >= 50) return "Low success rate, significant adjustments needed"
    return "Very low success rate, major plan revision required"
  }

  const getGradientClasses = (rate: number) => {
    if (rate >= 90) return 'from-emerald-50 via-green-50 to-teal-50'
    if (rate >= 75) return 'from-amber-50 via-yellow-50 to-orange-50'
    return 'from-red-50 via-rose-50 to-pink-50'
  }

  const getBorderClasses = (rate: number) => {
    if (rate >= 90) return 'border-emerald-200 shadow-emerald-100/50'
    if (rate >= 75) return 'border-amber-200 shadow-amber-100/50'
    return 'border-red-200 shadow-red-100/50'
  }

  const getProgressGradient = (rate: number) => {
    if (rate >= 90) return 'bg-gradient-to-r from-emerald-400 to-green-500'
    if (rate >= 75) return 'bg-gradient-to-r from-amber-400 to-yellow-500'
    return 'bg-gradient-to-r from-red-400 to-rose-500'
  }

  return (
    <Card className={`relative overflow-hidden border-2 shadow-lg transition-all duration-300 hover:shadow-xl ${getBorderClasses(successRate)}`}>
      {/* Dynamic gradient background */}
      <div className={`absolute inset-0 bg-gradient-to-br ${getGradientClasses(successRate)} opacity-60`}></div>
      
      {/* Celebration animation for high success rates */}
      {successRate >= 95 && (
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-4 left-4 w-2 h-2 bg-emerald-400 rounded-full animate-ping"></div>
          <div className="absolute top-6 right-8 w-1 h-1 bg-green-400 rounded-full animate-ping" style={{ animationDelay: '0.5s' }}></div>
          <div className="absolute bottom-8 left-6 w-1.5 h-1.5 bg-teal-400 rounded-full animate-ping" style={{ animationDelay: '1s' }}></div>
        </div>
      )}
      
      <div className="relative">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between text-gray-800">
            <span className="font-semibold">Retirement Success Rate</span>
            <div className="transition-transform duration-200 hover:scale-110">
              {getSuccessRateIcon(successRate)}
            </div>
          </CardTitle>
        </CardHeader>
        
        <CardContent>
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center space-x-2 mb-2">
                <AnimatedCounter
                  end={successRate}
                  duration={2.5}
                  decimals={1}
                  suffix="%"
                  className={`text-5xl font-bold tracking-tight ${getSuccessRateColor(successRate)}`}
                />
                {successRate >= 95 && (
                  <div className="text-emerald-500 animate-bounce">
                    <Sparkles className="h-8 w-8" />
                  </div>
                )}
              </div>
              <p className={`text-sm font-medium transition-colors duration-300 ${
                successRate >= 90 ? 'text-emerald-700' : 
                successRate >= 75 ? 'text-amber-700' : 'text-red-700'
              }`}>
                {getSuccessRateMessage(successRate)}
              </p>
            </div>
            
            <div className="text-right text-sm text-gray-600 ml-4">
              <p className="font-medium">Based on 100% of</p>
              <p>simulation scenarios</p>
            </div>
          </div>
          
          {/* Enhanced progress bar */}
          <div className="mt-6">
            <div className="flex justify-between text-xs font-medium text-gray-500 mb-2">
              <span>0%</span>
              <span className="text-gray-600">Success Rate</span>
              <span>100%</span>
            </div>
            <div className="relative">
              <div className="w-full bg-gray-200/80 rounded-full h-3 shadow-inner">
                <div 
                  className={`h-3 rounded-full transition-all duration-1000 ease-out shadow-sm ${getProgressGradient(successRate)}`}
                  style={{ 
                    width: `${Math.max(3, Math.min(100, successRate))}%`,
                    animation: 'slideIn 1.5s ease-out'
                  }}
                ></div>
              </div>
              {/* Glow effect for high success rates */}
              {successRate >= 90 && (
                <div 
                  className="absolute top-0 h-3 bg-emerald-400 rounded-full opacity-30 blur-sm transition-all duration-1000 ease-out"
                  style={{ width: `${Math.max(3, Math.min(100, successRate))}%` }}
                ></div>
              )}
            </div>
          </div>

          {/* Enhanced info section */}
          <div className="mt-6 p-4 bg-white/80 backdrop-blur-sm rounded-xl border border-gray-200/50 shadow-sm">
            <h4 className="text-sm font-semibold mb-3 flex items-center text-gray-800">
              <div className="w-2 h-2 bg-blue-500 rounded-full mr-2"></div>
              What this means:
            </h4>
            <p className="text-xs text-gray-700 leading-relaxed">
              <span className="font-semibold text-gray-800">{successRate.toFixed(1)}%</span> of <span className="font-semibold">{simulationRuns.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')}</span> scenarios don't run out of money before age 90, accounting for market volatility and spending patterns.
            </p>
          </div>
        </CardContent>
      </div>

      <style jsx>{`
        @keyframes slideIn {
          from {
            width: 0%;
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }
      `}</style>
    </Card>
  )
}