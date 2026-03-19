import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

jest.mock('@/components/report/ReportLayout', () => ({
  ReportLayout: () => React.createElement('div', null, 'layout'),
}))

jest.mock('@/components/report/scripts', () => ({
  inlineReportScript: () => 'window.__REPORT_READY__ = true;',
}))

import { ReportDocument } from '../ReportDocument'

describe('ReportDocument', () => {
  it('uses localized metadata for English reports', () => {
    const markup = renderToStaticMarkup(
      React.createElement(ReportDocument, {
        content: { locale: 'en' } as never,
        projectionSvg: '<svg />',
        breakdownSvg: '<svg />',
      })
    )

    expect(markup).toContain('<html lang="en">')
    expect(markup).toContain('<title>Retirement Plan</title>')
  })
})
