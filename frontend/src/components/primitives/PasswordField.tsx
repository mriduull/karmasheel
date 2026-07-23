import { forwardRef, type InputHTMLAttributes } from 'react'
import { TextField } from './TextField'

interface PasswordFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string
  error?: string
  hint?: string
}

export const PasswordField = forwardRef<HTMLInputElement, PasswordFieldProps>(
  function PasswordField(props, ref) {
    return <TextField ref={ref} type="password" autoComplete="current-password" {...props} />
  },
)
