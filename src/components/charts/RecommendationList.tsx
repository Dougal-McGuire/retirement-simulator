'use client'

import { useMemo } from 'react'
import { Lightbulb } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { SimulationParams, SimulationResults } from '@/types'
import {
  estimateRecommendationUplift,
  generateRecommendations,
} from '@/lib/insights/recommendations'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { useUpdateParams } from '@/lib/stores/simulationStore'
import { cn } from '@/lib/utils'

interface RecommendationListProps {
  params: SimulationParams
  results: SimulationResults | null
}

const impactClasses: Record<'High' | 'Medium' | 'Low', string> = {
  High: 'border-neo-red bg-red-50 text-neo-red',
  Medium: 'border-warning-600 bg-warning-50 text-warning-700',
  Low: 'border-neo-black bg-muted text-muted-foreground',
}

export function RecommendationList({ params, results }: RecommendationListProps) {
  const t = useTranslations('recommendations')
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
        <span className="flex items-center gap-3 text-sm font-semibold">
          {t('items.reduceVolatility.applied')}
          <button
            type="button"
            className="border-2 border-neo-black bg-neo-yellow px-2 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-neo-black"
            onClick={() => {
              toast.dismiss(instance.id)
              updateParams({ glidePathEnabled: previous })
            }}
          >
            {t('items.reduceVolatility.undo')}
          </button>
        </span>
      ),
      { duration: 8000 }
    )
  }

  const recommendations = useMemo(
    () => (results ? generateRecommendations(params, results) : []),
    [params, results]
  )

  return (
    <Card className="overflow-hidden">
      <CardContent className="bg-neo-white p-5">
        <div className="flex items-center gap-3">
          <Lightbulb className="h-5 w-5 text-neo-blue" aria-hidden="true" />
          <h4 className="text-sm font-extrabold uppercase tracking-[0.16em]">{t('title')}</h4>
        </div>
        <p className="mt-2 text-xs font-medium text-muted-foreground">{t('subtitle')}</p>

        {recommendations.length === 0 ? (
          <p className="mt-5 text-sm font-medium text-muted-foreground">{t('empty')}</p>
        ) : (
          <ul className="mt-5 space-y-3">
            {recommendations.map((rec) => {
              const uplift = results ? estimateRecommendationUplift(rec, params, results) : null

              return (
                <li
                  key={rec.id}
                  className="border-2 border-neo-black bg-background p-4 shadow-neo-sm"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-extrabold uppercase tracking-[0.12em] text-neo-black">
                      {t(`items.${rec.id}.title`)}
                    </p>
                    <span className="flex items-center gap-2">
                      {uplift && (
                        <span className="border-2 border-success-600 bg-success-50 px-2 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-success-700">
                          {t('uplift', { min: uplift.upliftMin, max: uplift.upliftMax })}
                        </span>
                      )}
                      <span
                        className={cn(
                          'border-2 px-2 py-1 text-[0.68rem] font-extrabold uppercase tracking-[0.12em]',
                          impactClasses[rec.impact]
                        )}
                      >
                        {t(`impact.${rec.impact.toLowerCase()}`)}
                      </span>
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-medium text-muted-foreground">
                    {t(`items.${rec.id}.body`)}
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
