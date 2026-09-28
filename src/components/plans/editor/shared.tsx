'use client'

import { useCallback, useMemo, useState, type ReactNode } from 'react'
import type { NumberFormatOptions } from 'next-intl'
import { useFormatter, useTranslations } from 'next-intl'
import { cn } from '@/lib/utils'

/**
 * Pieces every assumption panel shares. Moved verbatim out of the old
 * `PlanEditor`; only the card chrome went, because the edit panel's header
 * now carries the group title.
 */

export const isClose = (a: number, b: number, epsilon = 0.0005) => Math.abs(a - b) <= epsilon

interface StatItem {
  label: string
  value: string
  hint?: string
}

/**
 * `stale` greys the whole strip out: while a field next to it is refusing what
 * was typed, these numbers describe the last accepted plan, not the one on
 * screen, and pretending otherwise is how "30 years in retirement" survived an
 * age change nobody committed.
 */
function StatStrip({ items, stale = false }: { items: StatItem[]; stale?: boolean }) {
  return (
    <dl className="ws-stats" data-stale={stale || undefined} aria-hidden={stale || undefined}>
      {items.map((item) => (
        <div key={item.label}>
          <dt>{item.label}</dt>
          <dd className="ws-stats-value">{item.value}</dd>
          {item.hint && <dd className="ws-stats-hint">{item.hint}</dd>}
        </div>
      ))}
    </dl>
  )
}

export function PresetRow({
  label,
  options,
  activeKey,
  onSelect,
  disabled = false,
}: {
  label: string
  options: { key: string; label: string; detail: string }[]
  activeKey?: string
  onSelect: (key: string) => void
  /** Greyed out when the active market model ignores these assumptions. */
  disabled?: boolean
}) {
  return (
    <div className="ws-field-group" aria-disabled={disabled || undefined}>
      <span className="ws-group-label">{label}</span>
      <div className="ws-choices" data-columns="3">
        {options.map((option) => {
          const isActive = option.key === activeKey
          return (
            <button
              key={option.key}
              type="button"
              aria-pressed={isActive}
              disabled={disabled}
              onClick={() => onSelect(option.key)}
              className="ws-choice"
            >
              <span className="ws-choice-title">{option.label}</span>
              <span className="ws-choice-detail">{option.detail}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * The body of one assumption panel: its stat strip, the stale note and the
 * fields. The panel header shows the title, so there is none here. `id` is
 * the stable body id (`plan-editor-personal` …) tests and deep links find.
 */
export function PanelGroupBody({
  id,
  stats,
  statsStale = false,
  statsStaleNote,
  children,
  className,
}: {
  id: string
  stats?: StatItem[]
  statsStale?: boolean
  statsStaleNote?: string
  children: ReactNode
  className?: string
}) {
  return (
    <section id={id} data-testid={id} className={cn('flex flex-col gap-6', className)}>
      {stats && stats.length > 0 && <StatStrip items={stats} stale={statsStale} />}
      {statsStale && statsStaleNote && (
        <p data-testid={`${id}-stats-stale`} className="ws-callout" data-tone="warn">
          {statsStaleNote}
        </p>
      )}
      <div id={`${id}-body`} className="flex flex-col gap-6">
        {children}
      </div>
    </section>
  )
}

/**
 * Fields currently refusing what was typed. The value that reaches the store
 * is always the last valid one, so anything derived from it has to say so
 * rather than quietly describing a plan the user has already edited away.
 * Local to its group: an invalid draft is discarded when the panel closes.
 */
export function useInvalidFields() {
  const [invalidFields, setInvalidFields] = useState<Record<string, boolean>>({})
  const markInvalid = useCallback(
    (field: string, invalid: boolean) =>
      setInvalidFields((previous) =>
        Boolean(previous[field]) === invalid ? previous : { ...previous, [field]: invalid }
      ),
    []
  )
  return { invalidFields, markInvalid }
}

/** Number formatters and the field-level refusal copy the panels share. */
export function useEditorFormat() {
  const tSetup = useTranslations('setup')
  const format = useFormatter()

  const currency = useMemo<NumberFormatOptions>(
    () => ({
      style: 'currency',
      currency: 'EUR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }),
    []
  )

  const formatCurrency = (value: number) => format.number(value, currency)
  const formatPercent = (value: number, maximumFractionDigits = 1) =>
    format.number(value, { style: 'percent', minimumFractionDigits: 0, maximumFractionDigits })
  const formatInteger = (value: number) =>
    format.number(value, { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  /** Field-level refusal copy. Always translated — never the component default. */
  const ageRange = (min: number, max: number) => tSetup('validation.ageRange', { min, max })
  const numberRange = (min: number, max: number) =>
    tSetup('validation.range', { min: formatInteger(min), max: formatInteger(max) })
  const atLeast = (min: number) => tSetup('validation.atLeast', { min: formatInteger(min) })
  const notANumber = tSetup('validation.notANumber')

  return {
    formatCurrency,
    formatPercent,
    formatInteger,
    ageRange,
    numberRange,
    atLeast,
    notANumber,
  }
}
