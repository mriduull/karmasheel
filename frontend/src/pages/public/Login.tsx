import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { fetchCurrentUser, login } from '@/api/endpoints/auth'
import { ApiError, toBannerMessage } from '@/api/errors'
import { tokenStorage } from '@/api/tokenStorage'
import { useAuthStore } from '@/state/authStore'
import { queryClient } from '@/lib/queryClient'
import { loginSchema, type LoginFormValues } from '@/validation/auth'
import { AuthCard } from '@/components/auth/AuthCard'
import { TextField } from '@/components/primitives/TextField'
import { PasswordField } from '@/components/primitives/PasswordField'
import { Button } from '@/components/primitives/Button'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'

/** Distinguishes a bad-credentials 401 from every other failure — the
 * design spec calls for this exact plain-language copy rather than the
 * generic session-ended fallback in src/api/errors.ts, which is written
 * for an already-authenticated session unexpectedly expiring, not a
 * failed login attempt. */
const INVALID_CREDENTIALS_MESSAGE = "That username or password isn't right. Please try again."

export function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [formError, setFormError] = useState<string | null>(null)

  const {
    register: registerField,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  })

  const onSubmit = async (values: LoginFormValues) => {
    setFormError(null)

    try {
      const tokens = await login(values)
      tokenStorage.setRefreshToken(tokens.refresh)
      useAuthStore.getState().setAccessToken(tokens.access)

      const user = await fetchCurrentUser()
      useAuthStore.getState().setUser(user)
      queryClient.setQueryData(['me'], user)

      const from = (location.state as { from?: { pathname?: string } } | null)?.from
      const roleHome = user.role === 'WORKER' ? '/worker' : '/employer'
      navigate(from?.pathname ?? roleHome, { replace: true })
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.kind === 'unauthorized') {
          setFormError(INVALID_CREDENTIALS_MESSAGE)
        } else {
          setFormError(toBannerMessage(error))
        }
      } else {
        setFormError('Something went wrong — please try again.')
      }
    }
  }

  return (
    <AuthCard title="Log In">
      {formError && (
        <div className="mb-4">
          <ErrorBanner message={formError} />
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-4">
        <TextField
          label="Username"
          autoComplete="username"
          error={errors.username?.message}
          {...registerField('username')}
        />
        <PasswordField
          label="Password"
          error={errors.password?.message}
          {...registerField('password')}
        />

        <Button type="submit" variant="primary" isLoading={isSubmitting} className="mt-2">
          Log In
        </Button>
      </form>

      <p className="mt-6 text-center text-base text-text-secondary">
        New here?{' '}
        <Link to="/register" className="font-semibold text-brand-primary hover:underline">
          Register
        </Link>
      </p>
    </AuthCard>
  )
}
