'use client'

import { useEffect } from 'react'
import { useTranslations } from 'next-intl'
import { toast } from '@/components/ui/toast'
import { ActionToast } from '@/components/ui/action-toast'
import { useLocalSaveStore } from '@/lib/stores/planStorage'

/** One toast for the whole app: a change of reason replaces it in place. */
export const LOCAL_SAVE_TOAST_ID = 'local-save-problem'

/**
 * "Could not be saved on this device" — raised when the plans did not reach
 * localStorage, and why:
 *
 *  - `write-failed`: the browser refused the write (storage full, private
 *    mode, blocked). The edit is intact in memory; it is only not durable.
 *  - `read-only`: storage holds plans from a newer version of the app, which
 *    this tab must not overwrite. Only a reload gets it out of that.
 *
 * Never blocks: saving, editing and simulating carry on in memory. The toast
 * stays until it is dismissed or the next write succeeds, so it sits
 * bottom-left like the reload notice, clear of the docked edit panel.
 */
export function LocalSaveNotice() {
  const t = useTranslations('plans.localSave')
  const problem = useLocalSaveStore((state) => state.problem)

  useEffect(() => {
    if (!problem) {
      toast.dismiss(LOCAL_SAVE_TOAST_ID)
      return
    }

    toast(
      (instance) => (
        <ActionToast
          testId="local-save-notice"
          message={
            <span data-problem={problem}>
              {problem === 'read-only' ? t('readOnly') : t('failed')}
            </span>
          }
          actions={[
            ...(problem === 'read-only'
              ? [
                  {
                    label: t('reload'),
                    tone: 'primary' as const,
                    testId: 'local-save-notice-reload',
                    onClick: () => window.location.reload(),
                  },
                ]
              : []),
            {
              label: t('dismiss'),
              testId: 'local-save-notice-dismiss',
              onClick: () => toast.dismiss(instance.id),
            },
          ]}
        />
      ),
      { id: LOCAL_SAVE_TOAST_ID, duration: Infinity, position: 'bottom-left' }
    )
  }, [problem, t])

  return null
}
