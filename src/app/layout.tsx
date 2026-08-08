import type { Metadata } from 'next'
import Script from 'next/script'
import { IBM_Plex_Mono, Inter, Plus_Jakarta_Sans, Sora, Space_Grotesk } from 'next/font/google'
import {
  DEFAULT_THEME_ID,
  LEGACY_THEME_ALIASES,
  THEME_IDS,
  THEME_STORAGE_KEY,
} from '@/lib/themes'
import './globals.css'

const jakarta = Plus_Jakarta_Sans({
  variable: '--font-plus-jakarta',
  subsets: ['latin'],
  display: 'swap',
})

const sora = Sora({
  variable: '--font-sora',
  subsets: ['latin'],
  display: 'swap',
})

// The theme font stacks used to be pulled in with an `@import` from
// fonts.googleapis.com at the top of globals.css. That is a *runtime* request
// from the browser: on a blocked or offline network it fails loudly
// (ERR_CONNECTION_RESET, two to four entries per page load) and on a good one
// it costs a render-blocking round trip to a third party. `next/font` inlines
// the same families at build time and serves them from this origin, so the
// page never talks to Google at all.
const inter = Inter({
  variable: '--font-inter',
  subsets: ['latin'],
  display: 'swap',
})

const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  display: 'swap',
})

const plexMono = IBM_Plex_Mono({
  variable: '--font-plex-mono',
  weight: ['400', '500', '600', '700'],
  subsets: ['latin'],
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Retirement Simulator',
  description:
    'Monte Carlo retirement planning simulator with comprehensive financial analysis and professional PDF reports',
  icons: {
    icon: '/piggy.svg',
    shortcut: '/piggy.svg',
    apple: '/piggy.svg',
  },
}

const themeInitScript = `
(() => {
  const defaultTheme = ${JSON.stringify(DEFAULT_THEME_ID)};
  const validThemes = ${JSON.stringify(THEME_IDS)};
  const aliases = ${JSON.stringify(LEGACY_THEME_ALIASES)};
  let theme = defaultTheme;
  try {
    const stored = window.localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});
    if (stored && validThemes.includes(stored)) {
      theme = stored;
    } else if (stored && Object.prototype.hasOwnProperty.call(aliases, stored)) {
      // A theme id from an earlier build: migrate to its nearest neighbour and
      // rewrite storage so the paint never flickers back on the next visit.
      theme = aliases[stored];
      window.localStorage.setItem(${JSON.stringify(THEME_STORAGE_KEY)}, theme);
    }
  } catch {}
  document.documentElement.dataset.theme = theme;
})();
`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME_ID} suppressHydrationWarning>
      <body
        className={`${jakarta.variable} ${sora.variable} ${inter.variable} ${spaceGrotesk.variable} ${plexMono.variable} antialiased`}
      >
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeInitScript }}
        />
        {children}
      </body>
    </html>
  )
}
