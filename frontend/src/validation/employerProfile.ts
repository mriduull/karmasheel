import { z } from 'zod'

/**
 * Mirrors `profiles/models.py:EmployerProfile` + `EmployerProfileSerializer`,
 * grouped the same way as the Worker Profile form (F2) for consistency —
 * "Details" bundles the same kind of always-editable text fields Worker's
 * "Basics" section does; "Location" is coordinate-capture only (see
 * pages/employer/Profile.tsx), not bundled with address here.
 *
 * - `organization_name`: `CharField(max_length=150, blank=True)` — optional.
 * - `address`: `CharField(max_length=255, blank=True)` — optional.
 * - `pan_vat_number`: `CharField(max_length=9, blank=True,
 *   validators=[pan_vat_number_validator])`, validator = `RegexValidator(r"^\d{9}$")`
 *   — optional, but if present must be exactly 9 digits after stripping
 *   user-friendly formatting (spaces, dashes) client-side; the backend
 *   itself has no tolerance for separators, so they're normalized away
 *   before validation/submission, never sent through.
 */
export const employerDetailsSchema = z.object({
  organization_name: z.string().trim().max(150, 'Must be at most 150 characters.'),
  address: z.string().trim().max(255, 'Must be at most 255 characters.'),
  pan_vat_number: z
    .string()
    .trim()
    .transform((value) => value.replace(/[^\d]/g, ''))
    .refine((value) => value === '' || /^\d{9}$/.test(value), {
      message: 'Enter exactly 9 digits.',
    }),
})

export type EmployerDetailsFormValues = z.infer<typeof employerDetailsSchema>
