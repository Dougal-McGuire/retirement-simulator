// Server-only module for rendering report HTML
// This file is only imported by API routes running in Node.js

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inlineReportScript } from '@/components/report/scripts'
import { fmtDate, fmtCurrency, fmtPercent } from '@/lib/pdf-generator/formatters'
import type { ReportContent } from '@/lib/pdf-generator/reportTypes'

// Read and cache CSS at module load time
let cachedCss: string | null = null

function getReportCss(): string {
  if (cachedCss) return cachedCss

  try {
    const srcPath = join(process.cwd(), 'src/components/report/ReportPrint.module.css')
    let css = readFileSync(srcPath, 'utf-8')
    // Convert CSS module :global() syntax to regular CSS
    css = css.replace(/:global\(([^)]+)\)/g, '$1')
    cachedCss = css
  } catch {
    // Fallback minimal print styles
    cachedCss = `
      @page { size: A4; margin: 20mm 18mm 24mm; }
      @page :first { margin-top: 30mm; }
      body { font-family: Inter, system-ui, sans-serif; font-size: 12pt; line-height: 1.333; color: #111827; background: #fff; margin: 0; }
      main { display: flex; flex-direction: column; gap: 24pt; }
      h1 { font-size: 32pt; margin: 0 0 16pt; }
      h2 { font-size: 24pt; margin: 0 0 12pt; break-after: avoid; }
      h3 { font-size: 18pt; margin: 0 0 8pt; break-after: avoid; }
      p { margin: 0 0 12pt; widows: 2; orphans: 2; }
      table { width: 100%; border-collapse: collapse; margin-bottom: 16pt; break-inside: avoid; }
      th, td { text-align: left; padding: 6pt 0; border-bottom: 1px solid #e5e7eb; }
      figure { margin: 0; break-inside: avoid; }
      .card { border: 1px solid #d1d5db; border-radius: 8pt; padding: 16pt; background: #f9fafb; break-inside: avoid; }
      .gridTwo { display: grid; grid-template-columns: repeat(2, 1fr); gap: 16pt; }
      .gridThree { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16pt; }
      .surface { background: #fff; border: 1px solid #d1d5db; border-radius: 8pt; padding: 16pt; break-inside: avoid; }
      .kpiValue { font-size: 24pt; font-weight: 600; color: #111827; }
      .kpiLabel { font-size: 11pt; color: #4b5563; }
      .muted { color: #4b5563; }
      .section { display: flex; flex-direction: column; gap: 12pt; }
      .breakBeforePage { break-before: page; }
      .tocList { list-style: none; padding: 0; margin: 0; }
      .tocItem { font-size: 12pt; display: flex; align-items: baseline; }
      .tocLink { text-decoration: none; color: #111827; }
      .tocLeader { flex: 1; border-bottom: 0.75pt dotted #d1d5db; margin: 0 8pt; }
      .tocPage { color: #4b5563; min-width: 18pt; text-align: right; }
    `
  }

  return cachedCss
}

// Helper to escape HTML
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

interface RenderOptions {
  content: ReportContent
  projectionSvg: string
  breakdownSvg: string
  baseUrl?: string
}

