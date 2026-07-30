import { useQuery } from '@tanstack/react-query'
import { fetchOwnerJob } from '@/api/endpoints/jobs'

/** Distinct cache key from the public Job Detail's `['job', id]`
 * (Phase F1) — the owner view is a different response shape
 * (`EmployerJobPost`, not `PublicJobPost`), so they must never share a
 * cache entry. */
export function ownerJobQueryKey(id: number | string) {
  return ['jobs', 'owner', String(id)] as const
}

export function useOwnerJob(id: number | string | undefined) {
  return useQuery({
    queryKey: ownerJobQueryKey(id ?? ''),
    queryFn: () => fetchOwnerJob(id as string),
    enabled: id !== undefined,
  })
}
