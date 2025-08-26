import puppeteer from 'puppeteer';
import Handlebars from 'handlebars';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { program } from 'commander';
import { ReportDataSchema, type ReportData, DEFAULT_REPORT_DATA } from './schema/reportData.js';
import { renderLineChart, renderBarChart, type ChartSeries } from './charts/vega.js';
import * as formatters from './utils/formatters.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Register Handlebars helpers
Object.entries(formatters).forEach(([name, fn]) => {
  Handlebars.registerHelper(name, fn);
});

// Add eq helper for equality comparison
Handlebars.registerHelper('eq', (a: any, b: any) => a === b);

// Register Handlebars partials
const kpiTilePartial = readFileSync(
  join(__dirname, 'templates', 'components', 'kpi-tile.hbs'),
  'utf-8'
);
Handlebars.registerPartial('kpi-tile', kpiTilePartial);

async function generateCharts(data: ReportData) {
  // Assets projection chart
  const assetsSeries: ChartSeries[] = [
    {
      name: 'P10 (Pessimistic)',
      values: data.projections.milestones.map(m => ({ x: m.age, y: m.p10 })),
    },
    {
      name: 'P50 (Median)',
      values: data.projections.milestones.map(m => ({ x: m.age, y: m.p50 })),
    },
    {
      name: 'P90 (Optimistic)',
      values: data.projections.milestones.map(m => ({ x: m.age, y: m.p90 })),
    },
  ];

  const assetsChart = await renderLineChart(assetsSeries, {
    width: 560,
    height: 320,
    xTitle: 'Age (Years)',
    yTitle: 'Portfolio Value (€)',
  });

  // Spending breakdown chart
  const spendingCategories = [
    'Healthcare',
    'Food & Groceries',
    'Entertainment',
    'Shopping',
    'Utilities',
    'Vacations',
    'Home Repairs',
    'Car',
  ];

  const spendingValues = [
    data.spending.monthly.health * 12,
    data.spending.monthly.food * 12,
    data.spending.monthly.entertainment * 12,
    data.spending.monthly.shopping * 12,
    data.spending.monthly.utilities * 12,
    data.spending.annual.vacations,
    data.spending.annual.homeRepairs,
    data.spending.annual.car,
  ];

  const spendingChart = await renderBarChart(spendingCategories, spendingValues, {
    width: 560,
    height: 320,
    xTitle: 'Expense Category',
    yTitle: 'Annual Amount (€)',
  });

  return {
    assetsChart,
    spendingChart,
  };
}

async function loadTemplates() {
  const baseTemplate = readFileSync(join(__dirname, 'templates', 'base.html'), 'utf-8');
  const coverTemplate = readFileSync(join(__dirname, 'templates', 'cover.hbs'), 'utf-8');
  const tocTemplate = readFileSync(join(__dirname, 'templates', 'toc.hbs'), 'utf-8');
  const execTemplate = readFileSync(join(__dirname, 'templates', 'section-exec.hbs'), 'utf-8');
  const profileTemplate = readFileSync(join(__dirname, 'templates', 'section-profile.hbs'), 'utf-8');
  const assetsTemplate = readFileSync(join(__dirname, 'templates', 'section-assets.hbs'), 'utf-8');
  const spendingTemplate = readFileSync(join(__dirname, 'templates', 'section-spending.hbs'), 'utf-8');
  const riskTemplate = readFileSync(join(__dirname, 'templates', 'section-risk.hbs'), 'utf-8');
  const recosTemplate = readFileSync(join(__dirname, 'templates', 'section-recos.hbs'), 'utf-8');
  const appendixTemplate = readFileSync(join(__dirname, 'templates', 'section-appendix.hbs'), 'utf-8');

  return {
    base: Handlebars.compile(baseTemplate),
    cover: Handlebars.compile(coverTemplate),
    toc: Handlebars.compile(tocTemplate),
    exec: Handlebars.compile(execTemplate),
    profile: Handlebars.compile(profileTemplate),
    assets: Handlebars.compile(assetsTemplate),
    spending: Handlebars.compile(spendingTemplate),
    risk: Handlebars.compile(riskTemplate),
    recos: Handlebars.compile(recosTemplate),
    appendix: Handlebars.compile(appendixTemplate),
  };
}

