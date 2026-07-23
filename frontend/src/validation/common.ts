import { z } from 'zod'

/**
 * Shared Zod building blocks, reused by business-form schemas starting in
 * Phase F1 (no business schemas are defined in F0 itself).
 */

/** Exactly `length` digits, no separators — matches how the backend
 * validates `phone_number` (10, accounts/models.py) and `pan_vat_number`
 * (9, `profiles/models.py:pan_vat_number_validator`). */
export const digitsOfLength = (length: number) =>
  z
    .string()
    .trim()
    .regex(new RegExp(`^\\d{${length}}$`), `Must be exactly ${length} digits.`)

export const nonEmptyString = (label: string) => z.string().trim().min(1, `${label} is required.`)

/** Matches `PositiveSmallIntegerField`/`PositiveIntegerField` fields
 * (experience_years, preferred_travel_radius_km, etc.). */
export const nonNegativeInt = z.coerce.number().int().min(0)
