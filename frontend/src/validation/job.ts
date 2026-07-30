import { z } from 'zod'
import { nonEmptyString, optionalNonNegativeNumberString } from './common'

/**
 * Every numeric field is kept as a form-level `string` (never
 * `z.coerce.number()`), converted to a real number at submit time — same
 * approach as `validation/workerProfile.ts`, for the same reason
 * (sidesteps React-Hook-Form-plus-Zod-coercion typing friction).
 *
 * All schemas here mirror `jobs/models.py:JobPost` +
 * `jobs/serializers.py:JobPostSerializer` exactly, verified directly
 * against the model/serializer, not assumed:
 * - `title`: `CharField(max_length=150)` — required, no `blank=True`.
 * - `description`: `TextField()` — required, no `blank=True`.
 * - `category`/`subcategory`: required foreign keys.
 */
export const jobBasicsSchema = z.object({
  title: nonEmptyString('Title').max(150, 'Must be at most 150 characters.'),
  description: nonEmptyString('Description'),
  category: z.string().min(1, 'Choose a category.'),
  subcategory: z.string().min(1, 'Choose a subcategory.'),
})

export type JobBasicsFormValues = z.infer<typeof jobBasicsSchema>

const requiredNonNegativeIntString = (label: string, { min = 0 }: { min?: number } = {}) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required.`)
    .refine(
      (value) => !Number.isNaN(Number(value)) && Number(value) >= min && Number.isInteger(Number(value)),
      { message: min > 0 ? `${label} must be at least ${min}.` : `${label} must be zero or more.` },
    )

/**
 * `address`/`latitude`/`longitude` are all REQUIRED on `JobPost` — unlike
 * `WorkerProfile`/`EmployerProfile`, where all three are optional. No
 * `blank=True`/`null=True` on any of the three model fields. This is a
 * genuine, verified difference from the Worker/Employer profile location
 * pattern (`CoordinateCapture`), not an oversight — see
 * `components/shared/JobLocationFields.tsx`.
 */
export const jobLocationSchema = z.object({
  address: nonEmptyString('Address').max(255, 'Must be at most 255 characters.'),
  latitude: z
    .string()
    .trim()
    .min(1, 'Latitude is required.')
    .refine((value) => !Number.isNaN(Number(value)) && Number(value) >= -90 && Number(value) <= 90, {
      message: 'Enter a latitude between -90 and 90.',
    }),
  longitude: z
    .string()
    .trim()
    .min(1, 'Longitude is required.')
    .refine((value) => !Number.isNaN(Number(value)) && Number(value) >= -180 && Number(value) <= 180, {
      message: 'Enter a longitude between -180 and 180.',
    }),
})

export type JobLocationFormValues = z.infer<typeof jobLocationSchema>

/**
 * - `wage_type`/`work_type`: choice fields with defaults — always sent
 *   explicitly here (never omitted), so the default is only a form
 *   pre-fill, not a request-time omission.
 * - `wage_amount`: `DecimalField(validators=[MinValueValidator(0)])` — no
 *   default, no `blank=True` — genuinely required, unlike
 *   `WorkerProfile.expected_wage`.
 * - `required_experience_years`: `PositiveSmallIntegerField(default=0)` — required.
 * - `number_of_workers_required`: `PositiveIntegerField(default=1, validators=[MinValueValidator(1)])` — required, minimum 1.
 * - `scheduled_datetime`/`duration_days`/`application_deadline`: all
 *   `null=True, blank=True` — genuinely optional.
 */
export const jobTermsSchema = z.object({
  wage_type: z.enum(['HOURLY', 'DAILY', 'MONTHLY', 'FIXED']),
  wage_amount: z
    .string()
    .trim()
    .min(1, 'Wage amount is required.')
    .refine((value) => !Number.isNaN(Number(value)) && Number(value) >= 0, {
      message: 'Must be zero or more.',
    }),
  work_type: z.enum(['FULL_TIME', 'PART_TIME', 'CONTRACT', 'ONE_TIME']),
  required_experience_years: requiredNonNegativeIntString('Required experience (years)'),
  number_of_workers_required: requiredNonNegativeIntString('Number of workers needed', { min: 1 }),
  scheduled_datetime: z.string().trim(),
  duration_days: optionalNonNegativeNumberString('Duration (days)', { integer: true }),
  application_deadline: z.string().trim(),
})

export type JobTermsFormValues = z.infer<typeof jobTermsSchema>

/** The whole job form submits as ONE request (unlike the Worker/Employer
 * profile forms' independent per-section PATCHes) — `POST /api/jobs/`
 * has no concept of partial creation, so Basics/Location/Terms are
 * visually sectioned but validated and submitted together. */
export const jobFormSchema = jobBasicsSchema.merge(jobLocationSchema).merge(jobTermsSchema)

export type JobFormValues = z.infer<typeof jobFormSchema>

/** `application_deadline` can only be validated as "not in the past" on
 * CREATE — `JobPostSerializer.validate_application_deadline` only checks
 * `self.instance is None`, i.e. editing an existing job never re-checks
 * this, even if the stored deadline has since passed. */
export function isDeadlineInPast(value: string): boolean {
  if (!value) return false
  return new Date(value).getTime() < Date.now()
}
