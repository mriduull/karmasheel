import { z } from 'zod'
import { nonEmptyString } from './common'

export const loginSchema = z.object({
  username: nonEmptyString('Phone number'),
  password: nonEmptyString('Password'),
})

export type LoginFormValues = z.infer<typeof loginSchema>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const FULL_NAME_PATTERN = /^[A-Za-z\s]+$/

/**
 * Mirrors `accounts/serializers.py:RegisterSerializer` exactly:
 * - `full_name`: required, letters and spaces only; stored server-side on
 *   the account's name field while Django keeps an internal generated username.
 * - `email`: OPTIONAL — `AbstractUser.email` has `blank=True`, so DRF marks
 *   it `required=False`. Format is still checked client-side if provided.
 * - `phone_number`: required, max_length 10, NO format/digits validator
 *   (see validation/common.ts's note on `digitsOfLength`) — deliberately
 *   not a digits-only regex, to avoid rejecting input the backend accepts.
 * - `password`: `django.contrib.auth.password_validation.validate_password`
 *   with `MinimumLengthValidator` (default threshold 8) as the only rule
 *   checkable client-side; `UserAttributeSimilarityValidator`,
 *   `CommonPasswordValidator`, and `NumericPasswordValidator` can only be
 *   evaluated server-side — their messages surface via field-error
 *   translation (src/api/errors.ts:toFieldErrors) on submit.
 * - `role`: `WORKER` | `EMPLOYER` only, enforced by the RoleToggle UI
 *   itself (no free-text role input exists to validate).
 */
export const registerSchema = z.object({
  full_name: nonEmptyString('Full name').regex(
    FULL_NAME_PATTERN,
    'Name should only contain letters and spaces.',
  ),
  email: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || EMAIL_PATTERN.test(value), {
      message: 'Enter a valid email address.',
    }),
  phone_number: nonEmptyString('Phone number').max(10, 'Must be at most 10 characters.'),
  password: nonEmptyString('Password').min(8, 'Must be at least 8 characters.'),
  role: z.enum(['WORKER', 'EMPLOYER']),
})

export type RegisterFormValues = z.infer<typeof registerSchema>
