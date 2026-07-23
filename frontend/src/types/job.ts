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
