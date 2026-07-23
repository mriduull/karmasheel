import { StatusBadge } from '@/components/primitives/StatusBadge'
import { APPLICATION_STATUS_CONFIG } from '@/lib/applicationTransitions'
import type { ApplicationStatus } from '@/types/application'

/** Semantic color + text together — never color alone
 * (`applications/models.py:Application.Status`, the real 8-value set). */
export function ApplicationStatusChip({ status }: { status: ApplicationStatus }) {
  const config = APPLICATION_STATUS_CONFIG[status]
  return <StatusBadge tone={config.tone}>{config.label}</StatusBadge>
}
