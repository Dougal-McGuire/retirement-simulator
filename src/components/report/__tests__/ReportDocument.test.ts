import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'

jest.mock('@/components/report/ReportLayout', () => ({
  ReportLayout: () => React.createElement('div', null, 'layout'),
}))

jest.mock('@/components/report/scripts', () => ({
  inlineReportScript: () => 'window.__REPORT_READY__ = true;',
}))

import { ReportDocument } from '../ReportDocument'

const englishReportContent = {
  metadata: {
    id: 'report-test',
    generatedAt: '2026-01-01T00:00:00.000Z',
    version: 'test',
  },
  profile: {
    person: {
      currentAge: 45,
      retireAge: 67,
      pensionAge: 67,
      horizonAge: 90,
    },
    success: {
      trials: 100,
      successCount: 85,
      successRate: 0.85,
      score: 82,
      label: 'Strong',
      reasons: ['Balanced assumptions'],
      components: [
        { id: 'success', value: 85, weight: 0.6 },
        { id: 'spending', value: 100, weight: 0.25 },
        { id: 'liquidity', value: 100, weight: 0.15 },
      ],
    },
    highlights: ['Keep current plan on track'],
  },
  finances: {
    currentAssets: 250000,
    annualSavings: 24000,
    monthlyPension: 1800,
  },
  assumptions: {
    expectedReturn: 0.05,
    returnVolatility: 0.12,
    inflation: 0.02,
    inflationVolatility: 0.01,
    withdrawalStrategy: 'vanguardDynamic',
    dsWithdrawalRate: 0.05,
    dsCeilingRate: 0.05,
    dsFloorRate: -0.025,
    capitalGainsTax: 26.25,
    simulationRuns: 100,
  },
  projections: {
    milestones: [
      {
        age: 67,
        p10: 300000,
        p50: 550000,
        p90: 900000,
      },
    ],
  },
  expenses: {
    horizonYears: 45,
    totalHorizonAmount: 2160000,
    annualTotal: 48000,
    monthlyTotal: 4000,
    monthlyCategories: [
      {
        label: 'Housing & utilities',
        interval: 'monthly',
        originalAmount: 2000,
        annualAmount: 24000,
        share: 0.5,
      },
    ],
    annualCategories: [
      {
        label: 'Travel & vacations',
        interval: 'annual',
        originalAmount: 6000,
        annualAmount: 6000,
        share: 0.125,
      },
    ],
    allCategories: [
      {
        label: 'Housing & utilities',
        interval: 'monthly',
        originalAmount: 2000,
        annualAmount: 24000,
        share: 0.5,
      },
      {
        label: 'Travel & vacations',
        interval: 'annual',
        originalAmount: 6000,
        annualAmount: 6000,
        share: 0.125,
      },
    ],
    scheduledFlows: [
      {
        id: 'rent',
        kind: 'income',
        name: 'Rental income',
        amount: 900,
        frequency: 'monthly',
        startAge: 62,
        endAge: 70,
      },
    ],
  },
  scenarios: [],
  recommendations: {
    primary: [],
    uplifts: [],
  },
  locale: 'en',
} satisfies ReportContent

describe('ReportDocument', () => {
  it('uses localized metadata for English reports', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ReportDocument, {
        content: englishReportContent,
        projectionSvg: '<svg />',
        breakdownSvg: '<svg />',
      })
    )

    expect(markup).toContain('<html lang="en">')
    expect(markup).toContain('<title>Retirement Plan</title>')
  })
})
