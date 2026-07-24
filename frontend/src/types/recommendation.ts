import type { SkillTagSummary } from './skill'
import type { JobStatus, WageType, WorkType } from './job'
import type { EmployerVerificationStatus } from '@/hooks/useEmployerVerificationStatus'

/**
 * recommendations/serializers.py:SkillScoreSerializer — 70% required-skill
 * coverage + 30% cosine similarity (weights configurable server-side, not
 * shown to the user as a formula).
 */
export interface SkillScore {
  skill_score: number
  required_skill_coverage: number
  cosine_similarity_score: number
  matched_required_skills: SkillTagSummary[]
  missing_required_skills: SkillTagSummary[]
  matched_preferred_skills: SkillTagSummary[]
}

export interface AvailabilitySubScores {
  is_available: boolean
  wage_compatibility_score: number
  travel_radius_compatibility_score: number
}

/**
 * recommendations/services.py: the dict shape differs by `evaluate_match`
 * direction — `worker_to_job` scores the JOB's employer reliability
 * (includes `verification_status`), `job_to_worker` scores the WORKER's own
 * reliability (no `verification_status` — workers aren't verified).
 * `verification_status` is therefore optional here, not invented as always
 * present.
 */
export interface ReliabilitySubScores {
  contact_verified: boolean
  profile_completeness: number
  verification_status?: EmployerVerificationStatus
}

/**
 * Fields shared by every `RecommendationResult` shape
 * (recommendations/services.py:RecommendationResult /
 * recommendations/serializers.py:_BaseRecommendationSerializer), regardless
 * of whether the subject is a job or a worker. `reciprocal_preference_score`
 * is explanatory only ("Mutual fit") — never part of `final_score` and never
 * rendered as a second ranking number.
 */
export interface RecommendationResultBase {
  final_score: number
  skill: SkillScore
  distance_km: number | null
  distance_score: number | null
  experience_score: number
  availability_preference_score: number
  availability_sub_scores: AvailabilitySubScores
  reliability_verification_score: number
  reliability_sub_scores: ReliabilitySubScores
  employer_side_suitability: number
  worker_side_suitability: number
  reciprocal_preference_score: number
  reasons: string[]
  warnings: string[]
}

/** recommendations/serializers.py:RecommendedJobSerializer — the public-safe
 * job summary nested inside a worker-to-job recommendation / near-miss job. */
export interface RecommendedJobSummary {
  id: number
  title: string
  category_name: string
  subcategory_name: string
  employer_name: string
  address: string
  required_experience_years: number
  wage_type: WageType
  wage_amount: string
  work_type: WorkType
  status: JobStatus
}

/** recommendations/serializers.py:RecommendedWorkerSerializer — no phone
 * number or other private contact detail; never add a "contact this worker"
 * affordance from this shape. */
export interface RecommendedWorkerSummary {
  id: number
  username: string
  address: string
  experience_years: number
  is_available: boolean
  expected_wage: string | null
  preferred_travel_radius_km: number | null
  skills: SkillTagSummary[]
}

/** GET /api/recommendations/jobs/ and each entry of `near_miss_jobs` from
 * GET /api/recommendations/opportunities/ — identical shape
 * (`NearMissJobSerializer` reuses `JobRecommendationSerializer`'s fields). */
export interface JobRecommendation extends RecommendationResultBase {
  job: RecommendedJobSummary
}

/** GET /api/recommendations/jobs/<job_id>/workers/ */
export interface WorkerRecommendation extends RecommendationResultBase {
  worker: RecommendedWorkerSummary
}

/** recommendations/advisory.py:MissingSkillAdvisory /
 * recommendations/serializers.py:MissingSkillAdvisorySerializer.
 * `missing_frequency` = how many near-miss jobs are missing this skill;
 * `required_frequency` = how many near-miss jobs require it at all (a
 * broader demand signal); `job_ids` lets the UI deep-link to the specific
 * jobs this skill would help unlock. */
export interface MissingSkillAdvisory {
  skill: SkillTagSummary
  missing_frequency: number
  required_frequency: number
  job_ids: number[]
}

/** GET /api/recommendations/opportunities/ */
export interface OpportunityAdvisory {
  near_miss_jobs: JobRecommendation[]
  missing_skills: MissingSkillAdvisory[]
}
