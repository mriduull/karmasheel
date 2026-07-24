import { Link } from 'react-router-dom'
import { useWorkerJobRecommendations } from '@/hooks/useWorkerJobRecommendations'
import { ApiError, toBannerMessage } from '@/api/errors'
import { formatWage, formatWorkType } from '@/lib/formatters'
import { PageContainer } from '@/components/primitives/PageContainer'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { EmptyState } from '@/components/primitives/EmptyState'
import { Button } from '@/components/primitives/Button'
import { StatusBadge } from '@/components/primitives/StatusBadge'
import { RecommendationCard } from '@/components/shared/RecommendationCard'
import { RecommendationApplyAction } from '@/components/shared/RecommendationApplyAction'

/**
 * `GET /api/recommendations/jobs/` — ranked, explained job recommendations
 * for the authenticated worker's own profile
 * (recommendations/views.py:WorkerJobRecommendationsView). Only fields the
 * API actually returns are rendered; nothing is reconstructed.
 */
export function WorkerRecommendations() {
  const recommendationsQuery = useWorkerJobRecommendations()

  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold text-text-primary">Recommended Jobs</h1>
      <p className="mt-1 text-base text-text-secondary">
        Jobs matched to your profile, with the reasons why.
      </p>

      <div className="mt-6">
        {recommendationsQuery.isLoading && (
          <div className="flex flex-col gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {recommendationsQuery.isError && (
          <RecommendationsError error={recommendationsQuery.error} onRetry={() => recommendationsQuery.refetch()} />
        )}

        {recommendationsQuery.isSuccess && recommendationsQuery.data.length === 0 && (
          <EmptyState
            title="No matches yet"
            description="Try broadening your availability or adding more skills to your profile."
            action={
              <Link to="/worker/profile">
                <Button variant="primary">Complete your profile</Button>
              </Link>
            }
          />
        )}

        {recommendationsQuery.isSuccess && recommendationsQuery.data.length > 0 && (
          <div className="flex flex-col gap-4">
            {recommendationsQuery.data.map((recommendation, index) => (
              <RecommendationCard
                key={recommendation.job.id}
                rank={index + 1}
                result={recommendation}
                header={
                  <div>
                    <Link
                      to={`/jobs/${recommendation.job.id}`}
                      className="text-lg font-semibold text-text-primary hover:underline"
                    >
                      {recommendation.job.title}
                    </Link>
                    <p className="text-sm text-text-secondary">
                      {recommendation.job.employer_name} · {recommendation.job.category_name} /{' '}
                      {recommendation.job.subcategory_name}
                    </p>
                    <p className="text-sm text-text-secondary">{recommendation.job.address}</p>
                    <p className="text-sm text-text-secondary">
                      {formatWage(recommendation.job.wage_type, recommendation.job.wage_amount)} ·{' '}
                      {formatWorkType(recommendation.job.work_type)}
                    </p>
                    <div className="mt-1">
                      <StatusBadge tone={recommendation.job.status === 'ACTIVE' ? 'success' : 'neutral'}>
                        {recommendation.job.status === 'ACTIVE' ? 'Active' : 'Closed'}
                      </StatusBadge>
                    </div>
                  </div>
                }
                footer={
                  <div className="flex flex-wrap items-center gap-3">
                    <Link
                      to={`/jobs/${recommendation.job.id}`}
                      className="text-sm font-semibold text-brand-primary hover:underline"
                    >
                      View job
                    </Link>
                    <RecommendationApplyAction job={recommendation.job} />
                  </div>
                }
              />
            ))}
          </div>
        )}
      </div>
    </PageContainer>
  )
}

function RecommendationsError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  if (error instanceof ApiError && error.status === 404) {
    return (
      <EmptyState
        title="Complete your profile to see matches"
        description="We need your skills and location to recommend jobs."
        action={
          <Link to="/worker/profile">
            <Button variant="primary">Complete your profile</Button>
          </Link>
        }
      />
    )
  }

  return (
    <ErrorBanner
      message={error instanceof ApiError ? toBannerMessage(error) : 'Something went wrong — please try again.'}
      onRetry={onRetry}
    />
  )
}
