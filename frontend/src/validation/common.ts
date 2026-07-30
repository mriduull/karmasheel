import { z } from 'zod'

/**
 * Shared Zod building blocks, reused by business-form schemas starting in
 * Phase F1 (no business schemas are defined in F0 itself).
 */

/**
 * Exactly `length` digits, no separators. Matches
 * `profiles/models.py:pan_vat_number_validator` (`^\d{9}$`) exactly.
 *
 * Does NOT apply to `phone_number` — despite the "10-digit phone number"
 * framing in product copy, `accounts/models.py:User.phone_number` is a
 * plain `CharField(max_length=10, unique=True)` with no format validator
 * at all. A client-side digits-only/exactly-10 rule would reject input
 * the backend would actually accept — see `validation/auth.ts` for the
 * real constraint used on registration (required, max 10 characters).
 */
export const digitsOfLength = (length: number) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${length}}$`), `Must be exactly ${length} digits.`)

export const nonEmptyString = (label: string) => z.string().trim().min(1, `${label} is required.`)

/**
 * A number input kept as a form-level `string` (not coerced) so an empty
 * value is distinguishable from `0` — the caller maps `''` to `null` at
 * submit time to explicitly clear a nullable field (e.g. `expected_wage`,
 * `preferred_travel_radius_km`), rather than silently coercing blank to
 * zero. `integer: true` matches `PositiveIntegerField`-backed fields;
 * omitted for `DecimalField`-backed ones (`expected_wage`).
 */
export const optionalNonNegativeNumberString = (label: string, { integer = false } = {}) =>
  z.string().trim().refine(
    (value) => {
      if (value === '') return true
      const numeric = Number(value)
      if (Number.isNaN(numeric) || numeric < 0) return false
      return integer ? Number.isInteger(numeric) : true
    },
    {
      message: integer ? `${label} must be a whole number, zero or more.` : `${label} must be zero or more.`,
    },
  )
