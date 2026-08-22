import '@/i18n'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { http, HttpResponse } from 'msw'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { axe } from 'jest-axe'
import { QueryClientProvider } from '@tanstack/react-query'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { createTestQueryClient, resetAuthStore } from '@/test/utils'
import { useAuthStore } from '@/state/authStore'
import { tokenStorage } from '@/api/tokenStorage'
import { Login } from './Login'

function Probe({ label }: { label: string }) {
  return <p>{label}</p>
}

function renderLogin() {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/worker" element={<Probe label="worker-dashboard" />} />
          <Route path="/employer" element={<Probe label="employer-dashboard" />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Login', () => {
  beforeEach(() => {
    resetAuthStore()
    localStorage.clear()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('does not request saved email or username suggestions', () => {
    renderLogin()

    const usernameInput = screen.getByLabelText('Username')
    expect(usernameInput).toHaveAttribute('autocomplete', 'off')
    expect(usernameInput.closest('form')).toHaveAttribute('autocomplete', 'off')
  })

  it('logs in and redirects a Worker to /worker, storing tokens via the F0 auth system', async () => {
    const user = userEvent.setup()

    server.use(
      http.post(`${API_ROOT}/auth/login/`, () =>
        HttpResponse.json({ access: 'access-token-123', refresh: 'refresh-token-456' }),
      ),
      http.get(`${API_ROOT}/auth/me/`, () =>
        HttpResponse.json({
          id: 1,
          username: 'demo_worker_electrician',
          email: 'electrician@example.com',
          phone_number: '9811100011',
          role: 'WORKER',
          is_contact_verified: true,
        }),
      ),
    )

    renderLogin()

    await user.type(screen.getByLabelText('Username'), 'demo_worker_electrician')
    await user.type(screen.getByLabelText('Password'), 'DemoPass123!')
    await user.click(screen.getByRole('button', { name: 'Log In' }))

    expect(await screen.findByText('worker-dashboard')).toBeInTheDocument()
    expect(useAuthStore.getState().accessToken).toBe('access-token-123')
    expect(useAuthStore.getState().user?.role).toBe('WORKER')
    expect(tokenStorage.getRefreshToken()).toBe('refresh-token-456')
  })

  it('redirects an Employer to /employer', async () => {
    const user = userEvent.setup()

    server.use(
      http.post(`${API_ROOT}/auth/login/`, () =>
        HttpResponse.json({ access: 'access-token', refresh: 'refresh-token' }),
      ),
      http.get(`${API_ROOT}/auth/me/`, () =>
        HttpResponse.json({
          id: 2,
          username: 'demo_employer_verified',
          email: 'employer@example.com',
          phone_number: '9811100022',
          role: 'EMPLOYER',
          is_contact_verified: true,
        }),
      ),
    )

    renderLogin()

    await user.type(screen.getByLabelText('Username'), 'demo_employer_verified')
    await user.type(screen.getByLabelText('Password'), 'DemoPass123!')
    await user.click(screen.getByRole('button', { name: 'Log In' }))

    expect(await screen.findByText('employer-dashboard')).toBeInTheDocument()
  })

  it('shows a plain-language message for invalid credentials without storing any token', async () => {
    const user = userEvent.setup()

    server.use(
      http.post(`${API_ROOT}/auth/login/`, () =>
        HttpResponse.json({ detail: 'No active account found with the given credentials' }, { status: 401 }),
      ),
    )

    renderLogin()

    await user.type(screen.getByLabelText('Username'), 'demo_worker_electrician')
    await user.type(screen.getByLabelText('Password'), 'wrong-password')
    await user.click(screen.getByRole('button', { name: 'Log In' }))

    expect(
      await screen.findByText("That username or password isn't right. Please try again."),
    ).toBeInTheDocument()
    expect(useAuthStore.getState().accessToken).toBeNull()
    expect(tokenStorage.getRefreshToken()).toBeNull()
  })

  it('distinguishes an unreachable-server error from an authentication error', async () => {
    // A fetch failure while the browser reports being online (jsdom's
    // default) is a stopped/unreachable backend, not the user being
    // offline — must not show the "you're offline" message here.
    const user = userEvent.setup()

    server.use(http.post(`${API_ROOT}/auth/login/`, () => HttpResponse.error()))

    renderLogin()

    await user.type(screen.getByLabelText('Username'), 'demo_worker_electrician')
    await user.type(screen.getByLabelText('Password'), 'DemoPass123!')
    await user.click(screen.getByRole('button', { name: 'Log In' }))

    expect(await screen.findByText(/cannot reach the server/i)).toBeInTheDocument()
    expect(screen.queryByText(/you appear to be offline/i)).not.toBeInTheDocument()
  })

  it('shows the offline message specifically when the browser itself reports no connectivity', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)

    server.use(http.post(`${API_ROOT}/auth/login/`, () => HttpResponse.error()))

    renderLogin()

    await user.type(screen.getByLabelText('Username'), 'demo_worker_electrician')
    await user.type(screen.getByLabelText('Password'), 'DemoPass123!')
    await user.click(screen.getByRole('button', { name: 'Log In' }))

    expect(await screen.findByText(/you appear to be offline/i)).toBeInTheDocument()
  })

  it('disables the submit button while a login request is in flight', async () => {
    const user = userEvent.setup()

    server.use(
      http.post(`${API_ROOT}/auth/login/`, async () => {
        await new Promise((resolve) => setTimeout(resolve, 50))
        return HttpResponse.json({ access: 'a', refresh: 'r' })
      }),
      http.get(`${API_ROOT}/auth/me/`, () =>
        HttpResponse.json({
          id: 1,
          username: 'demo_worker_electrician',
          email: 'electrician@example.com',
          phone_number: '9811100011',
          role: 'WORKER',
          is_contact_verified: true,
        }),
      ),
    )

    renderLogin()

    await user.type(screen.getByLabelText('Username'), 'demo_worker_electrician')
    await user.type(screen.getByLabelText('Password'), 'DemoPass123!')

    const submitButton = screen.getByRole('button', { name: 'Log In' })
    await user.click(submitButton)

    // React Hook Form flips `isSubmitting` synchronously as handleSubmit
    // starts, before the (mocked, 50ms-delayed) request resolves — so the
    // button must already be disabled right after the click settles,
    // well before navigation away on success.
    expect(submitButton).toBeDisabled()

    await waitFor(() => expect(screen.getByText('worker-dashboard')).toBeInTheDocument())
  })

  it('has no automatically-detectable accessibility violations', async () => {
    const { container } = renderLogin()
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
