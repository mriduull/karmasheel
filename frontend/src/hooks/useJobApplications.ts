import { useQuery } from '@tanstack/react-query'
import { fetchJobApplications } from '@/api/endpoints/applications'

/** One cache entry per job — an Employer only ever views one job's
 * applicants at a time (there is no employer-wide applicants endpoint to
 * aggregate against anyway). */
export function jobApplicationsQueryKey(jobId: number | string) {
  return ['jobs', String(jobId), 'applications'] as const
}

export function useJobApplications(jobId: number | string) {
  return useQuery({
    queryKey: jobApplicationsQueryKey(jobId),
    queryFn: () => fetchJobApplications(jobId),
  })
}
