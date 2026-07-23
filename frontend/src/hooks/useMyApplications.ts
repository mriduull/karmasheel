import { useQuery } from '@tanstack/react-query'
import { fetchMyApplications } from '@/api/endpoints/applications'

export const MY_APPLICATIONS_QUERY_KEY = ['applications', 'mine'] as const

/** Shared across the Worker Dashboard (summary), My Applications (full
 * list), and Job Detail's ApplyPanel (already-applied check) so all
 * three read — and invalidate — the exact same cache entry.
 *
 * `enabled` defaults to `true` (Dashboard/My Applications, both already
 * Worker-role-guarded routes); ApplyPanel passes `enabled: role === 'WORKER'`
 * since it renders for every visitor, including anonymous ones who would
 * otherwise trigger a doomed-to-401 request. */
export function useMyApplications(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: MY_APPLICATIONS_QUERY_KEY,
    queryFn: fetchMyApplications,
    enabled: options.enabled,
  })
}
