import type { Metadata } from 'next'
import Script from 'next/script'
import { Plus_Jakarta_Sans, Sora } from 'next/font/google'
import { DEFAULT_THEME_ID, THEME_IDS, THEME_STORAGE_KEY } from '@/lib/themes'
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
  try {
    const storageKey = ${JSON.stringify(THEME_STORAGE_KEY)};
    const defaultTheme = ${JSON.stringify(DEFAULT_THEME_ID)};
    const validThemes = ${JSON.stringify(THEME_IDS)};
    const storedTheme = window.localStorage.getItem(storageKey);
    const theme = validThemes.includes(storedTheme) ? storedTheme : defaultTheme;
    document.documentElement.dataset.theme = theme;
  } catch {
    document.documentElement.dataset.theme = ${JSON.stringify(DEFAULT_THEME_ID)};
  }
})();
`

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" data-theme={DEFAULT_THEME_ID} suppressHydrationWarning>
      <body className={`${jakarta.variable} ${sora.variable} antialiased`}>
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
