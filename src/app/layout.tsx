import type { Metadata, Viewport } from 'next'
import './globals.css'
import './design-system.css'
import './interface.css'
import { COLOR_SCHEME_INIT_SCRIPT } from '@/lib/colorScheme'

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

// `viewportFit: 'cover'` lets iOS report env(safe-area-inset-*): the phone
// workspace's fixed bottom tab bar pads itself by the home indicator, and the
// page gutters (interface.css) grow by the notch insets in landscape.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // One design language in two colour schemes. Light and dark are token sets
  // in interface.css; by default the OS decides via prefers-color-scheme. An
  // explicit choice (see AppearanceSwitch) is stored in localStorage and
  // applied by this blocking inline script before the body paints, so a
  // stored override never flashes the other scheme. The script only sets
  // `data-color-scheme` on <html>, hence suppressHydrationWarning.
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: COLOR_SCHEME_INIT_SCRIPT }} />
      </head>
      <body className="antialiased">{children}</body>
    </html>
  )
}
