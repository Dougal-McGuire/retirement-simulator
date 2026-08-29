'use client'

import { Toaster } from 'react-hot-toast'

/**
 * App-wide toast overlay.
 *
 * Toasts used to land top-right, where the simulation page keeps its sticky
 * chrome and its tab strip: an "undo" card would sit *inside* the reading flow,
 * covering the comparison chart on desktop and reading as a page section on a
 * 390px screen. Bottom-right (bottom-centre on mobile) is out of the way of
 * everything the user is looking at, and above every other layer.
 *
 * `react-hot-toast` renders this container `position: fixed` and pauses each
 * toast's dismissal timer while the pointer is inside it, so the card is a real
 * overlay with hover-pause and an eight-second life, not a block of content.
 */

/** Default life of a toast, in ms. Action toasts (undo, switch) opt into it. */
export const TOAST_DURATION = 8000

export function ToastProvider() {
  return (
    <Toaster
      position="bottom-right"
      gutter={12}
      // Above dialogs, selects and tooltips (which sit at 99999): a toast the
      // user cannot see is a toast that never happened.
      containerStyle={{ zIndex: 100000, inset: '1rem' }}
      containerClassName="!bottom-[max(1rem,env(safe-area-inset-bottom))] max-sm:!left-2 max-sm:!right-2"
      toastOptions={{
        duration: TOAST_DURATION,
        className: 'max-w-[calc(100vw-1.5rem)] sm:max-w-[24rem]',
        style: {
          background: 'var(--white)',
          color: 'var(--ink)',
          border: '3px solid var(--ink)',
          borderRadius: '0px',
          padding: '12px 16px',
          fontSize: '14px',
          boxShadow: 'var(--shadow-sm)',
          maxWidth: 'none',
        },
        success: {
          duration: 4000,
          iconTheme: {
            primary: 'var(--ok)',
            secondary: 'var(--white)',
          },
        },
        error: {
          iconTheme: {
            primary: 'var(--danger)',
            secondary: 'var(--white)',
          },
          duration: 6000,
        },
        loading: {
          iconTheme: {
            primary: 'var(--accent)',
            secondary: 'var(--white)',
          },
        },
      }}
    />
  )
}

export { toast } from 'react-hot-toast'
