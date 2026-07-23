export type EmployerVerificationStatus = 'UNVERIFIED' | 'PENDING' | 'VERIFIED' | 'REJECTED'

interface EmployerVerificationState {
  status: EmployerVerificationStatus | null
  isLoading: boolean
}

/**
 * Stub for Phase F0. Returns "not verified, not loading" so
 * `RequireVerifiedEmployer` (routes/guards.tsx) has a real, testable gate
 * today even though `backend/profiles` endpoints aren't wired into the
 * frontend until Phase F3.
 *
 * TODO(F3): replace the body with a TanStack Query call to
 * `GET /api/profiles/employer/me/` (added in
 * `src/api/endpoints/profiles.ts`) and derive `status` from the
 * response's `verification_status` field. This hook's return shape does
 * not change, so nothing above it (the guard, its tests) needs to change.
 */
export function useEmployerVerificationStatus(): EmployerVerificationState {
  return { status: 'UNVERIFIED', isLoading: false }
}
