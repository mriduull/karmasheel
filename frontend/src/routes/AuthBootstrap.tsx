import { useEffect, useRef, type ReactNode } from 'react'
import { refreshAccessToken } from '@/api/client'
import { tokenStorage } from '@/api/tokenStorage'
import { useAuthStore } from '@/state/authStore'
import { useCurrentUser } from '@/hooks/useCurrentUser'
import { LoadingIndicator } from '@/components/primitives/LoadingIndicator'

/**
 * Runs once on app boot (docs/FRONTEND_IMPLEMENTATION_PLAN.md §3.4): if a
 * refresh token is already stored, silently exchange it for an access
 * token and fetch the current user before rendering any route, so a
 * reload never flashes logged-out UI and then bounces. Renders nothing of
 * its own once settled — `children` (the router) always follows.
 */
export function AuthBootstrap({ children }: { children: ReactNode }) {
  const isBootstrapping = useAuthStore((state) => state.isBootstrapping)
  const accessToken = useAuthStore((state) => state.accessToken)
  const setBootstrapped = useAuthStore((state) => state.setBootstrapped)
  const setUser = useAuthStore((state) => state.setUser)
  const logout = useAuthStore((state) => state.logout)
  const attempted = useRef(false)

  useEffect(() => {
    if (attempted.current) return
    attempted.current = true

    if (!tokenStorage.getRefreshToken()) {
      setBootstrapped()
      return
    }

    refreshAccessToken()
      .catch(() => {
        logout()
      })
      .finally(() => {
        // If the refresh failed, there is no access token to trigger the
        // /me fetch below, so bootstrap is already done. If it succeeded,
        // the effect below finishes bootstrap once /me resolves.
        if (!useAuthStore.getState().accessToken) {
          setBootstrapped()
        }
      })
    // Runs exactly once, guarded by `attempted` above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const meQuery = useCurrentUser()

  useEffect(() => {
    if (!accessToken) return

    if (meQuery.isSuccess) {
      setUser(meQuery.data)
      setBootstrapped()
    } else if (meQuery.isError) {
      logout()
      setBootstrapped()
    }
  }, [accessToken, meQuery.isSuccess, meQuery.isError, meQuery.data, setUser, logout, setBootstrapped])

  if (isBootstrapping) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <LoadingIndicator label="Loading Workforce Match" />
      </div>
    )
  }

  return <>{children}</>
}
