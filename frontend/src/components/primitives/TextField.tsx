import { forwardRef, useId, type InputHTMLAttributes } from 'react'

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string
  error?: string
  hint?: string
}

/** Base input primitive — label + input + hint/error, wired with
 * `aria-describedby`/`aria-invalid`. Role-specific fields (PhoneField,
 * PanVatField, PasswordField) wrap this starting in Phase F1. */
export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(function TextField(
  { label, error, hint, id, className = '', ...rest },
  ref,
) {
  const generatedId = useId()
  const fieldId = id ?? generatedId
  const hintId = hint ? `${fieldId}-hint` : undefined
  const errorId = error ? `${fieldId}-error` : undefined

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={fieldId} className="text-base font-semibold text-text-primary">
        {label}
      </label>
      {hint && (
        <span id={hintId} className="text-sm text-text-secondary">
          {hint}
        </span>
      )}
      <input
        id={fieldId}
        ref={ref}
        aria-describedby={[hintId, errorId].filter(Boolean).join(' ') || undefined}
        aria-invalid={Boolean(error)}
        className={`min-h-touch rounded-sm border border-text-secondary/30 bg-surface px-3 text-base text-text-primary focus:border-brand-primary ${className}`}
        {...rest}
      />
      {error && (
        <span id={errorId} role="alert" className="text-sm font-medium text-danger-text">
          {error}
        </span>
      )}
    </div>
  )
})
