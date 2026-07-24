import { useQuery } from '@tanstack/react-query'
import { fetchWorkerJobRecommendations } from '@/api/endpoints/recommendations'

export const WORKER_JOB_RECOMMENDATIONS_QUERY_KEY = ['recommendations', 'jobs'] as const

/** `staleTime: 0` (the default) is deliberate, not an oversight — every
 * score is computed fresh per request server-side (nothing is cached
 * there), so treating a stale client copy as still-valid would show a
 * ranking that no longer reflects the worker's current profile. */
export function useWorkerJobRecommendations() {
  return useQuery({
    queryKey: WORKER_JOB_RECOMMENDATIONS_QUERY_KEY,
    queryFn: () => fetchWorkerJobRecommendations(),
  })
}
