import { useEmployerProfile } from './useEmployerProfile'
import { ApiError } from '@/api/errors'

/** `profiles/models.py:EmployerProfile.VerificationStatus` — the
 * complete, real set of choices. Never invent additional values. */
export type EmployerVerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED'

interface EmployerVerificationState {
  status: EmployerVerificationStatus | null
  isLoading: boolean
  /** True only for a genuine fetch failure (network/server/etc) — never
   * true just because the resolved status isn't VERIFIED. Callers must
   * not collapse this into "unverified"; see routes/guards.tsx:VerifiedGate. */
  isError: boolean
  error: ApiError | null
  refetch: () => void
}

/**
 * Real implementation, replacing the Phase F0 stub — backed by
 * `GET /api/profiles/employer/me/` (`useEmployerProfile`, shared with the
 * Employer Dashboard/Profile screens so they all read the same cache
 * entry). `status` is `null` while loading or on error, never defaulted
 * to `'UNVERIFIED'` — a caller checking `status !== 'VERIFIED'` without
 * also checking `isLoading`/`isError` would otherwise briefly (or
 * permanently, on a network error) treat "we don't know yet" as "denied".
 */
export function useEmployerVerificationStatus(): EmployerVerificationState {
  const profileQuery = useEmployerProfile()

  return {
    status: profileQuery.data?.verification_status ?? null,
    isLoading: profileQuery.isLoading,
    isError: profileQuery.isError,
    error: profileQuery.error instanceof ApiError ? profileQuery.error : null,
    refetch: () => {
      void profileQuery.refetch()
    },
  }
}
