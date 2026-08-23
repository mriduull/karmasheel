import { Link } from 'react-router-dom'
import { Briefcase, PlusCircle, Star, User } from 'lucide-react'
import { useAuthStore } from '@/state/authStore'
import { useEmployerProfile } from '@/hooks/useEmployerProfile'
import { useMyJobs } from '@/hooks/useMyJobs'
import { ApiError, toBannerMessage } from '@/api/errors'
import { PageContainer } from '@/components/primitives/PageContainer'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { Button } from '@/components/primitives/Button'
import { VerificationStatusBanner } from '@/components/shared/VerificationStatusBanner'

/**
 * Two independent data sections (profile, jobs) — each with its own
 * loading/error UI, so a failure in one never blocks the other. No
 * analytics, notifications, employer-wide applicant count (no endpoint
 * supports one), recommendations, or ratings — those are Phase F4 or
 * simply unsupported.
 */
export function EmployerDashboard() {
  const user = useAuthStore((state) => state.user)
  const profileQuery = useEmployerProfile()
  const jobsQuery = useMyJobs()

  const isVerified = profileQuery.data?.verification_status === 'VERIFIED'

  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold text-text-primary">
        Welcome, <span className="break-all">{user?.username}</span>
        {profileQuery.data?.organization_name ? ` · ${profileQuery.data.organization_name}` : ''}
      </h1>

      <div className="mt-6">
        {profileQuery.isLoading && <SkeletonCard />}
        {profileQuery.isError && (
          <ErrorBanner
            message={
              profileQuery.error instanceof ApiError
                ? toBannerMessage(profileQuery.error)
                : 'Something went wrong — please try again.'
            }
            onRetry={() => profileQuery.refetch()}
          />
        )}
        {profileQuery.isSuccess && (
          <VerificationStatusBanner status={profileQuery.data.verification_status} />
        )}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link
          to="/employer/jobs"
          className="flex min-h-touch flex-col items-center gap-2 rounded-md border border-text-secondary/10 bg-surface p-6 text-center shadow-card transition-colors hover:bg-surface-muted"
        >
          <Briefcase size={28} aria-hidden="true" className="text-brand-primary" />
          <span className="text-base font-semibold text-text-primary">My Jobs</span>
        </Link>

        {isVerified ? (
          <Link
            to="/employer/jobs/new"
            className="flex min-h-touch flex-col items-center gap-2 rounded-md border border-text-secondary/10 bg-surface p-6 text-center shadow-card transition-colors hover:bg-surface-muted"
          >
            <PlusCircle size={28} aria-hidden="true" className="text-brand-primary" />
            <span className="text-base font-semibold text-text-primary">Post a Job</span>
          </Link>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-text-secondary/30 bg-surface-muted p-6 text-center opacity-75">
            <PlusCircle size={28} aria-hidden="true" className="text-text-secondary" />
            <span className="text-base font-semibold text-text-secondary">Post a Job</span>
            <span className="text-sm text-text-secondary">Available once your account is verified</span>
          </div>
        )}

        <Link
          to="/employer/profile"
          className="flex min-h-touch flex-col items-center gap-2 rounded-md border border-text-secondary/10 bg-surface p-6 text-center shadow-card transition-colors hover:bg-surface-muted"
        >
          <User size={28} aria-hidden="true" className="text-brand-primary" />
          <span className="text-base font-semibold text-text-primary">Employer Profile</span>
        </Link>

        <Link
          to="/employer/ratings"
          className="flex min-h-touch flex-col items-center gap-2 rounded-md border border-text-secondary/10 bg-surface p-6 text-center shadow-card transition-colors hover:bg-surface-muted"
        >
          <Star size={28} aria-hidden="true" className="text-brand-primary" />
          <span className="text-base font-semibold text-text-primary">Your Ratings</span>
        </Link>
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-lg font-semibold text-text-primary">Your jobs</h2>
        {jobsQuery.isLoading && <SkeletonCard />}
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
        {jobsQuery.isSuccess && jobsQuery.data.length === 0 && (
          <div className="rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card">
            <p className="text-base text-text-secondary">You haven't posted a job yet.</p>
          </div>
        )}
        {jobsQuery.isSuccess && jobsQuery.data.length > 0 && (
          <div className="rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card">
            {(() => {
              const activeCount = jobsQuery.data.filter((job) => job.status === 'ACTIVE').length
              const closedCount = jobsQuery.data.length - activeCount
              return (
                <>
                  <p className="text-2xl font-semibold text-text-primary">{jobsQuery.data.length}</p>
                  <p className="text-base text-text-secondary">
                    {jobsQuery.data.length === 1 ? 'job' : 'jobs'} total · {activeCount} active ·{' '}
                    {closedCount} closed
                  </p>
                </>
              )
            })()}
            <Link
              to="/employer/jobs"
              className="mt-2 inline-block font-semibold text-brand-primary hover:underline"
            >
              View all jobs
            </Link>
          </div>
        )}
      </div>

      {!isVerified && profileQuery.isSuccess && (
        <div className="mt-6">
          <Link to="/employer/profile">
            <Button variant="secondary">View verification status</Button>
          </Link>
        </div>
      )}
    </PageContainer>
  )
}
