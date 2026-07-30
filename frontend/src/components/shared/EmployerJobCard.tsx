import { Link } from 'react-router-dom'
import { MapPin } from 'lucide-react'
import type { EmployerJobPost } from '@/types/job'
import { formatDateTime, formatWage, formatWorkType } from '@/lib/formatters'
import { StatusBadge } from '@/components/primitives/StatusBadge'

interface EmployerJobCardProps {
  job: EmployerJobPost
}

/** One row/card in My Jobs — links to the owner Job Detail page. Closed
 * is shown in a muted "neutral" tone, never implying failure (design
 * spec convention, carried over from Worker's `ApplicationStatusChip`). */
export function EmployerJobCard({ job }: EmployerJobCardProps) {
  return (
    <Link
      to={`/employer/jobs/${job.id}`}
      className="flex flex-col gap-2 rounded-md border border-text-secondary/10 bg-surface p-4 shadow-card transition-colors hover:bg-surface-muted"
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-lg font-semibold text-text-primary">{job.title}</h2>
        <StatusBadge tone={job.status === 'ACTIVE' ? 'success' : 'neutral'}>
          {job.status === 'ACTIVE' ? 'Active' : 'Closed'}
        </StatusBadge>
      </div>

      <p className="text-sm text-text-secondary">
        {job.category_name} · {job.subcategory_name}
      </p>

      <p className="flex items-center gap-1 text-sm text-text-secondary">
        <MapPin size={16} aria-hidden="true" />
        {job.address}
      </p>

      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm font-semibold text-text-primary">
        <span>{formatWage(job.wage_type, job.wage_amount)}</span>
        <span>{formatWorkType(job.work_type)}</span>
      </div>

      <p className="text-sm text-text-secondary">
        Posted {formatDateTime(job.created_at)}
        {job.application_deadline && <> · Deadline {formatDateTime(job.application_deadline)}</>}
      </p>
    </Link>
  )
}
