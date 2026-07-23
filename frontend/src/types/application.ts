/** applications/models.py:Application.Status — the complete, real set.
 * Never invent additional values. */
export type ApplicationStatus =
  | 'APPLIED'
  | 'SHORTLISTED'
  | 'CONTACTED'
  | 'HIRED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'COMPLETED'
  | 'CANCELLED'

/**
 * applications/serializers.py:ApplicationSerializer — response shape from
 * `GET /api/applications/` and `POST /api/applications/`. Deliberately
 * has no employer name/contact/job-address fields — only `job` (id) and
 * `job_title` are exposed; anything more about the job requires following
 * `job` to `GET /api/jobs/<id>/`.
 */
export interface Application {
  id: number
  job: number
  job_title: string
  worker_username: string
  status: ApplicationStatus
  worker_note: string
  employer_note: string
  created_at: string
  updated_at: string
}

/** applications/serializers.py:ApplicationCreateSerializer — the only
 * writable fields are `job` and `worker_note`. */
export interface ApplicationCreatePayload {
  job: number
  worker_note?: string
}

/** applications/serializers.py:ApplicationStatusUpdateSerializer, plus
 * the view's own direct read of `worker_note`/`employer_note` from the
 * request body (applications/views.py:ApplicationStatusUpdateView.patch)
 * — not part of the serializer itself, but genuinely honored. */
export interface ApplicationStatusUpdatePayload {
  status: ApplicationStatus
  worker_note?: string
}
