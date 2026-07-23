import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { screen } from '@testing-library/react'
import { Route, Routes } from 'react-router-dom'
import { renderWithProviders, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
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

  it('redirects an unverified employer to /unauthorized (verification-status stub defaults to UNVERIFIED until Phase F3)', async () => {
    setAuthenticatedUser(EMPLOYER_USER)
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

  it('redirects a worker (wrong role entirely) to /worker before even checking verification', () => {
    setAuthenticatedUser(WORKER_USER)
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
