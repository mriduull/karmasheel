import { Link } from 'react-router-dom'
import { useOpportunityAdvisory } from '@/hooks/useOpportunityAdvisory'
import { ApiError, toBannerMessage } from '@/api/errors'
import { formatWage, formatWorkType } from '@/lib/formatters'
import { PageContainer } from '@/components/primitives/PageContainer'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { EmptyState } from '@/components/primitives/EmptyState'
import { StatusBadge } from '@/components/primitives/StatusBadge'
import { RecommendationCard } from '@/components/shared/RecommendationCard'
import { MissingSkillRow } from '@/components/shared/MissingSkillRow'

/**
 * `GET /api/recommendations/opportunities/` — near-miss jobs plus ranked
 * missing-skill suggestions (recommendations/views.py:OpportunityAdvisoryView,
 * recommendations/advisory.py). Distinct from Recommended Jobs: these are
 * jobs the worker does NOT yet strongly match, shown specifically to
 * explain what would help.
 */
export function WorkerOpportunities() {
  const advisoryQuery = useOpportunityAdvisory()

  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold text-text-primary">Opportunity Advisory</h1>
      <p className="mt-1 max-w-2xl text-base text-text-secondary">
        Jobs you're close to qualifying for, and what would help. This is different from Recommended
        Jobs — those are jobs you already match strongly; this page is about closing the gap on jobs you
        don't match yet.
      </p>

      <div className="mt-6">
        {advisoryQuery.isLoading && (
          <div className="flex flex-col gap-4">
            <SkeletonCard />
            <SkeletonCard />
          </div>
        )}

        {advisoryQuery.isError && (
          <ErrorBanner
            message={
              advisoryQuery.error instanceof ApiError
                ? toBannerMessage(advisoryQuery.error)
                : 'Something went wrong — please try again.'
            }
            onRetry={() => advisoryQuery.refetch()}
          />
        )}

        {advisoryQuery.isSuccess &&
          advisoryQuery.data.near_miss_jobs.length === 0 &&
          advisoryQuery.data.missing_skills.length === 0 && (
            <EmptyState
              title="You're either well-matched already or there's nothing close yet"
              description="Check Recommended Jobs for your strongest matches."
              action={
                <Link to="/worker/recommendations" className="font-semibold text-brand-primary hover:underline">
                  View Recommended Jobs
                </Link>
              }
            />
          )}

        {advisoryQuery.isSuccess && advisoryQuery.data.near_miss_jobs.length > 0 && (
          <section>
            <h2 className="mb-3 text-lg font-semibold text-text-primary">Near-miss jobs</h2>
            <div className="flex flex-col gap-4">
              {advisoryQuery.data.near_miss_jobs.map((recommendation, index) => (
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
                    <Link
                      to={`/jobs/${recommendation.job.id}`}
                      className="text-sm font-semibold text-brand-primary hover:underline"
                    >
                      View job
                    </Link>
                  }
                />
              ))}
            </div>
          </section>
        )}

        {advisoryQuery.isSuccess && advisoryQuery.data.missing_skills.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-1 text-lg font-semibold text-text-primary">Skills that would help</h2>
            <p className="mb-3 text-sm text-text-secondary">
              Learning these would help you qualify for more of the jobs above.
            </p>
            <div className="flex flex-col gap-3">
              {(() => {
                const jobTitleById = new Map(
                  advisoryQuery.data.near_miss_jobs.map((rec) => [rec.job.id, rec.job.title]),
                )
                return advisoryQuery.data.missing_skills.map((advisory) => (
                  <MissingSkillRow key={advisory.skill.id} advisory={advisory} jobTitleById={jobTitleById} />
                ))
              })()}
            </div>
            <Link
              to="/worker/profile"
              className="mt-4 inline-block text-sm font-semibold text-brand-primary hover:underline"
            >
              Update your skills
            </Link>
          </section>
        )}
      </div>
    </PageContainer>
  )
}
