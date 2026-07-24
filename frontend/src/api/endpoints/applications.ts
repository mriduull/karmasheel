import { apiFetch } from '@/api/client'
import type { ApiList } from '@/types/api'
import type {
  Application,
  ApplicationCreatePayload,
  ApplicationStatusUpdatePayload,
} from '@/types/application'
import type { Rating, RatingCreatePayload, RatingSummary } from '@/types/rating'

/** GET /api/applications/ — the authenticated Worker's own application
 * history, bare array (no pagination), newest first
 * (`Application.Meta.ordering = ["-created_at"]`). 404s if the worker has
 * no profile yet — structurally shouldn't happen (see profiles.ts). */
export function fetchMyApplications(): Promise<ApiList<Application>> {
  return apiFetch<ApiList<Application>>('/applications/')
}

/** POST /api/applications/ — apply to a job. `applications/views.py`
 * scopes `worker` from the authenticated request, never from the body. */
export function createApplication(payload: ApplicationCreatePayload): Promise<Application> {
  return apiFetch<Application>('/applications/', { method: 'POST', body: payload })
}

/** PATCH /api/applications/<id>/status/ — the single endpoint for every
 * status transition, worker- or employer-initiated
 * (applications/services.py:WORKER_ALLOWED_TRANSITIONS /
 * EMPLOYER_ALLOWED_TRANSITIONS). A Worker may only ever request
 * `WITHDRAWN`, and only from `APPLIED`/`SHORTLISTED`/`CONTACTED`. */
export function updateApplicationStatus(
  id: number,
  payload: ApplicationStatusUpdatePayload,
): Promise<Application> {
  return apiFetch<Application>(`/applications/${id}/status/`, { method: 'PATCH', body: payload })
}

/**
 * GET /api/jobs/<job_id>/applications/ — the owning Employer's view of
 * one job's applications, bare array. Note the URL: this view
 * (`applications/views.py:JobApplicationsView`) is routed under
 * `jobs/urls.py`, not `applications/urls.py` — there is no
 * employer-wide "all my applicants" endpoint at all, only this
 * per-job one. 403 for a non-owner, 404 if the job doesn't exist.
 */
export function fetchJobApplications(jobId: number | string): Promise<ApiList<Application>> {
  return apiFetch<ApiList<Application>>(`/jobs/${jobId}/applications/`)
}

/** GET /api/applications/<id>/rating/ — 0, 1, or 2 `Rating` entries for one
 * application (applications/views.py:ApplicationRatingView.get). Scoped to
 * the two participants server-side (403 for anyone else). There is no
 * separate "list all my ratings" endpoint — this per-application call, plus
 * the aggregate summary below, is the complete picture the backend provides
 * (docs/FRONTEND_IMPLEMENTATION_PLAN.md §1). */
export function fetchApplicationRatings(applicationId: number | string): Promise<ApiList<Rating>> {
  return apiFetch<ApiList<Rating>>(`/applications/${applicationId}/rating/`)
}

/** POST /api/applications/<id>/rating/ — rate the other participant.
 * `direction`/`reviewer`/`reviewed_user` are always derived server-side from
 * which side of the application the authenticated user is on
 * (applications/services.py:submit_rating) — never sent by the client.
 * `400` if the application isn't `COMPLETED` yet or this direction has
 * already been rated once. */
export function submitApplicationRating(
  applicationId: number | string,
  payload: RatingCreatePayload,
): Promise<Rating> {
  return apiFetch<Rating>(`/applications/${applicationId}/rating/`, { method: 'POST', body: payload })
}

/** GET /api/applications/ratings/summary/ — the authenticated user's own
 * aggregate rating, as the party being rated. Works identically for a
 * Worker or an Employer (applications/views.py:MyRatingSummaryView). */
export function fetchRatingSummary(): Promise<RatingSummary> {
  return apiFetch<RatingSummary>('/applications/ratings/summary/')
}
