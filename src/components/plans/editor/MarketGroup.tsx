'use client'

import { useTranslations } from 'next-intl'
import { ArrowRight } from 'lucide-react'
import { HOUSEHOLD_TYPES, MARKET_MODELS } from '@/types'
import { InfoTip } from '@/components/ui/info-tip'
import { LabeledNumberInput } from '@/components/forms/fields/LabeledNumberInput'
import { WizardSliderField } from '@/components/forms/fields/WizardSliderField'
import { EquityGlideSparkline } from '@/components/charts/EquityGlideSparkline'
import { pensionMonthlyAtAge } from '@/lib/simulation/cashFlows'
import { annualTaxAllowance, netAnnualPension, netPensionFactor } from '@/lib/simulation/engine'
import {
  HISTORICAL_FIRST_YEAR,
  HISTORICAL_LAST_YEAR,
  HISTORICAL_PATH_COUNT,
} from '@/lib/simulation/data/historicalMarket'
import {
  useSimulationParams,
  useSimulationResults,
  useUpdateParams,
} from '@/lib/stores/simulationStore'
import { useWorkspace } from '@/components/workspace/WorkspaceProvider'
import { PanelGroupBody, PresetRow, isClose, useEditorFormat } from './shared'

export const INVESTMENT_PRESETS = [
  { key: 'defensive', values: { averageROI: 0.055, roiVolatility: 0.1 } },
  { key: 'historical', values: { averageROI: 0.075, roiVolatility: 0.15 } },
  { key: 'growth', values: { averageROI: 0.095, roiVolatility: 0.2 } },
] as const

export const INFLATION_PRESETS = [
  { key: 'low', values: { averageInflation: 0.018, inflationVolatility: 0.005 } },
  { key: 'target', values: { averageInflation: 0.025, inflationVolatility: 0.008 } },
  { key: 'elevated', values: { averageInflation: 0.035, inflationVolatility: 0.012 } },
] as const

