import { Font } from '@react-pdf/renderer'
import fs from 'fs'
import path from 'path'

// Font configuration for react-pdf.
//
// The report uses Inter (SIL Open Font License, bundled locally in ./fonts)
// for a contemporary, adviser-grade typographic voice. If the font files are
// unavailable for any reason we fall back to the built-in Helvetica so PDF
// generation never breaks.

export const SANS = 'Inter'
export const SANS_FALLBACK = 'Helvetica'

let fontsRegistered = false
let interAvailable = false

function fontPath(file: string): string {
  return path.join(process.cwd(), 'src', 'lib', 'pdf-generator', 'react-pdf', 'fonts', file)
}

export function registerFonts(): void {
  if (fontsRegistered) return

  // Disable hyphenation for cleaner text rendering
  Font.registerHyphenationCallback((word) => [word])

  try {
    const regular = fontPath('Inter-Regular.ttf')
    const medium = fontPath('Inter-Medium.ttf')
    const semibold = fontPath('Inter-SemiBold.ttf')
    const bold = fontPath('Inter-Bold.ttf')

    if ([regular, medium, semibold, bold].every((file) => fs.existsSync(file))) {
      Font.register({
        family: SANS,
        fonts: [
          { src: regular, fontWeight: 400 },
          { src: medium, fontWeight: 500 },
          { src: semibold, fontWeight: 600 },
          { src: bold, fontWeight: 700 },
        ],
      })
      interAvailable = true
    }
  } catch {
    interAvailable = false
  }

  fontsRegistered = true
}

// Register fonts on module load
registerFonts()

/** Family name to use in styles (falls back to Helvetica when Inter is missing). */
export function sansFamily(): string {
  return interAvailable ? SANS : SANS_FALLBACK
}
