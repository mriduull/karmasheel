import type { Category, CategoryTree, Subcategory } from '@/types/taxonomy'
import type { EmployerJobPost, PublicJobPost, WorkerCandidate } from '@/types/job'
import type { WorkerProfile } from '@/types/profile'
import type { EmployerProfile } from '@/types/employer'
import type { Application } from '@/types/application'
import type {
  JobRecommendation,
  MissingSkillAdvisory,
  OpportunityAdvisory,
  RecommendationResultBase,
  RecommendedJobSummary,
  RecommendedWorkerSummary,
  WorkerRecommendation,
} from '@/types/recommendation'
import type { Rating, RatingSummary } from '@/types/rating'

export const CATEGORY_FIXTURES: Category[] = [
  { id: 1, name: 'Construction & Repair' },
  { id: 2, name: 'Domestic & Local Services' },
]

export const SUBCATEGORY_FIXTURES: Subcategory[] = [
  { id: 1, name: 'Electrical', category: 1 },
  { id: 2, name: 'Masonry', category: 1 },
  { id: 3, name: 'Cleaning', category: 2 },
]

export const CATEGORY_TREE_FIXTURES: CategoryTree[] = [
  {
    id: 1,
    name: 'Construction & Repair',
    subcategories: [
      { id: 1, name: 'Electrical', skills: [{ id: 2, name: 'House Wiring' }] },
      { id: 2, name: 'Masonry', skills: [{ id: 6, name: 'Tile Installation' }] },
    ],
  },
  {
    id: 2,
    name: 'Domestic & Local Services',
    subcategories: [{ id: 3, name: 'Cleaning', skills: [] }],
  },
]

export function buildJobFixture(overrides: Partial<PublicJobPost> = {}): PublicJobPost {
  return {
    id: 5,
    title: 'House Wiring for New Apartment Block',
    description: 'Complete wiring and breaker installation for a new four-unit apartment block.',
    category: 1,
    category_name: 'Construction & Repair',
    subcategory: 1,
    subcategory_name: 'Electrical',
    employer_name: 'Kathmandu Home Services Pvt. Ltd.',
    employer_verification_status: 'VERIFIED',
    required_skills: [{ id: 2, name: 'House Wiring', subcategory: 'Electrical' }],
    preferred_skills: [{ id: 4, name: 'Electrical Repair', subcategory: 'Electrical' }],
    address: 'Baneshwor, Kathmandu',
    latitude: '27.693800',
    longitude: '85.335500',
    required_experience_years: 3,
    wage_type: 'DAILY',
    wage_amount: '1300.00',
    work_type: 'CONTRACT',
    scheduled_datetime: null,
    duration_days: null,
    number_of_workers_required: 2,
    application_deadline: '2026-08-21T12:00:00Z',
    status: 'ACTIVE',
    created_at: '2026-07-22T12:00:00Z',
    updated_at: '2026-07-22T12:00:00Z',
    ...overrides,
  }
}

export function buildWorkerProfileFixture(overrides: Partial<WorkerProfile> = {}): WorkerProfile {
  return {
    id: 3,
    address: 'Koteshwor, Kathmandu',
    latitude: '27.677800',
    longitude: '85.348800',
    experience_years: 6,
    is_available: true,
    expected_wage: '1200.00',
    preferred_travel_radius_km: 15,
    skills: [{ id: 2, name: 'House Wiring', subcategory: 'Electrical' }],
    unmatched_terms: [],
    created_at: '2026-07-22T12:00:00Z',
    updated_at: '2026-07-22T12:00:00Z',
    ...overrides,
  }
}

export function buildEmployerProfileFixture(overrides: Partial<EmployerProfile> = {}): EmployerProfile {
  return {
    id: 4,
    organization_name: 'Kathmandu Home Services Pvt. Ltd.',
    address: 'Baneshwor, Kathmandu',
    latitude: '27.693800',
    longitude: '85.335500',
    pan_vat_number: '123456789',
    verification_status: 'VERIFIED',
    created_at: '2026-07-22T12:00:00Z',
    updated_at: '2026-07-22T12:00:00Z',
    ...overrides,
  }
}

