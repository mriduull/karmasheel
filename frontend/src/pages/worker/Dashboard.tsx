import { Link } from 'react-router-dom'
import { Briefcase, ClipboardList, FileText, Lightbulb, Star, TrendingUp, User } from 'lucide-react'
import { useAuthStore } from '@/state/authStore'
import { useWorkerProfile } from '@/hooks/useWorkerProfile'
import { useMyApplications } from '@/hooks/useMyApplications'
import { ApiError, toBannerMessage } from '@/api/errors'
import { PageContainer } from '@/components/primitives/PageContainer'
import { SkeletonCard } from '@/components/primitives/SkeletonCard'
import { ErrorBanner } from '@/components/primitives/ErrorBanner'
import { ProfileReadinessBanner } from '@/components/shared/ProfileReadinessBanner'
import { ApplicationSummaryCard } from '@/components/shared/ApplicationSummaryCard'

const SHORTCUTS = [
  { to: '/worker/profile', label: 'Complete / Edit Profile', icon: User },
  { to: '/jobs', label: 'Browse Jobs', icon: Briefcase },
  { to: '/worker/applications', label: 'My Applications', icon: ClipboardList },
  { to: '/worker/recommendations', label: 'Recommended Jobs', icon: TrendingUp },
  { to: '/worker/opportunities', label: 'Opportunity Advisory', icon: Lightbulb },
  { to: '/worker/cv', label: 'Your CV', icon: FileText },
  { to: '/worker/ratings', label: 'Your Ratings', icon: Star },
]

/**
 * Two independent data sections (profile, applications) — each with its
 * own loading/error UI, so a failure in one never blocks the other from
 * rendering. Recommendations/Opportunity Advisory/CV/Ratings are plain
 * navigation shortcuts here (Phase F4) — each fetches its own data only
 * once its destination screen becomes active, per design spec §3.1's
 * "navigation itself never fetches restricted data speculatively." No
 * invented analytics/notifications/charts.
 */
export function WorkerDashboard() {
  const user = useAuthStore((state) => state.user)
  const profileQuery = useWorkerProfile()
  const applicationsQuery = useMyApplications()

  return (
    <PageContainer>
      <h1 className="text-2xl font-semibold text-text-primary">Welcome, {user?.username}</h1>

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
        {profileQuery.isSuccess && <ProfileReadinessBanner profile={profileQuery.data} />}
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {SHORTCUTS.map((shortcut) => {
          const Icon = shortcut.icon
          return (
            <Link
              key={shortcut.to}
              to={shortcut.to}
              className="flex min-h-touch flex-col items-center gap-2 rounded-md border border-text-secondary/10 bg-surface p-6 text-center shadow-card transition-colors hover:bg-surface-muted"
            >
              <Icon size={28} aria-hidden="true" className="text-brand-primary" />
              <span className="text-base font-semibold text-text-primary">{shortcut.label}</span>
            </Link>
          )
        })}
      </div>

      <div className="mt-6">
        <h2 className="mb-2 text-lg font-semibold text-text-primary">Your applications</h2>
        {applicationsQuery.isLoading && <SkeletonCard />}
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
        {applicationsQuery.isSuccess && (
          <ApplicationSummaryCard applications={applicationsQuery.data} />
        )}
      </div>
    </PageContainer>
  )
}
