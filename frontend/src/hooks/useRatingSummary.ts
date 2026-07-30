import { useQuery } from '@tanstack/react-query'
import { fetchRatingSummary } from '@/api/endpoints/applications'

/** Shared across the Worker Ratings and Employer Ratings screens — each
 * fetches its own viewer's aggregate (the endpoint is viewer-scoped
 * server-side), so the same query key is safe to reuse for both roles
 * without ever mixing up whose summary is cached. */
export const RATING_SUMMARY_QUERY_KEY = ['applications', 'ratings', 'summary'] as const

export function useRatingSummary() {
  return useQuery({
    queryKey: RATING_SUMMARY_QUERY_KEY,
    queryFn: fetchRatingSummary,
  })
}
