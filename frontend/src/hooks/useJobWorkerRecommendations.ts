import { useQuery } from '@tanstack/react-query'
import { fetchJobWorkerRecommendations } from '@/api/endpoints/recommendations'

export function jobWorkerRecommendationsQueryKey(jobId: number | string) {
  return ['recommendations', 'jobs', String(jobId), 'workers'] as const
}

export function useJobWorkerRecommendations(jobId: number | string | undefined) {
  return useQuery({
    queryKey: jobWorkerRecommendationsQueryKey(jobId ?? ''),
    queryFn: () => fetchJobWorkerRecommendations(jobId as string),
    enabled: jobId !== undefined,
  })
}
