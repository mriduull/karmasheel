import { useState } from 'react'
import { Link } from 'react-router-dom'
import { PlusCircle } from 'lucide-react'
import { useMyJobs } from '@/hooks/useMyJobs'
import { useEmployerVerificationStatus } from '@/hooks/useEmployerVerificationStatus'
import { ApiError, toBannerMessage } from '@/api/errors'
import { PageContainer } from '@/components/primitives/PageContainer'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { EmptyState } from '@/components/primitives/EmptyState'
import { Button } from '@/components/primitives/Button'
import { EmployerJobCard } from '@/components/shared/EmployerJobCard'
import type { JobStatus } from '@/types/job'

type StatusFilter = 'ALL' | JobStatus

const FILTER_LABELS: Record<StatusFilter, string> = {
  ALL: 'All',
  ACTIVE: 'Active',
  CLOSED: 'Closed',
}

/** `GET /api/jobs/` — bare array, never paginated. The backend does not
 * filter this list server-side (no query params supported), so
 * Active/Closed filtering happens entirely client-side over the one
 * fetched array. */
export function EmployerJobs() {
  const jobsQuery = useMyJobs()
  const verification = useEmployerVerificationStatus()
  const [filter, setFilter] = useState<StatusFilter>('ALL')

  const isVerified = verification.status === 'VERIFIED'
  const jobs = jobsQuery.data ?? []
  const filteredJobs = filter === 'ALL' ? jobs : jobs.filter((job) => job.status === filter)

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-text-primary">My Jobs</h1>
        {isVerified ? (
          <Link to="/employer/jobs/new">
            <Button variant="primary">
              <PlusCircle size={18} aria-hidden="true" />
              Post a Job
            </Button>
          </Link>
        ) : (
          <p className="text-sm text-text-secondary">
            Posting a job is available once your account is verified.
          </p>
        )}
      </div>

      {jobsQuery.isLoading && (
        <div className="flex flex-col gap-4">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {jobsQuery.isError && (
        <ErrorBanner
          message={
            jobsQuery.error instanceof ApiError
              ? toBannerMessage(jobsQuery.error)
              : 'Something went wrong — please try again.'
          }
          onRetry={() => jobsQuery.refetch()}
        />
      )}

      {jobsQuery.isSuccess && jobs.length === 0 && (
        <EmptyState
          title="You haven't posted a job yet"
          description={
            isVerified
              ? 'Post your first job to start receiving applications.'
              : 'Posting a job is available once your account is verified.'
          }
          action={
            isVerified ? (
              <Link to="/employer/jobs/new">
                <Button variant="primary">Post a Job</Button>
              </Link>
            ) : undefined
          }
        />
      )}

      {jobsQuery.isSuccess && jobs.length > 0 && (
        <>
          <div role="tablist" aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2">
            {(['ALL', 'ACTIVE', 'CLOSED'] as StatusFilter[]).map((value) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                onClick={() => setFilter(value)}
                className={`min-h-touch rounded-sm px-4 text-base font-semibold ${
                  filter === value
                    ? 'bg-brand-primary text-white'
                    : 'bg-surface-muted text-text-primary hover:bg-surface-muted/70'
                }`}
              >
                {FILTER_LABELS[value]}
              </button>
            ))}
          </div>

          {filteredJobs.length === 0 ? (
            <EmptyState
              title={`No ${FILTER_LABELS[filter].toLowerCase()} jobs`}
              description="Try a different filter."
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredJobs.map((job) => (
                <EmployerJobCard key={job.id} job={job} />
              ))}
            </div>
          )}
        </>
      )}
    </PageContainer>
  )
}
