import { useQuery } from '@tanstack/react-query'
import { fetchMyJobs } from '@/api/endpoints/jobs'

export const MY_JOBS_QUERY_KEY = ['jobs', 'mine'] as const

/** Shared across the Employer Dashboard (summary) and My Jobs (full
 * list) so both read — and invalidate — the exact same cache entry. */
export function useMyJobs() {
  return useQuery({
    queryKey: MY_JOBS_QUERY_KEY,
    queryFn: fetchMyJobs,
  })
}
