import { useQuery } from '@tanstack/react-query'
import { fetchEmployerProfile } from '@/api/endpoints/profiles'

export const EMPLOYER_PROFILE_QUERY_KEY = ['profiles', 'employer', 'me'] as const

/** Shared across the Employer Dashboard, Employer Profile, My Jobs
 * (verification gate), and `useEmployerVerificationStatus` so all read —
 * and invalidate — the exact same cache entry. */
export function useEmployerProfile() {
  return useQuery({
    queryKey: EMPLOYER_PROFILE_QUERY_KEY,
    queryFn: fetchEmployerProfile,
  })
}
