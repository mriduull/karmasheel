/**
 * Auth endpoint functions needed by the F0 foundation itself (current-user
 * fetch, logout cleanup, the refresh call lives in ../client.ts since the
 * client owns the retry loop). `register`/`login` are intentionally not
 * defined here yet — those belong to the Login/Register forms built in
 * Phase F1.
 */
import { apiFetch } from '@/api/client'
import { tokenStorage } from '@/api/tokenStorage'
import type { CurrentUser } from '@/types/user'

export function fetchCurrentUser(): Promise<CurrentUser> {
  return apiFetch<CurrentUser>('/auth/me/', { method: 'GET' })
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
    // Local state is cleared by the caller regardless — see NavShell.
  }
}