export function buildEmployerJobFixture(overrides: Partial<EmployerJobPost> = {}): EmployerJobPost {
  return {
    id: 5,
    title: 'House Wiring for New Apartment Block',
    category: 1,
    category_name: 'Construction & Repair',
    subcategory: 1,
    subcategory_name: 'Electrical',
    employer_name: 'Kathmandu Home Services Pvt. Ltd.',
    required_skills: [{ id: 2, name: 'House Wiring', subcategory: 'Electrical' }],
    preferred_skills: [{ id: 4, name: 'Electrical Repair', subcategory: 'Electrical' }],
    unmatched_required_terms: [],
    unmatched_preferred_terms: [],
    description: 'Complete wiring and breaker installation for a new four-unit apartment block.',
    address: 'Baneshwor, Kathmandu',
    latitude: '27.693800',
    longitude: '85.335500',
    required_experience_years: 3,
    wage_type: 'DAILY',
    wage_amount: '1300.00',
    work_type: 'CONTRACT',
    scheduled_datetime: null,
    duration_days: null,
    number_of_workers_required: 2,
    application_deadline: '2026-08-21T12:00:00Z',
    status: 'ACTIVE',
    created_at: '2026-07-22T12:00:00Z',
    updated_at: '2026-07-22T12:00:00Z',
    ...overrides,
  }
}

function buildRecommendationResultBaseFixture(
  overrides: Partial<RecommendationResultBase> = {},
): RecommendationResultBase {
  return {
    final_score: 97.79,
    skill: {
      skill_score: 100,
      required_skill_coverage: 100,
      cosine_similarity_score: 90,
      matched_required_skills: [{ id: 2, name: 'House Wiring', subcategory: 'Electrical' }],
      missing_required_skills: [],
      matched_preferred_skills: [{ id: 4, name: 'Electrical Repair', subcategory: 'Electrical' }],
    },
    distance_km: 2.13,
    distance_score: 89.35,
    experience_score: 100,
    availability_preference_score: 100,
    availability_sub_scores: {
      is_available: true,
      wage_compatibility_score: 100,
      travel_radius_compatibility_score: 100,
    },
    reliability_verification_score: 84,
    reliability_sub_scores: {
      verification_status: 'VERIFIED',
      contact_verified: true,
      profile_completeness: 100,
    },
    employer_side_suitability: 94.67,
    worker_side_suitability: 91.12,
    reciprocal_preference_score: 93.25,
    reasons: [
      'Matches 2 of 2 required skills.',
      'Also matches 1 preferred skills.',
      'Located 2.13 km from the job.',
      'Meets the required experience.',
      'Available for work.',
      'Job wage meets the worker\'s expected wage.',
      'Employer profile is verified.',
    ],
    warnings: [],
    ...overrides,
  }
}

type JobRecommendationOverrides = Partial<Omit<JobRecommendation, 'job'>> & {
  job?: Partial<RecommendedJobSummary>
}

export function buildJobRecommendationFixture(
  overrides: JobRecommendationOverrides = {},
): JobRecommendation {
  const { job: jobOverrides, ...resultOverrides } = overrides
  return {
    ...buildRecommendationResultBaseFixture(resultOverrides),
    job: {
      id: 5,
      title: 'House Wiring for New Apartment Block',
      category_name: 'Construction & Repair',
      subcategory_name: 'Electrical',
      employer_name: 'Kathmandu Home Services Pvt. Ltd.',
      address: 'Baneshwor, Kathmandu',
      required_experience_years: 3,
      wage_type: 'DAILY',
      wage_amount: '1300.00',
      work_type: 'CONTRACT',
      status: 'ACTIVE',
      ...jobOverrides,
    },
  }
}

