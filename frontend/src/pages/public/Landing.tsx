import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle2 } from 'lucide-react'
import { fetchTaxonomyTree } from '@/api/endpoints/taxonomy'
import { browseJobs } from '@/api/endpoints/jobs'
import type { JobRecommendation } from '@/types/recommendation'
import { Button } from '@/components/primitives/Button'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { CategoryTile } from '@/components/shared/CategoryTile'
import { JobCard } from '@/components/shared/JobCard'
import { PhotoPlaceholder } from '@/components/shared/PhotoPlaceholder'
import { RecommendationCard } from '@/components/shared/RecommendationCard'
import { Footer } from '@/components/layout/Footer'
import { MatchlineHero } from '@/components/landing/MatchlineHero'

const HOW_IT_WORKS_STEPS = [
  {
    title: 'Create your profile',
    body: 'Workers add their skills, location, and availability. Employers add their organization details.',
  },
  {
    title: 'Get matched',
    body: 'Browse active jobs or candidates, filtered by category, work type, and distance.',
  },
  {
    title: 'Get to work',
    body: 'Apply, get shortlisted, and get hired — every step tracked in one place.',
  },
]

const WORKER_VALUE_POINTS = [
  'Free to join, no agent fees',
  'See exactly why each job matches you',
  'Track every application in one place',
]

const EMPLOYER_VALUE_POINTS = [
  'Post a job and reach nearby workers fast',
  'Compare candidates ranked by real fit, explained',
  'Track applicants from applied to hired',
]

const CATEGORY_TEASER_LIMIT = 6
const JOB_PREVIEW_LIMIT = 3

const SECTION_WRAP = 'mx-auto max-w-6xl px-4 sm:px-6 lg:px-8'

/**
 * Fixed, illustrative example — not a live recommendation. Reused verbatim
 * with `RecommendationCard` (same component the authenticated worker/
 * employer recommendation pages use) so the demonstrated explanation is
 * the real UI, only the data is fixed. Never fetched from
 * `/api/recommendations/*` — those endpoints require an authenticated
 * Worker/Employer and have no public/anonymous variant.
 */
const EXAMPLE_JOB_RECOMMENDATION: JobRecommendation = {
  final_score: 92,
  skill: {
    skill_score: 92,
    required_skill_coverage: 80,
    cosine_similarity_score: 88,
    matched_required_skills: [
      { id: 101, name: 'House Wiring', subcategory: 'Electrical' },
      { id: 102, name: 'Circuit Breaker Installation', subcategory: 'Electrical' },
      { id: 103, name: 'Electrical Safety', subcategory: 'Electrical' },
      { id: 104, name: 'Conduit Fitting', subcategory: 'Electrical' },
    ],
    missing_required_skills: [{ id: 105, name: 'Panel Fault Diagnosis', subcategory: 'Electrical' }],
    matched_preferred_skills: [],
  },
  distance_km: 2.4,
  distance_score: 88,
  experience_score: 95,
  availability_preference_score: 90,
  availability_sub_scores: {
    is_available: true,
    wage_compatibility_score: 90,
    travel_radius_compatibility_score: 85,
  },
  reliability_verification_score: 96,
  reliability_sub_scores: {
    contact_verified: true,
    profile_completeness: 100,
    verification_status: 'VERIFIED',
  },
  employer_side_suitability: 90,
  worker_side_suitability: 92,
  reciprocal_preference_score: 88,
  reasons: [
    'Matches 4 of 5 required skills',
    '2.4 km away',
    'Available on the required date',
    '4 years of relevant experience',
  ],
  warnings: ['Missing required skill: Panel Fault Diagnosis'],
  job: {
    id: 0,
    title: 'Residential Electrician — Panel Rewiring',
    category_name: 'Construction & Repair',
    subcategory_name: 'Electrical',
    employer_name: 'Kathmandu Home Services Pvt. Ltd.',
    address: 'Baneshwor, Kathmandu',
    required_experience_years: 3,
    wage_type: 'DAILY',
    wage_amount: '1800.00',
    work_type: 'CONTRACT',
    status: 'ACTIVE',
  },
}

