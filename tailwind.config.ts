import type { Config } from 'tailwindcss'

export default {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        chart: {
          '1': 'hsl(var(--chart-1))',
          '2': 'hsl(var(--chart-2))',
          '3': 'hsl(var(--chart-3))',
          '4': 'hsl(var(--chart-4))',
          '5': 'hsl(var(--chart-5))',
        },
        // Neo-brutalist color palette
        'neo-black': '#05080f',
        'neo-white': '#ffffff',
        'neo-yellow': '#f6c90e',
        'neo-blue': '#0e67f6',
        'neo-red': '#ff3b5c',
        'neo-green': '#2ad576',
        'neo-pink': '#ff4f91',
        'neo-purple': '#7a5bff',
        'neo-cyan': '#14c2c9',
        'neo-orange': '#ff6b35',
        // Enhanced color palette for retirement app
        success: {
          50: '#f0fdf4',
          100: '#dcfce7',
          500: '#22c55e',
          600: '#16a34a',
          700: '#15803d',
        },
        warning: {
          50: '#fffbeb',
          100: '#fef3c7',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
        },
        info: {
          50: '#eff6ff',
          100: '#dbeafe',
          500: '#3b82f6',
          600: '#2563eb',
          700: '#1d4ed8',
        },
        retirement: {
          50: '#f8fafc',
          100: '#f1f5f9',
          200: '#e2e8f0',
          300: '#cbd5e1',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
        },
      },
      fontFamily: {
        heading: ['Space Grotesk', 'sans-serif'],
        body: ['IBM Plex Mono', 'Inter', 'system-ui', 'sans-serif'],
        sans: ['IBM Plex Mono', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['IBM Plex Mono', 'monospace'],
      },
      borderWidth: {
        '3': '3px',
        '5': '5px',
        '6': '6px',
      },
      borderRadius: {
        'neo': '0px',
        'neo-soft': '4px',
        lg: '0px', // Changed for neo-brutalism
        md: '0px',
        sm: '0px',
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
        '128': '32rem',
      },
      boxShadow: {
        // Neo-brutalist hard shadows
        'neo': '4px 4px 0px #05080f',
        'neo-sm': '2px 2px 0px #05080f',
        'neo-md': '6px 6px 0px #05080f',
        'neo-lg': '8px 8px 0px #05080f',
        'neo-xl': '12px 12px 0px #05080f',
        // Colored neo-brutalist shadows
        'neo-yellow': '6px 6px 0px #f6c90e',
        'neo-blue': '6px 6px 0px #0e67f6',
        'neo-red': '6px 6px 0px #ff3b5c',
        'neo-green': '6px 6px 0px #2ad576',
        'neo-pink': '6px 6px 0px #ff4f91',
        'neo-purple': '6px 6px 0px #7a5bff',
        // Mobile-friendly shadows (smaller)
        'neo-mobile': '2px 2px 0px #000000',
        'neo-mobile-md': '3px 3px 0px #000000',
        // Keep existing soft shadows for backwards compatibility
        soft: '0 2px 15px -3px rgba(0, 0, 0, 0.07), 0 10px 20px -2px rgba(0, 0, 0, 0.04)',
        medium: '0 4px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 30px -5px rgba(0, 0, 0, 0.04)',
        strong: '0 10px 40px -10px rgba(0, 0, 0, 0.15), 0 20px 25px -5px rgba(0, 0, 0, 0.1)',
        glow: '0 0 0 1px rgba(59, 130, 246, 0.15), 0 4px 25px -5px rgba(59, 130, 246, 0.2)',
        success: '0 0 0 1px rgba(34, 197, 94, 0.15), 0 4px 25px -5px rgba(34, 197, 94, 0.2)',
        warning: '0 0 0 1px rgba(245, 158, 11, 0.15), 0 4px 25px -5px rgba(245, 158, 11, 0.2)',
      },
      transitionDuration: {
        'neo': '100ms',
        'neo-fast': '150ms',
      },
      animation: {
        'fade-in': 'fadeIn 0.2s ease-out',
        'slide-up': 'slideUp 0.15s ease-out',
        'scale-in': 'scaleIn 0.1s ease-out',
        'pulse-soft': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(10px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
    },
  },
  plugins: [],
} satisfies Config
