import { SimulationResults } from '@/types'

export class ClientChartGenerator {
  /**
   * Generate simple SVG charts as base64 images for PDF
   * This is a temporary solution until full chart generation is implemented
   */
  private static generateSVGChart(
    title: string, 
    data: number[], 
    labels: string[], 
    chartType: 'line' | 'bar' | 'doughnut' | 'pie' = 'line',
    colors: string[] = ['#3b82f6']
  ): string {
    const width = 800
    const height = 400
    const margin = { top: 60, right: 60, bottom: 80, left: 80 }
    const chartWidth = width - margin.left - margin.right
    const chartHeight = height - margin.top - margin.bottom

    let chartContent = ''

    if (chartType === 'line') {
      const maxValue = Math.max(...data)
      const minValue = Math.min(...data)
      const valueRange = maxValue - minValue
      
      // Generate line path
      const points = data.map((value, index) => {
        const x = margin.left + (index / (data.length - 1)) * chartWidth
        const y = margin.top + chartHeight - ((value - minValue) / valueRange) * chartHeight
        return `${x},${y}`
      }).join(' ')
      
      chartContent = `
        <polyline fill="none" stroke="${colors[0]}" stroke-width="3" points="${points}" />
        ${data.map((value, index) => {
          const x = margin.left + (index / (data.length - 1)) * chartWidth
          const y = margin.top + chartHeight - ((value - minValue) / valueRange) * chartHeight
          return `<circle cx="${x}" cy="${y}" r="4" fill="${colors[0]}" />`
        }).join('')}
      `
    } else if (chartType === 'bar') {
      const maxValue = Math.max(...data)
      const barWidth = chartWidth / data.length * 0.8
      const barSpacing = chartWidth / data.length
      
      chartContent = data.map((value, index) => {
        const x = margin.left + index * barSpacing + barSpacing * 0.1
        const barHeight = (value / maxValue) * chartHeight
        const y = margin.top + chartHeight - barHeight
        
        return `<rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" fill="${colors[0]}" rx="4" />`
      }).join('')
    }

    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#ffffff"/>
        
        <!-- Title -->
        <text x="${width/2}" y="30" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#1f2937">
          ${title}
        </text>
        
        <!-- Chart content -->
        ${chartContent}
        
        <!-- Axes -->
        <line x1="${margin.left}" y1="${margin.top}" x2="${margin.left}" y2="${margin.top + chartHeight}" stroke="#e5e7eb" stroke-width="2"/>
        <line x1="${margin.left}" y1="${margin.top + chartHeight}" x2="${margin.left + chartWidth}" y2="${margin.top + chartHeight}" stroke="#e5e7eb" stroke-width="2"/>
        
        <!-- Labels -->
        ${labels.map((label, index) => {
          const x = margin.left + (index / (labels.length - 1)) * chartWidth
          return `<text x="${x}" y="${margin.top + chartHeight + 25}" text-anchor="middle" font-family="Arial, sans-serif" font-size="12" fill="#6b7280">${label}</text>`
        }).join('')}
      </svg>
    `

    return `data:image/svg+xml;base64,${this.safeBase64Encode(svg)}`
  }

  /**
   * Safe base64 encoding that handles Unicode characters
   */
  private static safeBase64Encode(str: string): string {
    try {
      // Use Buffer for proper Unicode handling
      return Buffer.from(str, 'utf-8').toString('base64')
    } catch (error) {
      console.warn('Buffer encoding failed, falling back to btoa:', error)
      // Fallback: remove non-Latin1 characters and use btoa
      const latin1String = str.replace(/[^\x00-\xFF]/g, '') // Remove non-Latin1 characters
      return btoa(latin1String)
    }
  }

  /**
   * Generate all charts for a simulation result
   */
  static async generateAllCharts(results: SimulationResults) {
    try {
      // Generate simple SVG charts with actual data
      const ages = results.ages.map(age => age.toString())
      
      const assetChart = this.generateSVGChart(
        'Asset Projections by Age',
        results.assetPercentiles.p50,
        ages.filter((_, i) => i % 5 === 0), // Show every 5th label to avoid crowding
        'line',
        ['#3b82f6']
      )
      
      const spendingChart = this.generateSVGChart(
        'Monthly Spending During Retirement',
        results.spendingPercentiles.p50.slice(0, 10), // Show first 10 years
        ages.slice(0, 10),
        'bar',
        ['#8b5cf6']
      )
      
      // Simple success rate visualization
      const successChart = this.generateSuccessRateChart(results.successRate)
      
      // Expense breakdown
      const expenseChart = this.generateExpenseChart(results)

      return {
        assetProjection: assetChart,
        monthlySpending: spendingChart,
        successRate: successChart,
        expenseBreakdown: expenseChart
      }
    } catch (error) {
      console.error('Error generating charts:', error)
      throw new Error(`Failed to generate charts: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private static generateSuccessRateChart(successRate: number): string {
    const size = 300
    const center = size / 2
    const radius = 80
    const strokeWidth = 20
    
    const successAngle = (successRate / 100) * 360
    const successPath = this.polarToCartesian(center, center, radius, 0, successAngle)
    
    const color = successRate >= 85 ? '#10b981' : successRate >= 70 ? '#f59e0b' : '#ef4444'
    
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#ffffff"/>
        
        <!-- Background circle -->
        <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="#e5e7eb" stroke-width="${strokeWidth}"/>
        
        <!-- Success arc -->
        <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="${color}" stroke-width="${strokeWidth}"
                stroke-dasharray="${(successRate / 100) * 2 * Math.PI * radius} ${2 * Math.PI * radius}"
                stroke-dashoffset="${2 * Math.PI * radius / 4}" stroke-linecap="round"/>
        
        <!-- Center text -->
        <text x="${center}" y="${center - 10}" text-anchor="middle" font-family="Arial, sans-serif" font-size="36" font-weight="bold" fill="${color}">
          ${successRate.toFixed(1)}%
        </text>
        <text x="${center}" y="${center + 20}" text-anchor="middle" font-family="Arial, sans-serif" font-size="14" fill="#6b7280">
          Success Rate
        </text>
        
        <!-- Title -->
        <text x="${center}" y="30" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#1f2937">
          Retirement Plan Success Rate
        </text>
      </svg>
    `
    
    return `data:image/svg+xml;base64,${this.safeBase64Encode(svg)}`
  }
  
  private static generateExpenseChart(results: SimulationResults): string {
    const { monthlyExpenses, annualExpenses } = results.params
    
    const expenses = [
      { label: 'Health', value: monthlyExpenses.health * 12 },
      { label: 'Food', value: monthlyExpenses.food * 12 },
      { label: 'Entertainment', value: monthlyExpenses.entertainment * 12 },
      { label: 'Shopping', value: monthlyExpenses.shopping * 12 },
      { label: 'Utilities', value: monthlyExpenses.utilities * 12 },
      { label: 'Vacations', value: annualExpenses.vacations },
      { label: 'Repairs', value: annualExpenses.repairs },
      { label: 'Car Maintenance', value: annualExpenses.carMaintenance }
    ].filter(e => e.value > 0).sort((a, b) => b.value - a.value)
    
    const size = 400
    const center = size / 2
    const radius = 120
    
    const total = expenses.reduce((sum, exp) => sum + exp.value, 0)
    let currentAngle = 0
    
    const colors = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']
    
    const slices = expenses.map((expense, index) => {
      const sliceAngle = (expense.value / total) * 360
      const startAngle = currentAngle
      const endAngle = currentAngle + sliceAngle
      
      const largeArcFlag = sliceAngle > 180 ? 1 : 0
      const x1 = center + radius * Math.cos((startAngle * Math.PI) / 180)
      const y1 = center + radius * Math.sin((startAngle * Math.PI) / 180)
      const x2 = center + radius * Math.cos((endAngle * Math.PI) / 180)
      const y2 = center + radius * Math.sin((endAngle * Math.PI) / 180)
      
      const pathData = `M ${center} ${center} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2} Z`
      
      currentAngle += sliceAngle
      
      return `<path d="${pathData}" fill="${colors[index % colors.length]}" stroke="#ffffff" stroke-width="2" />`
    }).join('')
    
    const svg = `
      <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
        <rect width="100%" height="100%" fill="#ffffff"/>
        
        <!-- Title -->
        <text x="${center}" y="30" text-anchor="middle" font-family="Arial, sans-serif" font-size="18" font-weight="bold" fill="#1f2937">
          Annual Expense Breakdown
        </text>
        
        <!-- Pie slices -->
        ${slices}
        
        <!-- Legend -->
        ${expenses.slice(0, 6).map((expense, index) => `
          <rect x="20" y="${60 + index * 25}" width="15" height="15" fill="${colors[index % colors.length]}" />
          <text x="45" y="${72 + index * 25}" font-family="Arial, sans-serif" font-size="12" fill="#1f2937">
            ${expense.label}: €${expense.value.toLocaleString()}
          </text>
        `).join('')}
      </svg>
    `
    
    return `data:image/svg+xml;base64,${this.safeBase64Encode(svg)}`
  }
  
  private static polarToCartesian(centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number) {
    const start = this.degToRad(endAngle)
    const end = this.degToRad(startAngle)
    
    return {
      x: centerX + radius * Math.cos(start),
      y: centerY + radius * Math.sin(start)
    }
  }
  
  private static degToRad(degrees: number): number {
    return degrees * Math.PI / 180
  }
}