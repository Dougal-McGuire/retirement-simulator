'use client'

import { useMemo } from 'react'
import { Lightbulb } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import type { SimulationParams, SimulationResults } from '@/types'
import {
  estimateRecommendationUplift,
  generateRecommendations,
} from '@/lib/insights/recommendations'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { InfoTip } from '@/components/ui/info-tip'
import { toast, TOAST_DURATION } from '@/components/ui/toast'
import { ActionToast } from '@/components/ui/action-toast'
import { useUpdateParams } from '@/lib/stores/simulationStore'
import { cn } from '@/lib/utils'

interface RecommendationListProps {
  params: SimulationParams
  results: SimulationResults | null
}

const impactClasses: Record<'High' | 'Medium' | 'Low', string> = {
  High: 'border-danger bg-red-50 text-danger',
  Medium: 'border-warning-600 bg-warning-50 text-warning-700',
  Low: 'border-border bg-muted text-muted-foreground',
}

export function RecommendationList({ params, results }: RecommendationListProps) {
  const t = useTranslations('recommendations')
  const locale = useLocale()
  const updateParams = useUpdateParams()

  /**
   * "Consider volatility reduction" used to be advice with no address. It maps
   * exactly onto the allocation glide path, so the card offers to switch it on
   * — one click, undoable, and the dashboard re-simulates immediately.
   */
  const enableGlidePath = () => {
    const previous = params.glidePathEnabled
    updateParams({ glidePathEnabled: true })
    toast(
      (instance) => (
        <ActionToast
          testId="glide-path-toast"
          message={t('items.reduceVolatility.applied')}
          actions={[
            {
              label: t('items.reduceVolatility.undo'),
              tone: 'primary',
              testId: 'glide-path-toast-undo',
              onClick: () => {
                toast.dismiss(instance.id)
                updateParams({ glidePathEnabled: previous })
              },
            },
          ]}
        />
      ),
      { duration: TOAST_DURATION }
    )
  }

  // Bodies quote this plan's own figures, so they are produced in the reader's
  // language rather than looked up by sentence — see `generateRecommendations`.
  const recommendations = useMemo(
    () => (results ? generateRecommendations(params, results, locale === 'de' ? 'de' : 'en') : []),
    [params, results, locale]
  )

  return (
    <Card className="overflow-hidden">
      <CardContent className="bg-white p-5">
        <div className="flex items-center gap-3">
          <Lightbulb className="h-5 w-5 text-accent" aria-hidden="true" />
          <h4 className="text-sm font-extrabold  ">{t('title')}</h4>
          <InfoTip content={t('subtitle')} label={t('title')} side="bottom" />
        </div>

        {recommendations.length === 0 ? (
          <p className="mt-5 text-sm font-medium text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {recommendations.map((rec) => {
              const uplift = results ? estimateRecommendationUplift(rec, params, results) : null

              return (
                <li
                  key={rec.id}
                  className="rounded-sm border-2 border-border bg-background p-4 shadow-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-extrabold   text-ink">
                      {rec.title}
                    </p>
                    <span className="flex items-center gap-2">
                      {uplift && (
                        <span className="rounded-sm border-2 border-success-600 bg-success-50 px-2 py-1 text-[0.68rem] font-extrabold   text-success-700">
                          {t('uplift', { min: uplift.upliftMin, max: uplift.upliftMax })}
                        </span>
                      )}
                      <span
                        className={cn(
                          'rounded-sm border-2 px-2 py-1 text-[0.68rem] font-extrabold  ',
                          impactClasses[rec.impact]
                        )}
                      >
                        {t(`impact.${rec.impact.toLowerCase()}`)}
                      </span>
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-medium leading-relaxed text-muted-foreground">
                    {rec.body}
                  </p>
                  <p className="mt-2 text-[0.58rem] font-bold   text-muted-foreground">
                    {rec.category}
                  </p>
                  {rec.id === 'reduceVolatility' && !params.glidePathEnabled && (
                    <Button
                      size="sm"
                      className="mt-3 h-8"
                      data-testid="recommendation-enable-glide-path"
                      onClick={enableGlidePath}
                    >
                      {t('items.reduceVolatility.action')}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
