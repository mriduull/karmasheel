import type { SkillTagSummary } from './skill'

export interface SkillMatchSuggestion extends SkillTagSummary {
  confidence: number
}

export interface WorkerSkillMatch {
  input_term: string
  method: 'exact_name' | 'exact_alias' | 'fuzzy' | 'unmatched'
  confidence: number
  matched_skill: SkillTagSummary | null
  matched_skill_was_selected: boolean
  suggestions: SkillMatchSuggestion[]
}

/**
 * profiles/serializers.py:WorkerProfileSerializer — response shape from
 * `GET`/`PATCH /api/profiles/worker/me/`. `latitude`/`longitude`/
 * `expected_wage` are DRF DecimalFields, serialized as strings (or `null`
 * when unset) — never invented as `0`.
 */
export interface WorkerProfile {
  id: number
  address: string
  profile_photo: string | null
  profile_photo_url: string | null
  latitude: string | null
  longitude: string | null
  experience_years: number
  is_available: boolean
  expected_wage: string | null
  preferred_travel_radius_km: number | null
  skills: SkillTagSummary[]
  /**
   * Transient details for the phrases submitted in the current request.
   * A plain GET returns an empty list. The worker uses non-canonical
   * matches to verify or correct the normalization decision.
   */
  skill_matches: WorkerSkillMatch[]
  /**
   * Only ever non-empty in the response to a request that included
   * `skill_input` and/or `skill_review_input` (a `SerializerMethodField`
   * backed by transient request state). A plain GET always returns `[]`,
   * even if a previous save created an admin-review term.
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
  profile_photo?: File | null
  latitude?: number | null
  longitude?: number | null
  experience_years?: number
  is_available?: boolean
  expected_wage?: number | null
  preferred_travel_radius_km?: number | null
  skill_input?: string[]
  /** Explicit active taxonomy choices, used by the category picker. */
  skill_ids?: number[]
  /** Phrases the worker explicitly wants an administrator to review. */
  skill_review_input?: string[]
}
