import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { Home } from 'lucide-react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { createTestQueryClient, mockWindowLocationAssign, setAuthenticatedUser } from '@/test/utils'
import { useAuthStore } from '@/state/authStore'
import { tokenStorage } from '@/api/tokenStorage'
import { queryClient as appQueryClient } from '@/lib/queryClient'
import { NavShell } from './NavShell'

const WORKER_USER = {
  id: 1,
  username: 'demo_worker_electrician',
  email: 'electrician@example.com',
  phone_number: '9811100011',
  role: 'WORKER' as const,
  is_contact_verified: true,
}

function renderNavShell() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={['/worker']}>
        <Routes>
          <Route
            path="/worker"
            element={
              <NavShell items={[{ to: '/worker', label: 'Home', icon: Home }]} brandHref="/worker">
                <p>worker-dashboard-content</p>
              </NavShell>
            }
          />
          <Route path="/" element={<p>public-landing-page</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('NavShell — current-user display and logout', () => {
  beforeEach(() => {
    tokenStorage.setRefreshToken('a-refresh-token')
  })

  it('displays the current username and role', () => {
    setAuthenticatedUser(WORKER_USER)
    renderNavShell()

    expect(screen.getByText(/demo_worker_electrician/)).toBeInTheDocument()
    expect(screen.getByText(/Worker/)).toBeInTheDocument()
  })

  it('logs out: calls the backend logout endpoint, clears local auth state and cached data, and requests the public landing page', async () => {
    setAuthenticatedUser(WORKER_USER)
    appQueryClient.setQueryData(['me'], WORKER_USER)

    let loggedOutRefreshToken: unknown = null
    server.use(
      http.post(`${API_ROOT}/auth/logout/`, async ({ request }) => {
        const body = (await request.json()) as { refresh: string }
        loggedOutRefreshToken = body.refresh
        return new HttpResponse(null, { status: 204 })
      }),
    )

    // A hard navigation (`window.location.assign`), not client-side
    // navigate() — see NavShell.tsx's handleLogout for why (a verified
    // race against the currently-mounted route guard's own reactive
    // redirect to /login). jsdom doesn't implement real navigation, so
    // this is asserted via a spy rather than by checking rendered content.
    const { assignSpy, restore } = mockWindowLocationAssign()

    const user = userEvent.setup()
    renderNavShell()

    await user.click(screen.getByRole('button', { name: /log out/i }))

    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith('/'))
    expect(loggedOutRefreshToken).toBe('a-refresh-token')
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
    expect(tokenStorage.getRefreshToken()).toBeNull()
    expect(appQueryClient.getQueryData(['me'])).toBeUndefined()

    restore()
  })

  it('handles an already-expired session safely (logout endpoint itself fails)', async () => {
    setAuthenticatedUser(WORKER_USER)

    server.use(
      http.post(`${API_ROOT}/auth/logout/`, () =>
        HttpResponse.json({ detail: 'The refresh token is invalid, expired, or already blacklisted.' }, { status: 400 }),
      ),
    )

    const { assignSpy, restore } = mockWindowLocationAssign()

    const user = userEvent.setup()
    renderNavShell()

    await user.click(screen.getByRole('button', { name: /log out/i }))

    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith('/'))
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()

    restore()
  })
})
