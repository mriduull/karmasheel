import { z } from 'zod'
import { nonEmptyString } from './common'

export const loginSchema = z.object({
  username: nonEmptyString('Username'),
  password: nonEmptyString('Password'),
})

export type LoginFormValues = z.infer<typeof loginSchema>

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
/** Django's default `UnicodeUsernameValidator`, inherited unmodified by
 * this project's custom User model (accounts/models.py). */
const USERNAME_PATTERN = /^[\w.@+-]+$/
const USERNAME_HAS_LETTER_PATTERN = /[A-Za-z]/
const MAX_USERNAME_LENGTH = 30

/**
 * Mirrors `accounts/serializers.py:RegisterSerializer` exactly:
 * - `username`: required, 30 characters max, at least one letter, plus
 *   Django's default UnicodeUsernameValidator-compatible character set.
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
  username: nonEmptyString('Username')
    .max(MAX_USERNAME_LENGTH, 'Username must be 30 characters or fewer.')
    .regex(USERNAME_PATTERN, 'Letters, digits, and @/./+/-/_ only.')
    .regex(USERNAME_HAS_LETTER_PATTERN, 'Username must include at least one letter.'),
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
