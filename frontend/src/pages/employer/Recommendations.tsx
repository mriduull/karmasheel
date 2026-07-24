import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useOwnerJob } from '@/hooks/useOwnerJob'
import { useJobWorkerRecommendations } from '@/hooks/useJobWorkerRecommendations'
import { useJobApplications } from '@/hooks/useJobApplications'
import { ApiError, toBannerMessage } from '@/api/errors'
import { PageContainer } from '@/components/primitives/PageContainer'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { EmptyState } from '@/components/primitives/EmptyState'
import { RecommendationCard } from '@/components/shared/RecommendationCard'
import { SkillChipList } from '@/components/shared/SkillChipList'
import { ApplicationStatusChip } from '@/components/shared/ApplicationStatusChip'

/**
 * `GET /api/recommendations/jobs/<job_id>/workers/` — ranked, explained
 * worker candidates for one of the requesting Employer's own jobs
 * (recommendations/views.py:JobWorkerRecommendationsView). Route is guarded
 * by `RequireVerifiedEmployer` (router.tsx) so an unverified employer never
 * reaches this component; the 403 branch below is a defensive fallback for
 * a race (e.g. verification revoked mid-session) or direct navigation.
 */
export function EmployerRecommendations() {
  const { id } = useParams<{ id: string }>()
  const jobQuery = useOwnerJob(id)
  const recommendationsQuery = useJobWorkerRecommendations(id)
  // Cross-referenced against already-fetched application data (not a new
  // field invented on the recommendation response) to show an existing
  // application relationship where one exists.
  const applicationsQuery = useJobApplications(id ?? '')

  const statusByUsername = new Map(
    (applicationsQuery.data ?? []).map((application) => [application.worker_username, application.status]),
  )

  return (
    <PageContainer>
      <Link
        to={id ? `/employer/jobs/${id}` : '/employer/jobs'}
        className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft size={16} aria-hidden="true" />
        Back to Job
      </Link>

      <h1 className="text-2xl font-semibold text-text-primary">Recommended Workers</h1>
      {jobQuery.isSuccess && <p className="mt-1 text-base text-text-secondary">{jobQuery.data.title}</p>}
      {jobQuery.isLoading && <SkeletonCard />}

      <div className="mt-6">
        {recommendationsQuery.isLoading && (
          <div className="flex flex-col gap-4">
            <SkeletonCard />
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {recommendationsQuery.isError && (
          <ErrorBanner
            message={
              recommendationsQuery.error instanceof ApiError
                ? toBannerMessage(recommendationsQuery.error)
                : 'Something went wrong — please try again.'
            }
            onRetry={() => recommendationsQuery.refetch()}
          />
        )}

        {recommendationsQuery.isSuccess && recommendationsQuery.data.length === 0 && (
          <EmptyState
            title="No matching workers yet for this job"
            description="Check back once more workers with relevant skills complete their profiles."
          />
        )}

        {recommendationsQuery.isSuccess && recommendationsQuery.data.length > 0 && (
          <div className="flex flex-col gap-4">
            {recommendationsQuery.data.map((recommendation, index) => {
              const existingStatus = statusByUsername.get(recommendation.worker.username)

              return (
                <RecommendationCard
                  key={recommendation.worker.id}
                  rank={index + 1}
                  result={recommendation}
                  header={
                    <div>
                      <p className="text-lg font-semibold text-text-primary">
                        {recommendation.worker.username}
                      </p>
                      <p className="text-sm text-text-secondary">{recommendation.worker.address}</p>
                      <p className="text-sm text-text-secondary">
                        {recommendation.worker.experience_years} year
                        {recommendation.worker.experience_years === 1 ? '' : 's'} experience ·{' '}
                        {recommendation.worker.is_available ? 'Available' : 'Not currently available'}
                      </p>
                      {recommendation.worker.expected_wage && (
                        <p className="text-sm text-text-secondary">
                          Expects Rs. {recommendation.worker.expected_wage}
                        </p>
                      )}
                      <div className="mt-2">
                        <SkillChipList skills={recommendation.worker.skills} />
                      </div>
                      {existingStatus && (
                        <div className="mt-2">
                          <p className="mb-1 text-xs text-text-secondary">Already applied to this job:</p>
                          <ApplicationStatusChip status={existingStatus} viewerRole="EMPLOYER" />
                        </div>
                      )}
                    </div>
                  }
                />
              )
            })}
          </div>
        )}
      </div>
    </PageContainer>
  )
}
