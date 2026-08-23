import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { register as registerAccount } from '@/api/endpoints/auth'
import { ApiError, toBannerMessage, toFieldErrors } from '@/api/errors'
import { registerSchema, type RegisterFormValues } from '@/validation/auth'
import type { Role } from '@/types/user'
import { AuthCard } from '@/components/auth/AuthCard'
import { RoleToggle } from '@/components/auth/RoleToggle'
import { TextField } from '@/components/primitives/TextField'
import { PhoneField } from '@/components/primitives/PhoneField'
import { PasswordField } from '@/components/primitives/PasswordField'
import { Button } from '@/components/primitives/Button'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'

/** How long the confirmation screen auto-redirects to Login after — a
 * visible "Continue to Log In" link/button is always available too, so
 * nothing depends on this timer actually firing (accessibility, tests). */
const AUTO_REDIRECT_DELAY_MS = 3000

function isRole(value: string | null): value is Role {
  return value === 'WORKER' || value === 'EMPLOYER'
}

export function Register() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [formError, setFormError] = useState<string | null>(null)
  const [registeredUsername, setRegisteredUsername] = useState<string | null>(null)

  const roleParam = searchParams.get('role')
  const preselectedRole: Role = isRole(roleParam) ? roleParam : 'WORKER'

  const {
    register: registerField,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      username: '',
      email: '',
      phone_number: '',
      password: '',
      role: preselectedRole,
    },
  })

  const role = watch('role')

  // Successful registration never logs the user in — this effect only
  // redirects away from a confirmed registration, never toward one.
  useEffect(() => {
    if (!registeredUsername) return

    const timer = setTimeout(() => {
      navigate('/login', { replace: true })
    }, AUTO_REDIRECT_DELAY_MS)

    return () => clearTimeout(timer)
  }, [registeredUsername, navigate])

  const onSubmit = async (values: RegisterFormValues) => {
    setFormError(null)

    try {
      const account = await registerAccount({
        username: values.username,
        email: values.email || undefined,
        phone_number: values.phone_number,
        password: values.password,
        role: values.role,
      })
      setRegisteredUsername(account.username)
    } catch (error) {
      if (error instanceof ApiError) {
        const fieldErrors = toFieldErrors(error)

        if (fieldErrors) {
          for (const [field, message] of Object.entries(fieldErrors)) {
            setError(field as keyof RegisterFormValues, { type: 'server', message })
          }
        } else {
          setFormError(toBannerMessage(error))
        }
      } else {
        setFormError('Something went wrong — please try again.')
      }
    }
  }

  if (registeredUsername) {
    return (
      <AuthCard title="Account created">
        <p className="text-base text-text-secondary">
          Welcome, <strong className="text-text-primary">{registeredUsername}</strong> — your
          account is ready. Log in to set up your profile next.
        </p>
        <Button
          variant="primary"
          className="mt-6 w-full"
          onClick={() => navigate('/login', { replace: true })}
        >
          Continue to Log In
        </Button>
      </AuthCard>
    )
  }

  return (
    <AuthCard title="Register">
      {formError && (
        <div className="mb-4">
          <ErrorBanner message={formError} />
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <RoleToggle
          label="I am a"
          value={role}
          onChange={(nextRole) => setValue('role', nextRole, { shouldValidate: true })}
        />

        <div className="order-1">
          <TextField
            label="Username"
            autoComplete="section-register nickname"
            error={errors.username?.message}
            {...registerField('username')}
          />
        </div>
        <div className="order-4">
          <PasswordField
            label="Password"
            autoComplete="section-register new-password"
            error={errors.password?.message}
            {...registerField('password')}
          />
        </div>
        <div className="order-2">
          <TextField
            label="Email"
            type="email"
            autoComplete="section-register email"
            hint="Optional"
            error={errors.email?.message}
            {...registerField('email')}
          />
        </div>
        <div className="order-3">
          <PhoneField
            label="Phone number"
            autoComplete="section-register tel-national"
            hint="We'll use this to reach you — required"
            error={errors.phone_number?.message}
            {...registerField('phone_number')}
          />
        </div>
        <Button type="submit" variant="primary" isLoading={isSubmitting} className="order-5 mt-2">
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-base text-text-secondary">
        Already have an account?{' '}
        <Link to="/login" className="font-semibold text-brand-primary hover:underline">
          Log In
        </Link>
      </p>
    </AuthCard>
  )
}
