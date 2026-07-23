import { forwardRef, type InputHTMLAttributes } from 'react'
import { TextField } from './TextField'

interface PhoneFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  error?: string
  hint?: string
}

/** `type="tel"` + a numeric-friendly `inputMode` — the backend itself has
 * no digits-only format rule (see validation/common.ts), so this only
 * shapes the on-screen keyboard/UX, not validation. */
export const PhoneField = forwardRef<HTMLInputElement, PhoneFieldProps>(function PhoneField(
  props,
  ref,
) {
  return <TextField ref={ref} type="tel" inputMode="tel" autoComplete="tel" {...props} />
})
