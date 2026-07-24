import { useParams } from 'react-router-dom'
import { useOwnerJob } from '@/hooks/useOwnerJob'
import { ApiError, toBannerMessage } from '@/api/errors'
import { PageContainer } from '@/components/primitives/PageContainer'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { JobForm } from '@/components/shared/JobForm'

/**
 * `/employer/jobs/:id/edit` — owner-only (enforced by the backend on
 * every write; `RequireRole("EMPLOYER")` plus the fetch's own 403/404
 * handling here). Editing an existing job never requires
 * `IsVerifiedEmployer` (verified directly against
 * `jobs/views.py:JobPostDetailView` — only `POST /api/jobs/` has that
 * check), so this route is not wrapped in `RequireVerifiedEmployer`.
 */
export function EmployerJobEdit() {
  const { id } = useParams<{ id: string }>()
  const jobQuery = useOwnerJob(id)

  return (
    <PageContainer>
      <h1 className="mb-6 text-2xl font-semibold text-text-primary">Edit Job</h1>

      {jobQuery.isLoading && (
        <div className="flex flex-col gap-4">
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {jobQuery.isError && (
        <ErrorBanner
          message={
            jobQuery.error instanceof ApiError
              ? toBannerMessage(jobQuery.error)
              : 'Something went wrong — please try again.'
          }
          onRetry={() => jobQuery.refetch()}
        />
      )}

      {jobQuery.isSuccess && <JobForm mode="edit" job={jobQuery.data} />}
    </PageContainer>
  )
}
