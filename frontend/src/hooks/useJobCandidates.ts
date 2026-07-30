import { useQuery } from '@tanstack/react-query'
import { fetchJobCandidates } from '@/api/endpoints/jobs'

export function jobCandidatesQueryKey(jobId: number | string) {
  return ['jobs', String(jobId), 'candidates'] as const
}

export function useJobCandidates(jobId: number | string | undefined) {
  return useQuery({
    queryKey: jobCandidatesQueryKey(jobId ?? ''),
    queryFn: () => fetchJobCandidates(jobId as string),
    enabled: jobId !== undefined,
  })
}
