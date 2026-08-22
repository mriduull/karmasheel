import '@/i18n'
import { beforeEach, describe, expect, it } from 'vitest'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { createTestQueryClient, resetAuthStore, setAuthenticatedUser } from '@/test/utils'
import { PublicLayout } from './PublicLayout'

const WORKER_USER = {
  id: 1,
  username: 'demo_worker_electrician',
  email: 'electrician@example.com',
  phone_number: '9811100011',
  role: 'WORKER' as const,
  is_contact_verified: true,
}

const EMPLOYER_USER = {
  id: 2,
  username: 'demo_employer_verified',
  email: 'employer@example.com',
  phone_number: '9811100022',
  role: 'EMPLOYER' as const,
  is_contact_verified: true,
}

function renderPublicLayout(route = '/jobs') {
  return render(
    <QueryClientProvider client={createTestQueryClient()}>
      <MemoryRouter initialEntries={[route]}>
        <Routes>
          <Route
            element={<PublicLayout />}
          >
            <Route path="/jobs" element={<p>browse-jobs-content</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('PublicLayout navigation', () => {
  beforeEach(() => resetAuthStore())

  it('shows Log In / Register for an unauthenticated visitor', () => {
    renderPublicLayout()

    expect(screen.getAllByRole('link', { name: /log in/i }).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('link', { name: /register/i }).length).toBeGreaterThan(0)
  })

  it('does not show Log In / Register for an already-authenticated Worker visiting a public route', () => {
    setAuthenticatedUser(WORKER_USER)
    renderPublicLayout()

    expect(screen.queryByRole('link', { name: /log in/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /register/i })).not.toBeInTheDocument()
  })

  it('shows the full Worker navigation for an authenticated Worker instead', () => {
    setAuthenticatedUser(WORKER_USER)
    renderPublicLayout()

    const nav = screen.getByRole('navigation', { name: 'Primary' })
    const links = nav.querySelectorAll('a')
    const hrefs = new Set(Array.from(links).map((link) => link.getAttribute('href')))

    expect(hrefs).toEqual(
      new Set([
        '/worker',
        '/jobs',
        '/worker/applications',
        '/worker/recommendations',
        '/worker/opportunities',
        '/worker/profile',
        '/worker/cv',
        '/worker/ratings',
      ]),
    )
  })

  it('shows a return-to-dashboard link pointing at /employer for an authenticated Employer', () => {
    setAuthenticatedUser(EMPLOYER_USER)
    renderPublicLayout()

    const dashboardLinks = screen.getAllByRole('link', { name: /dashboard/i })
    expect(dashboardLinks.length).toBeGreaterThan(0)
    for (const link of dashboardLinks) {
      expect(link).toHaveAttribute('href', '/employer')
    }
  })

  it('still shows the identity + Logout block for an authenticated user on a public route', () => {
    setAuthenticatedUser(WORKER_USER)
    renderPublicLayout()

    expect(screen.getByText(/demo_worker_electrician/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /log out/i })).toBeInTheDocument()
  })

  it('keeps Browse Jobs visible in both the authenticated and unauthenticated nav', () => {
    renderPublicLayout()
    expect(screen.getAllByRole('link', { name: /browse jobs/i }).length).toBeGreaterThan(0)

    setAuthenticatedUser(WORKER_USER)
    renderPublicLayout()
    expect(screen.getAllByRole('link', { name: /browse jobs/i }).length).toBeGreaterThan(0)
  })
})
