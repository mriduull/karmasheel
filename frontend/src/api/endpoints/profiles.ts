import { apiFetch, apiFetchRaw } from '@/api/client'
import type { WorkerProfile, WorkerProfileUpdatePayload } from '@/types/profile'
import type { EmployerProfile, EmployerProfileUpdatePayload } from '@/types/employer'

/** GET /api/profiles/worker/me/ — 404s if no profile exists yet
 * (structurally shouldn't happen: accounts/serializers.py:RegisterSerializer
 * auto-creates an empty WorkerProfile for every WORKER registration). */
export function fetchWorkerProfile(): Promise<WorkerProfile> {
  return apiFetch<WorkerProfile>('/profiles/worker/me/')
}

/**
 * PATCH /api/profiles/worker/me/ — a true partial update
 * (`WorkerProfileSerializer.update`): any field omitted from `payload` is
 * left completely untouched server-side, including `skill_input` (only
 * applied when the key is present at all, even as an empty array).
 */
export function updateWorkerProfile(payload: WorkerProfileUpdatePayload): Promise<WorkerProfile> {
  return apiFetch<WorkerProfile>('/profiles/worker/me/', { method: 'PATCH', body: payload })
}

/** GET /api/profiles/worker/me/cv/preview/ — an HTML document
 * (`Content-Type: text/html`), generated entirely from the worker's own
 * stored profile data (profiles/views.py:WorkerCVPreviewView). `apiFetch`
 * already falls through to `.text()` for any non-JSON/PDF content type, so
 * this returns the raw HTML string, meant to be rendered in a sandboxed
 * iframe (`src/components/shared/CVPreviewFrame.tsx`), never via
 * `dangerouslySetInnerHTML`. */
export function fetchWorkerCvPreviewHtml(): Promise<string> {
  return apiFetch<string>('/profiles/worker/me/cv/preview/')
}

export interface WorkerCvPdfResult {
  blob: Blob
  filename: string
}

/** GET /api/profiles/worker/me/cv/pdf/ — binary PDF with the real filename
 * in `Content-Disposition` (profiles/views.py:WorkerCVPdfView). Uses
 * `apiFetchRaw` directly (not `apiFetch`) because the filename lives in a
 * response header that `apiFetch`'s parsed return value discards — this is
 * still the same authenticated client, with the same one-refresh-and-retry
 * behavior on a 401, not a separate fetch path. Callers own creating and
 * revoking the object URL for the returned blob (see WorkerCV.tsx). */
export async function fetchWorkerCvPdf(): Promise<WorkerCvPdfResult> {
  const response = await apiFetchRaw('/profiles/worker/me/cv/pdf/')
  const blob = await response.blob()

  const disposition = response.headers.get('content-disposition') ?? ''
  const match = /filename="?([^";]+)"?/i.exec(disposition)
  const filename = match?.[1] ?? 'cv.pdf'

  return { blob, filename }
}

/** GET /api/profiles/employer/me/ — 404s if no profile exists yet
 * (structurally shouldn't happen — registration auto-creates one for
 * every EMPLOYER, exactly like the Worker profile). */
export function fetchEmployerProfile(): Promise<EmployerProfile> {
  return apiFetch<EmployerProfile>('/profiles/employer/me/')
}

/** PATCH /api/profiles/employer/me/ — true partial update
 * (`EmployerProfileSerializer`). `verification_status` is read-only
 * server-side; this payload type has no field for it at all. */
export function updateEmployerProfile(
  payload: EmployerProfileUpdatePayload,
): Promise<EmployerProfile> {
  return apiFetch<EmployerProfile>('/profiles/employer/me/', { method: 'PATCH', body: payload })
}
