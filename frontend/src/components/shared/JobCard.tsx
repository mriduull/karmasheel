import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import type { PublicJobPost } from '@/types/job'
import { formatWage, formatWorkType } from '@/lib/formatters'
import { EmployerVerificationBadge } from './EmployerVerificationBadge'

interface JobCardProps {
  job: PublicJobPost
}

/**
 * `PublicJobPostSerializer` has no distance/distance_km field (that only
 * exists on the recommendation endpoints, Phase F4) — this card
 * deliberately never displays a distance figure, even though distance
 * *filtering* affects which jobs appear at all (see JobFilterPanel).
 */
export function JobCard({ job }: JobCardProps) {
  return (
    <Link
      to={`/jobs/${job.id}`}
      className="flex flex-col gap-2 rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card transition-colors hover:bg-surface-muted"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-semibold text-text-primary">{job.title}</h2>
        <EmployerVerificationBadge status={job.employer_verification_status} />
      </div>

      <p className="text-sm text-text-secondary">
        {job.category_name} · {job.subcategory_name}
      </p>

      <p className="text-sm text-text-secondary">{job.employer_name}</p>

      <p className="flex items-center gap-1 text-sm text-text-secondary">
        <MapPin size={16} aria-hidden="true" />
        {job.address}
      </p>

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-text-primary">
        <span>{formatWage(job.wage_type, job.wage_amount)}</span>
        <span>{formatWorkType(job.work_type)}</span>
      </div>
    </Link>
  )
}
