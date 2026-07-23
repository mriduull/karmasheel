import type { ButtonHTMLAttributes } from 'react'
import { LoadingIndicator } from './LoadingIndicator'

type Variant = 'primary' | 'secondary' | 'danger'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  isLoading?: boolean
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: 'bg-brand-primary text-white hover:bg-brand-primary-hover',
  secondary:
    'bg-surface text-text-primary border border-text-secondary/30 hover:bg-surface-muted',
  danger: 'bg-danger text-white hover:bg-danger/90',
}

/** Every button meets the ≥44px touch-target minimum via `min-h-touch`/`min-w-touch`. */
export function Button({
  variant = 'primary',
  isLoading = false,
  disabled,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      className={`inline-flex min-h-touch min-w-touch items-center justify-center gap-2 rounded-sm px-4 text-base font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT_CLASSES[variant]} ${className}`}
      disabled={disabled || isLoading}
      aria-busy={isLoading}
      {...rest}
    >
      {isLoading && <LoadingIndicator size="sm" />}
      {children}
    </button>
  )
}
