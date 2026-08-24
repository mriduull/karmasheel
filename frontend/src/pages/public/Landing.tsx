import { useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { CheckCircle2, Clock, MapPin, Search, UserPlus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { fetchTaxonomyTree } from '@/api/endpoints/taxonomy'
import { browseJobs } from '@/api/endpoints/jobs'
import type { JobRecommendation } from '@/types/recommendation'
import type { WorkType } from '@/types/job'
import { Button } from '@/components/primitives/Button'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { CategorySelect } from '@/components/shared/CategorySelect'
import { WorkTypeSelect } from '@/components/shared/WorkTypeSelect'
import { RecommendationCard } from '@/components/shared/RecommendationCard'
import { Footer } from '@/components/layout/Footer'
import { MatchlineHero } from '@/components/landing/MatchlineHero'
import { LandingCategoryCard, ExploreAllCategoriesCard } from '@/components/landing/LandingCategoryCard'
import { LandingJobCard } from '@/components/landing/LandingJobCard'
import { ProcessStepCard } from '@/components/landing/ProcessStepCard'

const HOW_IT_WORKS_STEPS = [
  {
    title: 'Create your profile',
    body: 'Workers add their skills, location, and availability. Employers add their organization details.',
    linkTo: '/register',
    linkLabel: 'Register',
  },
  {
    title: 'Get matched',
    body: 'Browse active jobs or candidates, filtered by category, work type, and distance.',
    linkTo: '/jobs',
    linkLabel: 'Browse jobs',
  },
  {
    title: 'Get to work',
    body: 'Apply, get shortlisted, and get hired — every step tracked in one place.',
    linkTo: '/register',
    linkLabel: 'Get started',
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
const JOB_PREVIEW_LIMIT = 6

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

/** Alternating pale/white section background band, matching the
 * reference's section rhythm — content width/padding stay on the same
 * `SECTION_WRAP` container used throughout. */
function Section({ tone = 'base', children }: { tone?: 'base' | 'muted'; children: ReactNode }) {
  return (
    <section className={tone === 'muted' ? 'bg-surface-muted' : undefined}>
      <div className={`${SECTION_WRAP} py-12 lg:py-16`}>{children}</div>
    </section>
  )
}

/** One small floating stat pill over the hero image — always rendered
 * inside the "Example match" labeled group below, never standalone, so it
 * can never be mistaken for a live personalized statistic. */
function HeroExampleChip({ icon: Icon, label }: { icon: LucideIcon; label: string }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary shadow-float">
      <Icon size={14} className="shrink-0 text-brand-secondary" aria-hidden="true" />
      {label}
    </span>
  )
}

export function Landing() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const [heroCategory, setHeroCategory] = useState<number | null>(null)
  const [heroWorkType, setHeroWorkType] = useState<WorkType | null>(null)

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

  const handleHeroSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const params = new URLSearchParams()
    if (heroCategory !== null) params.set('category', String(heroCategory))
    if (heroWorkType !== null) params.set('work_type', heroWorkType)
    navigate(params.toString() ? `/jobs?${params.toString()}` : '/jobs')
  }

  return (
    <div>
      {/* Hero */}
      <Section>
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col items-start gap-6 text-left">
            <h1 className="font-display text-3xl font-semibold text-text-primary lg:text-4xl">
              Find work that fits. Find workers who fit.
            </h1>
            <p className="max-w-xl text-lg text-text-secondary">
              {t('brand.name')} matches Nepal&rsquo;s workers and employers on skills, distance,
              availability and experience &mdash; and shows exactly why, every time.
            </p>

            <form
              onSubmit={handleHeroSearch}
              className="grid w-full grid-cols-1 gap-3 rounded-md border border-text-secondary/10 bg-surface p-3 shadow-card sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end"
            >
              <CategorySelect value={heroCategory} onChange={setHeroCategory} />
              <WorkTypeSelect value={heroWorkType} onChange={setHeroWorkType} />
              <Button type="submit" variant="primary" className="w-full sm:w-auto">
                <Search size={18} aria-hidden="true" />
                Search
              </Button>
            </form>

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

          <div className="relative flex h-80 items-end justify-center overflow-visible lg:h-[420px]">
            <img
              src="/images/landing/electrician-hero.png"
              alt="Electrician representing skilled local workers on Karmasheel"
              className="max-h-full w-auto max-w-full object-contain"
            />
            <div
              role="group"
              aria-label="Example match details — illustrative only, not live data"
              className="absolute bottom-4 left-0 flex flex-col items-start gap-2 sm:left-4"
            >
              <span className="rounded-full bg-warning-bg px-3 py-1 text-xs font-semibold text-warning-text">
                Example
              </span>
              <HeroExampleChip icon={CheckCircle2} label="4/5 required skills" />
              <HeroExampleChip icon={MapPin} label="2.4 km away" />
              <HeroExampleChip icon={Clock} label="Available tomorrow" />
            </div>
          </div>
        </div>
      </Section>

      {/* Human & Local moment */}
      <Section tone="muted">
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center">
          <img
            src="/images/landing/cook-real-work.png"
            alt="Cook preparing food in a working kitchen"
            className="h-64 w-full rounded-md object-cover lg:h-80"
          />
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
                  className="rounded-full bg-surface px-3 py-1 text-sm font-medium text-text-primary"
                >
                  {label}
                </span>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-3">
              <Link to="/jobs">
                <Button variant="primary">Explore jobs</Button>
              </Link>
              <a href="#how-it-works">
                <Button variant="secondary">How it works</Button>
              </a>
            </div>
          </div>
        </div>
      </Section>

      {/* Category teaser — hidden entirely if empty or unavailable,
          rather than showing a broken empty box (design spec §4). */}
      {categoriesQuery.isLoading && (
        <Section>
          <h2 className="mb-6 text-2xl font-semibold text-text-primary">Browse by category</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: CATEGORY_TEASER_LIMIT }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        </Section>
      )}
      {categories.length > 0 && (
        <Section>
          <h2 className="mb-2 text-2xl font-semibold text-text-primary">Browse by category</h2>
          <p className="mb-6 text-base text-text-secondary">
            Find work by trade, or explore everything Karmasheel covers.
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {categories.map((category) => (
              <LandingCategoryCard key={category.id} category={category} />
            ))}
            <ExploreAllCategoriesCard />
          </div>
        </Section>
      )}

      {/* How it works */}
      <Section tone="muted">
        <h2 id="how-it-works" className="mb-8 text-center font-display text-2xl font-semibold text-text-primary">
          How it works
        </h2>
        <div className="flex flex-col gap-6 sm:flex-row">
          {HOW_IT_WORKS_STEPS.map((step, index) => (
            <ProcessStepCard
              key={step.title}
              step={index + 1}
              icon={index === 0 ? UserPlus : index === 1 ? Search : CheckCircle2}
              title={step.title}
              body={step.body}
              linkTo={step.linkTo}
              linkLabel={step.linkLabel}
            />
          ))}
        </div>
      </Section>

      {/* Active-job preview — same "hide gracefully if empty" rule. */}
      {previewJobs.length > 0 && (
        <Section>
          <div className="mb-6 flex flex-wrap items-baseline justify-between gap-3">
            <div>
              <h2 className="text-2xl font-semibold text-text-primary">Recently posted</h2>
              <p className="mt-1 text-base text-text-secondary">Active jobs, newest first.</p>
            </div>
            <Link to="/jobs" className="text-sm font-semibold text-brand-primary hover:underline">
              Show all →
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {previewJobs.map((job) => (
              <LandingJobCard key={job.id} job={job} />
            ))}
          </div>
        </Section>
      )}

      {/* Matchline promo — relocated interactive example, recomposed as a
          clean image+text promotional section (Karmasheel Design
          Constitution §10, §41). */}
      <Section tone="muted">
        <MatchlineHero />
      </Section>

      {/* Explained match example — the real RecommendationCard, fed one
          fixed example so the demonstrated explanation is genuine UI. */}
      <Section>
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
      </Section>

      {/* Why workers/employers trust Karmasheel — replaces fabricated
          testimonials with labeled, real value points (no invented people
          or quotes). */}
      <Section tone="muted">
        <div className="grid grid-cols-1 gap-8 sm:grid-cols-2">
          <div className="flex flex-col gap-3 rounded-md border border-text-secondary/10 bg-surface p-6 shadow-card">
            <h2 className="text-xl font-semibold text-text-primary">Why workers choose Karmasheel</h2>
            <ul className="flex flex-col gap-2">
              {WORKER_VALUE_POINTS.map((point) => (
                <li key={point} className="flex items-start gap-2 text-base text-text-secondary">
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-brand-secondary" aria-hidden="true" />
                  {point}
                </li>
              ))}
            </ul>
          </div>
          <div className="flex flex-col gap-3 rounded-md border border-text-secondary/10 bg-surface p-6 shadow-card">
            <h2 className="text-xl font-semibold text-text-primary">Why employers trust Karmasheel</h2>
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
      </Section>

      {/* Final CTA — a light warm surface, not a dark block, so it reuses
          Button's existing primary/secondary variants unmodified. */}
      <Section>
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
      </Section>

      <Footer />
    </div>
  )
}
