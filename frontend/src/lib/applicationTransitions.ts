import type { ApplicationStatus } from '@/types/application'

/** Mirrors `applications/services.py:WORKER_ALLOWED_TRANSITIONS` exactly
 * — a Worker may only ever request `WITHDRAWN`, and only from these three
 * statuses. Kept as a direct, testable copy of the backend's own table
 * rather than an independently-invented one. */
export const WORKER_WITHDRAWABLE_STATUSES: ApplicationStatus[] = [
  'APPLIED',
  'SHORTLISTED',
  'CONTACTED',
]

export function canWorkerWithdraw(status: ApplicationStatus): boolean {
  return WORKER_WITHDRAWABLE_STATUSES.includes(status)
}

/** The four statuses a Worker can never act on further — rendered as
 * read-only history rows. */
export const TERMINAL_STATUSES: ApplicationStatus[] = [
  'REJECTED',
  'WITHDRAWN',
  'COMPLETED',
  'CANCELLED',
]

export function isTerminalStatus(status: ApplicationStatus): boolean {
  return TERMINAL_STATUSES.includes(status)
}

type Tone = 'success' | 'warning' | 'danger' | 'neutral'

/** Plain-language status labels + semantic tone — color is never the
 * only signal (paired with text in ApplicationStatusChip). */
export const APPLICATION_STATUS_CONFIG: Record<ApplicationStatus, { tone: Tone; label: string }> = {
  APPLIED: { tone: 'neutral', label: 'Applied' },
  SHORTLISTED: { tone: 'warning', label: 'Shortlisted' },
  CONTACTED: { tone: 'warning', label: 'Contacted' },
  HIRED: { tone: 'success', label: 'Hired' },
  COMPLETED: { tone: 'success', label: 'Completed' },
  REJECTED: { tone: 'danger', label: 'Not selected' },
  WITHDRAWN: { tone: 'neutral', label: 'Withdrawn by you' },
  CANCELLED: { tone: 'neutral', label: 'Cancelled by employer' },
}

export function applicationStatusLabel(status: ApplicationStatus): string {
  return APPLICATION_STATUS_CONFIG[status].label
}
