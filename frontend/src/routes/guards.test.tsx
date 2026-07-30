import '@/i18n'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { Route, Routes } from 'react-router-dom'
import { server } from '@/test/msw/server'
import { API_ROOT } from '@/test/msw/handlers'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { buildEmployerProfileFixture } from '@/test/fixtures'
import { PublicOnly, RequireAuth, RequireRole, RequireVerifiedEmployer } from './guards'
import type { CurrentUser } from '@/types/user'

const WORKER_USER: CurrentUser = {
  id: 1,
  username: 'demo_worker_ramesh',
  email: 'ramesh@example.com',
  phone_number: '9811100011',
  role: 'WORKER',
  is_contact_verified: true,
}

const EMPLOYER_USER: CurrentUser = {
  id: 2,
  username: 'demo_employer_pending',
  email: 'employer@example.com',
  phone_number: '9811100022',
  role: 'EMPLOYER',
  is_contact_verified: true,
}

function Probe({ label }: { label: string }) {
  return <p>{label}</p>
}

function TestRoutes({ element }: { element: ReactElement }) {
  return (
    <Routes>
      <Route path="/protected" element={element} />
      <Route path="/login" element={<Probe label="login-page" />} />
      <Route path="/worker" element={<Probe label="worker-home" />} />
      <Route path="/employer" element={<Probe label="employer-home" />} />
      <Route path="/unauthorized" element={<Probe label="unauthorized-page" />} />
    </Routes>
  )
}

describe('RequireAuth', () => {
  beforeEach(() => resetAuthStore())

  it('redirects an unauthenticated visitor to /login', () => {
    renderWithProviders(
      <TestRoutes
        element={
          <RequireAuth>
            <Probe label="secret" />
          </RequireAuth>
        }
      />,
      { route: '/protected' },
    )
    expect(screen.getByText('login-page')).toBeInTheDocument()
  })

  it('renders children for an authenticated user of any role', () => {
    setAuthenticatedUser(WORKER_USER)
    renderWithProviders(
      <TestRoutes
        element={
          <RequireAuth>
            <Probe label="secret" />
          </RequireAuth>
        }
      />,
      { route: '/protected' },
    )
    expect(screen.getByText('secret')).toBeInTheDocument()
  })
})

describe('PublicOnly', () => {
  beforeEach(() => resetAuthStore())

  it('renders children for an unauthenticated visitor', () => {
    renderWithProviders(
      <TestRoutes
        element={
          <PublicOnly>
            <Probe label="login-form" />
          </PublicOnly>
        }
      />,
      { route: '/protected' },
    )
    expect(screen.getByText('login-form')).toBeInTheDocument()
  })

  it('redirects an already-authenticated worker to /worker', () => {
    setAuthenticatedUser(WORKER_USER)
    renderWithProviders(
      <TestRoutes
        element={
          <PublicOnly>
            <Probe label="login-form" />
          </PublicOnly>
        }
      />,
      { route: '/protected' },
    )
    expect(screen.getByText('worker-home')).toBeInTheDocument()
  })

  it('redirects an already-authenticated employer to /employer', () => {
    setAuthenticatedUser(EMPLOYER_USER)
    renderWithProviders(
      <TestRoutes
        element={
          <PublicOnly>
            <Probe label="login-form" />
          </PublicOnly>
        }
      />,
      { route: '/protected' },
    )
    expect(screen.getByText('employer-home')).toBeInTheDocument()
  })
})

describe('RequireRole', () => {
  beforeEach(() => resetAuthStore())

  it('redirects to /login when unauthenticated', () => {
    renderWithProviders(
      <TestRoutes
        element={
          <RequireRole role="WORKER">
            <Probe label="worker-only" />
          </RequireRole>
        }
      />,
      { route: '/protected' },
    )
    expect(screen.getByText('login-page')).toBeInTheDocument()
  })

  it('renders children when the role matches', () => {
    setAuthenticatedUser(WORKER_USER)
    renderWithProviders(
      <TestRoutes
        element={
          <RequireRole role="WORKER">
            <Probe label="worker-only" />
          </RequireRole>
        }
      />,
      { route: '/protected' },
    )
    expect(screen.getByText('worker-only')).toBeInTheDocument()
  })

  it('redirects an employer away from a worker-only route to /employer', () => {
    setAuthenticatedUser(EMPLOYER_USER)
    renderWithProviders(
      <TestRoutes
        element={
          <RequireRole role="WORKER">
            <Probe label="worker-only" />
          </RequireRole>
        }
      />,
      { route: '/protected' },
    )
    expect(screen.getByText('employer-home')).toBeInTheDocument()
  })

  it('redirects a worker away from an employer-only route to /worker', () => {
    setAuthenticatedUser(WORKER_USER)
    renderWithProviders(
      <TestRoutes
        element={
          <RequireRole role="EMPLOYER">
            <Probe label="employer-only" />
          </RequireRole>
        }
      />,
      { route: '/protected' },
    )
    expect(screen.getByText('worker-home')).toBeInTheDocument()
  })
})

