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

/** POST /api/auth/login/ (SimpleJWT TokenObtainPairView, no custom serializer). */
export interface TokenPair {
  access: string
  refresh: string
}

export interface LoginPayload {
  username: string
  password: string
}

/** accounts/serializers.py:RegisterSerializer request fields — `email` is
 * optional (the model field has `blank=True`, so DRF marks it not-required). */
export interface RegisterPayload {
  username: string
  email?: string
  phone_number: string
  password: string
  role: Role
}

/** accounts/serializers.py:RegisterSerializer response — password is
 * write-only and never present in the response body. Not the same shape
 * as CurrentUser (no `is_contact_verified`) — registration never logs the
 * user in, so this response is only used to confirm success, not to
 * populate auth state. */
export interface RegisteredAccount {
  id: number
  username: string
  email: string
  phone_number: string
  role: Role
}
