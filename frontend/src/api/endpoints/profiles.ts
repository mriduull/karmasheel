import { apiFetch } from '@/api/client'
import type { WorkerProfile, WorkerProfileUpdatePayload } from '@/types/profile'

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
