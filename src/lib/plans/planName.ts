import type { Plan } from '@/types'

/** Translation keys that built-in plans may carry in `nameKey`. */
const BUILT_IN_NAME_KEYS = ['base', 'demo'] as const

type BuiltInNameKey = (typeof BUILT_IN_NAME_KEYS)[number]

const isBuiltInNameKey = (value: string | undefined): value is BuiltInNameKey =>
  typeof value === 'string' && (BUILT_IN_NAME_KEYS as readonly string[]).includes(value)

/**
 * Display name for a plan: built-in plans follow the UI language, user-named
 * plans always render exactly what the user typed.
 */
export function planDisplayName(plan: Plan, translate: (key: string) => string): string {
  if (isBuiltInNameKey(plan.nameKey)) {
    return translate(`defaultNames.${plan.nameKey}`)
  }
  return plan.name
}
