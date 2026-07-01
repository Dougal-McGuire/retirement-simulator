#!/usr/bin/env ts-node
import { readFile, writeFile } from 'fs/promises'
import { Command } from 'commander'
import { transformToReportData } from '../src/lib/transformers/reportDataTransformer'
import { ReportDataSchema, type ReportData } from '../src/lib/pdf-generator/schema/reportData'
import type { SimulationParams, SimulationResults } from '../src/types'

interface RawInput {
  params?: SimulationParams
  results?: SimulationResults
  reportData?: unknown
}

type NumericParamKey = keyof Omit<
  SimulationParams,
  'customExpenses' | 'oneTimeIncomes' | 'withdrawalStrategy'
>

const numericParamKeys = [
  'currentAge',
  'retirementAge',
  'legalRetirementAge',
  'endAge',
  'currentAssets',
  'annualSavings',
  'annualSavingsGrowthRate',
  'monthlyPension',
  'averageROI',
  'roiVolatility',
  'averageInflation',
  'inflationVolatility',
  'capitalGainsTax',
  'dsWithdrawalRate',
  'dsCeilingRate',
  'dsFloorRate',
  'simulationRuns',
] satisfies NumericParamKey[]

const percentileKeys = ['p10', 'p20', 'p50', 'p80', 'p90'] satisfies Array<
  keyof SimulationResults['assetPercentiles']
>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const isFiniteNumberArray = (value: unknown): value is number[] =>
  Array.isArray(value) && value.every(isFiniteNumber)

const isSimulationParams = (value: unknown): value is SimulationParams => {
  if (!isRecord(value)) return false

  return (
    numericParamKeys.every((key) => isFiniteNumber(value[key])) &&
    Array.isArray(value.oneTimeIncomes) &&
    value.oneTimeIncomes.every(
      (income) =>
        isRecord(income) &&
        isFiniteNumber(income.age) &&
        isFiniteNumber(income.amount) &&
        typeof income.name === 'string'
    ) &&
    Array.isArray(value.customExpenses) &&
    value.customExpenses.every(
      (expense) =>
        isRecord(expense) &&
        typeof expense.id === 'string' &&
        typeof expense.name === 'string' &&
        isFiniteNumber(expense.amount) &&
        (expense.interval === 'monthly' || expense.interval === 'annual')
    ) &&
    (value.withdrawalStrategy === 'fixedReal' || value.withdrawalStrategy === 'vanguardDynamic')
  )
}

const isPercentileData = (value: unknown): value is SimulationResults['assetPercentiles'] =>
  isRecord(value) && percentileKeys.every((key) => isFiniteNumberArray(value[key]))

const isSimulationResults = (value: unknown): value is SimulationResults =>
  isRecord(value) &&
  isFiniteNumberArray(value.ages) &&
  isPercentileData(value.assetPercentiles) &&
  isPercentileData(value.spendingPercentiles) &&
  isFiniteNumber(value.successRate) &&
  isSimulationParams(value.params)

const hasSimulationPayload = (
  input: RawInput
): input is RawInput & { params: SimulationParams; results: SimulationResults } =>
  isSimulationParams(input.params) && isSimulationResults(input.results)

const program = new Command()
  .name('generateReportPdf')
  .description('Erzeugt einen PDF-Rentenplan über die API /api/generate-pdf')
  .requiredOption('-i, --input <file>', 'Pfad zur JSON-Datei mit Simulationsergebnis')
  .option('-o, --output <file>', 'Zielfile für das PDF', 'report.pdf')
  .option('-b, --base-url <url>', 'Basis-URL des Next.js-Servers', 'http://localhost:3000')
  .option('-l, --locale <locale>', 'Sprache des Berichts (de oder en)', 'de')
  .parse(process.argv)

const options = program.opts<{ input: string; output: string; baseUrl: string; locale: string }>()

async function loadReportData(): Promise<ReportData> {
  const rawContent = await readFile(options.input, 'utf-8')
  const parsed: RawInput = JSON.parse(rawContent)

  if (parsed.reportData) {
    return ReportDataSchema.parse(parsed.reportData)
  }

  if (parsed.params || parsed.results) {
    if (!hasSimulationPayload(parsed)) {
      throw new Error('JSON params/results haben nicht das erwartete Simulationsformat')
    }

    const transformed = transformToReportData(parsed.params, parsed.results)
    return ReportDataSchema.parse(transformed)
  }

  throw new Error('JSON muss entweder reportData oder params/results enthalten')
}

async function run() {
  const reportData = await loadReportData()
  const baseUrl = options.baseUrl.replace(/\/?$/, '')

  const response = await fetch(`${baseUrl}/api/generate-pdf`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportData: { ...reportData, locale: options.locale } }),
  })

  if (!response.ok) {
    let details: unknown = null
    try {
      details = await response.json()
    } catch (error) {
      console.error('Antwort konnte nicht geparst werden:', error)
    }
    throw new Error(`API-Fehler (${response.status}): ${JSON.stringify(details)}`)
  }

  const buffer = Buffer.from(await response.arrayBuffer())
  await writeFile(options.output, buffer)
  console.log(`PDF gespeichert unter ${options.output}`)
}

run().catch((error) => {
  console.error('Fehler bei der PDF-Erzeugung:', error)
  process.exitCode = 1
})
