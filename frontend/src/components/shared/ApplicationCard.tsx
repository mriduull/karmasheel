import { Link } from 'react-router-dom'
import { ApplicationStatusChip } from './ApplicationStatusChip'
import { RateEngagementButton } from './RateEngagementButton'
import { canWorkerWithdraw } from '@/lib/applicationTransitions'
import { formatDateTime } from '@/lib/formatters'
import { Button } from '@/components/primitives/Button'
import type { Application } from '@/types/application'

interface ApplicationCardProps {
  application: Application
  onWithdraw: (application: Application) => void
}

/**
 * One application, in a card layout that works unchanged for both the
 * desktop "list of generously-spaced rows" and mobile "stacked cards"
 * presentations (no separate dense-table variant). Only shows
 * `job_title`/notes/status — `ApplicationSerializer` exposes no employer
 * name, contact info, or job address at all.
 */
export function ApplicationCard({ application, onWithdraw }: ApplicationCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <Link
          to={`/jobs/${application.job}`}
          className="text-lg font-semibold text-text-primary hover:underline"
        >
          {application.job_title}
        </Link>
        <p className="text-sm text-text-secondary">
          Applied {formatDateTime(application.created_at)}
        </p>
        {application.worker_note && (
          <p className="text-sm text-text-secondary">Your note: {application.worker_note}</p>
        )}
        {application.employer_note && (
          <p className="text-sm text-text-secondary">Employer note: {application.employer_note}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-row items-center gap-2 sm:flex-col sm:items-end">
        <ApplicationStatusChip status={application.status} />
        {canWorkerWithdraw(application.status) && (
          <Button variant="secondary" onClick={() => onWithdraw(application)}>
            Withdraw
          </Button>
        )}
        <RateEngagementButton application={application} viewerRole="WORKER" />
      </div>
    </div>
  )
}
