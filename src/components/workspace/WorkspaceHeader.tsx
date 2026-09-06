'use client'

import { useTranslations } from 'next-intl'
import { Play, Save } from 'lucide-react'
import {
  useActivePlanId,
  usePlanIsDirty,
  usePlans,
  useSavePlanDraft,
  useSetActivePlan,
} from '@/lib/stores/simulationStore'
import { useDisplayReal, useSetDisplayReal } from '@/lib/stores/displayStore'
import { planDisplayName } from '@/lib/plans/planName'
import { DashboardTools } from '@/components/simulation-compact/DashboardTools'
import type { SimulationResults } from '@/types'

export function WorkspaceHeader({
  results,
  loading,
  onRun,
}: {
  results: SimulationResults | null
  loading: boolean
  onRun: () => void
}) {
  const t = useTranslations('workspace')
  const tp = useTranslations('plans')
  const tc = useTranslations('simulationCompact.commandBar')
  const plans = usePlans()
  const active = useActivePlanId()
  const setActive = useSetActivePlan()
  const dirty = usePlanIsDirty()
  const save = useSavePlanDraft()
  return (
    <header className="workspace-toolbar">
      <label className="workspace-plan-picker">
        <span>{t('activePlan')}</span>
        <select
          aria-label={tc('planAria')}
          value={active}
          onChange={(event) => {
            if (event.target.value === active) return
            if (dirty && !window.confirm(tc('unsavedSwitch'))) return
            setActive(event.target.value)
          }}
        >
          {plans.map((plan) => (
            <option key={plan.id} value={plan.id}>
              {planDisplayName(plan, tp)}
            </option>
          ))}
        </select>
      </label>
      <span className="workspace-save-status">{t(dirty ? 'unsaved' : 'saved')}</span>
      <div className="workspace-actions">
        <button
          className="workspace-button"
          data-testid="command-save"
          disabled={!dirty}
          onClick={() => save()}
        >
          <Save size={17} aria-hidden="true" />
          {tc('saveButton')}
        </button>
        <button
          className="workspace-button workspace-button-primary"
          data-testid="run-button"
          disabled={loading}
          onClick={onRun}
        >
          <Play size={16} aria-hidden="true" />
          {t(loading ? 'computing' : 'calculate')}
        </button>
        <DashboardTools results={results} isLoading={loading} />
      </div>
    </header>
  )
}

export function EuroDisplay() {
  const t = useTranslations('simulation.display')
  const real = useDisplayReal()
  const setReal = useSetDisplayReal()
  return (
    <div
      className="workspace-euro"
      role="radiogroup"
      aria-label={t('label')}
      data-testid="display-toggle"
    >
      {[false, true].map((value) => (
        <button
          key={String(value)}
          role="radio"
          aria-checked={real === value}
          onClick={() => setReal(value)}
        >
          {t(value ? 'real' : 'nominal')}
        </button>
      ))}
    </div>
  )
}
