import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft } from 'lucide-react'
import { fetchJobDetail } from '@/api/endpoints/jobs'
import { ApiError, toBannerMessage } from '@/api/errors'
import { formatDateTime, formatWage, formatWorkType } from '@/lib/formatters'
import { useAuthStore } from '@/state/authStore'
import { PageContainer } from '@/components/primitives/PageContainer'
import { SkeletonBlock } from '@/components/primitives/SkeletonBlock'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { EmptyState } from '@/components/primitives/EmptyState'
import { StatusBadge } from '@/components/primitives/StatusBadge'
import { EmployerVerificationBadge } from '@/components/shared/EmployerVerificationBadge'
import { SkillChipList } from '@/components/shared/SkillChipList'

export function JobDetail() {
  const { id } = useParams<{ id: string }>()
  const user = useAuthStore((state) => state.user)

  const jobQuery = useQuery({
    queryKey: ['job', id],
    queryFn: () => fetchJobDetail(id as string),
    enabled: Boolean(id),
    retry: false,
  })

  if (jobQuery.isLoading) {
    return (
      <PageContainer>
        <div className="flex flex-col gap-4">
          <SkeletonBlock className="h-8 w-2/3" />
          <SkeletonBlock className="h-4 w-1/3" />
          <SkeletonBlock className="h-40 w-full" />
        </div>
      </PageContainer>
    )
  }

  if (jobQuery.isError) {
    const error = jobQuery.error

    if (error instanceof ApiError && error.status === 404) {
      return (
        <PageContainer>
          <EmptyState
            title="This job isn't available anymore"
            description="It may have been closed, or the link may be incorrect."
            action={
              <Link to="/jobs" className="font-semibold text-brand-primary hover:underline">
                Back to Browse
              </Link>
            }
          />
        </PageContainer>
      )
    }

    return (
      <PageContainer>
        <ErrorBanner
          message={error instanceof ApiError ? toBannerMessage(error) : 'Something went wrong — please try again.'}
          onRetry={() => jobQuery.refetch()}
        />
      </PageContainer>
    )
  }

  const job = jobQuery.data
  if (!job) return null

  return (
    <PageContainer>
      <Link
        to="/jobs"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to Browse
      </Link>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h1 className="text-2xl font-semibold text-text-primary">{job.title}</h1>
            <StatusBadge tone={job.status === 'ACTIVE' ? 'success' : 'neutral'}>
              {job.status === 'ACTIVE' ? 'Active' : 'Closed'}
            </StatusBadge>
          </div>
          <p className="mt-1 text-base text-text-secondary">
            {job.category_name} · {job.subcategory_name}
          </p>

          <section className="mt-6">
            <h2 className="mb-2 text-lg font-semibold text-text-primary">Description</h2>
            <p className="whitespace-pre-line text-base text-text-primary">{job.description}</p>
          </section>

          <dl className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <DetailRow label="Wage" value={formatWage(job.wage_type, job.wage_amount)} />
            <DetailRow label="Work type" value={formatWorkType(job.work_type)} />
            <DetailRow label="Location" value={job.address} />
            <DetailRow
              label="Required experience"
              value={
                job.required_experience_years > 0
                  ? `${job.required_experience_years} year${job.required_experience_years === 1 ? '' : 's'}`
                  : 'None required'
              }
            />
            <DetailRow
              label="Workers needed"
              value={String(job.number_of_workers_required)}
            />
            {job.scheduled_datetime && (
              <DetailRow label="Scheduled for" value={formatDateTime(job.scheduled_datetime)} />
            )}
            {job.duration_days !== null && (
              <DetailRow
                label="Expected duration"
                value={`${job.duration_days} day${job.duration_days === 1 ? '' : 's'}`}
              />
            )}
            {job.application_deadline && (
              <DetailRow
                label="Application deadline"
                value={formatDateTime(job.application_deadline)}
              />
            )}
          </dl>

          <section className="mt-6">
            <h2 className="mb-2 text-lg font-semibold text-text-primary">Required skills</h2>
            <SkillChipList skills={job.required_skills} />
          </section>

          <section className="mt-6">
            <h2 className="mb-2 text-lg font-semibold text-text-primary">Preferred skills</h2>
            <SkillChipList skills={job.preferred_skills} />
          </section>
        </div>

        <aside className="w-full shrink-0 lg:w-72">
          <div className="rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card">
            <h2 className="mb-2 text-lg font-semibold text-text-primary">{job.employer_name}</h2>
            <EmployerVerificationBadge status={job.employer_verification_status} />

            {/* Applying is Phase F2 — an unauthenticated visitor is
                nudged toward logging in; an already-authenticated worker
                (or employer) sees no button here at all, rather than one
                that would do nothing. */}
            {!user && (
              <p className="mt-4 text-sm text-text-secondary">
                <Link to="/login" className="font-semibold text-brand-primary hover:underline">
                  Log in as a worker
                </Link>{' '}
                to apply.
              </p>
            )}
          </div>
        </aside>
      </div>
    </PageContainer>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-sm text-text-secondary">{label}</dt>
      <dd className="text-base font-semibold text-text-primary">{value}</dd>
    </div>
  )
}
