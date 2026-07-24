import { Link } from 'react-router-dom'
import { useRatingSummary } from '@/hooks/useRatingSummary'
import { ApiError, toBannerMessage } from '@/api/errors'
import { PageContainer } from '@/components/primitives/PageContainer'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { RatingSummaryCard } from '@/components/shared/RatingSummaryCard'

/**
 * `GET /api/applications/ratings/summary/` — read-only aggregate. Rating
 * submission itself happens inline from each `COMPLETED` row on
 * `/worker/applications` (`RateEngagementButton`), not from this screen —
 * there is no bulk "list all my ratings" endpoint
 * (docs/FRONTEND_IMPLEMENTATION_PLAN.md §1/§3, correction #3).
 */
export function WorkerRatings() {
  const summaryQuery = useRatingSummary()

  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold text-text-primary">Your Ratings</h1>
      <p className="mt-1 text-base text-text-secondary">
        How employers have rated you after completed jobs.
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
        You can rate an employer from a completed job on your{' '}
        <Link to="/worker/applications" className="font-semibold text-brand-primary hover:underline">
          Applications
        </Link>{' '}
        page.
      </p>
    </PageContainer>
  )
}
