export type Role = 'WORKER' | 'EMPLOYER'

/**
 * Shape returned by GET /api/auth/me/ (accounts/serializers.py:CurrentUserSerializer).
 * This is the only source of truth for `role` — never decoded from the JWT.
 */
export interface CurrentUser {
  id: number
  username: string
  email: string
  phone_number: string
  role: Role
  is_contact_verified: boolean
}
