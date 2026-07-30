import { QueryClient } from '@tanstack/react-query'
import { ApiError } from '@/api/errors'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // 401/403/400 are not transient — retrying the same request changes
      // nothing. Only connectivity failures (genuinely offline, or a
      // reachable-network-but-unreachable-server case such as a stopped
      // backend or a transient CORS/DNS/timeout failure) and 5xx are
      // worth a couple of automatic retries.
      retry: (failureCount, error) => {
        if (
          error instanceof ApiError &&
          (error.kind === 'network' || error.kind === 'unreachable' || error.kind === 'server')
        ) {
          return failureCount < 2
        }
        return false
      },
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: false,
    },
  },
})
