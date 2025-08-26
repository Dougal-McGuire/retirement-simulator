# Retirement Report PDF Generator

Professional PDF report generator for retirement planning with clean typography and consistent design.

## Setup

```bash
cd pdf-generator
npm install
```

## Generate PDF

```bash
npm run build:pdf
```

This will generate a PDF at `dist/report.pdf` using the sample data.

## Features

- **Clean Typography**: Consistent font scales and spacing using design tokens
- **Professional Layout**: A4 format with proper margins and page breaks
- **Data Validation**: Automatic correction of invalid inputs (e.g., 2625% tax rate → 26.25%)
- **SVG Charts**: Crisp vector graphics for all visualizations
- **Proper Formatting**: German/European number formatting (1.234.567 €)
- **Table of Contents**: Auto-generated with page numbers
- **Running Headers/Footers**: Section titles and page numbers on every page

## Data Corrections

The system automatically validates and corrects suspicious data:
- Capital gains tax rates >100% are divided by 100 (assumes percentage entry error)
- All values are clamped to reasonable ranges
- Invalid data triggers footnotes explaining the correction

## Project Structure

```
pdf-generator/
├── src/
│   ├── render.ts           # Main Puppeteer renderer
│   ├── schema/             # Zod validation schemas
│   ├── templates/          # Handlebars templates
│   ├── styles/             # CSS (tokens + print)
│   ├── charts/             # Vega-Lite chart generators
│   └── utils/              # Formatters and helpers
├── assets/
│   └── fonts/              # Embedded WOFF2 fonts
└── sample.json             # Sample data file
```