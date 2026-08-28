'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useSimulationParams, useUpdateParams } from '@/lib/stores/simulationStore'
import { InlineSlider } from './InlineSlider'

interface AdvancedParamsPanelProps {
  /** Switches to the Plan tab for everything this row doesn't carry. */
  onOpenFullEditor: () => void
}

/**
 * The collapsible advanced-parameter row behind the command bar's
 * "Advanced ▸" (a compact-UX extra the design settled on). Only the levers
 * worth scrubbing live here; everything else is one click away in the full
 * plan editor.
 */
export function AdvancedParamsPanel({ onOpenFullEditor }: AdvancedParamsPanelProps) {
  const t = useTranslations('simulationCompact.advanced')
  const format = useFormatter()
  const params = useSimulationParams()
  const updateParams = useUpdateParams()

  const percent = (value: number, digits = 1) =>
    format.number(value, { style: 'percent', maximumFractionDigits: digits })
  const currency = (value: number) =>
    format.number(value, {
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })

  return (
    <div
      data-testid="advanced-params"
      style={{
        display: 'flex',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '8px 18px',
        padding: '7px 14px',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--line)',
        boxShadow: 'var(--shadow-sm)',
      }}
    >
      <InlineSlider
        width={190}
        label={t('volatility')}
        ariaLabel={t('volatilityAria')}
        value={params.roiVolatility}
        min={0}
        max={0.3}
        step={0.005}
        formattedValue={percent(params.roiVolatility)}
        onChange={(value) => updateParams({ roiVolatility: value })}
      />
      <InlineSlider
        width={190}
        label={t('inflation')}
        ariaLabel={t('inflationAria')}
        value={params.averageInflation}
        min={0}
        max={0.06}
        step={0.001}
        formattedValue={percent(params.averageInflation)}
        onChange={(value) => updateParams({ averageInflation: value })}
      />
      <InlineSlider
        width={210}
        label={t('pension')}
        ariaLabel={t('pensionAria')}
        value={params.monthlyPension}
        min={0}
        max={Math.max(8000, Math.ceil((params.monthlyPension * 2) / 500) * 500)}
        step={100}
        formattedValue={currency(params.monthlyPension)}
        onChange={(value) => updateParams({ monthlyPension: value })}
      />
      <InlineSlider
        width={150}
        label={t('endAge')}
        ariaLabel={t('endAgeAria')}
        value={params.endAge}
        min={Math.max(params.retirementAge + 1, 75)}
        max={105}
        step={1}
        formattedValue={format.number(params.endAge)}
        onChange={(value) => updateParams({ endAge: value })}
      />
      <InlineSlider
        width={160}
        label={t('runs')}
        ariaLabel={t('runsAria')}
        value={params.simulationRuns}
        min={100}
        max={5000}
        step={100}
        formattedValue={format.number(params.simulationRuns)}
        onChange={(value) => updateParams({ simulationRuns: value })}
      />
      <label
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--text-label)',
          cursor: 'pointer',
          whiteSpace: 'nowrap',
        }}
      >
        <input
          type="checkbox"
          checked={params.glidePathEnabled}
          onChange={(event) => updateParams({ glidePathEnabled: event.target.checked })}
          style={{ accentColor: 'var(--accent)', margin: 0 }}
        />
        {t('glidePath', {
          start: percent(params.equityAllocationStart, 0),
          end: percent(params.equityAllocationEnd, 0),
        })}
      </label>
      <div style={{ flex: 1 }} />
      <button
        type="button"
        className="ds-btn ds-btn--outline ds-btn--sm"
        onClick={onOpenFullEditor}
      >
        {t('editFullPlan')}
      </button>
    </div>
  )
}
