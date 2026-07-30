import type { ReactElement, ReactNode } from 'react'
import { render } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { vi } from 'vitest'
import { useAuthStore } from '@/state/authStore'
import type { CurrentUser } from '@/types/user'

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  })
}

export function resetAuthStore(): void {
  useAuthStore.setState({ accessToken: null, user: null, isBootstrapping: false })
}

export function setAuthenticatedUser(user: CurrentUser, accessToken = 'test-access-token'): void {
  useAuthStore.setState({ accessToken, user, isBootstrapping: false })
}

export function renderWithProviders(
  ui: ReactElement,
  {
    route = '/',
    queryClient = createTestQueryClient(),
  }: { route?: string; queryClient?: QueryClient } = {},
) {
  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[route]}>{children}</MemoryRouter>
      </QueryClientProvider>
    )
  }

  return render(ui, { wrapper: Wrapper })
}

/**
 * jsdom's `window.location.assign` is non-configurable, so `vi.spyOn`
 * can't touch it directly — replace the whole `location` object instead.
 * Used to assert a hard-navigation call (e.g. logout) without jsdom
 * attempting (and failing) a real navigation. Call the returned
 * `restore()` in `afterEach`/at the end of the test.
 */
export function mockWindowLocationAssign(): { assignSpy: ReturnType<typeof vi.fn>; restore: () => void } {
  const original = window.location
  const assignSpy = vi.fn()

  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { ...original, assign: assignSpy },
  })

  return {
    assignSpy,
    restore: () => {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: original,
      })
    },
  }
}