type WorkerRecommendationOverrides = Partial<Omit<WorkerRecommendation, 'worker'>> & {
  worker?: Partial<RecommendedWorkerSummary>
}

export function buildWorkerRecommendationFixture(
  overrides: WorkerRecommendationOverrides = {},
): WorkerRecommendation {
  const { worker: workerOverrides, ...resultOverrides } = overrides
  return {
    ...buildRecommendationResultBaseFixture({
      ...resultOverrides,
      reliability_sub_scores: {
        contact_verified: true,
        profile_completeness: 100,
        ...resultOverrides.reliability_sub_scores,
      },
    }),
    worker: {
      id: 3,
      username: 'demo_worker_ramesh',
      address: 'Koteshwor, Kathmandu',
      experience_years: 6,
      is_available: true,
      expected_wage: '1200.00',
      preferred_travel_radius_km: 15,
      skills: [{ id: 2, name: 'House Wiring', subcategory: 'Electrical' }],
      ...workerOverrides,
    },
  }
}

export function buildMissingSkillAdvisoryFixture(
  overrides: Partial<MissingSkillAdvisory> = {},
): MissingSkillAdvisory {
  return {
    skill: { id: 6, name: 'Tile Installation', subcategory: 'Masonry' },
    missing_frequency: 1,
    required_frequency: 1,
    job_ids: [7],
    ...overrides,
  }
}

export function buildOpportunityAdvisoryFixture(
  overrides: Partial<OpportunityAdvisory> = {},
): OpportunityAdvisory {
  return {
    near_miss_jobs: [
      buildJobRecommendationFixture({
        final_score: 66.7,
        job: {
          id: 7,
          title: 'Bathroom & Tile Renovation',
          category_name: 'Construction & Repair',
          subcategory_name: 'Masonry',
          employer_name: 'Kathmandu Home Services Pvt. Ltd.',
          address: 'Thimi, Bhaktapur',
          required_experience_years: 2,
          wage_type: 'DAILY',
          wage_amount: '1000.00',
          work_type: 'CONTRACT',
          status: 'ACTIVE',
        },
      }),
    ],
    missing_skills: [buildMissingSkillAdvisoryFixture()],
    ...overrides,
  }
}

export function buildWorkerCandidateFixture(overrides: Partial<WorkerCandidate> = {}): WorkerCandidate {
  return {
    id: 3,
    username: 'demo_worker_ramesh',
    address: 'Koteshwor, Kathmandu',
    latitude: '27.677800',
    longitude: '85.348800',
    experience_years: 6,
    is_available: true,
    expected_wage: '1200.00',
    preferred_travel_radius_km: 15,
    skills: [{ id: 2, name: 'House Wiring', subcategory: 'Electrical' }],
    ...overrides,
  }
}

export function buildRatingFixture(overrides: Partial<Rating> = {}): Rating {
  return {
    id: 12,
    application: 8,
    direction: 'WORKER_TO_EMPLOYER',
    reviewer_username: 'demo_worker_ramesh',
    reviewed_username: 'demo_employer_verified',
    score: 5,
    review_text: 'Paid on time and the site was well organized.',
    created_at: '2026-07-22T12:00:00Z',
    ...overrides,
  }
}

export function buildRatingSummaryFixture(overrides: Partial<RatingSummary> = {}): RatingSummary {
  return {
    average_rating: 5,
    rating_count: 1,
    ...overrides,
  }
}

export function buildApplicationFixture(overrides: Partial<Application> = {}): Application {
  return {
    id: 8,
    job: 5,
    job_title: 'House Wiring for New Apartment Block',
    worker_username: 'demo_worker_ramesh',
    status: 'APPLIED',
    worker_note: '',
    employer_note: '',
    created_at: '2026-07-22T12:00:00Z',
    updated_at: '2026-07-22T12:00:00Z',
    ...overrides,
  }
}
