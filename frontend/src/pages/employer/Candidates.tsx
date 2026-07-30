import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useOwnerJob } from '@/hooks/useOwnerJob'
import { useJobCandidates } from '@/hooks/useJobCandidates'
import { ApiError, toBannerMessage } from '@/api/errors'
import { PageContainer } from '@/components/primitives/PageContainer'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { EmptyState } from '@/components/primitives/EmptyState'
import { CandidateCard } from '@/components/shared/CandidateCard'

/**
 * `GET /api/jobs/<id>/candidates/` — the coarse, unscored candidate pool
 * (jobs/views.py:JobCandidatesView, jobs/serializers.py:WorkerCandidateSerializer).
 * Deliberately distinct from Recommended Workers
 * (`/employer/jobs/:id/recommendations`): this list has no score, no
 * ranking, and is available to any employer regardless of verification
 * status (only `IsEmployer` is required, not `IsVerifiedEmployer`) — a
 * simple pre-filter, not the final ranked comparison.
 */
export function EmployerCandidates() {
  const { id } = useParams<{ id: string }>()
  const jobQuery = useOwnerJob(id)
  const candidatesQuery = useJobCandidates(id)

  return (
    <PageContainer>
      <Link
        to={id ? `/employer/jobs/${id}` : '/employer/jobs'}
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to Job
      </Link>

      <h1 className="text-2xl font-semibold text-text-primary">Candidates</h1>
      {jobQuery.isSuccess && <p className="mt-1 text-base text-text-secondary">{jobQuery.data.title}</p>}
      {jobQuery.isLoading && <SkeletonCard />}
      <p className="mt-2 max-w-2xl text-sm text-text-secondary">
        A simple list of available workers whose skills and distance roughly match this job — not ranked
        or scored. For a fully explained, ranked comparison, see{' '}
        {id && (
          <Link to={`/employer/jobs/${id}/recommendations`} className="font-semibold text-brand-primary hover:underline">
            Recommended Workers
          </Link>
        )}
        .
      </p>

      <div className="mt-6">
        {candidatesQuery.isLoading && (
          <div className="flex flex-col gap-4">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {candidatesQuery.isError && (
          <ErrorBanner
            message={
              candidatesQuery.error instanceof ApiError
                ? toBannerMessage(candidatesQuery.error)
                : 'Something went wrong — please try again.'
            }
            onRetry={() => candidatesQuery.refetch()}
          />
        )}

        {candidatesQuery.isSuccess && candidatesQuery.data.length === 0 && (
          <EmptyState
            title="No candidates found"
            description="No available workers currently match this job's subcategory and distance."
          />
        )}

        {candidatesQuery.isSuccess && candidatesQuery.data.length > 0 && (
          <div className="flex flex-col gap-4">
            {candidatesQuery.data.map((candidate) => (
              <CandidateCard key={candidate.id} candidate={candidate} />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  )
}