export function renderReportHtml(options: RenderOptions): string {
  const { content, projectionSvg, breakdownSvg, baseUrl = '' } = options
  const locale = content.locale ?? 'de'
  const intlLocale = locale === 'de' ? 'de-DE' : 'en-US'
  const isGerman = locale === 'de'

  const reportDate = fmtDate(content.metadata.generatedAt, intlLocale)
  const css = getReportCss()
  const script = inlineReportScript()

  // Build TOC items
  const tocItems = [
    { id: 'zusammenfassung', label: isGerman ? 'Zusammenfassung' : 'Executive Summary' },
    { id: 'lesehinweise', label: isGerman ? 'So lesen Sie diesen Bericht' : 'How to read this report' },
    { id: 'eingaben', label: isGerman ? 'Eingaben und Annahmen' : 'Inputs and assumptions' },
    { id: 'ergebnisse', label: isGerman ? 'Simulationsergebnisse' : 'Simulation results' },
    { id: 'ausgaben', label: isGerman ? 'Ausgabenstruktur' : 'Spending structure' },
    { id: 'risiken', label: isGerman ? 'Risikoeinschätzung' : 'Risk assessment' },
    { id: 'empfehlungen', label: isGerman ? 'Empfohlene Maßnahmen' : 'Recommended actions' },
    { id: 'anhang', label: isGerman ? 'Anhang' : 'Appendix' },
  ]

  const tocHtml = tocItems
    .map(
      (item) => `
    <li class="tocItem">
      <a class="tocLink" href="#${item.id}">${escapeHtml(item.label)}</a>
      <span class="tocLeader" aria-hidden="true"></span>
      <span class="tocPage" data-toc-page data-target="#${item.id}"></span>
    </li>
  `
    )
    .join('')

  // Extract values using correct ReportContent structure
  const { profile, assumptions, projections, recommendations } = content
  const { person, success, bridge } = profile

  const html = `<!DOCTYPE html>
<html lang="${locale}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isGerman ? 'Rentenplan' : 'Retirement Plan'}</title>
  ${baseUrl ? `<base href="${baseUrl}/">` : ''}
  <style>
    @font-face {
      font-family: 'Inter';
      src: url('${baseUrl}/fonts/Inter-Regular.woff2') format('woff2');
      font-weight: 400;
      font-style: normal;
      font-display: swap;
    }
    @font-face {
      font-family: 'Inter';
      src: url('${baseUrl}/fonts/Inter-SemiBold.woff2') format('woff2');
      font-weight: 600;
      font-style: normal;
      font-display: swap;
    }
    ${css}
  </style>
</head>
<body data-locale="${locale}">
  <header aria-hidden data-print-visible data-date="${escapeHtml(reportDate)}" data-title="${isGerman ? 'Rentenplan' : 'Retirement Plan'}" data-page-label="${isGerman ? 'Seite' : 'Page'}" data-page-of="${isGerman ? 'von' : 'of'}"></header>
  <footer aria-hidden data-print-visible data-page-label="${isGerman ? 'Seite' : 'Page'}" data-page-of="${isGerman ? 'von' : 'of'}"></footer>

  <main class="reportMain" data-locale="${locale}">
    <!-- Cover -->
    <section class="cover">
      <h1>${isGerman ? 'Rentenplan' : 'Retirement Plan'}</h1>
      <div class="coverMeta">
        <p>${isGerman ? 'Erstellt am' : 'Generated on'}: ${escapeHtml(reportDate)}</p>
        <p>${isGerman ? 'Bericht-ID' : 'Report ID'}: ${escapeHtml(content.metadata.id)}</p>
      </div>
    </section>

    <!-- Executive Summary -->
    <section id="zusammenfassung" class="section breakBeforePage">
      <h2 data-toc-heading data-running-header="${isGerman ? 'Zusammenfassung' : 'Executive Summary'}">${isGerman ? 'Zusammenfassung' : 'Executive Summary'}</h2>
      <div class="gridThree">
        <div class="card">
          <span class="kpiValue">${success.score ?? 0}%</span>
          <span class="kpiLabel">${isGerman ? 'Plan-Gesundheit' : 'Plan Health'}</span>
        </div>
        <div class="card">
          <span class="kpiValue">${fmtPercent(success.successRate, 1, intlLocale)}</span>
          <span class="kpiLabel">${isGerman ? 'Erfolgswahrscheinlichkeit' : 'Success Probability'}</span>
        </div>
        <div class="card">
          <span class="kpiValue">${fmtCurrency(bridge?.cashNeedEUR ?? 0, intlLocale)}</span>
          <span class="kpiLabel">${isGerman ? 'Brückenbedarf' : 'Bridge Need'}</span>
        </div>
      </div>
      ${success.reasons.length > 0 ? `<p class="muted">${escapeHtml(success.reasons.join('. '))}</p>` : ''}
    </section>

    <!-- How to Read -->
    <section id="lesehinweise" class="section breakBeforePage">
      <h2 data-toc-heading data-running-header="${isGerman ? 'Lesehinweise' : 'How to Read'}">${isGerman ? 'So lesen Sie diesen Bericht' : 'How to read this report'}</h2>
      <p>${isGerman ? 'Dieser Bericht basiert auf Monte-Carlo-Simulationen, die verschiedene Marktszenarien modellieren.' : 'This report is based on Monte Carlo simulations modeling various market scenarios.'}</p>
    </section>

    <!-- Table of Contents -->
    <section class="section breakBeforePage">
      <h2>${isGerman ? 'Inhaltsverzeichnis' : 'Table of Contents'}</h2>
      <nav aria-label="${isGerman ? 'Inhaltsverzeichnis' : 'Table of contents'}">
        <ol class="tocList" data-toc-list>${tocHtml}</ol>
      </nav>
    </section>

    <!-- Inputs -->
    <section id="eingaben" class="section breakBeforePage">
      <h2 data-toc-heading data-running-header="${isGerman ? 'Eingaben' : 'Inputs'}">${isGerman ? 'Eingaben und Annahmen' : 'Inputs and assumptions'}</h2>
      <div class="gridTwo">
        <div class="surface">
          <h3>${isGerman ? 'Persönliche Daten' : 'Personal Data'}</h3>
          <table>
            <tbody>
              <tr><td>${isGerman ? 'Aktuelles Alter' : 'Current Age'}</td><td>${person.currentAge}</td></tr>
              <tr><td>${isGerman ? 'Rentenalter' : 'Retirement Age'}</td><td>${person.retireAge}</td></tr>
              <tr><td>${isGerman ? 'Pensionsalter' : 'Pension Age'}</td><td>${person.pensionAge}</td></tr>
              <tr><td>${isGerman ? 'Planungshorizont' : 'Planning Horizon'}</td><td>${person.horizonAge}</td></tr>
            </tbody>
          </table>
        </div>
        <div class="surface">
          <h3>${isGerman ? 'Simulationsparameter' : 'Simulation Parameters'}</h3>
          <table>
            <tbody>
              <tr><td>${isGerman ? 'Simulationsläufe' : 'Simulation Runs'}</td><td>${assumptions.simulationRuns.toLocaleString(intlLocale)}</td></tr>
              <tr><td>${isGerman ? 'Erfolgsrate' : 'Success Rate'}</td><td>${fmtPercent(success.successRate, 1, intlLocale)}</td></tr>
            </tbody>
          </table>
        </div>
      </div>
      <div class="surface">
        <h3>${isGerman ? 'Marktannahmen' : 'Market Assumptions'}</h3>
        <table>
          <tbody>
            <tr><td>${isGerman ? 'Erwartete Rendite' : 'Expected Return'}</td><td>${fmtPercent(assumptions.expectedReturn * 100, 1, intlLocale)}</td></tr>
            <tr><td>${isGerman ? 'Volatilität' : 'Volatility'}</td><td>${fmtPercent(assumptions.returnVolatility * 100, 1, intlLocale)}</td></tr>
            <tr><td>${isGerman ? 'Inflation' : 'Inflation'}</td><td>${fmtPercent(assumptions.inflation * 100, 1, intlLocale)}</td></tr>
            <tr><td>${isGerman ? 'Kapitalertragsteuer' : 'Capital Gains Tax'}</td><td>${fmtPercent(assumptions.capitalGainsTax, 1, intlLocale)}</td></tr>
          </tbody>
        </table>
      </div>
    </section>

    <!-- Results -->
    <section id="ergebnisse" class="section breakBeforePage">
      <h2 data-toc-heading data-running-header="${isGerman ? 'Ergebnisse' : 'Results'}">${isGerman ? 'Simulationsergebnisse' : 'Simulation results'}</h2>
      <figure>
        ${projectionSvg}
        <figcaption>${isGerman ? 'Vermögensentwicklung (P10-P90 Konfidenzband)' : 'Asset projection (P10-P90 confidence band)'}</figcaption>
      </figure>
      <div class="gridTwo">
        <div class="card">
          <span class="kpiValue">${fmtPercent(success.successRate, 1, intlLocale)}</span>
          <span class="kpiLabel">${isGerman ? 'Erfolgsquote' : 'Success Rate'}</span>
        </div>
        <div class="card">
          <span class="kpiValue">${projections.milestones.length}</span>
          <span class="kpiLabel">${isGerman ? 'Jahre simuliert' : 'Years simulated'}</span>
        </div>
      </div>
    </section>

    <!-- Spending -->
    <section id="ausgaben" class="section breakBeforePage">
      <h2 data-toc-heading data-running-header="${isGerman ? 'Ausgaben' : 'Spending'}">${isGerman ? 'Ausgabenstruktur' : 'Spending structure'}</h2>
      <figure>
        ${breakdownSvg}
        <figcaption>${isGerman ? 'Jährliche Ausgaben nach Kategorie' : 'Annual spending by category'}</figcaption>
      </figure>
    </section>

    <!-- Risks -->
    <section id="risiken" class="section breakBeforePage">
      <h2 data-toc-heading data-running-header="${isGerman ? 'Risiken' : 'Risks'}">${isGerman ? 'Risikoeinschätzung' : 'Risk assessment'}</h2>
      <p>${isGerman ? 'Basierend auf den Simulationsergebnissen wurden folgende Risikofaktoren identifiziert.' : 'Based on simulation results, the following risk factors were identified.'}</p>
    </section>

    <!-- Recommendations -->
    <section id="empfehlungen" class="section breakBeforePage">
      <h2 data-toc-heading data-running-header="${isGerman ? 'Empfehlungen' : 'Recommendations'}">${isGerman ? 'Empfohlene Maßnahmen' : 'Recommended actions'}</h2>
      ${
        recommendations.primary.length > 0
          ? recommendations.primary
              .map(
                (rec) => `
        <div class="surface">
          <h3>${escapeHtml(rec.title)}</h3>
          <p class="muted">${escapeHtml(rec.category)} · ${isGerman ? 'Auswirkung' : 'Impact'}: ${rec.impactLabel ?? rec.impact}</p>
          <p>${escapeHtml(rec.body)}</p>
        </div>
      `
              )
              .join('')
          : `<p class="muted">${isGerman ? 'Keine spezifischen Empfehlungen' : 'No specific recommendations'}</p>`
      }
    </section>

    <!-- Appendix -->
    <section id="anhang" class="section breakBeforePage">
      <h2 data-toc-heading data-running-header="${isGerman ? 'Anhang' : 'Appendix'}">${isGerman ? 'Anhang' : 'Appendix'}</h2>
      <p class="muted">${isGerman ? 'Technische Details und Berechnungsgrundlagen' : 'Technical details and calculation basis'}</p>
      <div class="surface">
        <h3>${isGerman ? 'Berichtsmetadaten' : 'Report Metadata'}</h3>
        <table>
          <tbody>
            <tr><td>${isGerman ? 'Bericht-ID' : 'Report ID'}</td><td>${escapeHtml(content.metadata.id)}</td></tr>
            <tr><td>${isGerman ? 'Erstellt am' : 'Generated at'}</td><td>${escapeHtml(content.metadata.generatedAt)}</td></tr>
            <tr><td>${isGerman ? 'Version' : 'Version'}</td><td>${escapeHtml(content.metadata.version ?? '1.0.0')}</td></tr>
          </tbody>
        </table>
      </div>
    </section>
  </main>

  <script>${script}</script>
</body>
</html>`

  return html
}
