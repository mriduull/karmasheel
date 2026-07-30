import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useAuthStore } from '@/state/authStore'
import { useEmployerVerificationStatus } from '@/hooks/useEmployerVerificationStatus'
import { LoadingIndicator } from '@/components/primitives/LoadingIndicator'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { PageContainer } from '@/components/primitives/PageContainer'
import { toBannerMessage } from '@/api/errors'
import type { ApiError } from '@/api/errors'
import type { Role } from '@/types/user'

function roleHome(role: Role): string {
  return role === 'WORKER' ? '/worker' : '/employer'
}

/** Generic protected-route guard — authenticated, any role. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  return <>{children}</>
}

/** Public-only guard — Login/Register redirect an already-authenticated user home. */
export function PublicOnly({ children }: { children: ReactNode }) {
  const user = useAuthStore((state) => state.user)

  if (user) {
    return <Navigate to={roleHome(user.role)} replace />
  }

  return <>{children}</>
}

/** Worker-only / employer-only guard, parameterized by `role`. A logged-in
 * user of the *other* role is redirected to their own dashboard rather
 * than shown a permission error, since this is a routing mismatch, not a
 * permission the user might plausibly be missing. */
export function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const user = useAuthStore((state) => state.user)
  const location = useLocation()

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />
  }

  if (user.role !== role) {
    return <Navigate to={roleHome(user.role)} replace />
  }

  return <>{children}</>
}

/**
 * Verified-employer gating infrastructure — wraps `RequireRole("EMPLOYER")`
 * and additionally requires `verification_status === "VERIFIED"`, matching
 * the backend's `IsVerifiedEmployer` permission
 * (backend/jobs/permissions.py) so the frontend never shows an action the
 * API would 403. Real data, from `GET /api/profiles/employer/me/`
 * (`useEmployerVerificationStatus`).
 */
export function RequireVerifiedEmployer({ children }: { children: ReactNode }) {
  const { status, isLoading, isError, error, refetch } = useEmployerVerificationStatus()

  return (
    <RequireRole role="EMPLOYER">
      <VerifiedGate status={status} isLoading={isLoading} isError={isError} error={error} refetch={refetch}>
        {children}
      </VerifiedGate>
    </RequireRole>
  )
}

function VerifiedGate({
  status,
  isLoading,
  isError,
  error,
  refetch,
  children,
}: {
  status: 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED' | null
  isLoading: boolean
  isError: boolean
  error: ApiError | null
  refetch: () => void
  children: ReactNode
}) {
  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingIndicator label="Checking verification status" />
      </div>
    )
  }

  // A fetch failure is never silently treated as "unverified" — that
  // would hide a network/server problem behind a permission message that
  // doesn't describe what actually happened. Shown with a retry instead
  // of redirecting away.
  if (isError) {
    return (
      <PageContainer>
        <ErrorBanner
          message={
            error ? toBannerMessage(error) : "We couldn't check your verification status."
          }
          onRetry={refetch}
        />
      </PageContainer>
    )
  }

  if (status !== 'VERIFIED') {
    return <Navigate to="/unauthorized" replace state={{ reason: 'unverified-employer', status }} />
  }

  return <>{children}</>
}
