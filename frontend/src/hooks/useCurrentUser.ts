import { useQuery } from '@tanstack/react-query'
import { fetchCurrentUser } from '@/api/endpoints/auth'
import { useAuthStore } from '@/state/authStore'

/**
 * `GET /api/auth/me/`, cached under `["me"]`. Only enabled once an access
 * token exists — the query itself never triggers the bootstrap refresh
 * (that's routes/AuthBootstrap.tsx's job); it just fetches once a token is
 * available.
 */
export function useCurrentUser() {
  const accessToken = useAuthStore((state) => state.accessToken)

  return useQuery({
    queryKey: ['me'],
    queryFn: fetchCurrentUser,
    enabled: Boolean(accessToken),
    staleTime: 5 * 60 * 1000,
  })
}
