'use client'

import { useEffect } from 'react'

/**
 * Sets `<html lang>` to the page's locale. The root layout renders above the
 * `[locale]` segment and cannot know it, so German pages were announced (and
 * hyphenated) as English. The inline script applies it before first paint;
 * the effect covers client-side switches between locales, where a script
 * rendered by React does not run. `<html>` carries suppressHydrationWarning.
 */
export function HtmlLang({ locale }: { locale: string }) {
  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])
  return (
    <script
      dangerouslySetInnerHTML={{
        __html: `document.documentElement.lang=${JSON.stringify(locale)}`,
      }}
    />
  )
}
