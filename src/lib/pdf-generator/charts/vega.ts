import * as vega from 'vega';
import * as vl from 'vega-lite';
import type { TopLevelSpec } from 'vega-lite';

export interface ChartSeries {
  name: string;
  values: Array<{ x: number; y: number }>;
  color?: string;
}

export interface ChartOptions {
  width?: number;
  height?: number;
  xTitle?: string;
  yTitle?: string;
  title?: string;
  band?: {
    values: Array<{ x: number; yTop: number; yBottom: number }>;
    color?: string;
    opacity?: number;
  };
}

const DEFAULT_COLORS = {
  p10: '#dc2626', // --bad
  p50: '#2563eb', // --accent
  p90: '#16a34a', // --ok
  default: '#6b7280', // --ink-500
};

export async function renderLineChart(
  series: ChartSeries[],
  options: ChartOptions = {}
): Promise<string> {
  const {
    width = 560,
    height = 320,
    xTitle = 'X Axis',
    yTitle = 'Y Axis',
    title = '',
    band,
  } = options;

  // Transform series data for Vega-Lite
  const data: any[] = [];
  series.forEach((s) => {
    s.values.forEach((point) => {
      data.push({
        x: point.x,
        y: point.y,
        series: s.name,
      });
    });
  });

  // Map series colors
  const colorScale: string[] = series.map((s) => {
    if (s.color) return s.color;
    const nameLower = s.name.toLowerCase();
    if (nameLower.includes('p10')) return DEFAULT_COLORS.p10;
    if (nameLower.includes('p50')) return DEFAULT_COLORS.p50;
    if (nameLower.includes('p90')) return DEFAULT_COLORS.p90;
    return DEFAULT_COLORS.default;
  });

  const lineLayer = {
    data: { values: data },
    mark: { type: 'line', strokeWidth: 1.5, clip: true },
    encoding: {
      x: {
        field: 'x', type: 'quantitative', title: xTitle,
        axis: { labelFontSize: 10, titleFontSize: 11, grid: true, gridColor: '#e5e7eb' },
      },
      y: {
        field: 'y', type: 'quantitative', title: yTitle,
        axis: { labelFontSize: 10, titleFontSize: 11, grid: true, gridColor: '#e5e7eb', format: ',.0f' },
      },
      color: {
        field: 'series', type: 'nominal',
        scale: { domain: series.map((s) => s.name), range: colorScale },
        legend: { title: null, orient: 'bottom', labelFontSize: 10 },
      },
      strokeWidth: { condition: [{ test: "datum.series === 'P50 (Median)'", value: 3 }], value: 1.5 }
    }
  } as TopLevelSpec;

  let spec: TopLevelSpec
  if (band && band.values && band.values.length) {
    spec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width,
      height,
      title: title ? { text: title, anchor: 'start', fontSize: 14 } : undefined,
      layer: [
        {
          data: { values: band.values },
          mark: { type: 'area', opacity: band.opacity ?? 0.18, color: band.color ?? '#60a5fa' },
          encoding: {
            x: { field: 'x', type: 'quantitative', title: xTitle, axis: { labelFontSize: 10, titleFontSize: 11, grid: true, gridColor: '#e5e7eb' } },
            y: { field: 'yTop', type: 'quantitative', title: yTitle, axis: { labelFontSize: 10, titleFontSize: 11, grid: true, gridColor: '#e5e7eb', format: ',.0f' } },
            y2: { field: 'yBottom' },
          },
        },
        lineLayer as any
      ],
      config: {
        font: 'Inter, system-ui, sans-serif',
        axis: { domainColor: '#6b7280', tickColor: '#9ca3af' },
        view: { stroke: null },
        background: 'transparent',
      },
    };
  } else {
    spec = {
      $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
      width,
      height,
      title: title ? { text: title, anchor: 'start', fontSize: 14 } : undefined,
      ...(lineLayer as any),
      config: {
        font: 'Inter, system-ui, sans-serif',
        axis: { domainColor: '#6b7280', tickColor: '#9ca3af' },
        view: { stroke: null },
        background: 'transparent',
      },
    };
  }

  // Compile to Vega and render as SVG
  const vegaSpec = vl.compile(spec).spec;
  const runtime = vega.parse(vegaSpec);
  const view = new vega.View(runtime, { renderer: 'svg' });
  
  const svg = await view.toSVG();
  return svg;
}

