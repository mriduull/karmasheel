import { apiFetch } from '@/api/client'
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
