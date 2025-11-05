import { useEffect } from 'react'

export interface KeyboardShortcut {
  key: string
  ctrl?: boolean
  cmd?: boolean
  shift?: boolean
  alt?: boolean
  handler: (event: KeyboardEvent) => void
  description?: string
}

/**
 * Hook to register keyboard shortcuts
 * @param shortcuts Array of keyboard shortcut configurations
 * @param enabled Whether the shortcuts are currently active
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[], enabled = true) {
  useEffect(() => {
    if (!enabled) return

    const handleKeyDown = (event: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const {
          key,
          ctrl = false,
          cmd = false,
          shift = false,
          alt = false,
          handler,
        } = shortcut

        const ctrlKey = ctrl && event.ctrlKey
        const cmdKey = cmd && (event.metaKey || event.ctrlKey) // Meta is Cmd on Mac, Ctrl on Windows
        const shiftKey = shift && event.shiftKey
        const altKey = alt && event.altKey

        // Check if the shortcut matches
        const keyMatches = event.key.toLowerCase() === key.toLowerCase()
        const modifiersMatch =
          (ctrl ? ctrlKey : !event.ctrlKey || cmd) &&
          (cmd ? cmdKey : !event.metaKey) &&
          (shift ? shiftKey : !event.shiftKey) &&
          (alt ? altKey : !event.altKey)

        // For cmd/ctrl shortcuts, we check either key
        const cmdCtrlMatches = (ctrl || cmd) && (event.ctrlKey || event.metaKey)

        if (keyMatches) {
          if ((ctrl || cmd) && cmdCtrlMatches && (!shift || shiftKey) && (!alt || altKey)) {
            event.preventDefault()
            handler(event)
            break
          } else if (!ctrl && !cmd && !shift && !alt && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
            // Plain key press with no modifiers
            handler(event)
            break
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [shortcuts, enabled])
}

/**
 * Hook for Escape key handling (useful for modals, dialogs)
 */
export function useEscapeKey(handler: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handler()
      }
    }

    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('keydown', handleEscape)
    }
  }, [handler, enabled])
}

/**
 * Hook for Enter key handling (useful for forms)
 */
export function useEnterKey(handler: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return

    const handleEnter = (event: KeyboardEvent) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault()
        handler()
      }
    }

    window.addEventListener('keydown', handleEnter)

    return () => {
      window.removeEventListener('keydown', handleEnter)
    }
  }, [handler, enabled])
}
