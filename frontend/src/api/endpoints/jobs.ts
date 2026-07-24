import { apiFetch } from '@/api/client'
import type { ApiList } from '@/types/api'
import type { EmployerJobPost, JobCreatePayload, JobUpdatePayload, PublicJobPost } from '@/types/job'

export interface JobBrowseFilters {
  category?: number
  subcategory?: number
  workType?: string
  /** Must be supplied together — the backend 400s otherwise
   * (jobs/views.py:ActiveJobBrowseView). */
  latitude?: number
  longitude?: number
  maxDistanceKm?: number
}

/**
 * Builds the exact query string `GET /api/jobs/browse/` expects
 * (jobs/views.py:ActiveJobBrowseView / jobs/services.py:filter_active_jobs):
 * `category`, `subcategory`, `work_type`, `latitude`, `longitude`,
 * `max_distance_km`. `latitude`/`longitude` are only ever sent as a pair —
 * the backend requires both or neither. `max_distance_km` is only sent
 * alongside a coordinate pair, since `filter_active_jobs` silently ignores
 * it otherwise (no origin to measure distance from).
 */
export function buildJobBrowseSearchParams(filters: JobBrowseFilters): URLSearchParams {
  const params = new URLSearchParams()

  if (filters.category !== undefined) params.set('category', String(filters.category))
  if (filters.subcategory !== undefined) params.set('subcategory', String(filters.subcategory))
  if (filters.workType) params.set('work_type', filters.workType)

  if (filters.latitude !== undefined && filters.longitude !== undefined) {
    params.set('latitude', String(filters.latitude))
    params.set('longitude', String(filters.longitude))
    if (filters.maxDistanceKm !== undefined) {
      params.set('max_distance_km', String(filters.maxDistanceKm))
    }
  }

  return params
}

/**
 * GET /api/jobs/browse/ — public, bare array (never a paginated envelope).
 *
 * Deliberately NOT called with `isPublic: true`: when a Worker is signed
 * in, attaching their access token lets `ActiveJobBrowseView` fall back to
 * their own stored profile coordinates/travel radius for distance
 * filtering when no explicit `latitude`/`longitude` is supplied — an
 * anonymous visitor simply has no token to attach, so this is a no-op for
 * them either way.
 */
export function browseJobs(filters: JobBrowseFilters = {}): Promise<ApiList<PublicJobPost>> {
  const query = buildJobBrowseSearchParams(filters).toString()
  return apiFetch<ApiList<PublicJobPost>>(`/jobs/browse/${query ? `?${query}` : ''}`)
}

/**
 * GET /api/jobs/<id>/ — public for an active job (404 for a non-owner on a
 * closed/missing job). Returns `PublicJobPostSerializer`'s shape for any
 * non-owner viewer. Not called with `isPublic: true` for the same reason
 * as `browseJobs` — this only matters if the viewer happens to be the
 * job's own owning employer, which returns a different (owner) shape;
 * that case belongs to Phase F3's job-management screens, not this public
 * detail page.
 */
export function fetchJobDetail(id: number | string): Promise<PublicJobPost> {
  return apiFetch<PublicJobPost>(`/jobs/${id}/`)
}

/** GET /api/jobs/ — the authenticated Employer's own jobs, bare array,
 * newest first (`JobPost.Meta.ordering = ["-created_at"]`). Any Employer
 * may list their own postings regardless of verification status
 * (`jobs/views.py:JobPostListCreateView` — only `POST` requires
 * `IsVerifiedEmployer`). Not paginated. */
export function fetchMyJobs(): Promise<ApiList<EmployerJobPost>> {
  return apiFetch<ApiList<EmployerJobPost>>('/jobs/')
}

/** POST /api/jobs/ — verified-Employer-only
 * (`jobs/permissions.py:IsVerifiedEmployer`, enforced server-side; the
 * frontend also gates the route with `RequireVerifiedEmployer` so this
 * 403 is a defensive fallback, not the primary gate). A new job always
 * starts `ACTIVE` — there is no draft status to request. */
export function createJob(payload: JobCreatePayload): Promise<EmployerJobPost> {
  return apiFetch<EmployerJobPost>('/jobs/', { method: 'POST', body: payload })
}

/**
 * GET /api/jobs/<id>/ for the OWNING employer — returns
 * `JobPostSerializer`'s full shape (`jobs/views.py:JobPostDetailView.get`,
 * `is_owner` branch), distinct from the public `fetchJobDetail` above.
 * 403 for a non-owner Employer, 404 if the job doesn't exist at all.
 */
export function fetchOwnerJob(id: number | string): Promise<EmployerJobPost> {
  return apiFetch<EmployerJobPost>(`/jobs/${id}/`)
}

/**
 * PATCH /api/jobs/<id>/ — owner-only, any verification status (editing an
 * existing job never requires `IsVerifiedEmployer`; only creating a new
 * one does — confirmed directly against `JobPostListCreateView.get_permissions`
 * vs. `JobPostDetailView`, which has no such check at all). Always
 * partial — the safest supported update behavior, matching every other
 * PATCH-based form in this app.
 */
export function updateJob(id: number | string, payload: JobUpdatePayload): Promise<EmployerJobPost> {
  return apiFetch<EmployerJobPost>(`/jobs/${id}/`, { method: 'PATCH', body: payload })
}