/** Panel `market`: Markt & Steuern. */
export function MarketGroup() {
  const t = useTranslations('planEditor')
  const tSetup = useTranslations('setup')
  const tControls = useTranslations('parameterControls')
  const tTax = useTranslations('parameterControls.fields.tax')
  const tWorkspace = useTranslations('workspace.editPanel')
  const params = useSimulationParams()
  const results = useSimulationResults()
  const updateParams = useUpdateParams()
  const { openEditor } = useWorkspace()
  const { formatCurrency, formatPercent, formatInteger, numberRange, notANumber } =
    useEditorFormat()

  const realReturn = (1 + params.averageROI) / (1 + params.averageInflation) - 1
  // Historical mode takes returns, volatility and inflation from the record, so
  // those inputs are shown but inert rather than hidden — a plan's assumptions
  // should not silently vanish when you flip a switch.
  const usesHistory = params.marketModel === 'historical'
  const glideOn = params.glidePathEnabled

  const investmentPresetKey = INVESTMENT_PRESETS.find(
    (preset) =>
      isClose(params.averageROI, preset.values.averageROI) &&
      isClose(params.roiVolatility, preset.values.roiVolatility)
  )?.key

  const inflationPresetKey = INFLATION_PRESETS.find(
    (preset) =>
      isClose(params.averageInflation, preset.values.averageInflation) &&
      isClose(params.inflationVolatility, preset.values.inflationVolatility)
  )?.key

  // Tax readouts. The drag is measured by the engine over every simulated
  // future rather than re-derived here, so the number the editor promises is
  // the number the projection actually paid.
  const effectiveAllowance = annualTaxAllowance(params)
  const pensionFactor = netPensionFactor(params)
  // Every pension paying out at the statutory age — gross, and after the tax
  // on each one's taxable share.
  const pensionGrossMonthly = pensionMonthlyAtAge(
    params.cashFlows ?? [],
    params.legalRetirementAge,
    params.legalRetirementAge
  ).total
  const pensionNetMonthly = netAnnualPension(params) / 12
  const taxDrag = results?.withdrawalTaxDrag

  return (
    <PanelGroupBody
      id="plan-editor-market"
      stats={
        usesHistory
          ? [
              {
                label: tControls('fields.marketModel.label'),
                value: tControls('fields.marketModel.options.historical.label'),
                hint: `${HISTORICAL_FIRST_YEAR}–${HISTORICAL_LAST_YEAR}`,
              },
              {
                label: tControls('fields.marketModel.pathsLabel'),
                value: formatInteger(HISTORICAL_PATH_COUNT),
                hint: tControls('fields.marketModel.pathsHint'),
              },
              {
                label: tControls('fields.glidePath.label'),
                value: glideOn ? tControls('toggle.on') : tControls('toggle.off'),
                hint: glideOn
                  ? `${formatPercent(params.equityAllocationStart, 0)} → ${formatPercent(params.equityAllocationEnd, 0)}`
                  : undefined,
              },
            ]
          : [
              {
                label: t('summary.realReturn'),
                value: formatPercent(realReturn, 1),
              },
              {
                label: glideOn
                  ? tControls('fields.glidePath.equitySleeveLabel', {
                      label: tControls('fields.roiVolatility.label'),
                    })
                  : tControls('fields.roiVolatility.label'),
                value: `± ${formatPercent(params.roiVolatility)}`,
                hint: glideOn
                  ? `${formatPercent(params.equityAllocationStart, 0)} → ${formatPercent(params.equityAllocationEnd, 0)}`
                  : undefined,
              },
              {
                label: tControls('fields.simulationRuns.label'),
                value: formatInteger(params.simulationRuns),
              },
            ]
      }
    >
      <div className="ws-field-group" data-testid="market-model-switch">
        <span className="ws-group-label">{tControls('fields.marketModel.label')}</span>
        <div className="ws-choices" data-columns="2" role="group">
          {MARKET_MODELS.map((model) => {
            const isSelected = params.marketModel === model
            return (
              <button
                key={model}
                type="button"
                aria-pressed={isSelected}
                data-testid={`market-model-${model}`}
                onClick={() => updateParams({ marketModel: model })}
                className="ws-choice"
              >
                <span className="ws-choice-title">
                  {tControls(`fields.marketModel.options.${model}.label`)}
                </span>
                <span className="ws-choice-detail">
                  {tControls(`fields.marketModel.options.${model}.description`)}
                </span>
              </button>
            )
          })}
        </div>
        {usesHistory && (
          <p className="ws-callout" data-testid="market-model-historical-notice">
            {tControls('fields.marketModel.historicalNotice', {
              count: formatInteger(HISTORICAL_PATH_COUNT),
              from: HISTORICAL_FIRST_YEAR,
              to: HISTORICAL_LAST_YEAR,
            })}
          </p>
        )}
      </div>

      <PresetRow
        label={tControls('presets.investment.title')}
        activeKey={investmentPresetKey}
        disabled={usesHistory}
        options={INVESTMENT_PRESETS.map((preset) => ({
          key: preset.key,
          label: tControls(`presets.investment.items.${preset.key}.name`),
          detail: `${formatPercent(preset.values.averageROI)} · σ ${formatPercent(preset.values.roiVolatility)}`,
        }))}
        onSelect={(key) => {
          const preset = INVESTMENT_PRESETS.find((entry) => entry.key === key)
          if (preset) updateParams({ ...preset.values })
        }}
      />

      <div className="grid gap-x-5 gap-y-6 @md:grid-cols-2">
        <WizardSliderField
          id="editor-averageROI"
          disabled={usesHistory}
          label={
            glideOn
              ? tControls('fields.glidePath.equitySleeveLabel', {
                  label: tSetup('market.averageROI.label'),
                })
              : tSetup('market.averageROI.label')
          }
          value={params.averageROI * 100}
          onValueChange={(value) => updateParams({ averageROI: value / 100 })}
          min={3}
          max={12}
          step={0.25}
          valueLabel={formatPercent(params.averageROI, 2)}
          minLabel={formatPercent(0.03, 0)}
          maxLabel={formatPercent(0.12, 0)}
        />
        <WizardSliderField
          id="editor-roiVolatility"
          disabled={usesHistory}
          label={
            glideOn
              ? tControls('fields.glidePath.equitySleeveLabel', {
                  label: tControls('fields.roiVolatility.label'),
                })
              : tControls('fields.roiVolatility.label')
          }
          value={params.roiVolatility * 100}
          onValueChange={(value) => updateParams({ roiVolatility: value / 100 })}
          min={2}
          max={25}
          step={0.5}
          valueLabel={formatPercent(params.roiVolatility, 1)}
          minLabel={formatPercent(0.02, 0)}
          maxLabel={formatPercent(0.25, 0)}
          helpText={tControls('fields.roiVolatility.range', {
            range: '68%',
            lower: formatPercent(params.averageROI - params.roiVolatility),
            upper: formatPercent(params.averageROI + params.roiVolatility),
          })}
          helpPlacement="inline"
        />
      </div>

      <div className="ws-subsection" data-testid="glide-path-block">
        <div className="ws-subsection-head">
          <div className="ws-subsection-title">
            <h3>{tControls('fields.glidePath.label')}</h3>
            <InfoTip
              content={tControls('fields.glidePath.description')}
              label={tControls('fields.glidePath.label')}
              side="bottom"
            />
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={glideOn}
            data-testid="glide-path-toggle"
            onClick={() => updateParams({ glidePathEnabled: !glideOn })}
            className="ws-switch"
          >
            <span aria-hidden="true" className="ws-switch-track" />
            {glideOn ? tControls('toggle.on') : tControls('toggle.off')}
          </button>
        </div>

        {glideOn && (
          <>
            <div className="grid gap-x-5 gap-y-6 @md:grid-cols-2">
              <WizardSliderField
                id="editor-equityAllocationStart"
                label={tControls('fields.glidePath.start')}
                value={Math.round(params.equityAllocationStart * 100)}
                onValueChange={(value) => updateParams({ equityAllocationStart: value / 100 })}
                min={0}
                max={100}
                step={5}
                valueLabel={formatPercent(params.equityAllocationStart, 0)}
                minLabel={formatPercent(0, 0)}
                maxLabel={formatPercent(1, 0)}
              />
              <WizardSliderField
                id="editor-equityAllocationEnd"
                label={tControls('fields.glidePath.end')}
                value={Math.round(params.equityAllocationEnd * 100)}
                onValueChange={(value) => updateParams({ equityAllocationEnd: value / 100 })}
                min={0}
                max={100}
                step={5}
                valueLabel={formatPercent(params.equityAllocationEnd, 0)}
                minLabel={formatPercent(0, 0)}
                maxLabel={formatPercent(1, 0)}
              />
            </div>

            <EquityGlideSparkline
              params={params}
              label={tControls('fields.glidePath.sparklineLabel')}
              caption={tControls('fields.glidePath.sparklineCaption', {
                start: formatPercent(params.equityAllocationStart, 0),
                startAge: params.currentAge,
                end: formatPercent(params.equityAllocationEnd, 0),
                retirementAge: Math.max(params.currentAge, params.retirementAge),
              })}
            />

            <details className="ws-disclosure">
              <summary>{tControls('fields.glidePath.advanced')}</summary>
              <div className="ws-disclosure-body grid gap-x-5 gap-y-6 @md:grid-cols-2">
                <LabeledNumberInput
                  id="editor-bondReturn"
                  disabled={usesHistory}
                  label={tControls('fields.glidePath.bondReturn')}
                  value={Number((params.bondReturn * 100).toFixed(2))}
                  onChange={(value) => updateParams({ bondReturn: value / 100 })}
                  className="w-full"
                  unit={tSetup('units.percentPerYear')}
                  min={-5}
                  max={15}
                  rangeMessage={numberRange(-5, 15)}
                  invalidMessage={notANumber}
                />
                <LabeledNumberInput
                  id="editor-bondVolatility"
                  disabled={usesHistory}
                  label={tControls('fields.glidePath.bondVolatility')}
                  value={Number((params.bondVolatility * 100).toFixed(2))}
                  onChange={(value) => updateParams({ bondVolatility: value / 100 })}
                  className="w-full"
                  unit="%"
                  min={0}
                  max={30}
                  rangeMessage={numberRange(0, 30)}
                  invalidMessage={notANumber}
                />
              </div>
              <p className="ws-subsection-note" style={{ paddingBottom: 16 }}>
                {usesHistory
                  ? tControls('fields.glidePath.historicalNote')
                  : tControls('fields.glidePath.correlationNote')}
              </p>
            </details>
          </>
        )}
      </div>

      <PresetRow
        label={tControls('presets.inflation.title')}
        activeKey={inflationPresetKey}
        disabled={usesHistory}
        options={INFLATION_PRESETS.map((preset) => ({
          key: preset.key,
          label: tControls(`presets.inflation.items.${preset.key}.name`),
          detail: `${formatPercent(preset.values.averageInflation)} · σ ${formatPercent(preset.values.inflationVolatility)}`,
        }))}
        onSelect={(key) => {
          const preset = INFLATION_PRESETS.find((entry) => entry.key === key)
          if (preset) updateParams({ ...preset.values })
        }}
      />

      <div className="grid gap-x-5 gap-y-6 @md:grid-cols-2">
        <WizardSliderField
          id="editor-averageInflation"
          disabled={usesHistory}
          label={tSetup('market.averageInflation.label')}
          value={params.averageInflation * 100}
          onValueChange={(value) => updateParams({ averageInflation: value / 100 })}
          min={1}
          max={6}
          step={0.1}
          valueLabel={formatPercent(params.averageInflation, 1)}
          minLabel={formatPercent(0.01, 0)}
          maxLabel={formatPercent(0.06, 0)}
        />
        <WizardSliderField
          id="editor-inflationVolatility"
          disabled={usesHistory}
          label={tControls('fields.inflationVolatility.label')}
          value={params.inflationVolatility * 100}
          onValueChange={(value) => updateParams({ inflationVolatility: value / 100 })}
          min={0.1}
          max={3}
          step={0.1}
          valueLabel={formatPercent(params.inflationVolatility, 2)}
          minLabel={formatPercent(0.001, 1)}
          maxLabel={formatPercent(0.03, 0)}
        />
        <LabeledNumberInput
          id="editor-simulationRuns"
          disabled={usesHistory}
          label={tControls('fields.simulationRuns.label')}
          value={params.simulationRuns}
          onChange={(value) => updateParams({ simulationRuns: value })}
          helpText={
            usesHistory
              ? tControls('fields.marketModel.runsIgnored', {
                  count: formatInteger(HISTORICAL_PATH_COUNT),
                })
              : tControls('fields.simulationRuns.tooltip')
          }
          helpPlacement={usesHistory ? 'inline' : 'tooltip'}
          className="w-full"
          groupThousands
          min={100}
          max={10000}
          rangeMessage={numberRange(100, 10000)}
          invalidMessage={notANumber}
        />
      </div>

      <div className="ws-subsection" data-testid="tax-block">
        <div className="ws-subsection-title">
          <h3>{tTax('title')}</h3>
          <InfoTip content={tTax('description')} label={tTax('title')} side="bottom" />
        </div>

        <div className="grid gap-x-5 gap-y-6 @md:grid-cols-2">
          <LabeledNumberInput
            id="editor-capitalGainsTax"
            label={tControls('fields.capitalGainsTax.label')}
            value={params.capitalGainsTax}
            onChange={(value) => updateParams({ capitalGainsTax: value })}
            helpText={tControls('fields.capitalGainsTax.tooltip')}
            className="w-full"
            unit="%"
            min={0}
            max={50}
            rangeMessage={numberRange(0, 50)}
            invalidMessage={notANumber}
          />
          <LabeledNumberInput
            id="editor-taxAllowanceAnnual"
            label={tTax('allowance.label')}
            value={params.taxAllowanceAnnual}
            onChange={(value) => updateParams({ taxAllowanceAnnual: value })}
            helpText={tTax('allowance.help')}
            className="w-full"
            unit={tSetup('units.currency')}
            groupThousands
            min={0}
            max={10000}
            rangeMessage={numberRange(0, 10000)}
            invalidMessage={notANumber}
          />
        </div>

        <div className="ws-field-group" data-testid="household-type-switch">
          <span className="ws-group-label">{tTax('household.label')}</span>
          <div className="ws-choices" data-columns="2" role="group">
            {HOUSEHOLD_TYPES.map((type) => {
              const isSelected = params.householdType === type
              return (
                <button
                  key={type}
                  type="button"
                  aria-pressed={isSelected}
                  data-testid={`household-type-${type}`}
                  onClick={() => updateParams({ householdType: type })}
                  className="ws-choice"
                >
                  <span className="ws-choice-title">
                    {tTax(`household.options.${type}.label`)}
                  </span>
                  <span className="ws-choice-detail">
                    {tTax(`household.options.${type}.description`)}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="ws-subsection-note">
            {tTax('allowance.effective', { amount: formatCurrency(effectiveAllowance) })}
          </p>
        </div>

        <WizardSliderField
          id="editor-equityFundExemption"
          label={tTax('exemption.label')}
          value={Math.round(params.equityFundExemption * 100)}
          onValueChange={(value) => updateParams({ equityFundExemption: value / 100 })}
          min={0}
          max={50}
          step={5}
          valueLabel={formatPercent(params.equityFundExemption, 0)}
          minLabel={formatPercent(0, 0)}
          maxLabel={formatPercent(0.5, 0)}
          helpText={tTax('exemption.help')}
        />

        <details className="ws-disclosure">
          <summary>{tTax('pension.summary')}</summary>
          <div className="ws-disclosure-body grid gap-x-5 gap-y-6 @md:grid-cols-2">
            <LabeledNumberInput
              id="editor-pensionTaxablePortion"
              label={tTax('pension.taxablePortion.label')}
              value={Number((params.pensionTaxablePortion * 100).toFixed(1))}
              onChange={(value) => updateParams({ pensionTaxablePortion: value / 100 })}
              helpText={tTax('pension.taxablePortion.help')}
              className="w-full"
              unit="%"
              min={0}
              max={100}
              rangeMessage={numberRange(0, 100)}
              invalidMessage={notANumber}
            />
            <LabeledNumberInput
              id="editor-pensionTaxRate"
              label={tTax('pension.rate.label')}
              value={Number((params.pensionTaxRate * 100).toFixed(1))}
              onChange={(value) => updateParams({ pensionTaxRate: value / 100 })}
              helpText={tTax('pension.rate.help')}
              className="w-full"
              unit="%"
              min={0}
              max={50}
              rangeMessage={numberRange(0, 50)}
              invalidMessage={notANumber}
            />
          </div>
          <p
            className="ws-subsection-note"
            style={{ paddingBottom: 16 }}
            data-testid="pension-net-readout"
          >
            {tTax('pension.net', {
              gross: formatCurrency(pensionGrossMonthly),
              net: formatCurrency(pensionNetMonthly),
              rate: formatPercent(
                pensionGrossMonthly > 0 ? pensionNetMonthly / pensionGrossMonthly : pensionFactor,
                1
              ),
            })}
          </p>
        </details>

        <p className="ws-callout" data-testid="tax-drag-readout">
          <strong>{tTax('drag.label')}: </strong>
          {taxDrag === undefined
            ? tTax('drag.empty')
            : `${tTax('drag.value', { rate: formatPercent(taxDrag, 1) })} — ${tTax('drag.hint')}`}
        </p>
      </div>

      {/* The withdrawal rule has its own section on the page (Entnahme): the
          corridor, the readouts and the four-strategy comparison do not fit in
          a side panel. The pointer goes there; `openEditor` closes the panel
          itself without returning focus to the Market card, which would
          otherwise race the jump for focus. */}
      <button
        type="button"
        className="ws-pointer"
        onClick={() => openEditor({ section: 'withdrawal' })}
      >
        <span>
          {t('groups.withdrawal.pointer', {
            strategy: tControls(
              `fields.withdrawalStrategy.options.${params.withdrawalStrategy}.label`
            ),
          })}
        </span>
        <span className="ws-pointer-link">
          {tWorkspace('toWithdrawal')}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </button>
    </PanelGroupBody>
  )
}
