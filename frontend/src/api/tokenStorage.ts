/**
 * Persisted storage for the refresh token only. The access token is never
 * persisted — it lives in memory in `state/authStore.ts` and is re-derived
 * from the refresh token on boot (docs/FRONTEND_IMPLEMENTATION_PLAN.md §3.4).
 */
const REFRESH_TOKEN_KEY = 'workforce-match.refreshToken'

export const tokenStorage = {
  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY)
  },
  setRefreshToken(token: string): void {
    localStorage.setItem(REFRESH_TOKEN_KEY, token)
  },
  clearRefreshToken(): void {
    localStorage.removeItem(REFRESH_TOKEN_KEY)
  },
}
