import { Font } from '@react-pdf/renderer'

// Font configuration for react-pdf
// Using built-in PDF fonts (Helvetica) for maximum compatibility and fast rendering
// Built-in fonts are embedded as vectors, not bitmaps

let fontsRegistered = false

export function registerFonts(): void {
  if (fontsRegistered) return

  // Disable hyphenation for cleaner text rendering
  Font.registerHyphenationCallback((word) => [word])

  fontsRegistered = true
}

// Register fonts on module load
registerFonts()
