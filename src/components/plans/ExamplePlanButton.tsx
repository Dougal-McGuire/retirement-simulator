'use client'

import { useState, useTransition } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRouter } from '@/navigation'
import { Button } from '@/components/ui/button'
import { MAX_PLANS } from '@/types'
import { buildDemoPlanParams, DEMO_PLAN_NAME_KEY } from '@/lib/plans/demoPlan'
import { useCreatePlan, usePlans, useSetActivePlan } from '@/lib/stores/simulationStore'
import { cn } from '@/lib/utils'

interface ExamplePlanButtonProps {
  className?: string
  variant?: 'default' | 'outline' | 'secondary'
  size?: 'sm' | 'default' | 'lg'
}

/**
 * "Explore an example plan" — the honest answer to a stranger who has not yet
 * decided to hand over their retirement numbers.
 *
 * It adds a furnished plan alongside whatever they already have (never
 * replacing it), switches to it and opens the dashboard. Clicking again returns
 * to the existing example rather than piling up copies, and the plan is an
 * ordinary one: editable, comparable and deletable from the plan bar.
 */
export function ExamplePlanButton({
  className,
  variant = 'outline',
  size = 'lg',
}: ExamplePlanButtonProps) {
  const t = useTranslations('landing.demo')
  const tPlans = useTranslations('plans')
  const router = useRouter()
  const plans = usePlans()
  const createPlan = useCreatePlan()
  const setActivePlan = useSetActivePlan()
  const [isPending, startTransition] = useTransition()
  const [failed, setFailed] = useState(false)

  const existing = plans.find((plan) => plan.nameKey === DEMO_PLAN_NAME_KEY)
  const atLimit = plans.length >= MAX_PLANS

  const handleClick = () => {
    setFailed(false)

    if (existing) {
      setActivePlan(existing.id)
    } else if (atLimit) {
      setFailed(true)
      return
    } else {
      // The stored `name` is a fallback; `nameKey` is what the plan bar renders
      // while the plan is still the untouched example.
      const created = createPlan(
        tPlans(`defaultNames.${DEMO_PLAN_NAME_KEY}`),
        buildDemoPlanParams(),
        { nameKey: DEMO_PLAN_NAME_KEY }
      )
      if (!created) {
        setFailed(true)
        return
      }
    }

    startTransition(() => {
      router.push('/simulation')
    })
  }

  return (
    <span className={cn('inline-flex flex-col items-stretch gap-1', className)}>
      <Button
        type="button"
        variant={variant}
        size={size}
        onClick={handleClick}
        disabled={isPending}
        aria-busy={isPending}
        data-testid="explore-example-plan"
        className="landing-label h-auto w-full whitespace-normal py-3 text-center leading-tight"
      >
        {isPending ? (
          <Loader2 className="mr-2 h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
        ) : (
          <Sparkles className="mr-2 h-4 w-4 shrink-0" aria-hidden="true" />
        )}
        {isPending ? t('opening') : existing ? t('resume') : t('cta')}
      </Button>
      {/* 0.68rem/medium was under 11px and, on the dark closing CTA band, the
          smallest text on the page. Caption-sized and semibold so it clears AA
          on every surface it appears on. */}
      <span className="landing-body text-xs font-semibold leading-relaxed text-muted-foreground">
        {failed ? t('limit', { max: MAX_PLANS }) : t('hint')}
      </span>
    </span>
  )
}
