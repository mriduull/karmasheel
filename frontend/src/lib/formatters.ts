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

/** Mirrors `jobs/models.py:JobPost.WageType` choices' human labels exactly
 * (distinct from `WAGE_TYPE_UNIT` above, which is a per-amount suffix). */
const WAGE_TYPE_LABELS: Record<WageType, string> = {
  HOURLY: 'Hourly',
  DAILY: 'Daily',
  MONTHLY: 'Monthly',
  FIXED: 'Fixed',
}

export function formatWorkType(workType: WorkType): string {
  return WORK_TYPE_LABELS[workType]
}

export function formatWageTypeLabel(wageType: WageType): string {
  return WAGE_TYPE_LABELS[wageType]
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

/** Converts a backend ISO 8601 string to the `YYYY-MM-DDTHH:mm` value an
 * `<input type="datetime-local">` expects, in the browser's local time
 * (datetime-local has no timezone concept of its own — this is the
 * standard, unavoidable interpretation). */
export function toDatetimeLocalInputValue(isoString: string): string {
  const date = new Date(isoString)
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** Converts a `datetime-local` input value (interpreted as local time, by
 * the same convention as `toDatetimeLocalInputValue`) back to an ISO 8601
 * string for the backend. */
export function fromDatetimeLocalInputValue(value: string): string {
  return new Date(value).toISOString()
}