describe('RequireVerifiedEmployer', () => {
  beforeEach(() => resetAuthStore())

  it('redirects a PENDING employer to /unauthorized', async () => {
    setAuthenticatedUser(EMPLOYER_USER)
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ verification_status: 'PENDING' })),
      ),
    )
    renderWithProviders(
      <TestRoutes
        element={
          <RequireVerifiedEmployer>
            <Probe label="post-a-job" />
          </RequireVerifiedEmployer>
        }
      />,
      { route: '/protected' },
    )
    expect(await screen.findByText('unauthorized-page')).toBeInTheDocument()
  })

  it('redirects a REJECTED employer to /unauthorized', async () => {
    setAuthenticatedUser(EMPLOYER_USER)
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ verification_status: 'REJECTED' })),
      ),
    )
    renderWithProviders(
      <TestRoutes
        element={
          <RequireVerifiedEmployer>
            <Probe label="post-a-job" />
          </RequireVerifiedEmployer>
        }
      />,
      { route: '/protected' },
    )
    expect(await screen.findByText('unauthorized-page')).toBeInTheDocument()
  })

  it('renders children for a VERIFIED employer', async () => {
    setAuthenticatedUser(EMPLOYER_USER)
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () =>
        HttpResponse.json(buildEmployerProfileFixture({ verification_status: 'VERIFIED' })),
      ),
    )
    renderWithProviders(
      <TestRoutes
        element={
          <RequireVerifiedEmployer>
            <Probe label="post-a-job" />
          </RequireVerifiedEmployer>
        }
      />,
      { route: '/protected' },
    )
    expect(await screen.findByText('post-a-job')).toBeInTheDocument()
  })

  it('does not expose protected content while verification status is still loading', () => {
    setAuthenticatedUser(EMPLOYER_USER)
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () => new Promise(() => {})),
    )
    renderWithProviders(
      <TestRoutes
        element={
          <RequireVerifiedEmployer>
            <Probe label="post-a-job" />
          </RequireVerifiedEmployer>
        }
      />,
      { route: '/protected' },
    )
    expect(screen.queryByText('post-a-job')).not.toBeInTheDocument()
    expect(screen.queryByText('unauthorized-page')).not.toBeInTheDocument()
  })

  it('shows a retryable error instead of redirecting when the verification check fails', async () => {
    setAuthenticatedUser(EMPLOYER_USER)
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () => HttpResponse.error()),
    )
    renderWithProviders(
      <TestRoutes
        element={
          <RequireVerifiedEmployer>
            <Probe label="post-a-job" />
          </RequireVerifiedEmployer>
        }
      />,
      { route: '/protected' },
    )
    expect(await screen.findByRole('button', { name: /try again/i })).toBeInTheDocument()
    expect(screen.queryByText('unauthorized-page')).not.toBeInTheDocument()
    expect(screen.queryByText('post-a-job')).not.toBeInTheDocument()
  })

  it('redirects a worker (wrong role entirely) to /worker before showing any verification UI', () => {
    setAuthenticatedUser(WORKER_USER)
    // RequireVerifiedEmployer calls useEmployerVerificationStatus() before
    // RequireRole's redirect check runs (hooks always execute), so this
    // endpoint is hit even though its result is never used here — mocked
    // only to avoid an unhandled-request error, not because it matters.
    server.use(
      http.get(`${API_ROOT}/profiles/employer/me/`, () => HttpResponse.json(buildEmployerProfileFixture())),
    )
    renderWithProviders(
      <TestRoutes
        element={
          <RequireVerifiedEmployer>
            <Probe label="post-a-job" />
          </RequireVerifiedEmployer>
        }
      />,
      { route: '/protected' },
    )
    expect(screen.getByText('worker-home')).toBeInTheDocument()
  })
})
