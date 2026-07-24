import { apiFetch } from '@/api/client'
import type { ApiList } from '@/types/api'
import type { JobRecommendation, OpportunityAdvisory, WorkerRecommendation } from '@/types/recommendation'

/**
 * GET /api/recommendations/jobs/?limit= — ranked, explained job
 * recommendations for the authenticated Worker's own profile
 * (recommendations/views.py:WorkerJobRecommendationsView). `limit` is
 * omitted entirely when not supplied, letting the backend apply its own
 * default (`RECOMMENDATION_SETTINGS.DEFAULT_RESULT_LIMIT`) rather than the
 * frontend guessing or duplicating that number. 404s if the worker has no
 * profile yet (structurally shouldn't happen — registration auto-creates one).
 */
export function fetchWorkerJobRecommendations(limit?: number): Promise<ApiList<JobRecommendation>> {
  const query = limit !== undefined ? `?limit=${limit}` : ''
  return apiFetch<ApiList<JobRecommendation>>(`/recommendations/jobs/${query}`)
}

/**
 * GET /api/recommendations/jobs/<job_id>/workers/?limit= — ranked, explained
 * worker candidates for one of the requesting Employer's own jobs
 * (recommendations/views.py:JobWorkerRecommendationsView). Verified-employer
 * and job-ownership are enforced server-side (`IsVerifiedEmployer`, then a
 * 403 for a non-owner) — the frontend route guard is a UX convenience, not
 * the actual gate.
 */
export function fetchJobWorkerRecommendations(
  jobId: number | string,
  limit?: number,
): Promise<ApiList<WorkerRecommendation>> {
  const query = limit !== undefined ? `?limit=${limit}` : ''
  return apiFetch<ApiList<WorkerRecommendation>>(`/recommendations/jobs/${jobId}/workers/${query}`)
}

/**
 * GET /api/recommendations/opportunities/ — near-miss jobs plus ranked
 * missing-skill suggestions for the authenticated Worker's own profile
 * (recommendations/views.py:OpportunityAdvisoryView). Not a paginated or
 * bare-array response — a single object with two arrays inside it.
 */
export function fetchOpportunityAdvisory(): Promise<OpportunityAdvisory> {
  return apiFetch<OpportunityAdvisory>('/recommendations/opportunities/')
}
