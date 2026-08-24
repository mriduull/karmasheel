import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import type { PublicJobPost } from '@/types/job'
import { formatPostedRelativeTime, formatWage, formatWorkType } from '@/lib/formatters'
import { EmployerVerificationBadge } from '@/components/shared/EmployerVerificationBadge'

interface LandingJobCardProps {
  job: PublicJobPost
}

/**
 * Landing-page-only job preview card — denser than the shared `JobCard`
 * used on Job Browse, matching the reference's job-grid composition
 * (work-type badge, relative posted time, address, wage). Every field
 * comes straight from `PublicJobPostSerializer`; no bookmark affordance
 * and no personalized-match copy — an anonymous visitor has no profile
 * for either to be honest about.
 */
export function LandingJobCard({ job }: LandingJobCardProps) {
  return (
    <Link
      to={`/jobs/${job.id}`}
      className="flex flex-col gap-3 rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card transition-colors hover:bg-surface-muted"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-semibold text-text-primary">
          {formatWorkType(job.work_type)}
        </span>
        <EmployerVerificationBadge status={job.employer_verification_status} />
      </div>

      <div>
        <h3 className="text-lg font-semibold text-text-primary">{job.title}</h3>
        <p className="text-sm text-text-secondary">{job.employer_name}</p>
      </div>

      <p className="flex items-center gap-1 text-sm text-text-secondary">
        <MapPin size={16} aria-hidden="true" />
        {job.address}
      </p>

      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold text-text-primary">
          {formatWage(job.wage_type, job.wage_amount)}
        </span>
        <span className="text-xs text-text-secondary">{formatPostedRelativeTime(job.created_at)}</span>
      </div>
    </Link>
  )
}
