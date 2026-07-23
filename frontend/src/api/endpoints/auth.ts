/**
 * Auth endpoint functions. `register`/`login` are plain request functions
 * only — the Login/Register pages (Phase F1) own all state/redirect logic
 * around them.
 */
import { apiFetch } from '@/api/client'
import { tokenStorage } from '@/api/tokenStorage'
import type { CurrentUser, LoginPayload, RegisterPayload, RegisteredAccount, TokenPair } from '@/types/user'

export function fetchCurrentUser(): Promise<CurrentUser> {
  return apiFetch<CurrentUser>('/auth/me/', { method: 'GET' })
}

/** POST /api/auth/login/ (SimpleJWT TokenObtainPairView) — public, no
 * access token to attach yet. */
export function login(payload: LoginPayload): Promise<TokenPair> {
  return apiFetch<TokenPair>('/auth/login/', { method: 'POST', body: payload, isPublic: true })
}

/** POST /api/auth/register/ — public. Never returns a token pair; the
 * caller must not treat a successful registration as a login. */
export function register(payload: RegisterPayload): Promise<RegisteredAccount> {
  return apiFetch<RegisteredAccount>('/auth/register/', {
    method: 'POST',
    body: payload,
    isPublic: true,
  })
}

/**
 * Blacklists the current refresh token server-side. Best-effort: a
 * network failure here must never trap the user in a logged-in-looking
 * UI, so the caller clears local auth state regardless of the outcome.
 */
export async function logoutRequest(): Promise<void> {
  const refresh = tokenStorage.getRefreshToken()
  if (!refresh) return

  try {
    await apiFetch<void>('/auth/logout/', { method: 'POST', body: { refresh } })
  } catch {
    // Local state is cleared by the caller regardless — see state/authStore.ts:logout.
  }
}
