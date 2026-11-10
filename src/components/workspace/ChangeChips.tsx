'use client'

import { memo, useState } from 'react'
import { useTranslations } from 'next-intl'
import { ChevronDown, X } from 'lucide-react'
import type { DraftChange } from '@/lib/simulation/draftChanges'
import { usePlanIsDirty } from '@/lib/stores/simulationStore'
import { Popover } from './Popover'
import type { PanelMode } from './usePanelMode'
import { revertDraftChange, useChangeLabel, useDraftChanges } from './useDraftChanges'
import { useWorkspace } from './WorkspaceProvider'

/**
 * How many chips the head shows before it folds the rest into "+n": three
 * beside the column, two where the drawer lies over the canvas, one on a
 * phone — as many as stay readable on the row's one line.
 */
const HEAD_CHIP_LIMIT: Record<PanelMode, number> = { docked: 3, drawer: 2, sheet: 1 }

/** One change with its ✕: taking it back writes the working copy, like any edit. */
function ChangeChip({ change, label }: { change: DraftChange; label: string }) {
  const t = useTranslations('workspace.changes')
  return (
    <li className="ws-chip" data-testid="change-chip" data-change={change.id}>
      <span className="ws-chip-label" title={label}>
        {label}
      </span>
      <button
        type="button"
        className="ws-chip-x"
        data-testid="change-revert"
        aria-label={t('revert', { change: label })}
        title={t('revert', { change: label })}
        onClick={() => revertDraftChange(change)}
      >
        <X size={14} aria-hidden="true" />
      </button>
    </li>
  )
}

/**
 * The head's change row: "Geändert:" and one chip per changed value
 * ("Ruhestart 62 → 64 ✕"), at most three and "+n" (which unfolds the rest).
 * ✕ takes exactly that change back; "Verwerfen" in the bar still drops all.
 * The row keeps its height while the plan is clean, so nothing below it
 * moves when the first change arrives.
 */
export const ChangeRow = memo(function ChangeRow() {
  const t = useTranslations('workspace.changes')
  const changes = useDraftChanges()
  const dirty = usePlanIsDirty()
  const labelOf = useChangeLabel()
  const { panelMode } = useWorkspace()
  const limit = HEAD_CHIP_LIMIT[panelMode]
  const [expanded, setExpanded] = useState(false)
  // Folded again once the list fits (a state reset during render, no effect).
  if (expanded && changes.length <= limit) setExpanded(false)

  const shown = expanded ? changes : changes.slice(0, limit)
  const hidden = changes.length - shown.length
  return (
    <div
      className="ws-changes"
      data-testid="change-row"
      data-dirty={dirty ? 'true' : undefined}
      data-expanded={expanded ? 'true' : undefined}
    >
      {dirty && (
        <>
          <span className="ws-changes-lead" id="change-row-label">
            {t('lead')}
          </span>
          <ul className="ws-chips" aria-labelledby="change-row-label">
            {shown.map((change) => (
              <ChangeChip key={change.id} change={change} label={labelOf(change)} />
            ))}
            {changes.length === 0 && <li className="ws-chip ws-chip-plain">{t('other')}</li>}
          </ul>
          {(hidden > 0 || expanded) && (
            <button
              type="button"
              className="ws-chip-more"
              data-testid="change-more"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? t('less') : t('more', { count: hidden })}
            </button>
          )}
        </>
      )}
    </div>
  )
})

/**
 * The dock's "n Änderungen ▾": the same chips as a list under the dock.
 * Renders nothing while the plan is clean (its slot in the dock keeps the
 * width).
 */
export const ChangeMenu = memo(function ChangeMenu() {
  const t = useTranslations('workspace.changes')
  const changes = useDraftChanges()
  const dirty = usePlanIsDirty()
  const labelOf = useChangeLabel()
  if (!dirty) return null
  const count = Math.max(1, changes.length)
  return (
    <Popover
      label={t('listLabel')}
      className="ws-change-menu"
      testId="change-menu"
      align="end"
      trigger={(props) => (
        <button
          {...props}
          className="ws-dock-changes"
          data-testid="change-menu-trigger"
        >
          {/* The button's name is the full wording; where the dock is tight
              it is shown abbreviated (the long form stays for assistive tech). */}
          <span className="ws-dock-changes-long">{t('count', { count })}</span>
          <span className="ws-dock-changes-short" aria-hidden="true">
            {t('countShort', { count })}
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </button>
      )}
    >
      {() => (
        <ul className="ws-chips ws-chips-list">
          {changes.map((change) => (
            <ChangeChip key={change.id} change={change} label={labelOf(change)} />
          ))}
          {changes.length === 0 && <li className="ws-chip ws-chip-plain">{t('other')}</li>}
        </ul>
      )}
    </Popover>
  )
})
