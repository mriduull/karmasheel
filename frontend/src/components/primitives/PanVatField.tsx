import { forwardRef, type InputHTMLAttributes } from 'react'
import { TextField } from './TextField'

interface PanVatFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  error?: string
  hint?: string
}

/** `inputMode="numeric"` for the on-screen keyboard; spaces/dashes are
 * accepted while typing and stripped before validation/submission
 * (`validation/employerProfile.ts:employerDetailsSchema`) — the backend's
 * own rule (`profiles/models.py:pan_vat_number_validator`,
 * `^\d{9}$`) has no tolerance for separators. */
export const PanVatField = forwardRef<HTMLInputElement, PanVatFieldProps>(function PanVatField(
  props,
  ref,
) {
  return <TextField ref={ref} type="text" inputMode="numeric" autoComplete="off" {...props} />
})
