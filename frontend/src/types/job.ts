import type { EmployerVerificationStatus } from '@/hooks/useEmployerVerificationStatus'
import type { SkillTagSummary } from './skill'

export type JobStatus = 'ACTIVE' | 'CLOSED'
export type WorkType = 'FULL_TIME' | 'PART_TIME' | 'CONTRACT' | 'ONE_TIME'
export type WageType = 'HOURLY' | 'DAILY' | 'MONTHLY' | 'FIXED'

export type { SkillTagSummary }

/**
 * jobs/serializers.py:PublicJobPostSerializer — the read-only, public-safe
 * shape returned by `GET /api/jobs/browse/` and `GET /api/jobs/<id>/` for
 * anonymous/non-owner requests. Deliberately has NO distance/distance_km
 * field (that only exists on the recommendation endpoints, Phase F4) and
 * no employer contact details or PAN/VAT.
 */
export interface PublicJobPost {
  id: number
  title: string
  description: string
  category: number
  category_name: string
  subcategory: number
  subcategory_name: string
  employer_name: string
  employer_verification_status: EmployerVerificationStatus
  required_skills: SkillTagSummary[]
  preferred_skills: SkillTagSummary[]
  address: string
  latitude: string
  longitude: string
  required_experience_years: number
  wage_type: WageType
  wage_amount: string
  work_type: WorkType
  scheduled_datetime: string | null
  duration_days: number | null
  number_of_workers_required: number
  application_deadline: string | null
  status: JobStatus
  created_at: string
  updated_at: string
}

/**
 * jobs/serializers.py:JobPostSerializer — the OWNER-view shape, returned
 * from `GET /api/jobs/` (own list), `POST /api/jobs/` (create),
 * `GET/PUT/PATCH /api/jobs/<id>/` when the requester owns the job. Unlike
 * `PublicJobPost`: no `employer_verification_status` field (the owner
 * doesn't need a badge for their own account), but includes
 * `unmatched_required_terms`/`unmatched_preferred_terms` (write-only
 * skill-input echo, only meaningfully non-empty in a create/update
 * response — see `types/profile.ts:WorkerProfile.unmatched_terms` for the
 * identical pattern). `required_skills_input`/`preferred_skills_input`
 * are write-only and never appear in a response body.
 */
export interface EmployerJobPost {
  id: number
  title: string
  category: number
  category_name: string
  subcategory: number
  subcategory_name: string
  employer_name: string
  required_skills: SkillTagSummary[]
  preferred_skills: SkillTagSummary[]
  unmatched_required_terms: string[]
  unmatched_preferred_terms: string[]
  description: string
  address: string
  latitude: string
  longitude: string
  required_experience_years: number
  wage_type: WageType
  wage_amount: string
  work_type: WorkType
  scheduled_datetime: string | null
  duration_days: number | null
  number_of_workers_required: number
  application_deadline: string | null
  status: JobStatus
  created_at: string
  updated_at: string
}

/**
 * `POST /api/jobs/` request body. `required_skills_input`/
 * `preferred_skills_input` are free-text phrase lists, resolved
 * server-side (`taxonomy/services.py:normalize_skill_phrases`) — never
 * validated as "real" skills client-side. `status` is deliberately never
 * sent — a new job always starts `ACTIVE`
 * (`JobPost.status` default), there is no draft state.
 */
export interface JobCreatePayload {
  title: string
  category: number
  subcategory: number
  description: string
  address: string
  latitude: number
  longitude: number
  required_experience_years: number
  wage_type: WageType
  wage_amount: number
  work_type: WorkType
  scheduled_datetime?: string | null
  duration_days?: number | null
  number_of_workers_required: number
  application_deadline?: string | null
  required_skills_input?: string[]
  preferred_skills_input?: string[]
}

/**
 * `PATCH /api/jobs/<id>/` request body — a true partial update
 * (`JobPostSerializer` via `DjangoModelSerializer`'s standard partial
 * mechanics, same as `WorkerProfileSerializer`): every field optional,
 * omitted fields left untouched. `status` is only ever sent here as
 * `'CLOSED'` (closing a job) — the serializer's own `validate_status`
 * rejects `'CLOSED' -> 'ACTIVE'`, so this type intentionally does not
 * offer `'ACTIVE'` as a settable value on an existing job.
 */
/**
 * jobs/serializers.py:WorkerCandidateSerializer — GET /api/jobs/<id>/candidates/,
 * the coarse, unscored candidate list. Deliberately has no phone number and
 * no score/ranking field at all — never synthesize one client-side; this
 * endpoint is a pre-filter, not a ranking (see RecommendedWorkerSummary in
 * types/recommendation.ts for the scored equivalent).
 */
export interface WorkerCandidate {
  id: number
  username: string
  address: string
  latitude: string | null
  longitude: string | null
  experience_years: number
  is_available: boolean
  expected_wage: string | null
  preferred_travel_radius_km: number | null
  skills: SkillTagSummary[]
}

export interface JobUpdatePayload {
  title?: string
  category?: number
  subcategory?: number
  description?: string
  address?: string
  latitude?: number
  longitude?: number
  required_experience_years?: number
  wage_type?: WageType
  wage_amount?: number
  work_type?: WorkType
  scheduled_datetime?: string | null
  duration_days?: number | null
  number_of_workers_required?: number
  application_deadline?: string | null
  required_skills_input?: string[]
  preferred_skills_input?: string[]
  status?: 'CLOSED'
}
