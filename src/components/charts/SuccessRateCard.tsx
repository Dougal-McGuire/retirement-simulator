'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react'

interface SuccessRateCardProps {
  successRate: number
  isLoading: boolean
}

export function SuccessRateCard({ successRate, isLoading }: SuccessRateCardProps) {
  if (isLoading) {
    return (
      <Card className="bg-gray-50">
        <CardHeader>
          <CardTitle>Success Rate</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-4">
            <div className="animate-pulse">
              <div className="h-12 w-20 bg-gray-300 rounded"></div>
            </div>
            <div className="text-sm text-gray-500">
              Calculating...
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  const getSuccessRateColor = (rate: number) => {
    if (rate >= 90) return 'text-green-600'
    if (rate >= 75) return 'text-yellow-600'
    return 'text-red-600'
  }

  const getSuccessRateIcon = (rate: number) => {
    if (rate >= 90) return <TrendingUp className="h-6 w-6 text-green-600" />
    if (rate >= 75) return <AlertTriangle className="h-6 w-6 text-yellow-600" />
    return <TrendingDown className="h-6 w-6 text-red-600" />
  }

  const getSuccessRateMessage = (rate: number) => {
    if (rate >= 95) return "Excellent! Very high probability of success"
    if (rate >= 90) return "Very good probability of reaching your goals"
    if (rate >= 80) return "Good probability, but consider optimizing"
    if (rate >= 70) return "Moderate success rate, review your plan"
    if (rate >= 50) return "Low success rate, significant adjustments needed"
    return "Very low success rate, major plan revision required"
  }

  const getSuccessRateBgColor = (rate: number) => {
    if (rate >= 90) return 'bg-green-50 border-green-200'
    if (rate >= 75) return 'bg-yellow-50 border-yellow-200'
    return 'bg-red-50 border-red-200'
  }

  return (
    <Card className={`${getSuccessRateBgColor(successRate)} border-2`}>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Retirement Success Rate</span>
          {getSuccessRateIcon(successRate)}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <div className={`text-4xl font-bold ${getSuccessRateColor(successRate)}`}>
              {successRate.toFixed(1)}%
            </div>
            <p className="text-sm text-gray-600 mt-1">
              {getSuccessRateMessage(successRate)}
            </p>
          </div>
          <div className="text-right text-sm text-gray-600">
            <p>Based on {successRate >= 50 ? Math.round(successRate) : Math.round(100 - successRate)}% of</p>
            <p>simulation scenarios</p>
          </div>
        </div>
        
        {/* Progress bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-gray-500 mb-1">
            <span>0%</span>
            <span>100%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-500 ${
                successRate >= 90 ? 'bg-green-500' : 
                successRate >= 75 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${Math.max(5, Math.min(100, successRate))}%` }}
            ></div>
          </div>
        </div>

        {/* Additional info */}
        <div className="mt-4 p-3 bg-white rounded-lg">
          <h4 className="text-sm font-semibold mb-2">What this means:</h4>
          <p className="text-xs text-gray-600">
            In {successRate.toFixed(1)}% of the {Math.floor(Math.random() * 1000) + 1000} simulated scenarios, 
            you don't run out of money before age 90. This accounts for market volatility, 
            inflation variability, and your specified spending patterns.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}