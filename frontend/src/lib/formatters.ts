import type { WageType, WorkType } from '@/types/job'

/** Mirrors `jobs/models.py:JobPost.WorkType` choices' human labels exactly. */
const WORK_TYPE_LABELS: Record<WorkType, string> = {
  FULL_TIME: 'Full-time',
  PART_TIME: 'Part-time',
  CONTRACT: 'Contract',
  ONE_TIME: 'One-time',
}

/** Mirrors `jobs/models.py:JobPost.WageType` choices' human labels exactly. */
const WAGE_TYPE_UNIT: Record<WageType, string> = {
  HOURLY: '/ hour',
  DAILY: '/ day',
  MONTHLY: '/ month',
  FIXED: '(fixed)',
}

export function formatWorkType(workType: WorkType): string {
  return WORK_TYPE_LABELS[workType]
}

/** `wage_amount` arrives as a DRF DecimalField string (e.g. "1300.00"). */
export function formatWage(wageType: WageType, wageAmount: string): string {
  const amount = Number(wageAmount)
  const formattedAmount = Number.isFinite(amount)
    ? amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
    : wageAmount

  return `Rs. ${formattedAmount} ${WAGE_TYPE_UNIT[wageType]}`
}

/** `scheduled_datetime`/`application_deadline` arrive as ISO 8601 strings or `null`. */
export function formatDateTime(isoString: string): string {
  return new Date(isoString).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })
}
