import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, Pencil, TrendingUp, Users, XCircle } from 'lucide-react'
import { useOwnerJob, ownerJobQueryKey } from '@/hooks/useOwnerJob'
import { MY_JOBS_QUERY_KEY } from '@/hooks/useMyJobs'
import { useEmployerVerificationStatus } from '@/hooks/useEmployerVerificationStatus'
import { updateJob } from '@/api/endpoints/jobs'
import { ApiError, toBannerMessage } from '@/api/errors'
import { formatDateTime, formatWage, formatWorkType } from '@/lib/formatters'
import { PageContainer } from '@/components/primitives/PageContainer'
import { SkeletonBlock } from '@/components/primitives/SkeletonBlock'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { EmptyState } from '@/components/primitives/EmptyState'
import { StatusBadge } from '@/components/primitives/StatusBadge'
import { Button } from '@/components/primitives/Button'
import { SkillChipList } from '@/components/shared/SkillChipList'
import { CloseJobConfirmDialog } from '@/components/shared/CloseJobConfirmDialog'
import type { EmployerJobPost } from '@/types/job'

/**
 * Owner-only detail view — deliberately uses `fetchOwnerJob`
 * (`EmployerJobPost`, the `JobPostSerializer` shape), never the public
 * `fetchJobDetail`/`PublicJobPost` from Phase F1. No recommendations, no
 * reopen, no delete — closing is the only status-changing action, and
 * it's one-way (`JobPostSerializer.validate_status` rejects
 * `CLOSED -> ACTIVE`).
 */
export function EmployerJobDetail() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const jobQuery = useOwnerJob(id)
  const { status: verificationStatus } = useEmployerVerificationStatus()
  const [closeTarget, setCloseTarget] = useState<EmployerJobPost | null>(null)
  const [closeError, setCloseError] = useState<string | null>(null)

  const closeMutation = useMutation({
    mutationFn: (job: EmployerJobPost) => updateJob(job.id, { status: 'CLOSED' }),
    onSuccess: (updated) => {
      queryClient.setQueryData(ownerJobQueryKey(updated.id), updated)
      void queryClient.invalidateQueries({ queryKey: MY_JOBS_QUERY_KEY })
      setCloseTarget(null)
      setCloseError(null)
    },
    onError: (error: unknown) => {
      void queryClient.invalidateQueries({ queryKey: ownerJobQueryKey(id ?? '') })
      setCloseError(
        error instanceof ApiError ? toBannerMessage(error) : 'Something went wrong — please try again.',
      )
    },
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

    if (error instanceof ApiError && (error.status === 404 || error.status === 403)) {
      return (
        <PageContainer>
          <EmptyState
            title={error.status === 403 ? 'Not your job' : 'Job not found'}
            description={
              error.status === 403
                ? "You can only view and manage jobs you posted."
                : "This job doesn't exist, or the link may be incorrect."
            }
            action={
              <Link to="/employer/jobs" className="font-semibold text-brand-primary hover:underline">
                Back to My Jobs
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

  const isActive = job.status === 'ACTIVE'

  return (
    <PageContainer>
      <Link
        to="/employer/jobs"
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to My Jobs
      </Link>

      <div className="flex flex-col gap-6 lg:flex-row">
        <div className="flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h1 className="text-2xl font-semibold text-text-primary">{job.title}</h1>
            <StatusBadge tone={isActive ? 'success' : 'neutral'}>
              {isActive ? 'Active' : 'Closed'}
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
            <DetailRow label="Workers needed" value={String(job.number_of_workers_required)} />
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
              <DetailRow label="Application deadline" value={formatDateTime(job.application_deadline)} />
            )}
            <DetailRow label="Posted" value={formatDateTime(job.created_at)} />
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

        <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-64">
          <Link to={`/employer/jobs/${job.id}/applications`}>
            <Button variant="primary" className="w-full">
              <Users size={18} aria-hidden="true" />
              View Applications
            </Button>
          </Link>

          <Link to={`/employer/jobs/${job.id}/candidates`}>
            <Button variant="secondary" className="w-full">
              <Users size={18} aria-hidden="true" />
              View Candidates
            </Button>
          </Link>

          {verificationStatus === 'VERIFIED' ? (
            <Link to={`/employer/jobs/${job.id}/recommendations`}>
              <Button variant="secondary" className="w-full">
                <TrendingUp size={18} aria-hidden="true" />
                Recommended Workers
              </Button>
            </Link>
          ) : (
            <p className="text-sm text-text-secondary">
              Recommended workers are available once your account is verified.
            </p>
          )}

          {/* Editing stays legal for a closed job (verified directly:
              `JobPostDetailView._update` has no active/closed check at
              all — only `validate_status` rejects the specific
              CLOSED -> ACTIVE transition, which the edit form never
              attempts to send). Only Close Job is gated on `isActive` —
              that action itself becomes illegal, and unavailable, once
              already closed. */}
          <Link to={`/employer/jobs/${job.id}/edit`}>
            <Button variant="secondary" className="w-full">
              <Pencil size={18} aria-hidden="true" />
              Edit Job
            </Button>
          </Link>
          {isActive && (
            <Button variant="danger" className="w-full" onClick={() => setCloseTarget(job)}>
              <XCircle size={18} aria-hidden="true" />
              Close Job
            </Button>
          )}
        </aside>
      </div>

      <CloseJobConfirmDialog
        job={closeTarget}
        isSubmitting={closeMutation.isPending}
        error={closeError}
        onConfirm={() => closeTarget && closeMutation.mutate(closeTarget)}
        onCancel={() => {
          setCloseTarget(null)
          setCloseError(null)
        }}
      />
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
