import { formatDateTime } from '@/lib/formatters'
import { ApplicationStatusChip } from './ApplicationStatusChip'
import { ApplicationTransitionActions } from './ApplicationTransitionActions'
import type { Application } from '@/types/application'

interface ApplicantCardProps {
  application: Application
  jobId: number | string
}

/**
 * One applicant, in a card layout that works unchanged for desktop rows
 * and mobile stacked cards. Only shows fields `ApplicationSerializer`
 * actually exposes — `worker_username`, notes, status, dates. No
 * employer-contact assumption, no link to a public Worker profile page
 * (none exists).
 */
export function ApplicantCard({ application, jobId }: ApplicantCardProps) {
  return (
    <div className="flex flex-col gap-3 rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card sm:flex-row sm:items-start sm:justify-between">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-lg font-semibold text-text-primary">{application.worker_username}</p>
        <p className="text-sm text-text-secondary">
          Applied {formatDateTime(application.created_at)}
        </p>
        {application.worker_note && (
          <p className="text-sm text-text-secondary">Worker's note: {application.worker_note}</p>
        )}
        {application.employer_note && (
          <p className="text-sm text-text-secondary">Your note: {application.employer_note}</p>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-start gap-2 sm:items-end">
        <ApplicationStatusChip status={application.status} viewerRole="EMPLOYER" />
        <ApplicationTransitionActions application={application} jobId={jobId} />
      </div>
    </div>
  )
}
