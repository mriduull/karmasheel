import type { Config } from 'tailwindcss'

// Design tokens per docs/FRONTEND_IMPLEMENTATION_PLAN.md §3.9.
// Exact hex values live once in src/styles/tokens.css as CSS custom
// properties; this file only points Tailwind's utility classes at them so
// `bg-brand-primary`, `text-danger`, etc. and the raw CSS variables never
// drift apart.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--color-bg)',
        surface: 'var(--color-surface)',
        'surface-muted': 'var(--color-surface-muted)',
        'text-primary': 'var(--color-text-primary)',
        'text-secondary': 'var(--color-text-secondary)',
        'brand-primary': 'var(--color-brand-primary)',
        'brand-primary-hover': 'var(--color-brand-primary-hover)',
        'brand-secondary': 'var(--color-brand-secondary)',
        success: 'var(--color-success)',
        'success-bg': 'var(--color-success-bg)',
        'success-text': 'var(--color-success-text)',
        'warning-bg': 'var(--color-warning-bg)',
        'warning-text': 'var(--color-warning-text)',
        danger: 'var(--color-danger)',
        'danger-bg': 'var(--color-danger-bg)',
        'danger-text': 'var(--color-danger-text)',
        'neutral-status-bg': 'var(--color-neutral-status-bg)',
        'neutral-status-text': 'var(--color-neutral-status-text)',
        'focus-ring': 'var(--color-focus-ring)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Slightly larger than Tailwind's defaults so the interface remains
        // comfortable to read at 100% browser zoom on wide desktop screens.
        xs: ['13px', { lineHeight: '1.5' }],
        sm: ['15px', { lineHeight: '1.5' }],
        base: ['17px', { lineHeight: '1.5' }],
        lg: ['20px', { lineHeight: '1.5' }],
        xl: ['24px', { lineHeight: '1.3' }],
        '2xl': ['30px', { lineHeight: '1.3' }],
        '3xl': ['38px', { lineHeight: '1.3' }],
      },
      spacing: {
        1: '4px',
        2: '8px',
        3: '12px',
        4: '16px',
        6: '24px',
        8: '32px',
        12: '48px',
        16: '64px',
      },
      borderRadius: {
        sm: '8px',
        md: '12px',
        lg: '16px',
      },
      boxShadow: {
        card: '0 1px 3px 0 rgb(28 25 23 / 0.08), 0 1px 2px -1px rgb(28 25 23 / 0.08)',
        float: '0 4px 12px 0 rgb(28 25 23 / 0.12)',
      },
      minHeight: {
        touch: '44px',
      },
      minWidth: {
        touch: '44px',
      },
    },
  },
  plugins: [],
} satisfies Config
