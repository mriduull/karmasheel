import type { SkillTagSummary } from './skill'

/**
 * profiles/serializers.py:WorkerProfileSerializer — response shape from
 * `GET`/`PATCH /api/profiles/worker/me/`. `latitude`/`longitude`/
 * `expected_wage` are DRF DecimalFields, serialized as strings (or `null`
 * when unset) — never invented as `0`.
 */
export interface WorkerProfile {
  id: number
  address: string
  latitude: string | null
  longitude: string | null
  experience_years: number
  is_available: boolean
  expected_wage: string | null
  preferred_travel_radius_km: number | null
  skills: SkillTagSummary[]
  /**
   * Only ever non-empty in the response to a request that itself included
   * `skill_input` (a `SerializerMethodField` backed by a transient
   * instance attribute set during that same request/response cycle) — a
   * plain `GET` always returns `[]` here, even if a previous save had
   * unmatched terms. See src/api/endpoints/profiles.ts.
   */
  unmatched_terms: string[]
  created_at: string
  updated_at: string
}

/**
 * Request body for `PATCH /api/profiles/worker/me/` — every field is
 * optional (true partial update; omitted fields are left untouched by
 * `WorkerProfileSerializer.update`). `null` explicitly clears a nullable
 * field; omitting a key leaves it as-is.
 */
export interface WorkerProfileUpdatePayload {
  address?: string
  latitude?: number | null
  longitude?: number | null
  experience_years?: number
  is_available?: boolean
  expected_wage?: number | null
  preferred_travel_radius_km?: number | null
  skill_input?: string[]
}
