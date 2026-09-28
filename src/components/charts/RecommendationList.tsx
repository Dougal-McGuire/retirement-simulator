'use client'

import { memo, useMemo } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import {
  estimateRecommendationUplift,
  generateRecommendations,
} from '@/lib/insights/recommendations'
import { toast, TOAST_DURATION } from '@/components/ui/toast'
import { ActionToast } from '@/components/ui/action-toast'
import {
  useSimulationResults,
  useSimulationStore,
  useUpdateParams,
} from '@/lib/stores/simulationStore'

/**
 * "Empfehlungen" in the Stellschrauben section: advice derived from this plan,
 * one hairline row each, with the estimated uplift where the app can defend a
 * number. Recommendations are generated from the parameters the shown result
 * was computed for, so a slider drag re-derives them once per result rather
 * than once per step.
 */
export const RecommendationList = memo(function RecommendationList() {
  const t = useTranslations('recommendations')
  const locale = useLocale()
  const updateParams = useUpdateParams()
  const results = useSimulationResults()
  const glidePathEnabled = useSimulationStore((state) => state.params.glidePathEnabled)

  /**
   * "Consider volatility reduction" used to be advice with no address. It maps
   * exactly onto the allocation glide path, so the row offers to switch it on
   * — one click, undoable, and the page re-simulates immediately. It is the
   * only glide-path action on the page.
   */
  const enableGlidePath = () => {
    const previous = useSimulationStore.getState().params.glidePathEnabled
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
    () =>
      results
        ? generateRecommendations(results.params, results, locale === 'de' ? 'de' : 'en').map(
            (rec) => ({ rec, uplift: estimateRecommendationUplift(rec, results.params, results) })
          )
        : [],
    [results, locale]
  )

  return (
    <section
      className="ws-levers-group"
      aria-labelledby="levers-recommendations-title"
      data-testid="recommendations"
    >
      <header className="ws-levers-head">
        <h3 id="levers-recommendations-title" className="ws-levers-title">
          {t('title')}
        </h3>
      </header>
      <p className="ws-levers-lede">{t('subtitle')}</p>

      {!results ? (
        <div className="ws-levers-list" aria-hidden="true">
          {[0, 1, 2].map((index) => (
            <div key={index} className="ws-levers-row-skeleton">
              <span className="ws-skeleton" style={{ width: '40%' }} />
              <span className="ws-skeleton" style={{ width: '75%' }} />
            </div>
          ))}
        </div>
      ) : recommendations.length === 0 ? (
        <p className="ws-levers-empty">{t('none')}</p>
      ) : (
        <ul className="ws-levers-list">
          {recommendations.map(({ rec, uplift }) => (
            <li key={rec.id} className="ws-levers-rec" data-recommendation={rec.id}>
              <div className="ws-levers-rec-head">
                <p className="ws-levers-row-name">{rec.title}</p>
                {uplift && (
                  <span className="ds-delta ds-delta--neutral ws-levers-rec-uplift">
                    {t('uplift', { min: uplift.upliftMin, max: uplift.upliftMax })}
                  </span>
                )}
              </div>
              <p className="ws-levers-rec-body">{rec.body}</p>
              <div className="ws-levers-rec-foot">
                <p className="ws-levers-rec-meta">
                  {rec.category} · {t(`impact.${rec.impact.toLowerCase()}`)}
                </p>
                {rec.id === 'reduceVolatility' && !glidePathEnabled && (
                  <button
                    type="button"
                    className="ws-levers-button"
                    data-testid="recommendation-enable-glide-path"
                    onClick={enableGlidePath}
                  >
                    {t('items.reduceVolatility.action')}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
})
