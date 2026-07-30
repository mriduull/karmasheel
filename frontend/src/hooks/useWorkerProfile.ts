import { useQuery } from '@tanstack/react-query'
import { fetchWorkerProfile } from '@/api/endpoints/profiles'

export const WORKER_PROFILE_QUERY_KEY = ['profiles', 'worker', 'me'] as const

/** Shared across the Worker Dashboard and Worker Profile screens so both
 * read (and invalidate) the exact same cache entry. */
export function useWorkerProfile() {
  return useQuery({
    queryKey: WORKER_PROFILE_QUERY_KEY,
    queryFn: fetchWorkerProfile,
  })
}
