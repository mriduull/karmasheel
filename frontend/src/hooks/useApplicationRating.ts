import { useQuery } from '@tanstack/react-query'
import { fetchApplicationRatings } from '@/api/endpoints/applications'

export function applicationRatingQueryKey(applicationId: number | string) {
  return ['applications', String(applicationId), 'rating'] as const
}

/** `enabled` defaults to `true`, but every real caller
 * (`RateEngagementButton`) passes `enabled: application.status === 'COMPLETED'`
 * — rating only ever exists on a completed application
 * (applications/services.py:submit_rating's own guard), so there is no
 * reason to fire this for any other status. */
export function useApplicationRating(applicationId: number | string, options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: applicationRatingQueryKey(applicationId),
    queryFn: () => fetchApplicationRatings(applicationId),
    enabled: options.enabled ?? true,
  })
}
