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

/** Matches `PositiveSmallIntegerField`/`PositiveIntegerField` fields
 * (experience_years, preferred_travel_radius_km, etc.). */
export const nonNegativeInt = z.coerce.number().int().min(0)
