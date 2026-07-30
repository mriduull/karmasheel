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

/**
 * `WITHDRAWN` and `CANCELLED` are each initiated by exactly one side
 * (`applications/services.py`: only a Worker can reach `WITHDRAWN`, only
 * an Employer can reach `CANCELLED`) — the shared "by you"/"by the other
 * side" phrasing in `APPLICATION_STATUS_CONFIG` is only correct from the
 * Worker's own viewpoint. Every other status is actor-neutral phrasing
 * ("Not selected", "Hired", etc.) and needs no adjustment.
 */
export function applicationStatusLabel(
  status: ApplicationStatus,
  viewerRole: 'WORKER' | 'EMPLOYER' = 'WORKER',
): string {
  if (status === 'WITHDRAWN') {
    return viewerRole === 'WORKER' ? 'Withdrawn by you' : 'Withdrawn by worker'
  }
  if (status === 'CANCELLED') {
    return viewerRole === 'EMPLOYER' ? 'Cancelled by you' : 'Cancelled by employer'
  }
  return APPLICATION_STATUS_CONFIG[status].label
}

/** Mirrors `applications/services.py:EMPLOYER_ALLOWED_TRANSITIONS`
 * exactly — a direct, testable copy of the backend's own table, not an
 * independently-invented one. Every status not listed (REJECTED,
 * WITHDRAWN, COMPLETED, CANCELLED) has no legal Employer transition —
 * terminal for both sides. */
export const EMPLOYER_ALLOWED_TRANSITIONS: Record<ApplicationStatus, ApplicationStatus[]> = {
  APPLIED: ['SHORTLISTED', 'CONTACTED', 'REJECTED'],
  SHORTLISTED: ['CONTACTED', 'HIRED', 'REJECTED'],
  CONTACTED: ['HIRED', 'REJECTED'],
  HIRED: ['COMPLETED', 'CANCELLED'],
  REJECTED: [],
  WITHDRAWN: [],
  COMPLETED: [],
  CANCELLED: [],
}

export function employerAllowedTransitions(status: ApplicationStatus): ApplicationStatus[] {
  return EMPLOYER_ALLOWED_TRANSITIONS[status]
}

/** Consequential/hard-to-reverse targets that require an explicit
 * confirmation before submitting; every other legal target is
 * forward-progress and may submit directly. */
export function transitionRequiresConfirmation(target: ApplicationStatus): boolean {
  return target === 'REJECTED' || target === 'CANCELLED'
}

/** Plain-language label for the ACTION button that requests a given
 * target status (distinct from the status label itself, e.g. the button
 * that requests `SHORTLISTED` reads "Shortlist", not "Shortlisted"). */
export const TRANSITION_ACTION_LABELS: Partial<Record<ApplicationStatus, string>> = {
  SHORTLISTED: 'Shortlist',
  CONTACTED: 'Mark as Contacted',
  HIRED: 'Hire',
  REJECTED: 'Reject',
  COMPLETED: 'Mark Completed',
  CANCELLED: 'Cancel',
}