export function Landing() {
  const { t } = useTranslation()

  const categoriesQuery = useQuery({
    queryKey: ['taxonomy', 'tree'],
    queryFn: fetchTaxonomyTree,
  })

  const jobsPreviewQuery = useQuery({
    queryKey: ['jobs', 'browse', 'landing-preview'],
    queryFn: () => browseJobs(),
  })

  const categories = categoriesQuery.data?.slice(0, CATEGORY_TEASER_LIMIT) ?? []
  const previewJobs = jobsPreviewQuery.data?.slice(0, JOB_PREVIEW_LIMIT) ?? []

  return (
    <div>
      {/* Hero */}
      <section className={`${SECTION_WRAP} py-12 lg:py-16`}>
        <div className="flex flex-col items-center gap-6 text-center">
          <h1 className="max-w-2xl font-display text-3xl font-semibold text-text-primary lg:text-4xl">
            Two sides. One clear match.
          </h1>
          <p className="max-w-2xl text-lg text-text-secondary">
            {t('brand.name')} matches Nepal&rsquo;s workers and employers on skills, distance,
            availability, experience and preferences &mdash; and shows exactly why, every time.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link to="/register?role=WORKER" className="w-full sm:w-auto">
              <Button variant="primary" className="w-full sm:w-auto">
                I am looking for work
              </Button>
            </Link>
            <Link to="/register?role=EMPLOYER" className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full sm:w-auto">
                I need workers
              </Button>
            </Link>
          </div>
        </div>

        <div className="mt-10">
          <MatchlineHero />
        </div>
      </section>

      {/* Human & Local moment */}
      <section className={`${SECTION_WRAP} py-12`}>
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col gap-3">
            <h2 className="font-display text-2xl font-semibold text-text-primary">
              Real work. Real people.
            </h2>
            <p className="text-base text-text-secondary">
              Electricians, drivers, cooks, cleaners, technicians — Karmasheel connects local
              workers with employers who need them, today.
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {['Electrical', 'Driving & Delivery', 'Cleaning & Home Care'].map((label) => (
                <span
                  key={label}
                  className="rounded-full bg-surface-muted px-3 py-1 text-sm font-medium text-text-primary"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>
          <PhotoPlaceholder
            caption="Photography placeholder — electrician at work, Kathmandu Valley"
            className="h-64 w-full lg:h-80"
          />
        </div>
      </section>

      {/* How it works */}
      <section className={`${SECTION_WRAP} py-12`}>
        <h2 className="mb-8 text-center font-display text-2xl font-semibold text-text-primary">
          How it works
        </h2>
        <div className="relative flex flex-col gap-8 sm:flex-row sm:justify-between sm:gap-6">
          <div
            className="absolute top-[23px] hidden sm:block sm:left-[60px] sm:right-[60px] sm:h-px sm:bg-text-secondary/15"
            aria-hidden="true"
          />
          {HOW_IT_WORKS_STEPS.map((step, index) => (
            <div key={step.title} className="relative flex flex-1 flex-col items-start gap-2 sm:items-center sm:text-center">
              <span
                className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full border-2 border-brand-primary bg-surface font-display font-semibold text-brand-primary"
                aria-hidden="true"
              >
                {index + 1}
              </span>
              <h3 className="text-lg font-semibold text-text-primary">{step.title}</h3>
              <p className="text-base text-text-secondary">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Category teaser — hidden entirely if empty or unavailable,
          rather than showing a broken empty box (design spec §4). */}
      {categoriesQuery.isLoading && (
        <section className={`${SECTION_WRAP} py-12`}>
          <h2 className="mb-6 text-2xl font-semibold text-text-primary">Browse by category</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: CATEGORY_TEASER_LIMIT }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        </section>
      )}
      {categories.length > 0 && (
        <section className={`${SECTION_WRAP} py-12`}>
          <h2 className="mb-6 text-2xl font-semibold text-text-primary">Browse by category</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {categories.map((category) => (
              <CategoryTile key={category.id} category={category} />
            ))}
          </div>
        </section>
      )}

      {/* Explained match example — the real RecommendationCard, fed one
          fixed example so the demonstrated explanation is genuine UI. */}
      <section className={`${SECTION_WRAP} py-12`}>
        <div className="mb-6 flex flex-wrap items-baseline gap-3">
          <h2 className="text-2xl font-semibold text-text-primary">What a match looks like</h2>
          <span className="rounded-full bg-warning-bg px-3 py-1 text-xs font-semibold text-warning-text">
            Example
          </span>
        </div>
        <p className="mb-4 text-sm text-text-secondary">
          Illustrative only — not connected to a live account.
        </p>
        <div className="max-w-2xl">
          <RecommendationCard
            rank={1}
            result={EXAMPLE_JOB_RECOMMENDATION}
            header={
              <div>
                <p className="text-lg font-semibold text-text-primary">
                  {EXAMPLE_JOB_RECOMMENDATION.job.title}
                </p>
                <p className="text-sm text-text-secondary">
                  {EXAMPLE_JOB_RECOMMENDATION.job.employer_name} &middot;{' '}
                  {EXAMPLE_JOB_RECOMMENDATION.job.category_name} /{' '}
                  {EXAMPLE_JOB_RECOMMENDATION.job.subcategory_name}
                </p>
                <p className="text-sm text-text-secondary">{EXAMPLE_JOB_RECOMMENDATION.job.address}</p>
              </div>
            }
          />
        </div>
      </section>

      {/* Active-job preview — same "hide gracefully if empty" rule. */}
      {previewJobs.length > 0 && (
        <section className={`${SECTION_WRAP} py-12`}>
          <h2 className="mb-6 text-2xl font-semibold text-text-primary">Recently posted</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {previewJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}

      {/* Worker vs Employer value proposition */}
      <section className={`${SECTION_WRAP} py-12`}>
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold text-text-primary">For Workers</h2>
            <ul className="flex flex-col gap-2">
              {WORKER_VALUE_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2 text-base text-text-secondary">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand-secondary" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3">
            <h2 className="text-xl font-semibold text-text-primary">For Employers</h2>
            <ul className="flex flex-col gap-2">
              {EMPLOYER_VALUE_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2 text-base text-text-secondary">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand-primary" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Final CTA — a light warm surface, not a dark block, so it reuses
          Button's existing primary/secondary variants unmodified. */}
      <section className={`${SECTION_WRAP} py-12`}>
        <div className="flex flex-col items-center gap-4 rounded-lg bg-surface-muted px-6 py-12 text-center">
          <h2 className="font-display text-2xl font-semibold text-text-primary">
            Ready to find your match?
          </h2>
          <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link to="/register?role=WORKER">
              <Button variant="primary">I am looking for work</Button>
            </Link>
            <Link to="/register?role=EMPLOYER">
              <Button variant="secondary">I need workers</Button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  )
}
