import { Toaster } from 'react-hot-toast'

export function ToastProvider() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 4000,
        style: {
          background: 'var(--neo-white)',
          color: 'var(--neo-black)',
          border: '2px solid var(--neo-black)',
          borderRadius: '0px',
          padding: '12px 16px',
          fontSize: '14px',
          boxShadow: 'var(--shadow-neo)',
        },
        success: {
          iconTheme: {
            primary: 'var(--neo-green)',
            secondary: 'var(--neo-white)',
          },
        },
        error: {
          iconTheme: {
            primary: 'var(--neo-red)',
            secondary: 'var(--neo-white)',
          },
          duration: 6000,
        },
        loading: {
          iconTheme: {
            primary: 'var(--neo-blue)',
            secondary: 'var(--neo-white)',
          },
        },
      }}
    />
  )
}

export { toast } from 'react-hot-toast'
