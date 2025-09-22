import * as vega from 'vega'
import * as vl from 'vega-lite'
import type { TopLevelSpec } from 'vega-lite'

vega.formatLocale({
  decimal: ',',
  thousands: '.',
  grouping: [3],
  currency: ['', ' €'],
  percent: '%'
})

export interface ProjectionPoint {
  age: number
  p10: number
  p50: number
  p90: number
}

export async function renderProjectionChart(points: ProjectionPoint[]): Promise<string> {
  const data = points.map((point) => ({
    age: point.age,
    p10: point.p10,
    p50: point.p50,
    p90: point.p90,
  }))

  const spec: TopLevelSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 520,
    height: 280,
    data: { values: data },
    transform: [
      { calculate: 'datum.p90', as: 'upper' },
      { calculate: 'datum.p10', as: 'lower' },
    ],
    layer: [
      {
        mark: { type: 'area', opacity: 0.2, color: '#4b5563' },
        encoding: {
          x: { field: 'age', type: 'quantitative' },
          y: { field: 'upper', type: 'quantitative' },
          y2: { field: 'lower' },
        },
      },
      {
        mark: { type: 'line', strokeWidth: 3, color: '#111827' },
        encoding: {
          x: { field: 'age', type: 'quantitative' },
          y: { field: 'p50', type: 'quantitative' },
        },
      },
    ],
    encoding: {
      x: {
        field: 'age',
        type: 'quantitative',
        title: 'Alter',
        axis: { labelFontSize: 10, titleFontSize: 12, tickCount: 8 },
      },
      y: {
        field: 'upper',
        type: 'quantitative',
        title: 'Vermögen (EUR)',
        axis: {
          labelFontSize: 10,
          titleFontSize: 12,
          format: ',.0f',
        },
      },
    },
    config: {
      font: 'Inter, system-ui, sans-serif',
      background: 'transparent',
      axis: {
        labelColor: '#111827',
        titleColor: '#111827',
        gridColor: '#e5e7eb',
        gridOpacity: 1,
      },
      view: { stroke: '#d1d5db' },
    },
  }

  const { spec: compiled } = vl.compile(spec)
  const view = new vega.View(vega.parse(compiled), { renderer: 'svg' })
  return view.toSVG()
}

export interface BreakdownDatum {
  label: string
  annualAmount: number
  share: number
}

export async function renderBreakdownChart(data: BreakdownDatum[]): Promise<string> {
  const dataset = data.map((row) => ({
    label: row.label,
    amount: row.annualAmount,
    share: row.share,
  }))

  const spec: TopLevelSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width: 520,
    height: 280,
    data: { values: dataset },
    mark: {
      type: 'bar',
      color: '#1f2937',
    },
    encoding: {
      x: {
        field: 'amount',
        type: 'quantitative',
        title: 'Jahresbetrag (EUR)',
        axis: { format: ',.0f', labelFontSize: 10, titleFontSize: 12 },
      },
      y: {
        field: 'label',
        type: 'ordinal',
        sort: '-x',
        title: null,
        axis: { labelFontSize: 10 },
      },
      tooltip: [
        { field: 'label', type: 'ordinal', title: 'Kategorie' },
        { field: 'amount', type: 'quantitative', title: 'Jahresbetrag', format: ',.0f' },
        { field: 'share', type: 'quantitative', title: 'Anteil', format: '.1%' },
      ],
    },
    config: {
      font: 'Inter, system-ui, sans-serif',
      background: 'transparent',
      view: { stroke: '#d1d5db' },
      axis: { labelColor: '#111827', titleColor: '#111827' },
    },
  }

  const { spec: compiled } = vl.compile(spec)
  const view = new vega.View(vega.parse(compiled), { renderer: 'svg' })
  return view.toSVG()
}
