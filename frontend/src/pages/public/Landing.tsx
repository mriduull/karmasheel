import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { fetchTaxonomyTree } from '@/api/endpoints/taxonomy'
import { browseJobs } from '@/api/endpoints/jobs'
import { Button } from '@/components/primitives/Button'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { CategoryTile } from '@/components/shared/CategoryTile'
import { JobCard } from '@/components/shared/JobCard'
import { Footer } from '@/components/layout/Footer'

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

const CATEGORY_TEASER_LIMIT = 6
const JOB_PREVIEW_LIMIT = 3

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
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-20">
        <div className="flex flex-col items-start gap-6">
          <h1 className="max-w-2xl text-3xl font-semibold text-text-primary">
            Find honest local work, or hire workers you can trust.
          </h1>
          <p className="max-w-2xl text-lg text-text-secondary">
            {t('brand.name')} connects blue-collar and local-service workers with employers,
            using skills, location, and experience — with every match explained in plain
            language.
          </p>
          <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
            <Link to="/register?role=WORKER" className="w-full sm:w-auto">
              <Button variant="primary" className="w-full sm:w-auto">
                Find Work
              </Button>
            </Link>
            <Link to="/register?role=EMPLOYER" className="w-full sm:w-auto">
              <Button variant="secondary" className="w-full sm:w-auto">
                Hire Workers
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
        <h2 className="mb-6 text-2xl font-semibold text-text-primary">How it works</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          {HOW_IT_WORKS_STEPS.map((step, index) => (
            <div key={step.title} className="flex flex-col gap-2">
              <span className="text-sm font-semibold text-brand-primary">Step {index + 1}</span>
              <h3 className="text-lg font-semibold text-text-primary">{step.title}</h3>
              <p className="text-base text-text-secondary">{step.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Category teaser — hidden entirely if empty or unavailable,
          rather than showing a broken empty box (design spec §4). */}
      {categoriesQuery.isLoading && (
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <h2 className="mb-6 text-2xl font-semibold text-text-primary">Browse by category</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: CATEGORY_TEASER_LIMIT }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
        </section>
      )}
      {categories.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <h2 className="mb-6 text-2xl font-semibold text-text-primary">Browse by category</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {categories.map((category) => (
              <CategoryTile key={category.id} category={category} />
            ))}
          </div>
        </section>
      )}

      {/* Active-job preview — same "hide gracefully if empty" rule. */}
      {previewJobs.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
          <h2 className="mb-6 text-2xl font-semibold text-text-primary">Recently posted</h2>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {previewJobs.map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
          </div>
        </section>
      )}

      {/* Register CTA */}
      <section className="mx-auto max-w-6xl px-4 py-12 text-center sm:px-6 lg:px-8">
        <h2 className="mb-4 text-2xl font-semibold text-text-primary">Ready to get started?</h2>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link to="/register">
            <Button variant="primary">Create an account</Button>
          </Link>
          <Link to="/jobs">
            <Button variant="secondary">Browse jobs without an account</Button>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  )
}
