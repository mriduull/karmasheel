import { StatusBadge } from '@/components/primitives/StatusBadge'
import type { EmployerVerificationStatus } from '@/hooks/useEmployerVerificationStatus'

const STATUS_CONFIG: Record<EmployerVerificationStatus, { tone: 'success' | 'warning' | 'danger' | 'neutral'; label: string }> = {
  VERIFIED: { tone: 'success', label: 'Verified employer' },
  PENDING: { tone: 'warning', label: 'Verification pending' },
  UNVERIFIED: { tone: 'neutral', label: 'Not yet verified' },
  REJECTED: { tone: 'danger', label: 'Verification not approved' },
}

/** `PublicJobPostSerializer.employer_verification_status` /
 * `EmployerProfile.VerificationStatus`, rendered as a badge — same status
 * vocabulary and tones used again once the employer-facing profile screen
 * exists (Phase F3). */
export function EmployerVerificationBadge({ status }: { status: EmployerVerificationStatus }) {
  const config = STATUS_CONFIG[status]
  return <StatusBadge tone={config.tone}>{config.label}</StatusBadge>
}