async function renderPDF(data: ReportData, outputPath: string) {
  console.log('🚀 Starting PDF generation...');
  
  // Validate and transform data
  const validatedData = ReportDataSchema.parse(data);
  
  // Check if tax rate was adjusted
  const originalTaxRate = (data.assumptions as any).capGainsTaxRatePct;
  const taxRateAdjusted = originalTaxRate > 100;
  
  // Load templates
  console.log('📄 Loading templates...');
  const templates = await loadTemplates();
  
  // Generate charts
  console.log('📊 Generating charts...');
  const charts = await generateCharts(validatedData);
  
  // Load CSS
  const tokensCSS = readFileSync(join(__dirname, 'styles', 'tokens.css'), 'utf-8');
  const printCSS = readFileSync(join(__dirname, 'styles', 'print.css'), 'utf-8');
  const combinedCSS = tokensCSS + '\n' + printCSS;
  
  // Render sections
  console.log('🔨 Rendering sections...');
  const sections = [
    templates.cover(validatedData),
    templates.toc(validatedData),
    templates.exec(validatedData),
    templates.profile({ ...validatedData, taxRateAdjusted }),
    templates.assets({ ...validatedData, ...charts }),
    templates.spending({ ...validatedData, ...charts }),
    templates.risk(validatedData),
    templates.recos(validatedData),
    templates.appendix(validatedData),
  ].join('\n');
  
  // Render full HTML
  const html = templates.base({
    css: combinedCSS,
    content: sections,
    reportDate: new Date().toLocaleDateString('de-DE'),
  });
  
  // Launch Puppeteer
  console.log('🌐 Launching browser...');
  const browser = await puppeteer.launch({
    headless: true,
    executablePath: '/usr/bin/chromium-browser', // Use system Chrome/Chromium
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  });
  
  const page = await browser.newPage();
  
  // Set viewport and media type
  await page.setViewport({ width: 794, height: 1123 }); // A4 in pixels at 96 DPI
  await page.emulateMediaType('print');
  
  // Load HTML with local file access
  console.log('📝 Loading HTML content...');
  await page.setContent(html, {
    waitUntil: 'networkidle0',
  });
  
  // Skip Paged.js for now - CSS will handle page breaks
  console.log('📖 Skipping Paged.js, using CSS page breaks...');
  
  // Generate PDF
  console.log('📄 Generating PDF...');
  
  // Ensure output directory exists
  const outputDir = dirname(outputPath);
  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true });
  }
  
  await page.pdf({
    path: outputPath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: false, // We handle this in CSS
    margin: {
      top: '0',
      right: '0',
      bottom: '0',
      left: '0',
    },
  });
  
  await browser.close();
  
  console.log(`✅ PDF generated successfully: ${outputPath}`);
}

// CLI setup
program
  .name('retirement-report-generator')
  .description('Generate professional PDF reports for retirement planning')
  .version('1.0.0')
  .requiredOption('-d, --data <path>', 'Path to JSON data file')
  .requiredOption('-o, --out <path>', 'Output PDF path')
  .action(async (options) => {
    try {
      // Load data
      const dataPath = options.data;
      const outputPath = options.out;
      
      if (!existsSync(dataPath)) {
        console.error(`❌ Data file not found: ${dataPath}`);
        process.exit(1);
      }
      
      const rawData = readFileSync(dataPath, 'utf-8');
      const data = JSON.parse(rawData);
      
      // Merge with defaults
      const mergedData = {
        ...DEFAULT_REPORT_DATA,
        ...data,
        metadata: {
          reportId: `RPT-${Date.now()}`,
          generatedAt: new Date().toISOString(),
          version: '1.0.0',
          ...data.metadata,
        },
      };
      
      // Generate PDF
      await renderPDF(mergedData as ReportData, outputPath);
    } catch (error) {
      console.error('❌ Error generating PDF:', error);
      process.exit(1);
    }
  });

program.parse();