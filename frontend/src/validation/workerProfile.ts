import { z } from 'zod'
import { optionalNonNegativeNumberString } from './common'

/**
 * Every numeric field here is kept as a form-level `string` (never
 * `z.coerce.number()`/`valueAsNumber`) so the component can convert to a
 * real number (or `null`, to explicitly clear an optional field) at
 * submit time — see pages/worker/Profile.tsx. This sidesteps the
 * React-Hook-Form-plus-Zod-coercion typing friction entirely rather than
 * fighting it.
 *
 * Mirrors `profiles/models.py:WorkerProfile` + `WorkerProfileSerializer`
 * exactly, split into the same independently-PATCHable sections used in
 * the form:
 * - `address`: `CharField(max_length=255, blank=True)` — optional, ≤255 chars.
 * - `experience_years`: `PositiveSmallIntegerField(default=0)`, NOT
 *   nullable — always a real integer ≥ 0 when this section is submitted.
 */
export const workerBasicsSchema = z.object({
  address: z.string().trim().max(255, 'Must be at most 255 characters.'),
  experience_years: z
    .string()
    .trim()
    .min(1, 'Years of experience is required.')
    .refine(
      (value) => !Number.isNaN(Number(value)) && Number(value) >= 0 && Number.isInteger(Number(value)),
      { message: 'Enter a whole number, zero or more.' },
    ),
})

export type WorkerBasicsFormValues = z.infer<typeof workerBasicsSchema>

/**
 * `is_available`: `BooleanField(default=True)`.
 * `expected_wage`: `DecimalField(..., null=True, blank=True, validators=[MinValueValidator(0)])`.
 * `preferred_travel_radius_km`: `PositiveIntegerField(null=True, blank=True)`.
 * Both numeric fields are optional/nullable — an empty form value means
 * "clear this field" (sent as `null`), not zero.
 */
export const workerAvailabilitySchema = z.object({
  is_available: z.boolean(),
  expected_wage: optionalNonNegativeNumberString('Expected wage'),
  preferred_travel_radius_km: optionalNonNegativeNumberString('Preferred travel radius', {
    integer: true,
  }),
})

export type WorkerAvailabilityFormValues = z.infer<typeof workerAvailabilitySchema>

/** `skill_input`: `ListField(child=CharField(max_length=150), required=False)`.
 * Individual chip validation only — the chip list itself is plain
 * component state (src/components/shared/SkillChipInput.tsx), not a form
 * field, since it has its own add/remove interaction rather than a
 * single input value. */
export const skillPhraseSchema = z
  .string()
  .trim()
  .min(1, 'Enter a skill.')
  .max(150, 'Must be at most 150 characters.')
