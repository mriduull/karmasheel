import { apiFetch } from '@/api/client'
import type { ApiList } from '@/types/api'
import type {
  Application,
  ApplicationCreatePayload,
  ApplicationStatusUpdatePayload,
} from '@/types/application'

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
