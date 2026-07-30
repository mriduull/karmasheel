import { useRatingSummary } from '@/hooks/useRatingSummary'
import { ApiError, toBannerMessage } from '@/api/errors'
import { PageContainer } from '@/components/primitives/PageContainer'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { RatingSummaryCard } from '@/components/shared/RatingSummaryCard'

/**
 * `GET /api/applications/ratings/summary/` — read-only aggregate, as rated
 * by workers. Rating submission itself happens inline from each
 * `COMPLETED` row on a job's Applications screen (`RateEngagementButton`),
 * not from this screen — identical pattern to Worker Ratings, per
 * docs/FRONTEND_IMPLEMENTATION_PLAN.md's Phase F4 correction #3.
 */
export function EmployerRatings() {
  const summaryQuery = useRatingSummary()

  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold text-text-primary">Your Ratings</h1>
      <p className="mt-1 text-base text-text-secondary">
        How workers have rated you after completed jobs.
      </p>

      <div className="mt-6 max-w-sm">
        {summaryQuery.isLoading && <SkeletonCard />}

        {summaryQuery.isError && (
          <ErrorBanner
            message={
              summaryQuery.error instanceof ApiError
                ? toBannerMessage(summaryQuery.error)
                : 'Something went wrong — please try again.'
            }
            onRetry={() => summaryQuery.refetch()}
          />
        )}

        {summaryQuery.isSuccess && <RatingSummaryCard summary={summaryQuery.data} />}
      </div>

      <p className="mt-6 text-sm text-text-secondary">
        You can rate a worker from a completed job on that job's Applications page.
      </p>
    </PageContainer>
  )
}
