import { EmployerVerificationBadge } from './EmployerVerificationBadge'
import type { EmployerVerificationStatus } from '@/hooks/useEmployerVerificationStatus'

const EXPLANATION: Record<EmployerVerificationStatus, string> = {
  VERIFIED: 'Your account is verified. You can post jobs and see everything My Jobs offers.',
  PENDING:
    "An administrator is reviewing your account. You'll be able to post jobs once verified — there's no in-app way to speed this up.",
  UNVERIFIED:
    "Your account hasn't been reviewed yet. An administrator verifies new employer accounts — there's no in-app way to request this.",
  REJECTED:
    "Your verification wasn't approved. There's no in-app appeal — contact an administrator through your organization's usual channel if you believe this is a mistake.",
}

const CONTAINER_CLASSES: Record<EmployerVerificationStatus, string> = {
  VERIFIED: 'bg-success-bg text-success-text',
  PENDING: 'bg-warning-bg text-warning-text',
  UNVERIFIED: 'bg-neutral-status-bg text-neutral-status-text',
  REJECTED: 'bg-danger-bg text-danger-text',
}

/**
 * Reused on the Employer Dashboard, Profile, and My Jobs screens so the
 * explanation is worded identically everywhere it appears. Always
 * explains that an administrator controls verification — never offers a
 * "request verification" action, since no such endpoint exists.
 */
export function VerificationStatusBanner({ status }: { status: EmployerVerificationStatus }) {
  return (
    <div role="status" className={`rounded-md p-4 ${CONTAINER_CLASSES[status]}`}>
      <div className="mb-2">
        <EmployerVerificationBadge status={status} />
      </div>
      <p className="text-sm">{EXPLANATION[status]}</p>
    </div>
  )
}
