import { StatusBadge } from '@/components/primitives/StatusBadge'
import { APPLICATION_STATUS_CONFIG, applicationStatusLabel } from '@/lib/applicationTransitions'
import type { ApplicationStatus } from '@/types/application'

interface ApplicationStatusChipProps {
  status: ApplicationStatus
  /** Defaults to the Worker's own viewpoint (unchanged from Phase F2) —
   * pass `'EMPLOYER'` on the Employer's applicant-management screens so
   * WITHDRAWN/CANCELLED read correctly from that side (see
   * lib/applicationTransitions.ts:applicationStatusLabel). */
  viewerRole?: 'WORKER' | 'EMPLOYER'
}

/** Semantic color + text together — never color alone
 * (`applications/models.py:Application.Status`, the real 8-value set). */
export function ApplicationStatusChip({ status, viewerRole = 'WORKER' }: ApplicationStatusChipProps) {
  const tone = APPLICATION_STATUS_CONFIG[status].tone
  return <StatusBadge tone={tone}>{applicationStatusLabel(status, viewerRole)}</StatusBadge>
}
