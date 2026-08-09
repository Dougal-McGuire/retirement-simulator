'use client'

import { Fragment, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { SimulationParams } from '@/types'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { LegendSwatch } from '@/components/charts/chartTheme'
import { buildAssumptionGroups } from '@/lib/simulation/planDiff'
import { useAssumptionValueFormatter } from '@/components/plans/useAssumptionFormat'
import { cn } from '@/lib/utils'

export interface AssumptionsPlan {
  id: string
  name: string
  params: SimulationParams
  color: string
}

/**
 * Side-by-side assumptions for the compared plans.
 *
 * Outcomes alone are not comparable — "98% vs 99%" means nothing until you can
 * see that one plan retires two years later. Rows that differ are highlighted
 * so the cause of the outcome gap is findable in one pass.
 */
export function AssumptionsDiff({ plans }: { plans: AssumptionsPlan[] }) {
  const t = useTranslations('plans.comparison.assumptions')
  const formatValue = useAssumptionValueFormatter()
  const [open, setOpen] = useState(false)
  const [highlighted, setHighlighted] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  // Cheap enough to derive on every render: a handful of scalar reads per plan.
  const groups = buildAssumptionGroups(plans.map((plan) => plan.params))

  const differingCount = groups.reduce(
    (total, group) => total + group.rows.filter((row) => row.differs).length,
    0
  )

  /**
   * "4 differences" was a label on a toggle: it told you a number and then made
   * you hunt for the rows behind it in a 30-row table. Now it opens the table
   * if needed and scrolls the first highlighted row into view, flashing it so
   * the eye lands in the right place.
   */
  const jumpToFirstDifference = () => {
    setOpen(true)
    if (typeof window === 'undefined') return

    let attempts = 0
    const focusRow = () => {
      attempts += 1
      const row = containerRef.current?.querySelector<HTMLElement>('tr[data-differs="true"]')
      if (!row) {
        // The collapsible mounts its content asynchronously.
        if (attempts < 20) window.requestAnimationFrame(focusRow)
        return
      }
      row.scrollIntoView({ behavior: 'smooth', block: 'center' })
      setHighlighted(true)
      window.setTimeout(() => setHighlighted(false), 1600)
    }
    window.requestAnimationFrame(focusRow)
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      ref={containerRef}
      className="mt-6 border-3 border-neo-black bg-neo-white shadow-neo-sm"
      data-testid="plan-comparison-assumptions"
    >
      {/* The count chip is a sibling of the trigger, not a child: it is its own
          button (nested buttons are invalid), and it does something different
          — it opens the table *and* takes the reader to the first row that
          actually differs, which is the only thing the number is about. */}
      <div className="flex flex-col items-stretch gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-3">
        {differingCount > 0 && (
          <button
            type="button"
            data-testid="plan-comparison-differences-chip"
            onClick={jumpToFirstDifference}
            className="order-first shrink-0 self-start border-2 border-neo-black bg-warning-50 px-2 py-1 text-[0.58rem] font-extrabold uppercase tracking-[0.12em] text-warning-700 transition-neo hover:-translate-y-[1px] hover:bg-warning-100 sm:order-none"
          >
            {t('differsCount', { count: differingCount })}
          </button>
        )}
        <CollapsibleTrigger className="flex min-w-0 flex-1 flex-col items-start gap-2 text-left transition-neo hover:opacity-80 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
          <span className="min-w-0">
            <span className="block text-[0.72rem] font-extrabold uppercase tracking-[0.16em] text-neo-black">
              {t('title')}
            </span>
            <span className="mt-1 block text-[0.66rem] font-medium text-muted-foreground">
              {t('description')}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-[0.6rem] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
              {open ? t('collapse') : t('expand')}
            </span>
            <ChevronDown
              aria-hidden="true"
              className={cn('h-4 w-4 transition-transform', open && 'rotate-180')}
            />
          </span>
        </CollapsibleTrigger>
      </div>

      <CollapsibleContent>
        <div className="border-t-2 border-neo-black/15 px-4 pb-4 pt-3">
          {differingCount === 0 && (
            <p className="mb-3 border-2 border-dashed border-neo-black/30 px-3 py-2 text-[0.66rem] font-medium text-muted-foreground">
              {t('identical')}
            </p>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[26rem] border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-neo-black text-[0.58rem] font-extrabold uppercase tracking-[0.12em] text-muted-foreground">
                  <th scope="col" className="py-2 pr-3">
                    <span className="sr-only">{t('title')}</span>
                  </th>
                  {plans.map((plan) => (
                    <th key={plan.id} scope="col" className="py-2 pl-3 text-right">
                      <span className="inline-flex items-center gap-1.5">
                        <LegendSwatch kind="line" color={plan.color} />
                        <span className="max-w-[8rem] truncate">{plan.name}</span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {groups.map((group) => (
                  <Fragment key={group.key}>
                    <tr className="bg-muted/60">
                      <th
                        scope="colgroup"
                        colSpan={plans.length + 1}
                        className="py-1.5 pr-3 text-[0.56rem] font-extrabold uppercase tracking-[0.16em] text-muted-foreground"
                      >
                        {t(`groups.${group.key}`)}
                      </th>
                    </tr>
                    {group.rows.map((row) => (
                      <tr
                        key={`${group.key}-${row.key}`}
                        data-differs={row.differs ? 'true' : 'false'}
                        className={cn(
                          'border-b border-neo-black/10 text-[0.68rem]',
                          row.differs
                            ? 'bg-warning-50/70 font-extrabold text-neo-black'
                            : 'font-semibold text-muted-foreground',
                          // Flashed after a jump from the count chip, so the
                          // reader's eye lands on the row the number meant.
                          row.differs &&
                            highlighted &&
                            'outline outline-2 outline-offset-[-2px] outline-warning-600'
                        )}
                      >
                        <th
                          scope="row"
                          className={cn(
                            'py-2 pr-3 text-left font-semibold',
                            row.differs && 'font-extrabold text-neo-black'
                          )}
                        >
                          <span className="flex items-center gap-1.5">
                            {row.differs && (
                              <span
                                aria-hidden="true"
                                className="inline-block h-2 w-2 shrink-0 bg-warning-600"
                              />
                            )}
                            {t(`rows.${row.key}`)}
                          </span>
                        </th>
                        {row.values.map((value, index) => (
                          <td
                            key={plans[index]?.id ?? index}
                            className="py-2 pl-3 text-right tabular-nums"
                          >
                            {formatValue(value, row.kind)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