export async function renderBarChart(
  categories: string[],
  values: number[],
  options: ChartOptions = {}
): Promise<string> {
  const {
    width = 560,
    height = 320,
    xTitle = 'Category',
    yTitle = 'Value',
    title = '',
  } = options;

  const data = categories.map((cat, i) => ({
    category: cat,
    value: values[i] || 0,
  }));

  const spec: TopLevelSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width,
    height,
    title: title ? { text: title, anchor: 'start', fontSize: 14 } : undefined,
    data: { values: data },
    mark: {
      type: 'bar',
      color: DEFAULT_COLORS.p50,
    },
    encoding: {
      x: {
        field: 'category',
        type: 'ordinal',
        title: xTitle,
        axis: {
          labelFontSize: 10,
          titleFontSize: 11,
          labelAngle: -45,
        },
      },
      y: {
        field: 'value',
        type: 'quantitative',
        title: yTitle,
        axis: {
          labelFontSize: 10,
          titleFontSize: 11,
          grid: true,
          gridColor: '#e5e7eb',
          format: ',.0f',
        },
      },
    },
    config: {
      font: 'Inter, system-ui, sans-serif',
      axis: {
        domainColor: '#6b7280',
        tickColor: '#9ca3af',
      },
      view: {
        stroke: null,
      },
      background: 'transparent',
    },
  };

  const vegaSpec = vl.compile(spec).spec;
  const runtime = vega.parse(vegaSpec);
  const view = new vega.View(runtime, { renderer: 'svg' });
  
  const svg = await view.toSVG();
  return svg;
}

export async function renderStackedAreaChart(
  series: ChartSeries[],
  options: ChartOptions = {}
): Promise<string> {
  const {
    width = 560,
    height = 320,
    xTitle = 'X Axis',
    yTitle = 'Y Axis',
    title = '',
  } = options;

  const data: any[] = [];
  series.forEach((s) => {
    s.values.forEach((point) => {
      data.push({
        x: point.x,
        y: point.y,
        category: s.name,
      });
    });
  });

  const spec: TopLevelSpec = {
    $schema: 'https://vega.github.io/schema/vega-lite/v5.json',
    width,
    height,
    title: title ? { text: title, anchor: 'start', fontSize: 14 } : undefined,
    data: { values: data },
    mark: {
      type: 'area',
      opacity: 0.7,
    },
    encoding: {
      x: {
        field: 'x',
        type: 'quantitative',
        title: xTitle,
        axis: {
          labelFontSize: 10,
          titleFontSize: 11,
          grid: true,
          gridColor: '#e5e7eb',
        },
      },
      y: {
        field: 'y',
        type: 'quantitative',
        stack: 'normalize',
        title: yTitle,
        axis: {
          labelFontSize: 10,
          titleFontSize: 11,
          grid: true,
          gridColor: '#e5e7eb',
          format: '.0%',
        },
      },
      color: {
        field: 'category',
        type: 'nominal',
        scale: {
          scheme: 'blues',
        },
        legend: {
          title: null,
          orient: 'bottom',
          labelFontSize: 10,
        },
      },
    },
    config: {
      font: 'Inter, system-ui, sans-serif',
      axis: {
        domainColor: '#6b7280',
        tickColor: '#9ca3af',
      },
      view: {
        stroke: null,
      },
      background: 'transparent',
    },
  };

  const vegaSpec = vl.compile(spec).spec;
  const runtime = vega.parse(vegaSpec);
  const view = new vega.View(runtime, { renderer: 'svg' });
  
  const svg = await view.toSVG();
  return svg;
}
