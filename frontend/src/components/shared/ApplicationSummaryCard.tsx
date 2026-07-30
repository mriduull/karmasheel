import { Link } from 'react-router-dom'
import { isTerminalStatus } from '@/lib/applicationTransitions'
import type { Application } from '@/types/application'

/** Dashboard summary — computed entirely from `GET /api/applications/`'s
 * own array (count, and how many are still in progress); no separate
 * summary endpoint exists, and no count is invented beyond what's
 * directly derivable from that response. */
export function ApplicationSummaryCard({ applications }: { applications: Application[] }) {
  if (applications.length === 0) {
    return (
      <div className="rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card">
        <p className="text-base text-text-secondary">You haven't applied to any jobs yet.</p>
        <Link
          to="/jobs"
          className="mt-2 inline-block font-semibold text-brand-primary hover:underline"
        >
          Browse jobs to get started
        </Link>
      </div>
    )
  }

  const activeCount = applications.filter((application) => !isTerminalStatus(application.status)).length

  return (
    <div className="rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card">
      <p className="text-2xl font-semibold text-text-primary">{applications.length}</p>
      <p className="text-base text-text-secondary">
        {applications.length === 1 ? 'application' : 'applications'} total
        {activeCount > 0 ? ` · ${activeCount} in progress` : ''}
      </p>
      <Link
        to="/worker/applications"
        className="mt-2 inline-block font-semibold text-brand-primary hover:underline"
      >
        View all applications
      </Link>
    </div>
  )
}
