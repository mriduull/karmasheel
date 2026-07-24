import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useOwnerJob } from '@/hooks/useOwnerJob'
import { useJobApplications } from '@/hooks/useJobApplications'
import { ApiError, toBannerMessage } from '@/api/errors'
import { PageContainer } from '@/components/primitives/PageContainer'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { EmptyState } from '@/components/primitives/EmptyState'
import { ApplicantCard } from '@/components/shared/ApplicantCard'
import type { ApplicationStatus } from '@/types/application'

type FilterGroup = 'ALL' | 'NEW' | 'IN_PROGRESS' | 'CLOSED_OUT'

const GROUP_STATUSES: Record<Exclude<FilterGroup, 'ALL'>, ApplicationStatus[]> = {
  NEW: ['APPLIED'],
  IN_PROGRESS: ['SHORTLISTED', 'CONTACTED', 'HIRED'],
  CLOSED_OUT: ['REJECTED', 'WITHDRAWN', 'COMPLETED', 'CANCELLED'],
}

const GROUP_LABELS: Record<FilterGroup, string> = {
  ALL: 'All',
  NEW: 'New',
  IN_PROGRESS: 'In progress',
  CLOSED_OUT: 'Closed out',
}

/**
 * `/employer/jobs/:id/applications` — the only way to reach any
 * applicant view; there is no employer-wide applicants screen (no
 * endpoint supports one, confirmed against `applications/urls.py` and
 * `jobs/urls.py`). Ownership is enforced server-side by
 * `JobApplicationsView` (403 for a non-owner) and, separately, by
 * `useOwnerJob` for the job-context header.
 */
export function EmployerJobApplications() {
  const { id } = useParams<{ id: string }>()
  const jobQuery = useOwnerJob(id)
  const applicationsQuery = useJobApplications(id ?? '')
  const [filter, setFilter] = useState<FilterGroup>('ALL')

  const applications = applicationsQuery.data ?? []
  const filteredApplications =
    filter === 'ALL' ? applications : applications.filter((app) => GROUP_STATUSES[filter].includes(app.status))

  return (
    <PageContainer>
      <Link
        to={id ? `/employer/jobs/${id}` : '/employer/jobs'}
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to Job
      </Link>

      <h1 className="mb-1 text-2xl font-semibold text-text-primary">Applications</h1>
      {jobQuery.isSuccess && <p className="mb-6 text-base text-text-secondary">{jobQuery.data.title}</p>}
      {jobQuery.isLoading && <SkeletonCard />}

      {applicationsQuery.isLoading && (
        <div className="flex flex-col gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {applicationsQuery.isError && (
        <ErrorBanner
          message={
            applicationsQuery.error instanceof ApiError
              ? toBannerMessage(applicationsQuery.error)
              : 'Something went wrong — please try again.'
          }
          onRetry={() => applicationsQuery.refetch()}
        />
      )}

      {applicationsQuery.isSuccess && applications.length === 0 && (
        <EmptyState title="No applications yet for this job" description="Check back once workers start applying." />
      )}

      {applicationsQuery.isSuccess && applications.length > 0 && (
        <>
          <div role="tablist" aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2">
            {(Object.keys(GROUP_LABELS) as FilterGroup[]).map((value) => (
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
                {GROUP_LABELS[value]}
              </button>
            ))}
          </div>

          {filteredApplications.length === 0 ? (
            <EmptyState
              title={`No applications in "${GROUP_LABELS[filter]}"`}
              description="Try a different filter."
            />
          ) : (
            <div className="flex flex-col gap-4">
              {filteredApplications.map((application) => (
                <ApplicantCard key={application.id} application={application} jobId={id ?? ''} />
              ))}
            </div>
          )}
        </>
      )}
    </PageContainer>
  )
}
